//! Background work: automatic shelves fed by folder watchers, temporary-shelf
//! expiry, reminders, and the content index used by search.

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::mpsc;
use std::time::{Duration, Instant};

use notify::event::{CreateKind, ModifyKind, RenameMode};
use notify::{EventKind, RecursiveMode, Watcher};
use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_notification::NotificationExt;

use crate::db;
use crate::files;
use crate::i18n;
use crate::models::FileInput;
use crate::state::AppState;
use crate::textract;

/// Emitted whenever files or shelves change: from a watcher, the phone,
/// a shared folder or expiry (with what arrived), or from any window
/// (source "app").
pub const FILES_CHANGED: &str = "files-changed";

/// Every window learns about changes made in another one (the drawer, a
/// desktop widget) without polling: the database reports each write to the
/// files or shelves tables, and a moment after a burst of them one
/// `files-changed` event (source "app") goes out.
pub fn announce_changes(app: &AppHandle, conn: &rusqlite::Connection) {
    use std::sync::atomic::{AtomicBool, Ordering};
    static PENDING: AtomicBool = AtomicBool::new(false);
    let app = app.clone();
    let hooked = conn.update_hook(Some(
        move |_: rusqlite::hooks::Action, _: &str, table: &str, _: i64| {
            if !matches!(table, "files" | "shelves") || PENDING.swap(true, Ordering::SeqCst) {
                return;
            }
            // Called inside the write, with the database locked: hand over.
            let app = app.clone();
            std::thread::spawn(move || {
                std::thread::sleep(Duration::from_millis(150));
                PENDING.store(false, Ordering::SeqCst);
                let _ = app.emit(
                    FILES_CHANGED,
                    FilesChanged {
                        added: 0,
                        shelf_name: String::new(),
                        source: "app".into(),
                    },
                );
            });
        },
    ));
    // Without it, other windows only catch up on their next refresh.
    if let Err(e) = hooked {
        log::warn!("database change hook unavailable: {e}");
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FilesChanged {
    pub added: usize,
    pub shelf_name: String,
    pub source: String,
}

/// Partial downloads and other files that are never worth shelving.
pub fn is_ignored(path: &Path) -> bool {
    let name = path
        .file_name()
        .map(|n| n.to_string_lossy().to_lowercase())
        .unwrap_or_default();
    let ext = path
        .extension()
        .map(|e| e.to_string_lossy().to_lowercase())
        .unwrap_or_default();
    name.is_empty()
        || name.starts_with('.')
        || name.starts_with("~$")
        || name == "desktop.ini"
        || name == "thumbs.db"
        || matches!(
            ext.as_str(),
            "crdownload"
                | "part"
                | "partial"
                | "tmp"
                | "temp"
                | "download"
                | "opdownload"
                | "!ut"
                | "td"
        )
}

/// Add paths to the shelf chosen by the sorting rules, or else to the
/// automatic shelf for `source` (created on first use), or `fallback`.
pub fn ingest(
    app: &AppHandle,
    paths: &[String],
    source: &str,
    fallback: Option<&str>,
) -> Option<FilesChanged> {
    let metas: Vec<FileInput> = paths
        .iter()
        .filter_map(|p| files::collect_meta(p))
        .collect();
    if metas.is_empty() {
        return None;
    }
    let state = app.state::<AppState>();
    let conn = state.db();
    let mut added_total = 0;
    let mut last_shelf = String::new();
    let mut by_shelf: HashMap<String, Vec<FileInput>> = HashMap::new();
    for meta in metas {
        let target = match db::shelf_for(&conn, &meta.extension, source).ok().flatten() {
            Some(id) => id,
            None => match fallback {
                Some(id) => id.to_string(),
                None => {
                    let (name, icon, color) = i18n::kind_shelf(state.language, source);
                    db::ensure_kind_shelf(&conn, source, name, icon, color)
                        .ok()?
                        .id
                }
            },
        };
        by_shelf.entry(target).or_default().push(meta);
    }
    let shelves = db::list_shelves(&conn).ok()?;
    drop(conn);
    for (shelf_id, items) in &mut by_shelf {
        // A shared shelf gets copies in its folder (outside the db lock).
        let folder = shelves
            .iter()
            .find(|s| &s.id == shelf_id)
            .and_then(|s| s.folder.clone());
        if let Some(folder) = folder {
            let paths: Vec<String> = items.iter().map(|m| m.absolute_path.clone()).collect();
            *items = crate::shared::copy_in(&folder, &paths)
                .iter()
                .filter_map(|p| files::collect_meta(p))
                .collect();
        }
    }
    let conn = state.db();
    for (shelf_id, items) in by_shelf {
        if let Ok((added, _)) = db::add_files_from(&conn, &items, &shelf_id, source) {
            added_total += added;
            if added > 0 {
                last_shelf = shelves
                    .iter()
                    .find(|s| s.id == shelf_id)
                    .map(|s| s.name.clone())
                    .unwrap_or_default();
            }
        }
    }
    drop(conn);
    let change = FilesChanged {
        added: added_total,
        shelf_name: last_shelf,
        source: source.into(),
    };
    if added_total > 0 {
        let _ = app.emit(FILES_CHANGED, change.clone());
        index_soon(app);
    }
    Some(change)
}

fn watched_folders(app: &AppHandle) -> Vec<(PathBuf, &'static str)> {
    let state = app.state::<AppState>();
    let Ok(settings) = db::get_settings(&state.db(), state.language) else {
        return Vec::new();
    };
    // Tests point the watchers at their own folders.
    let env_dir = |name: &str| std::env::var_os(name).map(PathBuf::from);
    let mut out = Vec::new();
    if settings.watch_downloads {
        if let Some(dir) = env_dir("STASH_DOWNLOADS_DIR").or_else(|| app.path().download_dir().ok())
        {
            out.push((dir, "downloads"));
        }
    }
    if settings.watch_screenshots {
        let default = || app.path().picture_dir().ok().map(|d| d.join("Screenshots"));
        if let Some(dir) = env_dir("STASH_SCREENSHOTS_DIR").or_else(default) {
            out.push((dir, "screenshots"));
        }
    }
    out
}

/// (Re)start the Downloads/Screenshots watchers to match the settings.
pub fn restart_watchers(app: &AppHandle) {
    let state = app.state::<AppState>();
    let mut slot = state.watcher.lock().unwrap_or_else(|e| e.into_inner());
    *slot = None; // dropping the old watcher stops it

    let folders = watched_folders(app);
    if folders.is_empty() {
        return;
    }
    let (tx, rx) = mpsc::channel::<(PathBuf, &'static str)>();
    let roots = folders.clone();
    let watcher = notify::recommended_watcher(move |res: notify::Result<notify::Event>| {
        let Ok(event) = res else { return };
        let relevant = matches!(
            event.kind,
            EventKind::Create(CreateKind::File | CreateKind::Any)
                | EventKind::Modify(ModifyKind::Name(RenameMode::To | RenameMode::Any))
        );
        if !relevant {
            return;
        }
        for path in event.paths {
            if is_ignored(&path) {
                continue;
            }
            if let Some((_, source)) = roots
                .iter()
                .find(|(root, _)| path.parent() == Some(root.as_path()))
            {
                let _ = tx.send((path, source));
            }
        }
    });
    let Ok(mut watcher) = watcher else {
        log::warn!("folder watcher unavailable");
        return;
    };
    for (dir, _) in &folders {
        if dir.is_dir() {
            if let Err(e) = watcher.watch(dir, RecursiveMode::NonRecursive) {
                log::warn!("cannot watch {}: {e}", dir.display());
            }
        }
    }
    *slot = Some(watcher);
    drop(slot);

    // Settle: wait until a new file stops growing (downloads, screenshot
    // writers) before adding it.
    let app = app.clone();
    std::thread::spawn(move || {
        let mut pending: HashMap<PathBuf, (&'static str, u64, Instant)> = HashMap::new();
        loop {
            match rx.recv_timeout(Duration::from_millis(500)) {
                Ok((path, source)) => {
                    pending.insert(path, (source, u64::MAX, Instant::now()));
                }
                Err(mpsc::RecvTimeoutError::Disconnected) => break,
                Err(mpsc::RecvTimeoutError::Timeout) => {}
            }
            let mut ready: HashMap<&'static str, Vec<String>> = HashMap::new();
            pending.retain(|path, (source, last_size, since)| {
                let Ok(meta) = std::fs::metadata(path) else {
                    return since.elapsed() < Duration::from_secs(30); // may appear after a rename
                };
                if !meta.is_file() {
                    return false;
                }
                if meta.len() != *last_size {
                    *last_size = meta.len();
                    *since = Instant::now();
                    return true;
                }
                if since.elapsed() >= Duration::from_millis(1500)
                    && std::fs::File::open(path).is_ok()
                {
                    ready
                        .entry(source)
                        .or_default()
                        .push(path.to_string_lossy().into_owned());
                    return false;
                }
                true
            });
            for (source, paths) in ready {
                ingest(&app, &paths, source, None);
            }
        }
    });
}

/// Index newly added files right away, off the calling thread.
pub fn index_soon(app: &AppHandle) {
    let app = app.clone();
    std::thread::spawn(move || index_batch(&app));
}

/// Index text for files that don't have any yet (a batch at a time).
fn index_batch(app: &AppHandle) {
    let state = app.state::<AppState>();
    let Ok(batch) = db::files_without_text(&state.db(), 25) else {
        return;
    };
    for file in batch {
        let path = PathBuf::from(&file.absolute_path);
        let text = textract::extract(&path).unwrap_or_default();
        let _ = db::index_text(&state.db(), &file.id, &text);
    }
}

fn run_periodic(app: &AppHandle, tick: u64) {
    let state = app.state::<AppState>();
    let now = db::now_ms();
    if tick.is_multiple_of(4) {
        let expired = db::expire_files(&state.db(), now).unwrap_or(0);
        if expired > 0 {
            let _ = app.emit(
                FILES_CHANGED,
                FilesChanged {
                    added: 0,
                    shelf_name: String::new(),
                    source: "expiry".into(),
                },
            );
        }
        let due = db::take_due_reminders(&state.db(), now).unwrap_or_default();
        for file in due {
            let body = if file.note.is_empty() {
                file.name.clone()
            } else {
                format!("{}\n{}", file.name, file.note)
            };
            let _ = app
                .notification()
                .builder()
                .title(i18n::strings(state.language).reminder_title)
                .body(body)
                .show();
        }
    }
    if tick.is_multiple_of(2) {
        crate::shared::refresh(app, None);
    }
    index_batch(app);
}

/// Every 15 s: index new files; every 30 s: re-read shared folders (some
/// cloud drives don't report changes); every minute: expiry and reminders.
pub fn start_background_jobs(app: &AppHandle) {
    let app = app.clone();
    std::thread::spawn(move || {
        let mut tick = 0u64;
        loop {
            std::thread::sleep(Duration::from_secs(15));
            run_periodic(&app, tick);
            tick += 1;
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ignores_partial_downloads_and_system_files() {
        for p in [
            "C:\\d\\movie.mp4.crdownload",
            "C:\\d\\a.part",
            "C:\\d\\~$report.docx",
            "C:\\d\\desktop.ini",
            "C:\\d\\.hidden",
        ] {
            assert!(is_ignored(Path::new(p)), "{p}");
        }
        for p in [
            "C:\\d\\invoice.pdf",
            "C:\\d\\Screenshot 2026-10-14.png",
            "C:\\d\\archive.zip",
        ] {
            assert!(!is_ignored(Path::new(p)), "{p}");
        }
    }
}
