//! Shared shelves: a shelf that mirrors a folder, typically one shared
//! through Google Drive, OneDrive or Dropbox (or a network share). Everyone
//! who links the same folder sees the same files:
//!
//! - adding a file to the shelf copies it into the folder (the cloud app
//!   then uploads it);
//! - whatever appears in the folder, from this PC or a friend's, shows up on
//!   the shelf;
//! - removing a file from the shelf moves it to the Recycle Bin, so it goes
//!   for everyone.
//!
//! Notes, tags, pins and reminders stay on this PC. Only the folder's top
//! level is mirrored; subfolders appear as folder items.

use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::mpsc;
use std::time::Duration;

use notify::{RecursiveMode, Watcher};
use rusqlite::Connection;
use tauri::{AppHandle, Emitter, Manager};

use crate::actions;
use crate::db;
use crate::files;
use crate::models::{FileInput, Shelf};
use crate::services::{self, FilesChanged, FILES_CHANGED};
use crate::state::AppState;

pub const KIND: &str = "shared";
pub const SOURCE: &str = "shared";

/// Paths compare case-insensitively on Windows.
fn key(path: &str) -> String {
    path.trim_end_matches(['\\', '/']).to_lowercase()
}

/// Is `path` directly inside `folder`?
pub fn is_inside(path: &str, folder: &str) -> bool {
    Path::new(path)
        .parent()
        .is_some_and(|p| key(&p.to_string_lossy()) == key(folder))
}

#[cfg(windows)]
fn is_hidden(meta: &std::fs::Metadata) -> bool {
    use std::os::windows::fs::MetadataExt;
    const HIDDEN: u32 = 0x2;
    const SYSTEM: u32 = 0x4;
    meta.file_attributes() & (HIDDEN | SYSTEM) != 0
}

#[cfg(not(windows))]
fn is_hidden(_meta: &std::fs::Metadata) -> bool {
    false
}

/// The folder's visible top-level entries. Fails when the folder can't be
/// read (drive offline, folder deleted), so callers leave the shelf alone.
pub fn scan(folder: &Path) -> std::io::Result<Vec<PathBuf>> {
    let mut out = Vec::new();
    for entry in std::fs::read_dir(folder)? {
        let entry = entry?;
        let path = entry.path();
        if services::is_ignored(&path) || entry.metadata().is_ok_and(|m| is_hidden(&m)) {
            continue;
        }
        out.push(path);
    }
    Ok(out)
}

/// Copy `paths` into `folder` (without overwriting), returning the paths to
/// shelve. Paths already in the folder are kept as they are. Blocking.
pub fn copy_in(folder: &str, paths: &[String]) -> Vec<String> {
    let mut out = Vec::with_capacity(paths.len());
    for p in paths {
        if is_inside(p, folder) {
            out.push(p.clone());
            continue;
        }
        match actions::copy_into_paths(&[PathBuf::from(p)], Path::new(folder)) {
            Ok(copies) => out.extend(copies.iter().map(|c| c.to_string_lossy().into_owned())),
            Err(e) => log::warn!("copy into shared folder failed: {e}"),
        }
    }
    out
}

/// Move files to the Recycle Bin. Tests set STASH_TRASH_DIR to collect them
/// in a folder instead of the real Recycle Bin.
pub fn recycle(path: &Path) -> Result<(), String> {
    if let Some(dir) = std::env::var_os("STASH_TRASH_DIR") {
        let dir = PathBuf::from(dir);
        std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
        let name = path.file_name().ok_or("no file name")?.to_string_lossy();
        let target = actions::unique_path(&dir, &name, "");
        return std::fs::rename(path, target).map_err(|e| e.to_string());
    }
    trash::delete(path).map_err(|e| e.to_string())
}

/// What changed between the folder and the shelf.
#[derive(Debug, Default, PartialEq)]
pub struct Diff {
    /// New entries in the folder.
    pub new: Vec<PathBuf>,
    /// Shelf files (ids) no longer in the folder.
    pub gone: Vec<String>,
}

pub fn diff(conn: &Connection, shelf_id: &str, entries: &[PathBuf]) -> rusqlite::Result<Diff> {
    let files = db::list_files(conn, Some(shelf_id))?;
    let present: HashSet<String> = entries.iter().map(|p| key(&p.to_string_lossy())).collect();
    let known: HashSet<String> = files.iter().map(|f| key(&f.absolute_path)).collect();
    Ok(Diff {
        new: entries
            .iter()
            .filter(|p| !known.contains(&key(&p.to_string_lossy())))
            .cloned()
            .collect(),
        gone: files
            .into_iter()
            .filter(|f| !present.contains(&key(&f.absolute_path)))
            .map(|f| f.id)
            .collect(),
    })
}

/// Bring one shelf in line with its folder. Returns (added, removed), or
/// `None` when the folder couldn't be read.
pub fn reconcile(app: &AppHandle, shelf: &Shelf) -> Option<(usize, usize)> {
    let folder = shelf.folder.as_deref()?;
    let entries = scan(Path::new(folder)).ok()?;
    let state = app.state::<AppState>();
    let diff = diff(&state.db(), &shelf.id, &entries).ok()?;
    // Metadata outside the database lock: cloud folders can be slow.
    let metas: Vec<FileInput> = diff
        .new
        .iter()
        .filter_map(|p| files::collect_meta(&p.to_string_lossy()))
        .collect();
    let conn = state.db();
    if !diff.gone.is_empty() {
        db::remove_files(&conn, &diff.gone).ok()?;
    }
    let (added, _) = db::add_files_from(&conn, &metas, &shelf.id, SOURCE).ok()?;
    Some((added, diff.gone.len()))
}

fn shared_shelves(app: &AppHandle) -> Vec<Shelf> {
    let state = app.state::<AppState>();
    let shelves = db::list_shelves(&state.db()).unwrap_or_default();
    shelves.into_iter().filter(|s| s.folder.is_some()).collect()
}

/// Reconcile every shared shelf (or just `only`) and tell the panel.
pub fn refresh(app: &AppHandle, only: Option<&str>) {
    for shelf in shared_shelves(app) {
        if only.is_some_and(|id| id != shelf.id) {
            continue;
        }
        if let Some((added, removed)) = reconcile(app, &shelf) {
            if added + removed > 0 {
                let _ = app.emit(
                    FILES_CHANGED,
                    FilesChanged {
                        added,
                        shelf_name: shelf.name.clone(),
                        source: SOURCE.into(),
                    },
                );
                if added > 0 {
                    services::index_soon(app);
                }
            }
        }
    }
}

/// Watch the shared folders; changes are picked up after a short pause
/// (cloud apps write in bursts). A periodic refresh covers drives that don't
/// report changes.
pub fn restart_watcher(app: &AppHandle) {
    let state = app.state::<AppState>();
    let mut slot = state
        .shared_watcher
        .lock()
        .unwrap_or_else(|e| e.into_inner());
    *slot = None;
    let folders: HashMap<String, String> = shared_shelves(app)
        .into_iter()
        .filter_map(|s| Some((key(s.folder.as_deref()?), s.id)))
        .collect();
    if folders.is_empty() {
        return;
    }
    let (tx, rx) = mpsc::channel::<String>();
    let lookup = folders.clone();
    let watcher = notify::recommended_watcher(move |res: notify::Result<notify::Event>| {
        let Ok(event) = res else { return };
        for path in event.paths {
            let Some(parent) = path.parent() else {
                continue;
            };
            if let Some(id) = lookup.get(&key(&parent.to_string_lossy())) {
                let _ = tx.send(id.clone());
            }
        }
    });
    let Ok(mut watcher) = watcher else {
        log::warn!("shared folder watcher unavailable");
        return;
    };
    for folder in folders.keys() {
        if let Err(e) = watcher.watch(Path::new(folder), RecursiveMode::NonRecursive) {
            log::warn!("cannot watch shared folder {folder}: {e}");
        }
    }
    *slot = Some(watcher);
    drop(slot);

    let app = app.clone();
    std::thread::spawn(move || {
        while let Ok(first) = rx.recv() {
            let mut changed = HashSet::from([first]);
            while let Ok(id) = rx.recv_timeout(Duration::from_millis(1200)) {
                changed.insert(id);
            }
            for id in changed {
                refresh(&app, Some(&id));
            }
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::Language;

    #[test]
    fn inside_is_case_insensitive_and_top_level_only() {
        assert!(is_inside(r"G:\My Drive\Ortak\a.pdf", r"g:\my drive\ortak"));
        assert!(is_inside(r"G:\My Drive\Ortak\a.pdf", r"G:\My Drive\Ortak\"));
        assert!(!is_inside(
            r"G:\My Drive\Ortak\sub\a.pdf",
            r"G:\My Drive\Ortak"
        ));
        assert!(!is_inside(r"C:\Users\me\a.pdf", r"G:\My Drive\Ortak"));
    }

    #[test]
    fn scans_visible_entries_and_diffs_against_the_shelf() {
        let dir = tempfile::tempdir().unwrap();
        let folder = dir.path();
        std::fs::write(folder.join("plan.pdf"), b"p").unwrap();
        std::fs::write(folder.join("video.mp4.crdownload"), b"partial").unwrap();
        std::fs::write(folder.join("desktop.ini"), b"").unwrap();
        std::fs::create_dir(folder.join("photos")).unwrap();

        let mut entries = scan(folder).unwrap();
        entries.sort();
        assert_eq!(
            entries,
            vec![folder.join("photos"), folder.join("plan.pdf")]
        );

        let conn = db::open_in_memory(Language::En).unwrap();
        let shelf = db::create_shelf(&conn, "Team", None, None).unwrap();
        let stale = folder.join("deleted-by-a-friend.txt");
        let meta = |p: &Path| FileInput {
            absolute_path: p.to_string_lossy().into_owned(),
            name: p.file_name().unwrap().to_string_lossy().into_owned(),
            extension: String::new(),
            size: 1,
            is_directory: false,
            created_at: 0,
            is_pinned: false,
        };
        // Same file, different case: already on the shelf.
        let upper = folder.join("PLAN.PDF");
        db::add_files(&conn, &[meta(&upper), meta(&stale)], &shelf.id).unwrap();

        let d = diff(&conn, &shelf.id, &entries).unwrap();
        assert_eq!(d.new, vec![folder.join("photos")]);
        assert_eq!(d.gone.len(), 1);
        let gone = db::get_file(&conn, &d.gone[0]).unwrap().unwrap();
        assert_eq!(gone.name, "deleted-by-a-friend.txt");

        assert!(scan(&folder.join("missing")).is_err());
    }

    #[test]
    fn copies_in_without_overwriting_and_keeps_files_already_there() {
        let dir = tempfile::tempdir().unwrap();
        let shared = dir.path().join("shared");
        std::fs::create_dir(&shared).unwrap();
        std::fs::write(shared.join("a.txt"), b"theirs").unwrap();
        let mine = dir.path().join("a.txt");
        std::fs::write(&mine, b"mine").unwrap();
        let folder = shared.to_string_lossy().into_owned();
        let already = shared.join("a.txt").to_string_lossy().into_owned();

        let out = copy_in(
            &folder,
            &[mine.to_string_lossy().into_owned(), already.clone()],
        );
        assert_eq!(
            out,
            vec![
                shared.join("a (2).txt").to_string_lossy().into_owned(),
                already
            ]
        );
        assert_eq!(
            std::fs::read_to_string(shared.join("a.txt")).unwrap(),
            "theirs"
        );
        assert_eq!(
            std::fs::read_to_string(shared.join("a (2).txt")).unwrap(),
            "mine"
        );
    }
}
