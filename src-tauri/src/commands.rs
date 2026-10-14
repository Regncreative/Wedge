//! Commands invoked by the panel (see src/renderer/src/lib/api.ts).
//! Every argument from the webview is validated here before use.

use std::sync::atomic::Ordering;

use serde::Deserialize;
use serde_json::{json, Value};
use tauri::{AppHandle, Manager, State};
use tauri_plugin_autostart::ManagerExt as _;
use tauri_plugin_clipboard_manager::ClipboardExt;
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_notification::NotificationExt;
use tauri_plugin_opener::OpenerExt;

use crate::db::{self, DeleteShelfError};
use crate::files;
use crate::hotkey;
use crate::i18n;
use crate::models::*;
use crate::panel;
use crate::state::AppState;
use crate::transfer;
use crate::updater;
use crate::win;

type CmdResult<T> = Result<T, String>;

fn err(e: impl std::fmt::Display) -> String {
    e.to_string()
}

// ── Validation ────────────────────────────────────────────

pub const MAX_ITEMS: usize = 10_000;
/// Windows extended-length paths can reach 32,767 characters.
pub const MAX_PATH_CHARS: usize = 32_767;

pub fn check_id(id: &str) -> CmdResult<()> {
    if id.is_empty() || id.len() > 100 {
        return Err("Invalid arguments: id".into());
    }
    Ok(())
}

pub fn check_ids(ids: &[String]) -> CmdResult<()> {
    if ids.is_empty() || ids.len() > MAX_ITEMS {
        return Err("Invalid arguments: ids".into());
    }
    ids.iter().try_for_each(|id| check_id(id))
}

pub fn check_paths(paths: &[String]) -> CmdResult<()> {
    if paths.len() > MAX_ITEMS
        || paths
            .iter()
            .any(|p| p.is_empty() || p.chars().count() > MAX_PATH_CHARS)
    {
        return Err("Invalid arguments: paths".into());
    }
    Ok(())
}

pub fn check_shelf_name(name: &str) -> CmdResult<String> {
    let name = name.trim();
    if name.is_empty() || name.chars().count() > 100 {
        return Err("Invalid arguments: name".into());
    }
    Ok(name.to_string())
}

pub fn check_settings_patch(p: &SettingsPatch) -> CmdResult<()> {
    let bad = |what: &str| Err(format!("Invalid arguments: {what}"));
    if let Some(c) = &p.accent_color {
        if !db::is_hex_color(c) {
            return bad("accentColor");
        }
    }
    if let Some(h) = &p.open_hotkey {
        if h.is_empty() || h.len() > 100 {
            return bad("openHotkey");
        }
    }
    for id in [&p.default_shelf_id, &p.last_shelf_id]
        .into_iter()
        .flatten()
    {
        check_id(id)?;
    }
    if p.idle_opacity.is_some_and(|v| !v.is_finite())
        || p.idle_timeout_sec.is_some_and(|v| !v.is_finite())
    {
        return bad("idle");
    }
    Ok(())
}

fn file_by_id(state: &AppState, id: &str) -> CmdResult<Option<StashFile>> {
    check_id(id)?;
    db::get_file(&state.db(), id).map_err(err)
}

// ── Window ────────────────────────────────────────────────

#[tauri::command]
pub fn hide_panel(app: AppHandle) {
    panel::hide(&app);
}

#[tauri::command]
pub fn set_pinned(state: State<'_, AppState>, pinned: bool) -> bool {
    state.pinned.store(pinned, Ordering::SeqCst);
    pinned
}

#[tauri::command]
pub fn is_pinned(state: State<'_, AppState>) -> bool {
    state.pinned.load(Ordering::SeqCst)
}

// ── Files ─────────────────────────────────────────────────

#[tauri::command]
pub async fn list_files(
    state: State<'_, AppState>,
    shelf_id: Option<String>,
) -> CmdResult<Vec<StashFile>> {
    if let Some(id) = &shelf_id {
        check_id(id)?;
    }
    let mut list = db::list_files(&state.db(), shelf_id.as_deref()).map_err(err)?;
    let checks = files::check_all(list.iter().map(|f| f.absolute_path.clone()).collect()).await;
    for (f, exists) in list.iter_mut().zip(checks) {
        f.exists = exists == Some(true);
    }
    Ok(list)
}

#[tauri::command]
pub async fn add_files(
    app: AppHandle,
    state: State<'_, AppState>,
    paths: Vec<String>,
    shelf_id: Option<String>,
) -> CmdResult<AddFilesResult> {
    check_paths(&paths)?;
    if let Some(id) = &shelf_id {
        check_id(id)?;
    }
    let metas = tauri::async_runtime::spawn_blocking(move || {
        paths
            .iter()
            .filter_map(|p| files::collect_meta(p))
            .collect::<Vec<_>>()
    })
    .await
    .map_err(err)?;

    let (result, notify) = {
        let conn = state.db();
        let settings = db::get_settings(&conn, state.language).map_err(err)?;
        let shelves = db::list_shelves(&conn).map_err(err)?;
        let target = shelf_id
            .filter(|id| shelves.iter().any(|s| &s.id == id))
            .or_else(|| Some(settings.default_shelf_id.clone()).filter(|id| !id.is_empty()))
            .or_else(|| shelves.first().map(|s| s.id.clone()))
            .ok_or("No shelf available")?;
        let (added, skipped) = db::add_files(&conn, &metas, &target).map_err(err)?;
        let shelf_name = shelves
            .iter()
            .find(|s| s.id == target)
            .map(|s| s.name.clone())
            .unwrap_or_default();
        (
            AddFilesResult {
                added,
                skipped,
                shelf_id: target,
                shelf_name,
            },
            settings.notifications,
        )
    };

    // Drops land on the open panel, which shows its own toast; only notify
    // when files arrive while the panel is hidden.
    let visible = panel::window(&app)
        .and_then(|w| w.is_visible().ok())
        .unwrap_or(false);
    if result.added > 0 && notify && !visible {
        let body = i18n::files_added(state.language, result.added, &result.shelf_name);
        let _ = app
            .notification()
            .builder()
            .title("Stash")
            .body(body)
            .show();
    }
    Ok(result)
}

#[tauri::command]
pub fn remove_files(state: State<'_, AppState>, ids: Vec<String>) -> CmdResult<bool> {
    check_ids(&ids)?;
    db::remove_files(&state.db(), &ids).map_err(err)?;
    Ok(true)
}

#[tauri::command]
pub async fn clear_missing_files(state: State<'_, AppState>) -> CmdResult<usize> {
    let all = db::list_files(&state.db(), None).map_err(err)?;
    let checks = files::check_all(all.iter().map(|f| f.absolute_path.clone()).collect()).await;
    // Only drop confirmed-missing files; an unreachable network share
    // (timeout) may come back, so its references are kept.
    let missing: Vec<String> = all
        .into_iter()
        .zip(checks)
        .filter(|(_, c)| *c == Some(false))
        .map(|(f, _)| f.id)
        .collect();
    if !missing.is_empty() {
        db::remove_files(&state.db(), &missing).map_err(err)?;
    }
    Ok(missing.len())
}

#[tauri::command]
pub fn pin_files(state: State<'_, AppState>, ids: Vec<String>, pinned: bool) -> CmdResult<bool> {
    check_ids(&ids)?;
    db::set_files_pinned(&state.db(), &ids, pinned).map_err(err)?;
    Ok(true)
}

#[tauri::command]
pub fn move_file(state: State<'_, AppState>, id: String, shelf_id: String) -> CmdResult<bool> {
    check_id(&id)?;
    check_id(&shelf_id)?;
    db::move_file(&state.db(), &id, &shelf_id).map_err(err)?;
    Ok(true)
}

#[tauri::command]
pub async fn open_file(
    app: AppHandle,
    state: State<'_, AppState>,
    id: String,
) -> CmdResult<OpResult> {
    let Some(file) = file_by_id(&state, &id)? else {
        return Ok(OpResult::err("not_found"));
    };
    if !files::is_reachable(&file.absolute_path).await {
        return Ok(OpResult::err("missing"));
    }
    let _ = db::touch_file(&state.db(), &id);
    Ok(
        match app.opener().open_path(&file.absolute_path, None::<&str>) {
            Ok(()) => OpResult::ok(),
            Err(e) => OpResult::err(e.to_string()),
        },
    )
}

#[tauri::command]
pub async fn reveal_file(
    app: AppHandle,
    state: State<'_, AppState>,
    id: String,
) -> CmdResult<OpResult> {
    let Some(file) = file_by_id(&state, &id)? else {
        return Ok(OpResult::err("not_found"));
    };
    if !files::is_reachable(&file.absolute_path).await {
        return Ok(OpResult::err("missing"));
    }
    Ok(match app.opener().reveal_item_in_dir(&file.absolute_path) {
        Ok(()) => OpResult::ok(),
        Err(e) => OpResult::err(e.to_string()),
    })
}

#[tauri::command]
pub fn copy_path(app: AppHandle, state: State<'_, AppState>, id: String) -> CmdResult<bool> {
    let Some(file) = file_by_id(&state, &id)? else {
        return Ok(false);
    };
    app.clipboard()
        .write_text(file.absolute_path)
        .map_err(err)?;
    Ok(true)
}

#[tauri::command]
pub async fn show_properties(
    app: AppHandle,
    state: State<'_, AppState>,
    id: String,
) -> CmdResult<OpResult> {
    let Some(file) = file_by_id(&state, &id)? else {
        return Ok(OpResult::err("not_found"));
    };
    if !files::is_reachable(&file.absolute_path).await {
        return Ok(OpResult::err("missing"));
    }
    panel::yield_to_dialog(&app);
    // The property sheet must be opened from the UI (STA) thread.
    let (tx, rx) = tokio::sync::oneshot::channel();
    let path = file.absolute_path;
    app.run_on_main_thread(move || {
        let _ = tx.send(win::show_properties(&path));
    })
    .map_err(err)?;
    Ok(if rx.await.unwrap_or(false) {
        OpResult::ok()
    } else {
        OpResult::err("failed")
    })
}

async fn shell_image(
    state: &AppState,
    id: &str,
    size: i32,
    thumbnail: bool,
) -> CmdResult<Option<String>> {
    let Some(file) = file_by_id(state, id)? else {
        return Ok(None);
    };
    if file.is_directory && thumbnail {
        return Ok(None);
    }
    let key = format!("{size}:{thumbnail}:{}", file.absolute_path);
    if let Some(hit) = state.icon_cache.lock().map_err(err)?.get(&key) {
        return Ok(hit.clone());
    }
    if !files::is_reachable(&file.absolute_path).await {
        return Ok(None);
    }
    let path = file.absolute_path;
    let url = tauri::async_runtime::spawn_blocking(move || {
        win::shell_image_data_url(&path, size, thumbnail)
    })
    .await
    .map_err(err)?;
    let mut cache = state.icon_cache.lock().map_err(err)?;
    if cache.len() > 2_000 {
        cache.clear(); // simple bound; icons are cheap to recreate
    }
    cache.insert(key, url.clone());
    Ok(url)
}

#[tauri::command]
pub async fn file_icon(state: State<'_, AppState>, id: String) -> CmdResult<Option<String>> {
    shell_image(&state, &id, 48, false).await
}

#[tauri::command]
pub async fn file_preview(state: State<'_, AppState>, id: String) -> CmdResult<Option<String>> {
    shell_image(&state, &id, 200, true).await
}

/// Start a native drag of the given files into other apps. Runs on the UI
/// thread (synchronous command) and returns when the drag ends.
#[tauri::command]
pub fn start_drag(app: AppHandle, state: State<'_, AppState>, ids: Vec<String>) -> CmdResult<()> {
    check_ids(&ids)?;
    let paths: Vec<std::path::PathBuf> = {
        let conn = state.db();
        ids.iter()
            .filter_map(|id| db::get_file(&conn, id).ok().flatten())
            .map(|f| {
                let _ = db::touch_file(&conn, &f.id);
                std::path::PathBuf::from(f.absolute_path)
            })
            // The drag must start while the button is still down, so this is a
            // quick local check; the panel only offers files it saw as reachable.
            .filter(|p| p.exists())
            .collect()
    };
    if paths.is_empty() {
        return Ok(());
    }
    let window = panel::window(&app).ok_or("no window")?;
    let icon = win::shell_image_png(&paths[0].to_string_lossy(), 64, false)
        .unwrap_or_else(|| include_bytes!("../icons/tray.png").to_vec());
    drag::start_drag(
        &window,
        drag::DragItem::Files(paths),
        drag::Image::Raw(icon),
        |_result, _cursor| {},
        drag::Options::default(),
    )
    .map_err(err)
}

// ── Shelves ───────────────────────────────────────────────

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ShelfInput {
    name: String,
    icon: Option<String>,
    color: Option<String>,
}

#[tauri::command]
pub fn list_shelves(state: State<'_, AppState>) -> CmdResult<Vec<Shelf>> {
    db::list_shelves(&state.db()).map_err(err)
}

#[tauri::command]
pub fn create_shelf(state: State<'_, AppState>, input: ShelfInput) -> CmdResult<Shelf> {
    let name = check_shelf_name(&input.name)?;
    if input
        .icon
        .as_ref()
        .is_some_and(|i| i.is_empty() || i.len() > 50)
        || input.color.as_ref().is_some_and(|c| !db::is_hex_color(c))
    {
        return Err("Invalid arguments: style".into());
    }
    db::create_shelf(
        &state.db(),
        &name,
        input.icon.as_deref(),
        input.color.as_deref(),
    )
    .map_err(err)
}

#[tauri::command]
pub fn rename_shelf(state: State<'_, AppState>, id: String, name: String) -> CmdResult<bool> {
    check_id(&id)?;
    let name = check_shelf_name(&name)?;
    db::rename_shelf(&state.db(), &id, &name).map_err(err)?;
    Ok(true)
}

#[tauri::command]
pub fn delete_shelf(state: State<'_, AppState>, id: String) -> CmdResult<bool> {
    check_id(&id)?;
    let conn = state.db();
    match db::delete_shelf(&conn, &id) {
        Ok(()) => {
            // Heal default/last shelf references.
            db::get_settings(&conn, state.language).map_err(err)?;
            Ok(true)
        }
        Err(DeleteShelfError::LastShelf) => Err("Cannot delete the last shelf".into()),
        Err(DeleteShelfError::Db(e)) => Err(e),
    }
}

// ── Settings & app ────────────────────────────────────────

#[tauri::command]
pub fn get_stats(state: State<'_, AppState>) -> CmdResult<ShelfStats> {
    db::stats(&state.db()).map_err(err)
}

#[tauri::command]
pub fn get_settings(state: State<'_, AppState>) -> CmdResult<AppSettings> {
    db::get_settings(&state.db(), state.language).map_err(err)
}

#[tauri::command]
pub fn set_settings(
    app: AppHandle,
    state: State<'_, AppState>,
    patch: SettingsPatch,
) -> CmdResult<AppSettings> {
    check_settings_patch(&patch)?;
    // Register first: an unavailable hotkey must not be persisted.
    if let Some(h) = &patch.open_hotkey {
        if !hotkey::reregister(&app, h) {
            return Err("hotkey_unavailable".into());
        }
    }
    let next = db::set_settings(&state.db(), &patch, state.language).map_err(err)?;
    if patch.start_with_windows.is_some() {
        sync_autostart(&app, next.start_with_windows);
    }
    Ok(next)
}

/// Start with Windows. Debug builds never register themselves.
pub fn sync_autostart(app: &AppHandle, enabled: bool) {
    if cfg!(debug_assertions) {
        return;
    }
    let launcher = app.autolaunch();
    let current = launcher.is_enabled().unwrap_or(false);
    let result = match (enabled, current) {
        (true, false) => launcher.enable(),
        (false, true) => launcher.disable(),
        _ => Ok(()),
    };
    if let Err(e) = result {
        log::warn!("autostart: {e}");
    }
}

#[tauri::command]
pub fn app_version(app: AppHandle) -> String {
    app.package_info().version.to_string()
}

#[tauri::command]
pub fn open_releases(app: AppHandle) -> bool {
    app.opener()
        .open_url(
            "https://github.com/Regncreative/Stash/releases/latest",
            None::<&str>,
        )
        .is_ok()
}

#[tauri::command]
pub fn open_logs_folder(app: AppHandle, state: State<'_, AppState>) -> CmdResult<String> {
    let dir = state.data_dir.join("logs");
    let _ = std::fs::create_dir_all(&dir);
    app.opener()
        .open_path(dir.to_string_lossy(), None::<&str>)
        .map_err(err)?;
    Ok(String::new())
}

#[tauri::command]
pub async fn export_data(app: AppHandle, state: State<'_, AppState>) -> CmdResult<Value> {
    let data = transfer::build_export(&state.db(), state.language).map_err(err)?;
    let stamp = data.exported_at.get(..10).unwrap_or("backup").to_string();
    let mut dialog = app
        .dialog()
        .file()
        .set_file_name(format!("stash-backup-{stamp}.json"))
        .add_filter("Stash backup", &["json"]);
    if let Ok(docs) = app.path().document_dir() {
        dialog = dialog.set_directory(docs);
    }
    if let Some(win) = panel::window(&app) {
        dialog = dialog.set_parent(&win);
    }
    let Some(target) = dialog.blocking_save_file() else {
        return Ok(json!({ "ok": false, "canceled": true }));
    };
    let path = target.into_path().map_err(err)?;
    let text = serde_json::to_string_pretty(&data).map_err(err)?;
    tokio::fs::write(&path, text).await.map_err(err)?;
    Ok(json!({ "ok": true }))
}

#[tauri::command]
pub async fn import_data(app: AppHandle, state: State<'_, AppState>) -> CmdResult<Value> {
    let mut dialog = app.dialog().file().add_filter("Stash backup", &["json"]);
    if let Some(win) = panel::window(&app) {
        dialog = dialog.set_parent(&win);
    }
    let Some(source) = dialog.blocking_pick_file() else {
        return Ok(json!({ "ok": false, "canceled": true }));
    };
    let path = source.into_path().map_err(err)?;
    let text = match tokio::fs::read_to_string(&path).await {
        Ok(t) => t,
        Err(e) => {
            log::warn!("import: {e}");
            return Ok(json!({ "ok": false, "canceled": false }));
        }
    };
    match transfer::apply_import(&state.db(), &text, state.language) {
        Ok((shelves, files)) => Ok(json!({ "ok": true, "shelves": shelves, "files": files })),
        Err(e) => {
            log::warn!("import rejected: {e:?}");
            Ok(json!({ "ok": false, "canceled": false }))
        }
    }
}

// ── Updates ───────────────────────────────────────────────

#[tauri::command]
pub async fn check_for_updates(app: AppHandle) -> UpdateStatus {
    updater::check(&app, true).await
}

#[tauri::command]
pub fn install_update(app: AppHandle) -> bool {
    updater::install(&app);
    true
}

#[tauri::command]
pub fn update_status(app: AppHandle) -> UpdateStatus {
    updater::status(&app)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validates_ids_and_paths() {
        assert!(check_id("").is_err());
        assert!(check_id(&"x".repeat(101)).is_err());
        assert!(check_id("abc").is_ok());
        assert!(check_ids(&[]).is_err());
        assert!(check_paths(&["C:\\a.txt".into()]).is_ok());
        assert!(check_paths(&["".into()]).is_err());
        assert!(check_paths(&["x".repeat(MAX_PATH_CHARS + 1)]).is_err());
    }

    #[test]
    fn trims_shelf_names_and_refuses_empty_ones() {
        assert_eq!(check_shelf_name("  Docs  ").unwrap(), "Docs");
        assert!(check_shelf_name("   ").is_err());
        assert!(check_shelf_name(&"x".repeat(101)).is_err());
    }

    #[test]
    fn validates_settings_patches() {
        let ok = SettingsPatch {
            accent_color: Some("#00ff00".into()),
            ..Default::default()
        };
        assert!(check_settings_patch(&ok).is_ok());
        let css = SettingsPatch {
            accent_color: Some("red; background:url(x)".into()),
            ..Default::default()
        };
        assert!(check_settings_patch(&css).is_err());
        let hk = SettingsPatch {
            open_hotkey: Some(String::new()),
            ..Default::default()
        };
        assert!(check_settings_patch(&hk).is_err());
    }
}
