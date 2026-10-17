//! Commands invoked by the panel (see src/renderer/src/lib/api.ts).
//! Every argument from the webview is validated here before use.

use std::sync::atomic::Ordering;

use serde::Deserialize;
use serde_json::{json, Value};
use tauri::{AppHandle, Manager, State};
#[cfg(not(feature = "store"))]
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

pub type CmdResult<T> = Result<T, String>;

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
            return bad("hotkey");
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
    let (target, notify) = {
        let conn = state.db();
        let settings = db::get_settings(&conn, state.language).map_err(err)?;
        let shelves = db::list_shelves(&conn).map_err(err)?;
        let target = shelf_id
            .and_then(|id| shelves.iter().find(|s| s.id == id))
            .or_else(|| shelves.iter().find(|s| s.id == settings.default_shelf_id))
            .or_else(|| shelves.first())
            .cloned()
            .ok_or("No shelf available")?;
        (target, settings.notifications)
    };
    let folder = target.folder.clone();
    let metas = tauri::async_runtime::spawn_blocking(move || {
        // A shared shelf gets copies in its folder.
        let paths = match &folder {
            Some(folder) => crate::shared::copy_in(folder, &paths),
            None => paths,
        };
        paths
            .iter()
            .filter_map(|p| files::collect_meta(p))
            .collect::<Vec<_>>()
    })
    .await
    .map_err(err)?;

    let (added, skipped) = db::add_files(&state.db(), &metas, &target.id).map_err(err)?;
    let result = AddFilesResult {
        added,
        skipped,
        shelf_id: target.id,
        shelf_name: target.name,
    };

    if result.added > 0 {
        crate::services::index_soon(&app);
    }
    // Drops land on the open panel, which shows its own toast; only notify
    // when files arrive while the panel is hidden.
    let visible = panel::is_open();
    if result.added > 0 && notify && !visible {
        let body = i18n::files_added(state.language, result.added, &result.shelf_name);
        let _ = app
            .notification()
            .builder()
            .title("Wedge")
            .body(body)
            .show();
    }
    Ok(result)
}

#[tauri::command]
pub async fn remove_files(state: State<'_, AppState>, ids: Vec<String>) -> CmdResult<bool> {
    check_ids(&ids)?;
    let (owned, shared) = {
        let conn = state.db();
        let shelves = db::list_shelves(&conn).map_err(err)?;
        let files: Vec<StashFile> = ids
            .iter()
            .filter_map(|id| db::get_file(&conn, id).ok().flatten())
            .collect();
        // Clips and phone uploads live in Wedge's own folder; removing them
        // from the shelf deletes the file too, unless another shelf uses it.
        let owned: Vec<String> = files
            .iter()
            .map(|f| f.absolute_path.clone())
            .filter(|p| crate::commands_extra::is_owned(&state, p))
            .collect();
        // Files of a shared shelf go to the Recycle Bin: they leave the
        // folder for everyone it is shared with.
        let shared: Vec<(String, String)> = files
            .iter()
            .filter(|f| {
                shelves.iter().any(|s| {
                    s.id == f.shelf_id
                        && s.folder
                            .as_deref()
                            .is_some_and(|dir| crate::shared::is_inside(&f.absolute_path, dir))
                })
            })
            .map(|f| (f.id.clone(), f.absolute_path.clone()))
            .collect();
        (owned, shared)
    };
    let failed: Vec<String> = tauri::async_runtime::spawn_blocking(move || {
        shared
            .into_iter()
            .filter(|(_, path)| {
                let path = std::path::Path::new(path);
                path.exists() && crate::shared::recycle(path).is_err()
            })
            .map(|(id, _)| id)
            .collect()
    })
    .await
    .map_err(err)?;
    let ids: Vec<String> = ids.into_iter().filter(|id| !failed.contains(id)).collect();
    db::remove_files(&state.db(), &ids).map_err(err)?;
    let still_used = db::list_files(&state.db(), None).unwrap_or_default();
    for path in owned {
        if !still_used.iter().any(|f| f.absolute_path == path) {
            let _ = std::fs::remove_file(&path);
        }
    }
    if !failed.is_empty() {
        return Err("recycle_failed".into());
    }
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

/// Move a file to another shelf. Onto a shared shelf this copies the file
/// into the shared folder; files can't leave a shared shelf this way (they
/// live in the shared folder; drag them out instead).
#[tauri::command]
pub async fn move_file(
    state: State<'_, AppState>,
    id: String,
    shelf_id: String,
) -> CmdResult<bool> {
    check_id(&id)?;
    check_id(&shelf_id)?;
    let (file, from, to) = {
        let conn = state.db();
        let file = db::get_file(&conn, &id)
            .map_err(err)?
            .ok_or("Unknown file")?;
        let from = db::get_shelf(&conn, &file.shelf_id).map_err(err)?;
        let to = db::get_shelf(&conn, &shelf_id)
            .map_err(err)?
            .ok_or("Unknown shelf")?;
        (file, from, to)
    };
    if from.as_ref().is_some_and(|s| s.folder.is_some()) {
        return Err("shared_move".into());
    }
    let Some(folder) = to.folder else {
        db::move_file(&state.db(), &id, &shelf_id).map_err(err)?;
        return Ok(true);
    };
    let source = file.absolute_path.clone();
    let copy = tauri::async_runtime::spawn_blocking(move || {
        crate::shared::copy_in(&folder, &[source]).pop()
    })
    .await
    .map_err(err)?
    .ok_or("copy_failed")?;
    let name = std::path::Path::new(&copy)
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or(file.name);
    db::relocate_file(&state.db(), &id, &shelf_id, &copy, &name).map_err(err)?;
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

/// Open a shared shelf's folder in Explorer.
#[tauri::command]
pub async fn open_shelf_folder(
    app: AppHandle,
    state: State<'_, AppState>,
    id: String,
) -> CmdResult<OpResult> {
    check_id(&id)?;
    let folder = db::get_shelf(&state.db(), &id)
        .map_err(err)?
        .and_then(|s| s.folder);
    let Some(folder) = folder else {
        return Ok(OpResult::err("not_shared"));
    };
    if !files::is_reachable(&folder).await {
        return Ok(OpResult::err("missing"));
    }
    Ok(match app.opener().open_path(&folder, None::<&str>) {
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
    // Cache successes only, so a transient failure doesn't stick.
    if url.is_some() {
        let mut cache = state.icon_cache.lock().map_err(err)?;
        if cache.len() > 2_000 {
            cache.clear(); // simple bound; icons are cheap to recreate
        }
        cache.insert(key, url.clone());
    }
    Ok(url)
}

#[tauri::command]
pub async fn file_icon(state: State<'_, AppState>, id: String) -> CmdResult<Option<String>> {
    shell_image(&state, &id, 48, false).await
}

#[tauri::command]
pub async fn file_preview(state: State<'_, AppState>, id: String) -> CmdResult<Option<String>> {
    shell_image(&state, &id, 256, true).await
}

/// How long a drag waits for the file's icon before using a plain one.
const DRAG_ICON_WAIT: std::time::Duration = std::time::Duration::from_millis(300);

/// The icon shown under the cursor while dragging `path` out.
pub(crate) async fn drag_icon(path: &std::path::Path) -> Vec<u8> {
    let path = path.to_string_lossy().into_owned();
    tauri::async_runtime::spawn_blocking(move || {
        win::shell_image_png_within(&path, 64, false, Some(DRAG_ICON_WAIT))
    })
    .await
    .ok()
    .flatten()
    .unwrap_or_else(|| include_bytes!("../icons/tray.png").to_vec())
}

/// Drag files out of Wedge into another app and wait until the drag ends;
/// returns whether something took them. Everything that can be slow (the
/// database, the files, the icon) is done before; the UI thread, which OLE
/// needs for the drag, only runs the drag itself.
pub(crate) async fn drag_out(
    app: &AppHandle,
    paths: Vec<std::path::PathBuf>,
    icon: Vec<u8>,
) -> CmdResult<bool> {
    let (tx, rx) = std::sync::mpsc::channel::<Result<bool, String>>();
    app.run_on_main_thread(move || {
        if !win::primary_button_down() {
            let _ = tx.send(Ok(false));
            return;
        }
        let _ = tx.send(crate::dragout::drag_files(&paths, &icon));
    })
    .map_err(err)?;
    tauri::async_runtime::spawn_blocking(move || rx.recv())
        .await
        .map_err(err)?
        .map_err(err)?
}

/// Start a native drag of the given files into other apps; returns, when the
/// drag ends, whether something took them (the pocket empties itself then).
#[tauri::command]
pub async fn start_drag(
    app: AppHandle,
    state: State<'_, AppState>,
    ids: Vec<String>,
) -> CmdResult<bool> {
    check_ids(&ids)?;
    let files: Vec<StashFile> = {
        let conn = state.db();
        ids.iter()
            .filter_map(|id| db::get_file(&conn, id).ok().flatten())
            .inspect(|f| {
                let _ = db::touch_file(&conn, &f.id);
            })
            .collect()
    };
    let mut paths = Vec::new();
    for f in files {
        if files::is_reachable(&f.absolute_path).await {
            paths.push(std::path::PathBuf::from(f.absolute_path));
        }
    }
    let Some(first) = paths.first() else {
        return Ok(false);
    };
    let icon = drag_icon(first).await;
    drag_out(&app, paths, icon).await
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
pub fn create_shelf(
    app: AppHandle,
    state: State<'_, AppState>,
    input: ShelfInput,
) -> CmdResult<Shelf> {
    let name = check_shelf_name(&input.name)?;
    if input
        .icon
        .as_ref()
        .is_some_and(|i| i.is_empty() || i.len() > 50)
        || input.color.as_ref().is_some_and(|c| !db::is_hex_color(c))
    {
        return Err("Invalid arguments: style".into());
    }
    let shelf = db::create_shelf(
        &state.db(),
        &name,
        input.icon.as_deref(),
        input.color.as_deref(),
    )
    .map_err(err)?;
    panel::relayout(&app);
    Ok(shelf)
}

/// A shelf's icon and color (its tab on the screen edge).
#[tauri::command]
pub fn set_shelf_style(
    state: State<'_, AppState>,
    id: String,
    icon: String,
    color: String,
) -> CmdResult<bool> {
    check_id(&id)?;
    if icon.is_empty() || icon.len() > 50 || !db::is_hex_color(&color) {
        return Err("Invalid arguments: style".into());
    }
    db::set_shelf_style(&state.db(), &id, &icon, &color).map_err(err)?;
    Ok(true)
}

#[tauri::command]
pub fn rename_shelf(state: State<'_, AppState>, id: String, name: String) -> CmdResult<bool> {
    check_id(&id)?;
    let name = check_shelf_name(&name)?;
    db::rename_shelf(&state.db(), &id, &name).map_err(err)?;
    Ok(true)
}

/// Link a folder (e.g. one shared in Google Drive or OneDrive) as a shared
/// shelf. A folder that is already linked returns its shelf.
#[tauri::command]
pub async fn create_shared_shelf(
    app: AppHandle,
    state: State<'_, AppState>,
    folder: String,
    name: Option<String>,
) -> CmdResult<Shelf> {
    if folder.chars().count() > MAX_PATH_CHARS || !std::path::Path::new(&folder).is_absolute() {
        return Err("Invalid arguments: folder".into());
    }
    let name = match name {
        Some(n) => check_shelf_name(&n)?,
        None => check_shelf_name(
            &std::path::Path::new(&folder)
                .file_name()
                .map(|n| n.to_string_lossy().into_owned())
                .unwrap_or_else(|| folder.clone()),
        )?,
    };
    let probe = folder.clone();
    let is_dir =
        tauri::async_runtime::spawn_blocking(move || std::path::Path::new(&probe).is_dir())
            .await
            .map_err(err)?;
    if !is_dir {
        return Err("folder_unavailable".into());
    }
    let shelf = {
        let conn = state.db();
        if let Some(existing) = db::shelf_by_folder(&conn, &folder).map_err(err)? {
            return Ok(existing);
        }
        let shelf = db::create_shelf(&conn, &name, Some("users"), Some("#0F9D58")).map_err(err)?;
        db::set_shelf_folder(&conn, &shelf.id, &folder).map_err(err)?;
        db::get_shelf(&conn, &shelf.id)
            .map_err(err)?
            .ok_or("Unknown shelf")?
    };
    let handle = app.clone();
    let id = shelf.id.clone();
    tauri::async_runtime::spawn_blocking(move || crate::shared::refresh(&handle, Some(&id)))
        .await
        .map_err(err)?;
    crate::shared::restart_watcher(&app);
    panel::relayout(&app);
    Ok(shelf)
}

/// Delete a shelf (its files stay on disk; a shared folder is left as is).
#[tauri::command]
pub fn delete_shelf(app: AppHandle, state: State<'_, AppState>, id: String) -> CmdResult<bool> {
    check_id(&id)?;
    let conn = state.db();
    let shelves = db::list_shelves(&conn).map_err(err)?;
    let Some(target) = shelves.iter().find(|s| s.id == id) else {
        return Ok(false);
    };
    // The pocket is part of the edge; and one ordinary shelf always stays.
    if target.kind == "pocket" {
        return Err("Cannot delete the pocket".into());
    }
    if shelves.iter().filter(|s| s.kind != "pocket").count() <= 1 {
        return Err("Cannot delete the last shelf".into());
    }
    let was_shared = target.folder.is_some();
    match db::delete_shelf(&conn, &id) {
        Ok(()) => {
            // Heal default/last shelf references.
            db::get_settings(&conn, state.language).map_err(err)?;
            drop(conn);
            if was_shared {
                crate::shared::restart_watcher(&app);
            }
            panel::relayout(&app);
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
    // Agreeing on the welcome screen applies both Windows integrations.
    let agreed = patch.onboarding_done == Some(true);
    if patch.start_with_windows.is_some() || agreed {
        sync_autostart(&app, next.start_with_windows);
    }
    if patch.watch_downloads.is_some() || patch.watch_screenshots.is_some() {
        crate::services::restart_watchers(&app);
    }
    if patch.context_menu.is_some() || agreed {
        sync_context_menu(&app, next.context_menu);
    }
    if patch.edge_handle.is_some() {
        panel::apply_side(&app, next.edge_handle);
    }
    Ok(next)
}

/// "Add to Wedge" in Explorer's right-click menu. Debug builds never register.
pub fn sync_context_menu(app: &AppHandle, enabled: bool) {
    if cfg!(debug_assertions) {
        return;
    }
    let label = i18n::strings(app.state::<AppState>().language).context_menu_label;
    match std::env::current_exe() {
        Ok(exe) => {
            if let Err(e) = crate::shell::set_context_menu(enabled, label, &exe) {
                log::warn!("context menu: {e}");
            }
        }
        Err(e) => log::warn!("context menu: {e}"),
    }
}

/// Start with Windows. Debug builds never register themselves.
pub fn sync_autostart(app: &AppHandle, enabled: bool) {
    if cfg!(debug_assertions) {
        return;
    }
    #[cfg(feature = "store")]
    {
        let _ = app;
        if let Err(e) = crate::store::set_startup_task(enabled) {
            log::warn!("startup task: {e}");
        }
    }
    #[cfg(not(feature = "store"))]
    sync_run_key(app, enabled);
}

#[cfg(not(feature = "store"))]
fn sync_run_key(app: &AppHandle, enabled: bool) {
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

/// The page has loaded: now desktop widgets can be reopened. A second webview
/// started while the main one is still starting never finishes loading, and
/// `run_on_main_thread` runs inline on the main thread, so this is an async
/// command (another thread) posting the work. Runs once.
#[tauri::command]
pub async fn app_ready(app: AppHandle) -> CmdResult<()> {
    static STARTED: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);
    if STARTED.swap(true, Ordering::SeqCst) {
        return Ok(());
    }
    let handle = app.clone();
    app.run_on_main_thread(move || crate::widget::restore(&handle))
        .map_err(err)
}

#[tauri::command]
pub fn app_version(app: AppHandle) -> String {
    app.package_info().version.to_string()
}

#[tauri::command]
pub fn open_releases(app: AppHandle) -> bool {
    app.opener()
        .open_url(
            "https://github.com/Regncreative/Wedge/releases/latest",
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
        .set_file_name(format!("wedge-backup-{stamp}.json"))
        .add_filter("Wedge backup", &["json"]);
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
    let mut dialog = app.dialog().file().add_filter("Wedge backup", &["json"]);
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
