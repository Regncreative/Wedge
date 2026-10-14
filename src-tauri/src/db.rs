//! SQLite storage. The schema and file location are the same as in Stash 1.x
//! (%APPDATA%\Stash\stash.db), so upgrading keeps every shelf and setting.

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
            ("İş", "briefcase", "#2563EB"),
            ("Kişisel", "heart", "#E74856"),
            ("Geçici", "clock", "#64748B"),
        ],
        Language::En => [
            ("Work", "briefcase", "#2563EB"),
            ("Personal", "heart", "#E74856"),
            ("Temporary", "clock", "#64748B"),
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
    })
}

pub fn list_shelves(conn: &Connection) -> Result<Vec<Shelf>> {
    let mut stmt = conn.prepare("SELECT * FROM shelves ORDER BY sort_order ASC, created_at ASC")?;
    let rows = stmt.query_map([], map_shelf)?;
    rows.collect()
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
    };
    conn.execute(
        "INSERT INTO shelves (id, name, icon, color, created_at, sort_order) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![shelf.id, shelf.name, shelf.icon, shelf.color, shelf.created_at, shelf.sort_order],
    )?;
    Ok(shelf)
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
    in_tx(conn, |tx| {
        let now = now_ms();
        let (mut added, mut skipped) = (0, 0);
        let mut insert = tx.prepare(
            "INSERT OR IGNORE INTO files
               (id, shelf_id, absolute_path, name, extension, size, is_directory,
                created_at, added_at, last_accessed, is_pinned)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, NULL, ?10)",
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
        "accentColor": "#2563EB",
        "startWithWindows": true,
        "openHotkey": DEFAULT_HOTKEY,
        "defaultShelfId": "",
        "lastShelfId": "",
        "notifications": true,
        "fileSort": "added",
        "idleOpacity": 0.4,
        "idleTimeoutSec": 10,
        "updateChannel": "stable",
        "onboardingDone": false
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
            "#2563EB".into()
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
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

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
        assert_eq!(s.accent_color, "#2563EB");
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
