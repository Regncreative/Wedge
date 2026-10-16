//! SQLite storage. The schema is the same as in Stash 1.x (Wedge's old
//! name), whose stash.db is carried over (state::data_dir), so upgrading
//! keeps every shelf and setting.

use std::path::Path;
use std::time::{SystemTime, UNIX_EPOCH};

use rusqlite::{params, Connection, OptionalExtension, Row};
use serde_json::{Map, Value};

use crate::models::*;

pub type Result<T> = rusqlite::Result<T>;

/// Ordered schema migrations; `PRAGMA user_version` is the number applied.
/// Append new entries — never edit one that has shipped.
const MIGRATIONS: &[&str] = &[
    // 1 — initial schema. 1.0.x installs already have these tables with
    // user_version 0, so every statement must stay idempotent.
    r#"
    CREATE TABLE IF NOT EXISTS shelves (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      icon TEXT NOT NULL DEFAULT 'folder',
      color TEXT NOT NULL DEFAULT '#0078D4',
      created_at INTEGER NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS files (
      id TEXT PRIMARY KEY,
      shelf_id TEXT NOT NULL,
      absolute_path TEXT NOT NULL,
      name TEXT NOT NULL,
      extension TEXT NOT NULL DEFAULT '',
      size INTEGER NOT NULL DEFAULT 0,
      is_directory INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      added_at INTEGER NOT NULL,
      last_accessed INTEGER,
      is_pinned INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (shelf_id) REFERENCES shelves(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_files_path_shelf ON files(absolute_path, shelf_id);
    CREATE INDEX IF NOT EXISTS idx_files_shelf ON files(shelf_id);
    CREATE INDEX IF NOT EXISTS idx_files_name ON files(name);
    CREATE INDEX IF NOT EXISTS idx_files_ext ON files(extension);
    CREATE INDEX IF NOT EXISTS idx_files_pinned ON files(is_pinned);
    CREATE INDEX IF NOT EXISTS idx_files_added ON files(added_at DESC);
    "#,
    // 2 — notes, tags, reminders, automatic, temporary and shared shelves,
    // sorting rules, and a full-text index of file contents.
    r#"
    ALTER TABLE files ADD COLUMN note TEXT NOT NULL DEFAULT '';
    ALTER TABLE files ADD COLUMN tags TEXT NOT NULL DEFAULT '';
    ALTER TABLE files ADD COLUMN remind_at INTEGER;
    ALTER TABLE files ADD COLUMN source TEXT NOT NULL DEFAULT 'manual';
    CREATE INDEX IF NOT EXISTS idx_files_remind ON files(remind_at) WHERE remind_at IS NOT NULL;

    ALTER TABLE shelves ADD COLUMN kind TEXT NOT NULL DEFAULT 'normal';
    ALTER TABLE shelves ADD COLUMN expire_hours INTEGER;

    CREATE TABLE IF NOT EXISTS rules (
      id TEXT PRIMARY KEY,
      shelf_id TEXT NOT NULL,
      extensions TEXT NOT NULL DEFAULT '',
      source TEXT NOT NULL DEFAULT 'any',
      created_at INTEGER NOT NULL,
      FOREIGN KEY (shelf_id) REFERENCES shelves(id) ON DELETE CASCADE
    );

    CREATE VIRTUAL TABLE IF NOT EXISTS file_text USING fts5(
      file_id UNINDEXED,
      content,
      tokenize = 'unicode61 remove_diacritics 2'
    );
    CREATE TRIGGER IF NOT EXISTS files_text_cleanup AFTER DELETE ON files BEGIN
      DELETE FROM file_text WHERE file_id = old.id;
    END;

    -- Shared shelves mirror a folder (e.g. in Google Drive or OneDrive).
    ALTER TABLE shelves ADD COLUMN folder TEXT;
    "#,
];

pub const SCHEMA_VERSION: i64 = MIGRATIONS.len() as i64;

/// Run `f` in a transaction, or inside the caller's if one is already open
/// (e.g. an import), since SQLite transactions don't nest.
fn in_tx<T>(conn: &Connection, f: impl FnOnce(&Connection) -> Result<T>) -> Result<T> {
    if !conn.is_autocommit() {
        return f(conn);
    }
    let tx = conn.unchecked_transaction()?;
    let out = f(&tx)?;
    tx.commit()?;
    Ok(out)
}

pub fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

/// Open (creating if needed), migrate and seed the database.
pub fn open(path: &Path, lang: Language) -> Result<Connection> {
    let conn = Connection::open(path)?;
    conn.pragma_update(None, "journal_mode", "WAL")?;
    conn.pragma_update(None, "foreign_keys", "ON")?;
    let backup = path.with_file_name(format!(
        "{}.backup",
        path.file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("stash.db")
    ));
    run_migrations(&conn, Some(&backup))?;
    seed_defaults(&conn, lang)?;
    Ok(conn)
}

/// In-memory database for tests.
pub fn open_in_memory(lang: Language) -> Result<Connection> {
    let conn = Connection::open_in_memory()?;
    conn.pragma_update(None, "foreign_keys", "ON")?;
    run_migrations(&conn, None)?;
    seed_defaults(&conn, lang)?;
    Ok(conn)
}

/// Bring the schema up to date. Before migrating an existing database, a
/// snapshot is written to `backup` so a bad migration can't lose shelves.
pub fn run_migrations(conn: &Connection, backup: Option<&Path>) -> Result<()> {
    let current: i64 = conn.pragma_query_value(None, "user_version", |r| r.get(0))?;
    if current > SCHEMA_VERSION {
        log::warn!("database schema v{current} is newer than this build (v{SCHEMA_VERSION})");
        return Ok(());
    }
    if current == SCHEMA_VERSION {
        return Ok(());
    }
    let has_tables: bool = conn.query_row(
        "SELECT COUNT(*) > 0 FROM sqlite_master WHERE type = 'table' AND name = 'shelves'",
        [],
        |r| r.get(0),
    )?;
    if let (Some(backup), true) = (backup, has_tables) {
        let _ = std::fs::remove_file(backup);
        conn.execute("VACUUM INTO ?1", [backup.to_string_lossy()])?;
    }
    for version in current..SCHEMA_VERSION {
        let tx = conn.unchecked_transaction()?;
        tx.execute_batch(MIGRATIONS[version as usize])?;
        tx.pragma_update(None, "user_version", version + 1)?;
        tx.commit()?;
    }
    Ok(())
}

pub fn default_shelves(lang: Language) -> [(&'static str, &'static str, &'static str); 3] {
    match lang {
        Language::Tr => [
            ("İş", "briefcase", "#8D97FF"),
            ("Kişisel", "heart", "#FF7FAC"),
            ("Geçici", "clock", "#F6BB45"),
        ],
        Language::En => [
            ("Work", "briefcase", "#8D97FF"),
            ("Personal", "heart", "#FF7FAC"),
            ("Temporary", "clock", "#F6BB45"),
        ],
        Language::Ru => [
            ("Работа", "briefcase", "#8D97FF"),
            ("Личное", "heart", "#FF7FAC"),
            ("Временная", "clock", "#F6BB45"),
        ],
    }
}

fn seed_defaults(conn: &Connection, lang: Language) -> Result<()> {
    let count: i64 = conn.query_row("SELECT COUNT(*) FROM shelves", [], |r| r.get(0))?;
    if count == 0 {
        let now = now_ms();
        let mut first = None;
        for (order, (name, icon, color)) in default_shelves(lang).iter().enumerate() {
            let id = uuid::Uuid::new_v4().to_string();
            conn.execute(
                "INSERT INTO shelves (id, name, icon, color, created_at, sort_order) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                params![id, name, icon, color, now, order as i64],
            )?;
            first.get_or_insert(id);
        }
        if let Some(id) = first {
            set_raw(conn, "defaultShelfId", &Value::String(id))?;
        }
    } else if get_raw(conn, "onboardingDone")?.is_none() {
        // Existing users already know the app; only fresh installs see the welcome.
        set_raw(conn, "onboardingDone", &Value::Bool(true))?;
    }
    Ok(())
}

// ── Shelves ───────────────────────────────────────────────

fn map_shelf(row: &Row) -> Result<Shelf> {
    Ok(Shelf {
        id: row.get("id")?,
        name: row.get("name")?,
        icon: row.get("icon")?,
        color: row.get("color")?,
        created_at: row.get("created_at")?,
        sort_order: row.get("sort_order")?,
        kind: row.get("kind")?,
        expire_hours: row.get("expire_hours")?,
        folder: row.get("folder")?,
    })
}

pub fn list_shelves(conn: &Connection) -> Result<Vec<Shelf>> {
    let mut stmt = conn.prepare("SELECT * FROM shelves ORDER BY sort_order ASC, created_at ASC")?;
    let rows = stmt.query_map([], map_shelf)?;
    rows.collect()
}

/// Where Explorer's "Add to Wedge" puts files: the shelf the user last opened,
/// unless it's an automatic one (downloads, screenshots, phone), which only
/// its own source fills; then the default shelf or the first regular one.
pub fn manual_shelf(conn: &Connection, last: &str, default: &str) -> Result<String> {
    let shelves = list_shelves(conn)?;
    let takes_files = |id: &str| {
        shelves
            .iter()
            .any(|s| s.id == id && matches!(s.kind.as_str(), "normal" | "pocket"))
    };
    Ok([last, default]
        .into_iter()
        .find(|id| takes_files(id))
        .map(str::to_string)
        .or_else(|| {
            shelves
                .iter()
                .find(|s| s.kind == "normal")
                .map(|s| s.id.clone())
        })
        .unwrap_or_else(|| last.to_string()))
}

pub fn create_shelf(
    conn: &Connection,
    name: &str,
    icon: Option<&str>,
    color: Option<&str>,
) -> Result<Shelf> {
    let max: Option<i64> =
        conn.query_row("SELECT MAX(sort_order) FROM shelves", [], |r| r.get(0))?;
    let shelf = Shelf {
        id: uuid::Uuid::new_v4().to_string(),
        name: name.to_string(),
        icon: icon.unwrap_or("folder").to_string(),
        color: color.unwrap_or("#0078D4").to_string(),
        created_at: now_ms(),
        sort_order: max.map_or(0, |m| m + 1),
        kind: "normal".into(),
        expire_hours: None,
        folder: None,
    };
    conn.execute(
        "INSERT INTO shelves (id, name, icon, color, created_at, sort_order) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![shelf.id, shelf.name, shelf.icon, shelf.color, shelf.created_at, shelf.sort_order],
    )?;
    Ok(shelf)
}

pub fn get_shelf(conn: &Connection, id: &str) -> Result<Option<Shelf>> {
    conn.query_row("SELECT * FROM shelves WHERE id = ?1", [id], map_shelf)
        .optional()
}

/// Turn a shelf into a shared shelf mirroring `folder`.
pub fn set_shelf_folder(conn: &Connection, id: &str, folder: &str) -> Result<()> {
    conn.execute(
        "UPDATE shelves SET kind = 'shared', folder = ?1, expire_hours = NULL WHERE id = ?2",
        params![folder, id],
    )?;
    Ok(())
}

/// The shared shelf already linked to `folder` (compared case-insensitively).
pub fn shelf_by_folder(conn: &Connection, folder: &str) -> Result<Option<Shelf>> {
    let norm = |p: &str| p.trim_end_matches(['\\', '/']).to_lowercase();
    let wanted = norm(folder);
    Ok(list_shelves(conn)?
        .into_iter()
        .find(|s| s.folder.as_deref().is_some_and(|f| norm(f) == wanted)))
}

pub fn set_shelf_style(conn: &Connection, id: &str, icon: &str, color: &str) -> Result<()> {
    conn.execute(
        "UPDATE shelves SET icon = ?1, color = ?2 WHERE id = ?3",
        params![icon, color, id],
    )?;
    Ok(())
}

pub fn rename_shelf(conn: &Connection, id: &str, name: &str) -> Result<()> {
    conn.execute(
        "UPDATE shelves SET name = ?1 WHERE id = ?2",
        params![name, id],
    )?;
    Ok(())
}

#[derive(Debug, PartialEq)]
pub enum DeleteShelfError {
    LastShelf,
    Db(String),
}

pub fn delete_shelf(conn: &Connection, id: &str) -> std::result::Result<(), DeleteShelfError> {
    let db = |e: rusqlite::Error| DeleteShelfError::Db(e.to_string());
    let count: i64 = conn
        .query_row("SELECT COUNT(*) FROM shelves", [], |r| r.get(0))
        .map_err(db)?;
    if count <= 1 {
        return Err(DeleteShelfError::LastShelf);
    }
    conn.execute("DELETE FROM shelves WHERE id = ?1", [id])
        .map_err(db)?;
    Ok(())
}

// ── Files ─────────────────────────────────────────────────

fn map_file(row: &Row) -> Result<StashFile> {
    Ok(StashFile {
        id: row.get("id")?,
        shelf_id: row.get("shelf_id")?,
        absolute_path: row.get("absolute_path")?,
        name: row.get("name")?,
        extension: row.get("extension")?,
        size: row.get("size")?,
        is_directory: row.get::<_, i64>("is_directory")? != 0,
        created_at: row.get("created_at")?,
        added_at: row.get("added_at")?,
        last_accessed: row.get("last_accessed")?,
        is_pinned: row.get::<_, i64>("is_pinned")? != 0,
        note: row.get("note")?,
        tags: row.get("tags")?,
        remind_at: row.get("remind_at")?,
        source: row.get("source")?,
        exists: true,
    })
}

pub fn list_files(conn: &Connection, shelf_id: Option<&str>) -> Result<Vec<StashFile>> {
    let order = "ORDER BY is_pinned DESC, added_at DESC";
    match shelf_id {
        Some(id) => {
            let mut stmt =
                conn.prepare(&format!("SELECT * FROM files WHERE shelf_id = ?1 {order}"))?;
            let rows = stmt.query_map([id], map_file)?;
            rows.collect()
        }
        None => {
            let mut stmt = conn.prepare(&format!("SELECT * FROM files {order}"))?;
            let rows = stmt.query_map([], map_file)?;
            rows.collect()
        }
    }
}

pub fn get_file(conn: &Connection, id: &str) -> Result<Option<StashFile>> {
    conn.query_row("SELECT * FROM files WHERE id = ?1", [id], map_file)
        .optional()
}

/// Insert files into a shelf; paths already on that shelf are skipped.
pub fn add_files(conn: &Connection, files: &[FileInput], shelf_id: &str) -> Result<(usize, usize)> {
    add_files_from(conn, files, shelf_id, "manual")
}

/// Like [`add_files`], recording where the files came from.
pub fn add_files_from(
    conn: &Connection,
    files: &[FileInput],
    shelf_id: &str,
    source: &str,
) -> Result<(usize, usize)> {
    in_tx(conn, |tx| {
        let now = now_ms();
        let (mut added, mut skipped) = (0, 0);
        let mut insert = tx.prepare(
            "INSERT OR IGNORE INTO files
               (id, shelf_id, absolute_path, name, extension, size, is_directory,
                created_at, added_at, last_accessed, is_pinned, source)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, NULL, ?10, ?11)",
        )?;
        for f in files {
            let changed = insert.execute(params![
                uuid::Uuid::new_v4().to_string(),
                shelf_id,
                f.absolute_path,
                f.name,
                f.extension,
                f.size,
                f.is_directory as i64,
                f.created_at,
                now,
                f.is_pinned as i64,
                source,
            ])?;
            if changed > 0 {
                added += 1
            } else {
                skipped += 1
            }
        }
        Ok((added, skipped))
    })
}

pub fn remove_files(conn: &Connection, ids: &[String]) -> Result<()> {
    in_tx(conn, |tx| {
        let mut stmt = tx.prepare("DELETE FROM files WHERE id = ?1")?;
        for id in ids {
            stmt.execute([id])?;
        }
        Ok(())
    })
}

pub fn set_files_pinned(conn: &Connection, ids: &[String], pinned: bool) -> Result<()> {
    in_tx(conn, |tx| {
        let mut stmt = tx.prepare("UPDATE files SET is_pinned = ?1 WHERE id = ?2")?;
        for id in ids {
            stmt.execute(params![pinned as i64, id])?;
        }
        Ok(())
    })
}

pub fn move_file(conn: &Connection, id: &str, shelf_id: &str) -> Result<()> {
    conn.execute(
        "UPDATE files SET shelf_id = ?1 WHERE id = ?2",
        params![shelf_id, id],
    )?;
    Ok(())
}

/// Point a file at a new copy on another shelf (moving onto a shared shelf).
pub fn relocate_file(
    conn: &Connection,
    id: &str,
    shelf_id: &str,
    path: &str,
    name: &str,
) -> Result<()> {
    conn.execute(
        "UPDATE files SET shelf_id = ?1, absolute_path = ?2, name = ?3 WHERE id = ?4",
        params![shelf_id, path, name, id],
    )?;
    Ok(())
}

pub fn touch_file(conn: &Connection, id: &str) -> Result<()> {
    conn.execute(
        "UPDATE files SET last_accessed = ?1 WHERE id = ?2",
        params![now_ms(), id],
    )?;
    Ok(())
}

pub fn stats(conn: &Connection) -> Result<ShelfStats> {
    let shelf_count = conn.query_row("SELECT COUNT(*) FROM shelves", [], |r| r.get(0))?;
    let (file_count, total_size) = conn.query_row(
        "SELECT COUNT(*), COALESCE(SUM(size), 0) FROM files",
        [],
        |r| Ok((r.get(0)?, r.get(1)?)),
    )?;
    Ok(ShelfStats {
        shelf_count,
        file_count,
        total_size,
    })
}

// ── Settings ──────────────────────────────────────────────
// Stored as key → JSON value, exactly like 1.x.

pub fn get_raw(conn: &Connection, key: &str) -> Result<Option<Value>> {
    let raw: Option<String> = conn
        .query_row("SELECT value FROM settings WHERE key = ?1", [key], |r| {
            r.get(0)
        })
        .optional()?;
    Ok(raw.and_then(|s| serde_json::from_str(&s).ok()))
}

pub fn set_raw(conn: &Connection, key: &str, value: &Value) -> Result<()> {
    conn.execute(
        "INSERT INTO settings (key, value) VALUES (?1, ?2)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        params![key, value.to_string()],
    )?;
    Ok(())
}

pub const DEFAULT_HOTKEY: &str = "CommandOrControl+Shift+Space";

fn defaults() -> Map<String, Value> {
    serde_json::json!({
        "theme": "dark",
        "accentColor": "#8D97FF",
        "startWithWindows": true,
        "openHotkey": DEFAULT_HOTKEY,
        "defaultShelfId": "",
        "lastShelfId": "",
        "notifications": true,
        "fileSort": "added",
        "idleOpacity": 0.4,
        "idleTimeoutSec": 10,
        "updateChannel": "stable",
        "onboardingDone": false,
        "watchDownloads": true,
        "watchScreenshots": true,
        "edgeHandle": "right",
        "contextMenu": true
    })
    .as_object()
    .cloned()
    .unwrap_or_default()
}

pub fn clamp_opacity(v: f64) -> f64 {
    if v.is_finite() {
        v.clamp(0.1, 0.7)
    } else {
        0.4
    }
}

pub fn clamp_timeout(v: f64) -> i64 {
    if v.is_finite() {
        (v.round() as i64).clamp(5, 60)
    } else {
        10
    }
}

pub fn is_hex_color(s: &str) -> bool {
    s.len() == 7 && s.starts_with('#') && s[1..].chars().all(|c| c.is_ascii_hexdigit())
}

fn enum_or<T: serde::de::DeserializeOwned>(v: Option<&Value>, fallback: T) -> T {
    v.and_then(|v| serde_json::from_value(v.clone()).ok())
        .unwrap_or(fallback)
}

/// Read settings, filling and persisting defaults for missing keys and
/// replacing invalid values (older databases, manual edits).
pub fn get_settings(conn: &Connection, lang: Language) -> Result<AppSettings> {
    let mut stored = Map::new();
    {
        let mut stmt = conn.prepare("SELECT key, value FROM settings")?;
        let rows = stmt.query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))?;
        for row in rows {
            let (k, v) = row?;
            if let Ok(v) = serde_json::from_str::<Value>(&v) {
                stored.insert(k, v);
            }
        }
    }
    for (k, v) in defaults() {
        if !stored.contains_key(&k) {
            if k != "defaultShelfId" {
                set_raw(conn, &k, &v)?;
            }
            stored.insert(k, v);
        }
    }

    let str_of = |k: &str| {
        stored
            .get(k)
            .and_then(Value::as_str)
            .unwrap_or("")
            .to_string()
    };
    let bool_of = |k: &str, d: bool| stored.get(k).and_then(Value::as_bool).unwrap_or(d);
    let num_of = |k: &str| stored.get(k).and_then(Value::as_f64).unwrap_or(f64::NAN);

    let accent = str_of("accentColor");
    let hotkey = str_of("openHotkey");
    let mut s = AppSettings {
        theme: enum_or(stored.get("theme"), Theme::Dark),
        accent_color: if is_hex_color(&accent) {
            accent
        } else {
            "#8D97FF".into()
        },
        start_with_windows: bool_of("startWithWindows", true),
        language: lang,
        open_hotkey: if hotkey.is_empty() {
            DEFAULT_HOTKEY.into()
        } else {
            hotkey
        },
        default_shelf_id: str_of("defaultShelfId"),
        last_shelf_id: str_of("lastShelfId"),
        notifications: bool_of("notifications", true),
        file_sort: enum_or(stored.get("fileSort"), FileSort::Added),
        idle_opacity: clamp_opacity(num_of("idleOpacity")),
        idle_timeout_sec: clamp_timeout(num_of("idleTimeoutSec")),
        update_channel: enum_or(stored.get("updateChannel"), UpdateChannel::Stable),
        onboarding_done: bool_of("onboardingDone", false),
        watch_downloads: bool_of("watchDownloads", true),
        watch_screenshots: bool_of("watchScreenshots", true),
        edge_handle: enum_or(stored.get("edgeHandle"), EdgeHandle::Right),
        context_menu: bool_of("contextMenu", true),
    };

    // Heal shelf references after a shelf was deleted.
    let shelves = list_shelves(conn)?;
    let has = |id: &str| shelves.iter().any(|sh| sh.id == id);
    if !has(&s.default_shelf_id) {
        s.default_shelf_id = shelves.first().map(|sh| sh.id.clone()).unwrap_or_default();
        if !s.default_shelf_id.is_empty() {
            set_raw(
                conn,
                "defaultShelfId",
                &Value::String(s.default_shelf_id.clone()),
            )?;
        }
    }
    if !has(&s.last_shelf_id) {
        s.last_shelf_id = s.default_shelf_id.clone();
        if !s.last_shelf_id.is_empty() {
            set_raw(conn, "lastShelfId", &Value::String(s.last_shelf_id.clone()))?;
        }
    }
    Ok(s)
}

/// Persist a validated patch. The language is never stored: it follows Windows.
pub fn set_settings(
    conn: &Connection,
    patch: &SettingsPatch,
    lang: Language,
) -> Result<AppSettings> {
    in_tx(conn, |tx| write_patch(tx, patch))?;
    get_settings(conn, lang)
}

fn write_patch(tx: &Connection, patch: &SettingsPatch) -> Result<()> {
    let put = |k: &str, v: Value| set_raw(tx, k, &v);
    if let Some(v) = patch.theme {
        put("theme", serde_json::to_value(v).unwrap_or_default())?;
    }
    if let Some(v) = &patch.accent_color {
        put("accentColor", Value::String(v.clone()))?;
    }
    if let Some(v) = patch.start_with_windows {
        put("startWithWindows", Value::Bool(v))?;
    }
    if let Some(v) = &patch.open_hotkey {
        put("openHotkey", Value::String(v.clone()))?;
    }
    if let Some(v) = &patch.default_shelf_id {
        put("defaultShelfId", Value::String(v.clone()))?;
    }
    if let Some(v) = &patch.last_shelf_id {
        put("lastShelfId", Value::String(v.clone()))?;
    }
    if let Some(v) = patch.notifications {
        put("notifications", Value::Bool(v))?;
    }
    if let Some(v) = patch.file_sort {
        put("fileSort", serde_json::to_value(v).unwrap_or_default())?;
    }
    if let Some(v) = patch.idle_opacity {
        put("idleOpacity", serde_json::json!(clamp_opacity(v)))?;
    }
    if let Some(v) = patch.idle_timeout_sec {
        put("idleTimeoutSec", serde_json::json!(clamp_timeout(v)))?;
    }
    if let Some(v) = patch.update_channel {
        put("updateChannel", serde_json::to_value(v).unwrap_or_default())?;
    }
    if let Some(v) = patch.onboarding_done {
        put("onboardingDone", Value::Bool(v))?;
    }
    if let Some(v) = patch.watch_downloads {
        put("watchDownloads", Value::Bool(v))?;
    }
    if let Some(v) = patch.watch_screenshots {
        put("watchScreenshots", Value::Bool(v))?;
    }
    if let Some(v) = patch.edge_handle {
        put("edgeHandle", serde_json::to_value(v).unwrap_or_default())?;
    }
    if let Some(v) = patch.context_menu {
        put("contextMenu", Value::Bool(v))?;
    }
    Ok(())
}

/// A random id for this installation (staged-rollout bucket).
pub fn install_id(conn: &Connection) -> Result<String> {
    if let Some(Value::String(id)) = get_raw(conn, "installId")? {
        return Ok(id);
    }
    let id = uuid::Uuid::new_v4().to_string();
    set_raw(conn, "installId", &Value::String(id.clone()))?;
    Ok(id)
}

// ── Notes, tags, reminders ────────────────────────────────

pub fn set_file_meta(conn: &Connection, id: &str, note: &str, tags: &str) -> Result<()> {
    conn.execute(
        "UPDATE files SET note = ?1, tags = ?2 WHERE id = ?3",
        params![note, tags, id],
    )?;
    Ok(())
}

pub fn set_reminder(conn: &Connection, id: &str, at: Option<i64>) -> Result<()> {
    conn.execute(
        "UPDATE files SET remind_at = ?1 WHERE id = ?2",
        params![at, id],
    )?;
    Ok(())
}

/// Reminders that are due, cleared so each fires once.
pub fn take_due_reminders(conn: &Connection, now: i64) -> Result<Vec<StashFile>> {
    in_tx(conn, |tx| {
        let due: Vec<StashFile> = {
            let mut stmt = tx.prepare(
                "SELECT * FROM files WHERE remind_at IS NOT NULL AND remind_at <= ?1 ORDER BY remind_at",
            )?;
            let rows = stmt.query_map([now], map_file)?;
            rows.collect::<Result<_>>()?
        };
        for f in &due {
            tx.execute("UPDATE files SET remind_at = NULL WHERE id = ?1", [&f.id])?;
        }
        Ok(due)
    })
}

// ── Automatic and temporary shelves ───────────────────────

pub fn shelf_of_kind(conn: &Connection, kind: &str) -> Result<Option<Shelf>> {
    conn.query_row(
        "SELECT * FROM shelves WHERE kind = ?1 ORDER BY created_at LIMIT 1",
        [kind],
        map_shelf,
    )
    .optional()
}

/// The shelf for an automatic source, created on first use.
pub fn ensure_kind_shelf(
    conn: &Connection,
    kind: &str,
    name: &str,
    icon: &str,
    color: &str,
) -> Result<Shelf> {
    if let Some(shelf) = shelf_of_kind(conn, kind)? {
        return Ok(shelf);
    }
    let mut shelf = create_shelf(conn, name, Some(icon), Some(color))?;
    conn.execute(
        "UPDATE shelves SET kind = ?1 WHERE id = ?2",
        params![kind, shelf.id],
    )?;
    shelf.kind = kind.to_string();
    Ok(shelf)
}

pub fn set_shelf_expiry(conn: &Connection, id: &str, hours: Option<i64>) -> Result<()> {
    conn.execute(
        "UPDATE shelves SET expire_hours = ?1 WHERE id = ?2",
        params![hours, id],
    )?;
    Ok(())
}

/// Remove files that outlived their shelf's expiry. Pinned files stay.
pub fn expire_files(conn: &Connection, now: i64) -> Result<usize> {
    conn.execute(
        "DELETE FROM files
         WHERE is_pinned = 0
           AND EXISTS (
             SELECT 1 FROM shelves s
             WHERE s.id = files.shelf_id
               AND s.folder IS NULL
               AND s.expire_hours IS NOT NULL
               AND files.added_at < ?1 - s.expire_hours * 3600000
           )",
        [now],
    )
}

// ── Sorting rules ─────────────────────────────────────────

#[derive(Debug, Clone, serde::Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Rule {
    pub id: String,
    pub shelf_id: String,
    /// Comma-separated lowercase extensions; empty matches every file.
    pub extensions: String,
    /// "any" or a source such as "downloads".
    pub source: String,
}

pub fn normalize_extensions(raw: &str) -> String {
    let mut out: Vec<String> = raw
        .split([',', ' ', ';'])
        .map(|e| e.trim().trim_start_matches('.').to_lowercase())
        .filter(|e| !e.is_empty())
        .collect();
    out.dedup();
    out.join(",")
}

pub fn list_rules(conn: &Connection) -> Result<Vec<Rule>> {
    let mut stmt =
        conn.prepare("SELECT id, shelf_id, extensions, source FROM rules ORDER BY created_at")?;
    let rows = stmt.query_map([], |r| {
        Ok(Rule {
            id: r.get(0)?,
            shelf_id: r.get(1)?,
            extensions: r.get(2)?,
            source: r.get(3)?,
        })
    })?;
    rows.collect()
}

pub fn add_rule(conn: &Connection, shelf_id: &str, extensions: &str, source: &str) -> Result<Rule> {
    let rule = Rule {
        id: uuid::Uuid::new_v4().to_string(),
        shelf_id: shelf_id.to_string(),
        extensions: normalize_extensions(extensions),
        source: source.to_string(),
    };
    conn.execute(
        "INSERT INTO rules (id, shelf_id, extensions, source, created_at) VALUES (?1, ?2, ?3, ?4, ?5)",
        params![rule.id, rule.shelf_id, rule.extensions, rule.source, now_ms()],
    )?;
    Ok(rule)
}

pub fn delete_rule(conn: &Connection, id: &str) -> Result<()> {
    conn.execute("DELETE FROM rules WHERE id = ?1", [id])?;
    Ok(())
}

/// The first rule matching a file's extension and source decides its shelf.
pub fn shelf_for(conn: &Connection, extension: &str, source: &str) -> Result<Option<String>> {
    let ext = extension.to_lowercase();
    Ok(list_rules(conn)?
        .into_iter()
        .find(|r| {
            (r.source == "any" || r.source == source)
                && (r.extensions.is_empty() || r.extensions.split(',').any(|e| e == ext))
        })
        .map(|r| r.shelf_id))
}

// ── Content index ─────────────────────────────────────────

pub fn index_text(conn: &Connection, file_id: &str, text: &str) -> Result<()> {
    in_tx(conn, |tx| {
        tx.execute("DELETE FROM file_text WHERE file_id = ?1", [file_id])?;
        tx.execute(
            "INSERT INTO file_text (file_id, content) VALUES (?1, ?2)",
            params![file_id, text],
        )?;
        Ok(())
    })
}

/// Files whose contents match every word of `query` (prefix match).
pub fn search_content(conn: &Connection, query: &str) -> Result<Vec<String>> {
    let terms: Vec<String> = query
        .split_whitespace()
        .map(|t| t.replace('"', ""))
        .filter(|t| !t.is_empty())
        .map(|t| format!("\"{t}\"*"))
        .collect();
    if terms.is_empty() {
        return Ok(Vec::new());
    }
    let mut stmt =
        conn.prepare("SELECT DISTINCT file_id FROM file_text WHERE file_text MATCH ?1 LIMIT 500")?;
    let rows = stmt.query_map([terms.join(" AND ")], |r| r.get(0))?;
    rows.collect()
}

/// Files on the shelves that have no text indexed yet.
pub fn files_without_text(conn: &Connection, limit: i64) -> Result<Vec<StashFile>> {
    let mut stmt = conn.prepare(
        "SELECT * FROM files f WHERE is_directory = 0
           AND NOT EXISTS (SELECT 1 FROM file_text t WHERE t.file_id = f.id)
         ORDER BY added_at DESC LIMIT ?1",
    )?;
    let rows = stmt.query_map([limit], map_file)?;
    rows.collect()
}

/// Wedge's own files (clips, phone uploads) moved with the data folder from
/// `from` to `to`: point their entries at the new place. Returns how many.
pub fn rebase_paths(conn: &Connection, from: &Path, to: &Path) -> Result<usize> {
    let with_sep = |p: &Path| {
        let s = p.to_string_lossy().trim_end_matches('\\').to_string();
        format!("{s}\\")
    };
    conn.execute(
        "UPDATE files SET absolute_path = ?2 || substr(absolute_path, length(?1) + 1)
         WHERE lower(substr(absolute_path, 1, length(?1))) = lower(?1)",
        params![with_sep(from), with_sep(to)],
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn files_in_the_old_data_folder_follow_it() {
        let conn = db();
        let shelf = list_shelves(&conn).unwrap()[0].id.clone();
        add_files(
            &conn,
            &[
                file("C:\\Users\\a\\AppData\\Roaming\\Stash\\clips\\shot.png"),
                file("C:\\Users\\a\\AppData\\Roaming\\StashOther\\x.txt"),
                file("D:\\Stash\\notes.txt"),
            ],
            &shelf,
        )
        .unwrap();
        let moved = rebase_paths(
            &conn,
            Path::new("C:\\Users\\a\\AppData\\Roaming\\stash"),
            Path::new("C:\\Users\\a\\AppData\\Roaming\\Wedge"),
        )
        .unwrap();
        assert_eq!(moved, 1);
        let mut paths: Vec<_> = list_files(&conn, None)
            .unwrap()
            .into_iter()
            .map(|f| f.absolute_path)
            .collect();
        paths.sort();
        assert_eq!(
            paths,
            [
                "C:\\Users\\a\\AppData\\Roaming\\StashOther\\x.txt",
                "C:\\Users\\a\\AppData\\Roaming\\Wedge\\clips\\shot.png",
                "D:\\Stash\\notes.txt",
            ]
        );
    }

    fn file(path: &str) -> FileInput {
        FileInput {
            absolute_path: path.into(),
            name: path.rsplit('\\').next().unwrap_or(path).into(),
            extension: "txt".into(),
            size: 100,
            is_directory: false,
            created_at: 1,
            is_pinned: false,
        }
    }

    fn db() -> Connection {
        open_in_memory(Language::En).unwrap()
    }

    #[test]
    fn seeds_default_shelves_and_default_shelf() {
        let conn = db();
        let shelves = list_shelves(&conn).unwrap();
        let names: Vec<_> = shelves.iter().map(|s| s.name.as_str()).collect();
        assert_eq!(names, ["Work", "Personal", "Temporary"]);
        let s = get_settings(&conn, Language::En).unwrap();
        assert_eq!(s.default_shelf_id, shelves[0].id);
        assert!(!s.onboarding_done);
    }

    #[test]
    fn turkish_defaults() {
        let conn = open_in_memory(Language::Tr).unwrap();
        assert_eq!(list_shelves(&conn).unwrap()[0].name, "İş");
    }

    #[test]
    fn russian_defaults() {
        let conn = open_in_memory(Language::Ru).unwrap();
        assert_eq!(list_shelves(&conn).unwrap()[0].name, "Работа");
        assert_eq!(
            get_settings(&conn, Language::Ru).unwrap().language,
            Language::Ru
        );
    }

    #[test]
    fn skips_duplicates_per_shelf() {
        let conn = db();
        let shelves = list_shelves(&conn).unwrap();
        assert_eq!(
            add_files(
                &conn,
                &[file("C:\\a.txt"), file("C:\\b.txt")],
                &shelves[0].id
            )
            .unwrap(),
            (2, 0)
        );
        assert_eq!(
            add_files(&conn, &[file("C:\\a.txt")], &shelves[0].id).unwrap(),
            (0, 1)
        );
        assert_eq!(
            add_files(&conn, &[file("C:\\a.txt")], &shelves[1].id).unwrap(),
            (1, 0)
        );
    }

    #[test]
    fn lists_pinned_first_then_newest() {
        let conn = db();
        let work = list_shelves(&conn).unwrap()[0].id.clone();
        add_files(&conn, &[file("C:\\old.txt")], &work).unwrap();
        add_files(&conn, &[file("C:\\new.txt")], &work).unwrap();
        let old = list_files(&conn, Some(&work))
            .unwrap()
            .into_iter()
            .find(|f| f.name == "old.txt")
            .unwrap();
        set_files_pinned(&conn, &[old.id], true).unwrap();
        let names: Vec<_> = list_files(&conn, Some(&work))
            .unwrap()
            .into_iter()
            .map(|f| f.name)
            .collect();
        assert_eq!(names, ["old.txt", "new.txt"]);
    }

    #[test]
    fn moves_removes_and_counts() {
        let conn = db();
        let shelves = list_shelves(&conn).unwrap();
        add_files(
            &conn,
            &[file("C:\\a.txt"), file("C:\\b.txt"), file("C:\\c.txt")],
            &shelves[0].id,
        )
        .unwrap();
        let files = list_files(&conn, None).unwrap();
        move_file(&conn, &files[0].id, &shelves[1].id).unwrap();
        assert_eq!(list_files(&conn, Some(&shelves[1].id)).unwrap().len(), 1);
        remove_files(&conn, &[files[1].id.clone(), files[2].id.clone()]).unwrap();
        assert_eq!(
            stats(&conn).unwrap(),
            ShelfStats {
                shelf_count: 3,
                file_count: 1,
                total_size: 100
            }
        );
    }

    #[test]
    fn deleting_a_shelf_removes_its_files_and_heals_defaults() {
        let conn = db();
        let shelves = list_shelves(&conn).unwrap();
        add_files(&conn, &[file("C:\\a.txt")], &shelves[0].id).unwrap();
        delete_shelf(&conn, &shelves[0].id).unwrap();
        assert!(list_files(&conn, None).unwrap().is_empty());
        let s = get_settings(&conn, Language::En).unwrap();
        assert_eq!(s.default_shelf_id, shelves[1].id);
        assert_eq!(s.last_shelf_id, shelves[1].id);
    }

    #[test]
    fn refuses_to_delete_the_last_shelf() {
        let conn = db();
        let shelves = list_shelves(&conn).unwrap();
        delete_shelf(&conn, &shelves[0].id).unwrap();
        delete_shelf(&conn, &shelves[1].id).unwrap();
        assert_eq!(
            delete_shelf(&conn, &shelves[2].id),
            Err(DeleteShelfError::LastShelf)
        );
    }

    #[test]
    fn settings_are_clamped_and_language_is_never_stored() {
        let conn = db();
        let patch = SettingsPatch {
            idle_opacity: Some(5.0),
            idle_timeout_sec: Some(1.0),
            language: Some(Language::Tr),
            ..Default::default()
        };
        let s = set_settings(&conn, &patch, Language::En).unwrap();
        assert_eq!(s.idle_opacity, 0.7);
        assert_eq!(s.idle_timeout_sec, 5);
        assert_eq!(s.language, Language::En);
        assert_eq!(get_raw(&conn, "language").unwrap(), None);
    }

    #[test]
    fn invalid_stored_values_fall_back_to_defaults() {
        let conn = db();
        set_raw(&conn, "theme", &Value::String("neon".into())).unwrap();
        set_raw(&conn, "accentColor", &Value::String("red".into())).unwrap();
        set_raw(&conn, "idleOpacity", &Value::String("x".into())).unwrap();
        let s = get_settings(&conn, Language::En).unwrap();
        assert_eq!(s.theme, Theme::Dark);
        assert_eq!(s.accent_color, "#8D97FF");
        assert_eq!(s.idle_opacity, 0.4);
    }

    #[test]
    fn rejects_unknown_settings_keys() {
        let err = serde_json::from_str::<SettingsPatch>(r#"{"isAdmin": true}"#);
        assert!(err.is_err());
        let err = serde_json::from_str::<SettingsPatch>(r#"{"theme": "neon"}"#);
        assert!(err.is_err());
    }

    #[test]
    fn creates_shelves_at_the_end() {
        let conn = db();
        let s = create_shelf(&conn, "Downloads", None, None).unwrap();
        assert_eq!(s.sort_order, 3);
        rename_shelf(&conn, &s.id, "DL").unwrap();
        assert_eq!(list_shelves(&conn).unwrap()[3].name, "DL");
    }

    #[test]
    fn stays_fast_with_ten_thousand_files() {
        let conn = db();
        let work = list_shelves(&conn).unwrap()[0].id.clone();
        let many: Vec<_> = (0..10_000)
            .map(|i| file(&format!("C:\\data\\file-{i}.txt")))
            .collect();
        let t0 = std::time::Instant::now();
        add_files(&conn, &many, &work).unwrap();
        assert_eq!(list_files(&conn, None).unwrap().len(), 10_000);
        assert!(t0.elapsed().as_millis() < 2000, "took {:?}", t0.elapsed());
    }

    #[test]
    fn migrates_a_1_0_x_database_in_place_with_backup() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("stash.db");
        {
            // A 1.0.x install: tables exist, user_version is still 0.
            let legacy = Connection::open(&path).unwrap();
            legacy.execute_batch(MIGRATIONS[0]).unwrap();
            legacy
                .execute(
                    "INSERT INTO shelves (id, name, created_at) VALUES ('legacy', 'Old shelf', 1)",
                    [],
                )
                .unwrap();
            set_raw(&legacy, "theme", &Value::String("light".into())).unwrap();
        }
        let conn = open(&path, Language::En).unwrap();
        let version: i64 = conn
            .pragma_query_value(None, "user_version", |r| r.get(0))
            .unwrap();
        assert_eq!(version, SCHEMA_VERSION);
        assert_eq!(list_shelves(&conn).unwrap()[0].name, "Old shelf");
        assert!(dir.path().join("stash.db.backup").exists());
        let s = get_settings(&conn, Language::En).unwrap();
        assert_eq!(s.theme, Theme::Light);
        assert!(s.onboarding_done, "upgrading users skip the welcome");
    }

    #[test]
    fn notes_tags_and_reminders() {
        let conn = db();
        let work = list_shelves(&conn).unwrap()[0].id.clone();
        add_files(&conn, &[file("C:\\a.txt"), file("C:\\b.txt")], &work).unwrap();
        let files = list_files(&conn, None).unwrap();
        set_file_meta(&conn, &files[0].id, "for the tax office", "finance, 2026").unwrap();
        set_reminder(&conn, &files[0].id, Some(1_000)).unwrap();
        set_reminder(&conn, &files[1].id, Some(5_000)).unwrap();

        let due = take_due_reminders(&conn, 2_000).unwrap();
        assert_eq!(due.len(), 1);
        assert_eq!(due[0].note, "for the tax office");
        assert_eq!(due[0].tags, "finance, 2026");
        assert!(
            take_due_reminders(&conn, 2_000).unwrap().is_empty(),
            "fires once"
        );
        assert_eq!(take_due_reminders(&conn, 9_000).unwrap().len(), 1);
    }

    #[test]
    fn automatic_shelves_are_created_once() {
        let conn = db();
        let a = ensure_kind_shelf(&conn, "downloads", "Downloads", "download", "#0078D4").unwrap();
        let b = ensure_kind_shelf(&conn, "downloads", "Downloads", "download", "#0078D4").unwrap();
        assert_eq!(a.id, b.id);
        assert_eq!(a.kind, "downloads");
        assert_eq!(list_shelves(&conn).unwrap().len(), 4);
    }

    #[test]
    fn explorer_adds_skip_automatic_shelves() {
        let conn = db();
        let shelves = list_shelves(&conn).unwrap();
        let shots =
            ensure_kind_shelf(&conn, "screenshots", "Screenshots", "camera", "#C79BFF").unwrap();
        let default = &shelves[0].id;
        assert_eq!(
            manual_shelf(&conn, &shelves[1].id, default).unwrap(),
            shelves[1].id
        );
        assert_eq!(manual_shelf(&conn, &shots.id, default).unwrap(), *default);
        assert_eq!(manual_shelf(&conn, &shots.id, &shots.id).unwrap(), *default);
    }

    #[test]
    fn temporary_shelves_expire_unpinned_files() {
        let conn = db();
        let temp = list_shelves(&conn).unwrap()[2].id.clone();
        let work = list_shelves(&conn).unwrap()[0].id.clone();
        set_shelf_expiry(&conn, &temp, Some(24)).unwrap();
        add_files(&conn, &[file("C:\\old.txt"), file("C:\\keep.txt")], &temp).unwrap();
        add_files(&conn, &[file("C:\\work.txt")], &work).unwrap();
        let keep = list_files(&conn, Some(&temp))
            .unwrap()
            .into_iter()
            .find(|f| f.name == "keep.txt")
            .unwrap();
        set_files_pinned(&conn, &[keep.id], true).unwrap();

        let two_days = now_ms() + 48 * 3_600_000;
        assert_eq!(
            expire_files(&conn, now_ms()).unwrap(),
            0,
            "nothing is old yet"
        );
        assert_eq!(expire_files(&conn, two_days).unwrap(), 1);
        let left: Vec<_> = list_files(&conn, None)
            .unwrap()
            .into_iter()
            .map(|f| f.name)
            .collect();
        assert_eq!(left.len(), 2);
        assert!(left.contains(&"keep.txt".to_string()) && left.contains(&"work.txt".to_string()));
    }

    #[test]
    fn rules_route_files_by_extension_and_source() {
        let conn = db();
        let shelves = list_shelves(&conn).unwrap();
        add_rule(&conn, &shelves[1].id, ".PDF, docx", "downloads").unwrap();
        add_rule(&conn, &shelves[2].id, "", "screenshots").unwrap();
        assert_eq!(list_rules(&conn).unwrap()[0].extensions, "pdf,docx");

        assert_eq!(
            shelf_for(&conn, "pdf", "downloads").unwrap(),
            Some(shelves[1].id.clone())
        );
        assert_eq!(
            shelf_for(&conn, "PDF", "downloads").unwrap(),
            Some(shelves[1].id.clone())
        );
        assert_eq!(shelf_for(&conn, "pdf", "manual").unwrap(), None);
        assert_eq!(
            shelf_for(&conn, "png", "screenshots").unwrap(),
            Some(shelves[2].id.clone())
        );

        // Deleting a shelf removes its rules.
        delete_shelf(&conn, &shelves[1].id).unwrap();
        assert_eq!(list_rules(&conn).unwrap().len(), 1);
    }

    #[test]
    fn full_text_search_over_contents() {
        let conn = db();
        let work = list_shelves(&conn).unwrap()[0].id.clone();
        add_files(&conn, &[file("C:\\inv.pdf"), file("C:\\notes.txt")], &work).unwrap();
        let files = list_files(&conn, None).unwrap();
        let inv = files
            .iter()
            .find(|f| f.name == "inv.pdf")
            .unwrap()
            .id
            .clone();
        index_text(
            &conn,
            &inv,
            "Fatura No 2026-114 Toplam tutar: 4.250 TL Ödeme",
        )
        .unwrap();
        assert_eq!(files_without_text(&conn, 10).unwrap().len(), 1);

        assert_eq!(
            search_content(&conn, "fatura").unwrap(),
            std::slice::from_ref(&inv)
        );
        assert_eq!(
            search_content(&conn, "odeme tut").unwrap(),
            std::slice::from_ref(&inv),
            "diacritics + prefixes"
        );
        assert!(
            search_content(&conn, "fatura kira").unwrap().is_empty(),
            "all words must match"
        );
        assert!(search_content(&conn, "\"").unwrap().is_empty());

        remove_files(&conn, &[inv]).unwrap();
        assert!(
            search_content(&conn, "fatura").unwrap().is_empty(),
            "index follows deletes"
        );
    }

    #[test]
    fn leaves_a_newer_schema_alone() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("stash.db");
        {
            let future = Connection::open(&path).unwrap();
            future.execute_batch(MIGRATIONS[0]).unwrap();
            future
                .pragma_update(None, "user_version", SCHEMA_VERSION + 5)
                .unwrap();
        }
        let conn = open(&path, Language::En).unwrap();
        let version: i64 = conn
            .pragma_query_value(None, "user_version", |r| r.get(0))
            .unwrap();
        assert_eq!(version, SCHEMA_VERSION + 5);
    }
}
