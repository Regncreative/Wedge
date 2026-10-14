//! Auto-update from GitHub Releases. Every update is verified against the
//! public key in tauri.conf.json before it is installed, so a tampered
//! download is rejected even without an Authenticode certificate.

use std::time::Duration;

use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_notification::NotificationExt;
use tauri_plugin_updater::UpdaterExt;

use crate::db;
use crate::i18n;
use crate::models::{UpdateChannel, UpdateStatus};
use crate::state::AppState;

const STABLE_FEED: &str = "https://github.com/Regncreative/Stash/releases/latest/download/latest.json";
/// A fixed pre-release ("channel-beta") whose latest.json the Release
/// workflow points at the newest version, beta or stable.
const BETA_FEED: &str = "https://github.com/Regncreative/Stash/releases/download/channel-beta/latest.json";

fn set_status(app: &AppHandle, status: UpdateStatus) {
    let state = app.state::<AppState>();
    *state.update.lock().unwrap_or_else(|e| e.into_inner()) = status.clone();
    let _ = app.emit("update-status", status);
}

pub fn status(app: &AppHandle) -> UpdateStatus {
    app.state::<AppState>()
        .update
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .clone()
}

pub fn has_pending(app: &AppHandle) -> bool {
    app.state::<AppState>()
        .pending_update
        .lock()
        .map(|p| p.is_some())
        .unwrap_or(false)
}

fn notify(app: &AppHandle, title: &str, body: &str) {
    let state = app.state::<AppState>();
    let enabled = db::get_settings(&state.db(), state.language)
        .map(|s| s.notifications)
        .unwrap_or(true);
    if enabled {
        let _ = app.notification().builder().title(title).body(body).show();
    }
}

/// Stable per-install bucket 0–99 for staged rollouts.
fn rollout_bucket(app: &AppHandle) -> u64 {
    let state = app.state::<AppState>();
    let conn = state.db();
    let id = match db::get_raw(&conn, "installId").ok().flatten() {
        Some(serde_json::Value::String(id)) => id,
        _ => {
            let id = uuid::Uuid::new_v4().to_string();
            let _ = db::set_raw(&conn, "installId", &serde_json::Value::String(id.clone()));
            id
        }
    };
    bucket_for(&id)
}

pub fn bucket_for(install_id: &str) -> u64 {
    // FNV-1a: stable across releases, unlike std's randomized hasher.
    let mut h: u64 = 0xcbf2_9ce4_8422_2325;
    for b in install_id.bytes() {
        h ^= b as u64;
        h = h.wrapping_mul(0x0100_0000_01b3);
    }
    h % 100
}

/// `stagingPercentage` in the update manifest limits who gets a release;
/// the Rollout workflow edits it (0 halts a bad release).
pub fn in_rollout(raw: &serde_json::Value, bucket: u64) -> bool {
    match raw.get("stagingPercentage").and_then(|v| v.as_u64()) {
        Some(pct) => bucket < pct,
        None => true,
    }
}

pub async fn check(app: &AppHandle, manual: bool) -> UpdateStatus {
    if cfg!(debug_assertions) {
        set_status(app, UpdateStatus::Dev);
        return UpdateStatus::Dev;
    }
    if has_pending(app) {
        return status(app);
    }
    let state = app.state::<AppState>();
    let lang = state.language;
    let channel = db::get_settings(&state.db(), lang)
        .map(|s| s.update_channel)
        .unwrap_or(UpdateChannel::Stable);
    let feed = match channel {
        UpdateChannel::Stable => STABLE_FEED,
        UpdateChannel::Beta => BETA_FEED,
    };
    set_status(app, UpdateStatus::Checking);

    let result = async {
        let updater = app
            .updater_builder()
            .endpoints(vec![feed.parse().map_err(|e| format!("{e}"))?])
            .map_err(|e| e.to_string())?
            .timeout(Duration::from_secs(30))
            .build()
            .map_err(|e| e.to_string())?;
        updater.check().await.map_err(|e| e.to_string())
    }
    .await;

    let t = i18n::strings(lang);
    let current = app.package_info().version.to_string();
    match result {
        Ok(Some(update)) if in_rollout(&update.raw_json, rollout_bucket(app)) => {
            let version = update.version.clone();
            set_status(app, UpdateStatus::Available { version: version.clone() });
            notify(app, t.update_title, &i18n::update_downloading(lang, &version));
            download(app, update).await
        }
        Ok(_) => {
            let s = UpdateStatus::NotAvailable { version: current.clone() };
            set_status(app, s.clone());
            if manual {
                notify(app, "Stash", &i18n::up_to_date(lang, &current));
            }
            s
        }
        Err(message) => {
            log::warn!("update check failed: {message}");
            let s = UpdateStatus::Error { message: message.clone() };
            set_status(app, s.clone());
            if manual {
                notify(app, t.update_error, &message);
            }
            s
        }
    }
}

async fn download(app: &AppHandle, update: tauri_plugin_updater::Update) -> UpdateStatus {
    let mut received = 0usize;
    let mut last_percent = u32::MAX;
    let progress_app = app.clone();
    let bytes = update
        .download(
            move |chunk, total| {
                received += chunk;
                if let Some(total) = total.filter(|t| *t > 0) {
                    let percent = ((received as u64 * 100) / total) as u32;
                    if percent != last_percent {
                        last_percent = percent;
                        set_status(&progress_app, UpdateStatus::Downloading { percent });
                    }
                }
            },
            || {},
        )
        .await;

    match bytes {
        Ok(bytes) => {
            let version = update.version.clone();
            let lang = app.state::<AppState>().language;
            *app.state::<AppState>()
                .pending_update
                .lock()
                .unwrap_or_else(|e| e.into_inner()) = Some((update, bytes));
            let s = UpdateStatus::Downloaded { version: version.clone() };
            set_status(app, s.clone());
            notify(app, i18n::strings(lang).update_ready_title, &i18n::update_ready(lang, &version));
            s
        }
        Err(e) => {
            // Includes signature verification failures.
            log::error!("update download failed: {e}");
            let s = UpdateStatus::Error { message: e.to_string() };
            set_status(app, s.clone());
            s
        }
    }
}

/// Run the downloaded installer; Stash exits and the new version starts.
pub fn install(app: &AppHandle) {
    let pending = app
        .state::<AppState>()
        .pending_update
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .take();
    if let Some((update, bytes)) = pending {
        if let Err(e) = update.install(bytes) {
            log::error!("update install failed: {e}");
            set_status(app, UpdateStatus::Error { message: e.to_string() });
        }
    }
}

/// Quiet check shortly after launch.
pub fn schedule_startup_check(app: &AppHandle) {
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(Duration::from_secs(8)).await;
        check(&app, false).await;
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rollout_respects_staging_percentage() {
        let staged = serde_json::json!({ "version": "2.0.0", "stagingPercentage": 10 });
        assert!(in_rollout(&staged, 3));
        assert!(!in_rollout(&staged, 10));
        assert!(!in_rollout(&serde_json::json!({ "stagingPercentage": 0 }), 0));
        assert!(in_rollout(&serde_json::json!({ "version": "2.0.0" }), 99));
    }

    #[test]
    fn buckets_are_stable_and_spread() {
        assert_eq!(bucket_for("abc"), bucket_for("abc"));
        let buckets: std::collections::HashSet<_> =
            (0..1000).map(|i| bucket_for(&format!("install-{i}"))).collect();
        assert!(buckets.len() > 90, "only {} distinct buckets", buckets.len());
    }
}
