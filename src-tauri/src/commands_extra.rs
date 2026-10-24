//! Commands for notes, reminders, rules, content search, quick actions,
//! clipboard, shared shelves and the preview overlay.

use std::path::{Path, PathBuf};

use serde::Serialize;
use serde_json::{json, Value};
use tauri::{AppHandle, State};
use tauri_plugin_clipboard_manager::ClipboardExt;
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_opener::OpenerExt;

use crate::actions::{self, ImageFormat};
use crate::commands::{check_id, check_ids, CmdResult, MAX_PATH_CHARS};
use crate::db;
use crate::models::StashFile;
use crate::panel;
use crate::services;
use crate::shell;
use crate::state::AppState;
use crate::textract;
use crate::win;

fn err(e: impl std::fmt::Display) -> String {
    e.to_string()
}

fn files_by_ids(state: &AppState, ids: &[String]) -> CmdResult<Vec<StashFile>> {
    check_ids(ids)?;
    let conn = state.db();
    Ok(ids
        .iter()
        .filter_map(|id| db::get_file(&conn, id).ok().flatten())
        .collect())
}

fn existing_paths(files: &[StashFile]) -> Vec<PathBuf> {
    files
        .iter()
        .map(|f| PathBuf::from(&f.absolute_path))
        .filter(|p| p.exists())
        .collect()
}

/// Add freshly created files (zip, converted images…) next to `like`.
fn shelve_new(state: &AppState, paths: &[PathBuf], shelf_id: &str) {
    let metas: Vec<_> = paths
        .iter()
        .filter_map(|p| crate::files::collect_meta(&p.to_string_lossy()))
        .collect();
    let _ = db::add_files(&state.db(), &metas, shelf_id);
}

// ── Notes, reminders, expiry, rules ───────────────────────

#[tauri::command]
pub fn set_file_note(
    state: State<'_, AppState>,
    id: String,
    note: String,
    tags: String,
) -> CmdResult<bool> {
    check_id(&id)?;
    if note.chars().count() > 2_000 || tags.chars().count() > 300 {
        return Err("Invalid arguments: note".into());
    }
    let tags = tags
        .split(',')
        .map(str::trim)
        .filter(|t| !t.is_empty())
        .collect::<Vec<_>>()
        .join(", ");
    db::set_file_meta(&state.db(), &id, note.trim(), &tags).map_err(err)?;
    Ok(true)
}

#[tauri::command]
pub fn set_reminder(state: State<'_, AppState>, id: String, at: Option<i64>) -> CmdResult<bool> {
    check_id(&id)?;
    if at.is_some_and(|t| t <= 0) {
        return Err("Invalid arguments: at".into());
    }
    db::set_reminder(&state.db(), &id, at).map_err(err)?;
    Ok(true)
}

#[tauri::command]
pub fn set_shelf_expiry(
    state: State<'_, AppState>,
    id: String,
    hours: Option<i64>,
) -> CmdResult<bool> {
    check_id(&id)?;
    if hours.is_some_and(|h| !(1..=24 * 365).contains(&h)) {
        return Err("Invalid arguments: hours".into());
    }
    db::set_shelf_expiry(&state.db(), &id, hours).map_err(err)?;
    Ok(true)
}

#[tauri::command]
pub fn list_rules(state: State<'_, AppState>) -> CmdResult<Vec<db::Rule>> {
    db::list_rules(&state.db()).map_err(err)
}

const RULE_SOURCES: &[&str] = &[
    "any",
    "manual",
    "downloads",
    "screenshots",
    "phone",
    "clipboard",
];

#[tauri::command]
pub fn add_rule(
    state: State<'_, AppState>,
    shelf_id: String,
    extensions: String,
    source: String,
) -> CmdResult<db::Rule> {
    check_id(&shelf_id)?;
    if extensions.len() > 300 || !RULE_SOURCES.contains(&source.as_str()) {
        return Err("Invalid arguments: rule".into());
    }
    db::add_rule(&state.db(), &shelf_id, &extensions, &source).map_err(err)
}

#[tauri::command]
pub fn delete_rule(state: State<'_, AppState>, id: String) -> CmdResult<bool> {
    check_id(&id)?;
    db::delete_rule(&state.db(), &id).map_err(err)?;
    Ok(true)
}

#[tauri::command]
pub fn search_content(state: State<'_, AppState>, query: String) -> CmdResult<Vec<String>> {
    if query.chars().count() > 200 {
        return Err("Invalid arguments: query".into());
    }
    db::search_content(&state.db(), &query).map_err(err)
}

// ── Quick actions ─────────────────────────────────────────

#[tauri::command]
pub async fn zip_files(state: State<'_, AppState>, ids: Vec<String>) -> CmdResult<Value> {
    let files = files_by_ids(&state, &ids)?;
    let paths = existing_paths(&files);
    let Some(first) = paths.first() else {
        return Ok(json!({ "ok": false }));
    };
    let dir = first.parent().unwrap_or(Path::new(".")).to_path_buf();
    let stem = if paths.len() == 1 {
        first
            .file_stem()
            .map(|s| s.to_string_lossy().into_owned())
            .unwrap_or_default()
    } else {
        "Wedge".to_string()
    };
    let dest = actions::unique_path(&dir, &stem, "zip");
    let (zip_paths, zip_dest) = (paths.clone(), dest.clone());
    tauri::async_runtime::spawn_blocking(move || actions::zip_paths(&zip_paths, &zip_dest))
        .await
        .map_err(err)?
        .map_err(err)?;
    shelve_new(&state, std::slice::from_ref(&dest), &files[0].shelf_id);
    Ok(json!({ "ok": true, "path": dest }))
}

#[tauri::command]
pub async fn convert_images(
    state: State<'_, AppState>,
    ids: Vec<String>,
    format: ImageFormat,
) -> CmdResult<Value> {
    let files = files_by_ids(&state, &ids)?;
    let paths = existing_paths(&files);
    let results = tauri::async_runtime::spawn_blocking(move || {
        paths
            .iter()
            .map(|p| actions::convert_image(p, format))
            .collect::<Vec<_>>()
    })
    .await
    .map_err(err)?;
    let done: Vec<actions::Converted> = results.iter().filter_map(|r| r.clone().ok()).collect();
    if let Some(first) = files.first() {
        let made: Vec<PathBuf> = done.iter().map(|c| c.path.clone()).collect();
        shelve_new(&state, &made, &first.shelf_id);
    }
    Ok(json!({ "results": done, "failed": results.len() - done.len() }))
}

/// "Reduce size": a smaller copy of each image next to it. Images that
/// can't get smaller are reported as `alreadySmall` and left alone.
#[tauri::command]
pub async fn shrink_images(state: State<'_, AppState>, ids: Vec<String>) -> CmdResult<Value> {
    let files = files_by_ids(&state, &ids)?;
    let paths = existing_paths(&files);
    let suffix = crate::i18n::strings(state.language).shrunk_suffix;
    let results = tauri::async_runtime::spawn_blocking(move || {
        paths
            .iter()
            .map(|p| actions::shrink_image(p, suffix))
            .collect::<Vec<_>>()
    })
    .await
    .map_err(err)?;
    let mut done = Vec::new();
    let (mut already_small, mut failed) = (0, 0);
    for r in results {
        match r {
            Ok(actions::Shrunk::Done(c)) => done.push(c),
            Ok(actions::Shrunk::AlreadySmall) => already_small += 1,
            Err(_) => failed += 1,
        }
    }
    if let Some(first) = files.first() {
        let made: Vec<PathBuf> = done.iter().map(|c| c.path.clone()).collect();
        shelve_new(&state, &made, &first.shelf_id);
    }
    Ok(json!({ "results": done, "alreadySmall": already_small, "failed": failed }))
}

#[tauri::command]
pub async fn collect_files(
    app: AppHandle,
    state: State<'_, AppState>,
    ids: Vec<String>,
) -> CmdResult<Value> {
    let files = files_by_ids(&state, &ids)?;
    let paths = existing_paths(&files);
    let mut dialog = app.dialog().file();
    if let Some(win) = panel::window(&app) {
        dialog = dialog.set_parent(&win);
    }
    let Some(folder) = dialog.blocking_pick_folder() else {
        return Ok(json!({ "ok": false, "canceled": true }));
    };
    let dest = folder.into_path().map_err(err)?;
    let copied = tauri::async_runtime::spawn_blocking(move || actions::copy_into(&paths, &dest))
        .await
        .map_err(err)?
        .map_err(err)?;
    Ok(json!({ "ok": true, "copied": copied }))
}

#[tauri::command]
pub fn copy_paths(
    app: AppHandle,
    state: State<'_, AppState>,
    ids: Vec<String>,
) -> CmdResult<usize> {
    let files = files_by_ids(&state, &ids)?;
    let text = files
        .iter()
        .map(|f| f.absolute_path.as_str())
        .collect::<Vec<_>>()
        .join("\r\n");
    app.clipboard().write_text(text).map_err(err)?;
    Ok(files.len())
}

#[tauri::command]
pub async fn open_files(
    app: AppHandle,
    state: State<'_, AppState>,
    ids: Vec<String>,
) -> CmdResult<usize> {
    let files = files_by_ids(&state, &ids)?;
    let mut opened = 0;
    for f in &files {
        if !crate::files::is_reachable(&f.absolute_path).await {
            continue;
        }
        if app
            .opener()
            .open_path(&f.absolute_path, None::<&str>)
            .is_ok()
        {
            opened += 1;
            let _ = db::touch_file(&state.db(), &f.id);
        }
    }
    Ok(opened)
}

/// Zip the files into a temporary archive and drag that out (e.g. into a
/// mail). The archive is written in the background; if the button was let
/// go meanwhile, there is nothing to drag.
#[tauri::command]
pub async fn start_drag_zip(
    app: AppHandle,
    state: State<'_, AppState>,
    ids: Vec<String>,
    name: String,
) -> CmdResult<()> {
    let files = files_by_ids(&state, &ids)?;
    let safe: String = name
        .chars()
        .filter(|c| !r#"<>:"/\|?*"#.contains(*c) && !c.is_control())
        .take(80)
        .collect();
    let dest = std::env::temp_dir().join("Wedge").join(format!(
        "{}.zip",
        if safe.trim().is_empty() {
            "Wedge"
        } else {
            safe.trim()
        }
    ));
    let zip = dest.clone();
    let written = tauri::async_runtime::spawn_blocking(move || {
        let paths = existing_paths(&files);
        if paths.is_empty() {
            return Ok(false);
        }
        std::fs::create_dir_all(zip.parent().unwrap_or(Path::new(".")))?;
        let _ = std::fs::remove_file(&zip);
        actions::zip_paths(&paths, &zip).map(|()| true)
    })
    .await
    .map_err(err)?
    .map_err(err)?;
    if !written {
        return Ok(());
    }
    let icon = crate::commands::drag_icon(&dest).await;
    crate::commands::drag_out(&app, vec![dest], icon).await?;
    Ok(())
}

/// Folder picker (sync folder).
#[tauri::command]
pub async fn pick_folder(app: AppHandle) -> CmdResult<Option<String>> {
    let mut dialog = app.dialog().file();
    if let Some(win) = panel::window(&app) {
        dialog = dialog.set_parent(&win);
    }
    Ok(dialog
        .blocking_pick_folder()
        .and_then(|f| f.into_path().ok())
        .map(|p| p.to_string_lossy().into_owned()))
}

// ── Clipboard ─────────────────────────────────────────────

fn clips_dir(state: &AppState) -> PathBuf {
    state.data_dir.join("clips")
}

/// Whether a path lives in Wedge's own folders (clips, phone uploads), so
/// removing it from the shelf may delete the file too.
pub fn is_owned(state: &AppState, path: &str) -> bool {
    let p = Path::new(path);
    p.starts_with(clips_dir(state)) || p.starts_with(state.data_dir.join("inbox"))
}

fn timestamp_name() -> String {
    // Local time isn't needed; a sortable UTC stamp keeps names unique and readable.
    let secs = db::now_ms() / 1000;
    let (d, s) = (secs / 86_400, secs % 86_400);
    format!("{d}-{:02}{:02}{:02}", s / 3600, s % 3600 / 60, s % 60)
}

pub fn is_url(text: &str) -> bool {
    let t = text.trim();
    (t.starts_with("https://") || t.starts_with("http://")) && !t.contains(char::is_whitespace)
}

fn url_title(url: &str) -> String {
    let host = url
        .trim()
        .split("://")
        .nth(1)
        .unwrap_or(url)
        .split(['/', '?', '#'])
        .next()
        .unwrap_or("link")
        .trim_start_matches("www.");
    host.chars()
        .filter(|c| c.is_alphanumeric() || *c == '.' || *c == '-')
        .collect()
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PasteResult {
    kind: &'static str,
    added: usize,
}

/// More text than this isn't a note any more.
const MAX_CLIP_CHARS: usize = 1_000_000;

/// A file name for a clip: its first line, without what Windows forbids.
fn clip_name(text: &str, fallback: &str) -> String {
    let name: String = text
        .lines()
        .find(|l| !l.trim().is_empty())
        .unwrap_or_default()
        .chars()
        .filter(|c| !r#"<>:"/\|?*"#.contains(*c) && !c.is_control())
        .take(40)
        .collect();
    // Windows drops trailing dots and spaces from names.
    let name = name.trim().trim_end_matches(['.', ' ']);
    if name.is_empty() {
        fallback.to_string()
    } else {
        name.to_string()
    }
}

/// Save a link as an Internet shortcut (named after its title, or its host)
/// or text as a note, in `dir`. Returns the file and "link" or "text".
fn write_clip(
    dir: &Path,
    text: &str,
    title: Option<&str>,
) -> std::io::Result<(PathBuf, &'static str)> {
    if is_url(text) {
        let name = match title.map(|t| clip_name(t, "")) {
            Some(name) if !name.is_empty() => name,
            _ => clip_name(&url_title(text), "link"),
        };
        let dest = actions::unique_path(dir, &name, "url");
        std::fs::write(
            &dest,
            format!("[InternetShortcut]\r\nURL={}\r\n", text.trim()),
        )?;
        Ok((dest, "link"))
    } else {
        let dest = actions::unique_path(dir, &clip_name(text, "note"), "txt");
        std::fs::write(&dest, text)?;
        Ok((dest, "text"))
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Clip {
    path: String,
    kind: &'static str,
}

/// Text or a link dragged onto a shelf (from a browser, an editor…), saved
/// the way Ctrl+V saves it. The page then adds the file like a dropped one,
/// so it lands on the shelf it was dropped on.
#[tauri::command]
pub fn save_clip(
    state: State<'_, AppState>,
    text: String,
    title: Option<String>,
) -> CmdResult<Clip> {
    if text.trim().is_empty() {
        return Err("nothing to save".into());
    }
    if text.chars().count() > MAX_CLIP_CHARS {
        return Err("text too large".into());
    }
    let title = title.filter(|t| t.chars().count() <= 500);
    let dir = clips_dir(&state);
    std::fs::create_dir_all(&dir).map_err(err)?;
    let (path, kind) = write_clip(&dir, &text, title.as_deref()).map_err(err)?;
    Ok(Clip {
        path: path.to_string_lossy().into_owned(),
        kind,
    })
}

/// Ctrl+V in the panel: files copied in Explorer, an image (e.g. "Copy image"
/// in a browser), a link, or text.
#[tauri::command]
pub async fn paste_clipboard(
    app: AppHandle,
    state: State<'_, AppState>,
    shelf_id: Option<String>,
) -> CmdResult<PasteResult> {
    if let Some(id) = &shelf_id {
        check_id(id)?;
    }
    let target = shelf_id.or_else(|| {
        db::get_settings(&state.db(), state.language)
            .ok()
            .map(|s| s.default_shelf_id)
    });
    let added_to = |paths: Vec<String>, source: &str| -> usize {
        services::ingest(&app, &paths, source, target.as_deref())
            .map(|c| c.added)
            .unwrap_or(0)
    };

    let files = tauri::async_runtime::spawn_blocking(shell::clipboard_files)
        .await
        .map_err(err)?;
    if !files.is_empty() {
        // Pasted, like the images and text below, so a "Pasted" rule routes
        // them too (#47).
        let n = added_to(files, "clipboard");
        return Ok(PasteResult {
            kind: "files",
            added: n,
        });
    }

    let dir = clips_dir(&state);
    std::fs::create_dir_all(&dir).map_err(err)?;

    if let Ok(image) = app.clipboard().read_image() {
        let (w, h) = (image.width(), image.height());
        let rgba = image.rgba().to_vec();
        let dest = actions::unique_path(&dir, &format!("clip-{}", timestamp_name()), "png");
        let path = dest.clone();
        tauri::async_runtime::spawn_blocking(move || {
            image::RgbaImage::from_raw(w, h, rgba).map(|img| img.save(&path))
        })
        .await
        .map_err(err)?
        .ok_or("bad image")?
        .map_err(err)?;
        let n = added_to(vec![dest.to_string_lossy().into_owned()], "clipboard");
        return Ok(PasteResult {
            kind: "image",
            added: n,
        });
    }

    let text = app.clipboard().read_text().unwrap_or_default();
    if text.trim().is_empty() {
        return Ok(PasteResult {
            kind: "empty",
            added: 0,
        });
    }
    if text.chars().count() > MAX_CLIP_CHARS {
        return Err("clipboard text too large".into());
    }
    let (dest, kind) = write_clip(&dir, &text, None).map_err(err)?;
    let n = added_to(vec![dest.to_string_lossy().into_owned()], "clipboard");
    Ok(PasteResult { kind, added: n })
}

// ── Preview ───────────────────────────────────────────────

#[derive(Serialize)]
#[serde(rename_all = "camelCase", tag = "kind")]
pub enum Preview {
    Image { url: String },
    Text { text: String },
    None,
}

/// Larger look at a file (Space): Windows' thumbnail for images, PDFs,
/// videos and documents; otherwise the beginning of its text.
#[tauri::command]
pub async fn quick_look(state: State<'_, AppState>, id: String) -> CmdResult<Preview> {
    check_id(&id)?;
    let Some(file) = db::get_file(&state.db(), &id).map_err(err)? else {
        return Ok(Preview::None);
    };
    if file.absolute_path.chars().count() > MAX_PATH_CHARS {
        return Ok(Preview::None);
    }
    let path = file.absolute_path;
    tauri::async_runtime::spawn_blocking(move || {
        if let Some(url) = win::shell_image_data_url(&path, 640, true) {
            return Preview::Image { url };
        }
        match textract::extract(Path::new(&path)) {
            Some(text) if !text.trim().is_empty() => Preview::Text {
                text: text.chars().take(6_000).collect(),
            },
            _ => win::shell_image_data_url(&path, 256, false)
                .map(|url| Preview::Image { url })
                .unwrap_or(Preview::None),
        }
    })
    .await
    .map_err(err)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn recognizes_links() {
        assert!(is_url("https://example.com/a?b=1"));
        assert!(is_url("  http://x.org  "));
        assert!(!is_url("see https://example.com later"));
        assert!(!is_url("ftp://example.com"));
        assert_eq!(
            url_title("https://www.github.com/Regncreative/Wedge"),
            "github.com"
        );
    }

    #[test]
    fn saves_dropped_links_and_text_as_shortcuts_and_notes() {
        let dir = tempfile::tempdir().unwrap();
        let read = |p: &Path| std::fs::read_to_string(p).unwrap();

        // A link is named after its title when there is one, else its host.
        let (link, kind) = write_clip(
            dir.path(),
            "https://example.com/a",
            Some("Release notes: 2.1"),
        )
        .unwrap();
        assert_eq!(kind, "link");
        assert_eq!(link.file_name().unwrap(), "Release notes 2.1.url");
        assert_eq!(
            read(&link),
            "[InternetShortcut]\r\nURL=https://example.com/a\r\n"
        );
        let (bare, _) = write_clip(dir.path(), "https://www.github.com/x", Some("  ")).unwrap();
        assert_eq!(bare.file_name().unwrap(), "github.com.url");

        // Text keeps every line, and its first line names it.
        let text = "\n  Shopping list?\nmilk\n";
        let (note, kind) = write_clip(dir.path(), text, None).unwrap();
        assert_eq!(kind, "text");
        assert_eq!(note.file_name().unwrap(), "Shopping list.txt");
        assert_eq!(read(&note), text);
        // Nothing usable for a name, or a name Windows would cut short.
        let (odd, _) = write_clip(dir.path(), "???", None).unwrap();
        assert_eq!(odd.file_name().unwrap(), "note.txt");
        let (dots, _) = write_clip(dir.path(), "Wait...", None).unwrap();
        assert_eq!(dots.file_name().unwrap(), "Wait.txt");
    }
}
