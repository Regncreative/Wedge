//! PC-to-PC sync through a folder that a cloud drive (OneDrive, Dropbox,
//! Google Drive…) already keeps in sync. Each PC writes its shelves to
//! `<folder>/<device id>.json` and merges the other PCs' files:
//! - shelves are matched by name; files are added, never duplicated;
//! - removals travel as tombstones, so a file deleted on one PC goes away
//!   on the others (unless it was re-added later);
//! - paths are stored relative to known folders ({OneDrive}, {Documents}…),
//!   so they line up even when user names differ.
//!
//! Only normal shelves sync; automatic ones (Downloads, Screenshots…) are
//! specific to each PC.

use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::time::Duration;

use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager};

use crate::db;
use crate::models::FileInput;
use crate::services::{FilesChanged, FILES_CHANGED};
use crate::state::AppState;

const TOMBSTONE_DAYS: i64 = 30;

/// Folder prefixes rewritten as tokens, most specific first.
#[derive(Debug, Clone, Default)]
pub struct KnownFolders(pub Vec<(&'static str, PathBuf)>);

impl KnownFolders {
    pub fn detect(app: &AppHandle) -> Self {
        let p = app.path();
        let mut v: Vec<(&'static str, PathBuf)> = Vec::new();
        for (token, dir) in [
            (
                "{OneDrive}",
                std::env::var_os("OneDrive").map(PathBuf::from),
            ),
            ("{Desktop}", p.desktop_dir().ok()),
            ("{Documents}", p.document_dir().ok()),
            ("{Downloads}", p.download_dir().ok()),
            ("{Pictures}", p.picture_dir().ok()),
            ("{Home}", p.home_dir().ok()),
        ] {
            if let Some(dir) = dir {
                v.push((token, dir));
            }
        }
        // Longest prefix wins (e.g. OneDrive\Desktop before Home).
        v.sort_by_key(|(_, d)| std::cmp::Reverse(d.as_os_str().len()));
        KnownFolders(v)
    }

    pub fn tokenize(&self, path: &str) -> String {
        let lower = path.to_lowercase();
        for (token, dir) in &self.0 {
            let d = dir.to_string_lossy();
            let dl = d.to_lowercase();
            if lower == dl || lower.starts_with(&format!("{dl}\\")) {
                return format!("{token}{}", &path[d.len()..]);
            }
        }
        path.to_string()
    }

    pub fn resolve(&self, path: &str) -> String {
        for (token, dir) in &self.0 {
            if let Some(rest) = path.strip_prefix(token) {
                return format!("{}{rest}", dir.to_string_lossy());
            }
        }
        path.to_string()
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SyncShelf {
    pub name: String,
    pub icon: String,
    pub color: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SyncFile {
    pub shelf: String,
    pub path: String,
    pub name: String,
    pub extension: String,
    pub size: i64,
    pub is_directory: bool,
    pub created_at: i64,
    pub added_at: i64,
    pub is_pinned: bool,
    pub note: String,
    pub tags: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SyncDeletion {
    pub shelf: String,
    pub path: String,
    pub at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Snapshot {
    pub format: String,
    pub version: u32,
    pub device: String,
    pub device_name: String,
    pub updated_at: i64,
    pub shelves: Vec<SyncShelf>,
    pub files: Vec<SyncFile>,
    pub deleted: Vec<SyncDeletion>,
}

fn key(shelf: &str, path: &str) -> (String, String) {
    (shelf.to_lowercase(), path.to_lowercase())
}

pub fn build_snapshot(
    conn: &Connection,
    folders: &KnownFolders,
    device: &str,
    device_name: &str,
) -> db::Result<Snapshot> {
    let shelves: Vec<_> = db::list_shelves(conn)?
        .into_iter()
        .filter(|s| s.kind == "normal")
        .collect();
    let names: HashMap<String, String> = shelves
        .iter()
        .map(|s| (s.id.clone(), s.name.clone()))
        .collect();
    let files = db::list_files(conn, None)?
        .into_iter()
        .filter_map(|f| {
            let shelf = names.get(&f.shelf_id)?.clone();
            Some(SyncFile {
                shelf,
                path: folders.tokenize(&f.absolute_path),
                name: f.name,
                extension: f.extension,
                size: f.size,
                is_directory: f.is_directory,
                created_at: f.created_at,
                added_at: f.added_at,
                is_pinned: f.is_pinned,
                note: f.note,
                tags: f.tags,
            })
        })
        .collect();
    let since = db::now_ms() - TOMBSTONE_DAYS * 86_400_000;
    let mut stmt = conn.prepare(
        "SELECT shelf_name, path, MAX(at) FROM tombstones WHERE at >= ?1 GROUP BY shelf_name, path",
    )?;
    let deleted = stmt
        .query_map([since], |r| {
            Ok(SyncDeletion {
                shelf: r.get(0)?,
                path: folders.tokenize(&r.get::<_, String>(1)?),
                at: r.get(2)?,
            })
        })?
        .collect::<db::Result<Vec<_>>>()?;
    Ok(Snapshot {
        format: "stash-sync".into(),
        version: 1,
        device: device.into(),
        device_name: device_name.into(),
        updated_at: db::now_ms(),
        shelves: shelves
            .into_iter()
            .map(|s| SyncShelf {
                name: s.name,
                icon: s.icon,
                color: s.color,
            })
            .collect(),
        files,
        deleted,
    })
}

#[derive(Debug, Default, PartialEq)]
pub struct MergeResult {
    pub added: usize,
    pub removed: usize,
}

/// Apply another PC's snapshot to the local database.
pub fn merge(
    conn: &Connection,
    remote: &Snapshot,
    folders: &KnownFolders,
) -> db::Result<MergeResult> {
    let mut result = MergeResult::default();
    let tx = conn.unchecked_transaction()?;

    let mut shelf_ids: HashMap<String, String> = db::list_shelves(&tx)?
        .into_iter()
        .filter(|s| s.kind == "normal")
        .map(|s| (s.name.to_lowercase(), s.id))
        .collect();
    for s in &remote.shelves {
        if let std::collections::hash_map::Entry::Vacant(slot) =
            shelf_ids.entry(s.name.to_lowercase())
        {
            slot.insert(db::create_shelf(&tx, &s.name, Some(&s.icon), Some(&s.color))?.id);
        }
    }

    // What is here now, and what was removed here (and when).
    let names: HashMap<String, String> = db::list_shelves(&tx)?
        .into_iter()
        .map(|s| (s.id, s.name))
        .collect();
    let local: HashMap<(String, String), (String, i64)> = db::list_files(&tx, None)?
        .into_iter()
        .filter_map(|f| {
            let shelf = names.get(&f.shelf_id)?;
            Some((key(shelf, &f.absolute_path), (f.id, f.added_at)))
        })
        .collect();
    let tombstones: HashMap<(String, String), i64> = {
        let mut stmt = tx.prepare(
            "SELECT shelf_name, path, MAX(at) FROM tombstones GROUP BY shelf_name, path",
        )?;
        let rows = stmt.query_map([], |r| {
            Ok((
                key(&r.get::<_, String>(0)?, &r.get::<_, String>(1)?),
                r.get(2)?,
            ))
        })?;
        rows.collect::<db::Result<_>>()?
    };

    // Deletions first, so a file removed there doesn't get re-added here.
    let mut removed_here = HashSet::new();
    let mut to_remove = Vec::new();
    for d in &remote.deleted {
        let k = key(&d.shelf, &folders.resolve(&d.path));
        if let Some((id, added_at)) = local.get(&k) {
            if *added_at < d.at {
                to_remove.push(id.clone());
                removed_here.insert(k);
            }
        }
    }
    if !to_remove.is_empty() {
        db::remove_files(&tx, &to_remove)?;
        result.removed = to_remove.len();
    }

    let mut by_shelf: HashMap<String, Vec<FileInput>> = HashMap::new();
    for f in &remote.files {
        let path = folders.resolve(&f.path);
        let k = key(&f.shelf, &path);
        if local.contains_key(&k) || removed_here.contains(&k) {
            continue;
        }
        if tombstones.get(&k).is_some_and(|at| *at >= f.added_at) {
            continue; // removed here after it was added there
        }
        let Some(shelf_id) = shelf_ids.get(&f.shelf.to_lowercase()) else {
            continue;
        };
        by_shelf
            .entry(shelf_id.clone())
            .or_default()
            .push(FileInput {
                absolute_path: path,
                name: f.name.clone(),
                extension: f.extension.clone(),
                size: f.size,
                is_directory: f.is_directory,
                created_at: f.created_at,
                is_pinned: f.is_pinned,
            });
    }
    for (shelf_id, files) in by_shelf {
        result.added += db::add_files_from(&tx, &files, &shelf_id, "sync")?.0;
    }
    tx.execute(
        "DELETE FROM tombstones WHERE at < ?1",
        [db::now_ms() - TOMBSTONE_DAYS * 86_400_000],
    )?;
    tx.commit()?;
    Ok(result)
}

fn write_atomic(path: &Path, text: &str) -> std::io::Result<()> {
    let tmp = path.with_extension("json.tmp");
    std::fs::write(&tmp, text)?;
    std::fs::rename(&tmp, path)
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncDevice {
    pub name: String,
    pub updated_at: i64,
    pub this_pc: bool,
}

/// One round: publish ours, merge theirs. Returns the devices seen.
pub fn run_once(app: &AppHandle) -> Result<Vec<SyncDevice>, String> {
    let state = app.state::<AppState>();
    let settings = db::get_settings(&state.db(), state.language).map_err(|e| e.to_string())?;
    if settings.sync_folder.is_empty() {
        return Ok(Vec::new());
    }
    let dir = PathBuf::from(&settings.sync_folder);
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let folders = KnownFolders::detect(app);
    let device = db::install_id(&state.db()).map_err(|e| e.to_string())?;
    let device_name = std::env::var("COMPUTERNAME").unwrap_or_else(|_| "PC".into());

    let mut devices = Vec::new();
    let mut total = MergeResult::default();
    for entry in std::fs::read_dir(&dir)
        .map_err(|e| e.to_string())?
        .flatten()
    {
        let path = entry.path();
        if path.extension().is_none_or(|e| e != "json")
            || path.file_stem().is_some_and(|s| s == device.as_str())
        {
            continue;
        }
        let Ok(text) = std::fs::read_to_string(&path) else {
            continue;
        };
        let Ok(remote) = serde_json::from_str::<Snapshot>(&text) else {
            continue;
        };
        if remote.format != "stash-sync" || remote.version != 1 || remote.device == device {
            continue;
        }
        match merge(&state.db(), &remote, &folders) {
            Ok(r) => {
                total.added += r.added;
                total.removed += r.removed;
            }
            Err(e) => log::warn!("sync merge from {}: {e}", remote.device_name),
        }
        devices.push(SyncDevice {
            name: remote.device_name,
            updated_at: remote.updated_at,
            this_pc: false,
        });
    }

    let ours =
        build_snapshot(&state.db(), &folders, &device, &device_name).map_err(|e| e.to_string())?;
    let text = serde_json::to_string_pretty(&ours).map_err(|e| e.to_string())?;
    write_atomic(&dir.join(format!("{device}.json")), &text).map_err(|e| e.to_string())?;
    devices.insert(
        0,
        SyncDevice {
            name: device_name,
            updated_at: ours.updated_at,
            this_pc: true,
        },
    );

    if total.added + total.removed > 0 {
        let _ = app.emit(
            FILES_CHANGED,
            FilesChanged {
                added: total.added,
                shelf_name: String::new(),
                source: "sync".into(),
            },
        );
    }
    Ok(devices)
}

pub fn start(app: &AppHandle) {
    let app = app.clone();
    std::thread::spawn(move || loop {
        if let Err(e) = run_once(&app) {
            log::warn!("sync: {e}");
        }
        std::thread::sleep(Duration::from_secs(20));
    });
}

#[tauri::command]
pub fn sync_now(app: AppHandle) -> Result<Vec<SyncDevice>, String> {
    run_once(&app)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::Language;

    fn folders(home: &str, onedrive: &str) -> KnownFolders {
        KnownFolders(vec![
            ("{OneDrive}", PathBuf::from(onedrive)),
            ("{Home}", PathBuf::from(home)),
        ])
    }

    fn file(path: &str) -> FileInput {
        FileInput {
            absolute_path: path.into(),
            name: path.rsplit('\\').next().unwrap().into(),
            extension: "pdf".into(),
            size: 1,
            is_directory: false,
            created_at: 1,
            is_pinned: false,
        }
    }

    #[test]
    fn tokens_map_paths_between_pcs() {
        let a = folders("C:\\Users\\sinan", "C:\\Users\\sinan\\OneDrive");
        let b = folders("D:\\Users\\work", "D:\\Users\\work\\OneDrive - Company");
        let t = a.tokenize("C:\\Users\\sinan\\OneDrive\\Docs\\x.pdf");
        assert_eq!(t, "{OneDrive}\\Docs\\x.pdf");
        assert_eq!(
            b.resolve(&t),
            "D:\\Users\\work\\OneDrive - Company\\Docs\\x.pdf"
        );
        assert_eq!(
            a.tokenize("C:\\USERS\\SINAN\\notes.txt"),
            "{Home}\\notes.txt"
        );
        assert_eq!(a.tokenize("E:\\Other\\y.txt"), "E:\\Other\\y.txt");
        assert_eq!(
            a.tokenize("C:\\Users\\sinanx\\z.txt"),
            "C:\\Users\\sinanx\\z.txt",
            "no partial-name match"
        );
    }

    /// Two PCs exchanging snapshots.
    struct Pc {
        conn: Connection,
        folders: KnownFolders,
        id: &'static str,
    }

    impl Pc {
        fn new(id: &'static str, home: &str) -> Self {
            Pc {
                conn: db::open_in_memory(Language::En).unwrap(),
                folders: folders(home, &format!("{home}\\OneDrive")),
                id,
            }
        }
        fn snapshot(&self) -> Snapshot {
            build_snapshot(&self.conn, &self.folders, self.id, self.id).unwrap()
        }
        fn pull(&self, other: &Pc) -> MergeResult {
            merge(&self.conn, &other.snapshot(), &self.folders).unwrap()
        }
        fn names(&self, shelf: &str) -> Vec<String> {
            let id = db::list_shelves(&self.conn)
                .unwrap()
                .into_iter()
                .find(|s| s.name == shelf)
                .unwrap()
                .id;
            let mut v: Vec<_> = db::list_files(&self.conn, Some(&id))
                .unwrap()
                .into_iter()
                .map(|f| f.absolute_path)
                .collect();
            v.sort();
            v
        }
        fn shelf(&self, name: &str) -> String {
            db::list_shelves(&self.conn)
                .unwrap()
                .into_iter()
                .find(|s| s.name == name)
                .unwrap()
                .id
        }
    }

    #[test]
    fn files_and_shelves_travel_and_paths_are_translated() {
        let a = Pc::new("a", "C:\\Users\\sinan");
        let b = Pc::new("b", "D:\\Users\\work");
        let invoices = db::create_shelf(&a.conn, "Invoices", None, None).unwrap();
        db::add_files(
            &a.conn,
            &[file("C:\\Users\\sinan\\OneDrive\\inv.pdf")],
            &invoices.id,
        )
        .unwrap();

        assert_eq!(
            b.pull(&a),
            MergeResult {
                added: 1,
                removed: 0
            }
        );
        assert_eq!(b.names("Invoices"), ["D:\\Users\\work\\OneDrive\\inv.pdf"]);
        assert_eq!(b.pull(&a), MergeResult::default(), "idempotent");
        // And back: nothing new for A.
        assert_eq!(a.pull(&b), MergeResult::default());
    }

    #[test]
    fn deletions_propagate_and_re_adds_win() {
        let a = Pc::new("a", "C:\\Users\\sinan");
        let b = Pc::new("b", "D:\\Users\\work");
        let work = a.shelf("Work");
        db::add_files(&a.conn, &[file("C:\\Users\\sinan\\OneDrive\\x.pdf")], &work).unwrap();
        b.pull(&a);
        assert_eq!(b.names("Work").len(), 1);

        // Removed on A (tombstone timestamps are in seconds; step past them).
        std::thread::sleep(std::time::Duration::from_millis(1100));
        let id = db::list_files(&a.conn, None).unwrap()[0].id.clone();
        db::remove_files(&a.conn, &[id]).unwrap();
        assert_eq!(
            b.pull(&a),
            MergeResult {
                added: 0,
                removed: 1
            }
        );
        assert!(b.names("Work").is_empty());
        // B's own removal must not resurrect anything on A.
        assert_eq!(a.pull(&b), MergeResult::default());

        // Re-added on A later: it comes back on B.
        std::thread::sleep(std::time::Duration::from_millis(1100));
        db::add_files(&a.conn, &[file("C:\\Users\\sinan\\OneDrive\\x.pdf")], &work).unwrap();
        assert_eq!(b.pull(&a).added, 1);
    }

    #[test]
    fn automatic_shelves_stay_local() {
        let a = Pc::new("a", "C:\\Users\\sinan");
        let b = Pc::new("b", "D:\\Users\\work");
        let dl = db::ensure_kind_shelf(&a.conn, "downloads", "Downloads", "download", "#0078D4")
            .unwrap();
        db::add_files(
            &a.conn,
            &[file("C:\\Users\\sinan\\Downloads\\setup.pdf")],
            &dl.id,
        )
        .unwrap();
        assert_eq!(b.pull(&a), MergeResult::default());
        assert!(db::list_shelves(&b.conn)
            .unwrap()
            .iter()
            .all(|s| s.name != "Downloads"));
    }
}
