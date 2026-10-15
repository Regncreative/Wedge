//! Process-wide state shared by commands, the tray and the updater.

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::atomic::AtomicBool;
use std::sync::{Mutex, MutexGuard};

use rusqlite::Connection;

use crate::models::{Language, UpdateStatus};

pub struct AppState {
    db: Mutex<Connection>,
    pub data_dir: PathBuf,
    pub language: Language,
    pub pinned: AtomicBool,
    /// Set while an Explorer dialog (Properties) should sit above the panel.
    pub restore_on_top_on_focus: AtomicBool,
    pub icon_cache: Mutex<HashMap<String, Option<String>>>,
    pub update: Mutex<UpdateStatus>,
    pub pending_update: Mutex<Option<(tauri_plugin_updater::Update, Vec<u8>)>>,
    pub hotkey: Mutex<Option<String>>,
    /// Downloads / Screenshots watcher.
    pub watcher: Mutex<Option<notify::RecommendedWatcher>>,
    /// Shared shelves' folder watcher.
    pub shared_watcher: Mutex<Option<notify::RecommendedWatcher>>,
}

impl AppState {
    pub fn new(conn: Connection, data_dir: PathBuf, language: Language) -> Self {
        Self {
            db: Mutex::new(conn),
            data_dir,
            language,
            pinned: AtomicBool::new(false),
            restore_on_top_on_focus: AtomicBool::new(false),
            icon_cache: Mutex::new(HashMap::new()),
            update: Mutex::new(UpdateStatus::Idle),
            pending_update: Mutex::new(None),
            hotkey: Mutex::new(None),
            watcher: Mutex::new(None),
            shared_watcher: Mutex::new(None),
        }
    }

    /// Lock the database. A poisoned lock (panic mid-query) is recovered:
    /// SQLite itself stays consistent thanks to transactions.
    pub fn db(&self) -> MutexGuard<'_, Connection> {
        self.db.lock().unwrap_or_else(|e| e.into_inner())
    }
}

fn app_data() -> PathBuf {
    std::env::var_os("APPDATA")
        .map(PathBuf::from)
        .unwrap_or_else(std::env::temp_dir)
}

/// %APPDATA%\Wedge. Wedge used to be called Stash: Stash 1.x and early
/// 2.0 builds kept everything in %APPDATA%\Stash, which is renamed on the
/// first start (and used as is if it can't be, e.g. while 1.x still runs).
/// The STASH_USER_DATA variable points tests (and side-by-side debugging)
/// at an isolated profile.
pub fn data_dir() -> PathBuf {
    if let Some(dir) = std::env::var_os("STASH_USER_DATA") {
        return PathBuf::from(dir);
    }
    let dir = app_data().join("Wedge");
    let old = app_data().join("Stash");
    if !dir.exists() && old.join("stash.db").exists() && std::fs::rename(&old, &dir).is_err() {
        return old;
    }
    dir
}

/// Where the data lived when Wedge was called Stash (None for test profiles).
pub fn old_data_dir() -> Option<PathBuf> {
    if std::env::var_os("STASH_USER_DATA").is_some() {
        return None;
    }
    Some(app_data().join("Stash"))
}
