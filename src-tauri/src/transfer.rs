//! Portable JSON backup of shelves, file references and look-and-feel
//! settings. Same format as Stash 1.x exports (Wedge was called Stash).

use std::collections::HashMap;

use rusqlite::Connection;
use serde::{Deserialize, Serialize};

use crate::db;
use crate::models::*;

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StashExport {
    pub format: String,
    pub version: u32,
    pub exported_at: String,
    pub shelves: Vec<ExportShelf>,
    pub files: Vec<ExportFile>,
    pub settings: ExportSettings,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportShelf {
    pub id: String,
    pub name: String,
    pub icon: String,
    pub color: String,
    pub sort_order: i64,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportFile {
    pub shelf_id: String,
    pub absolute_path: String,
    pub name: String,
    pub extension: String,
    pub size: i64,
    pub is_directory: bool,
    pub created_at: i64,
    pub is_pinned: bool,
}

/// Machine-specific settings (hotkey, autostart, default shelf) stay local.
#[derive(Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportSettings {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub theme: Option<Theme>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub accent_color: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub file_sort: Option<FileSort>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub idle_opacity: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub idle_timeout_sec: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub notifications: Option<bool>,
}

pub fn build_export(conn: &Connection, lang: Language) -> db::Result<StashExport> {
    let s = db::get_settings(conn, lang)?;
    Ok(StashExport {
        format: "stash-export".into(),
        version: 1,
        exported_at: iso_now(),
        shelves: db::list_shelves(conn)?
            .into_iter()
            .map(|sh| ExportShelf {
                id: sh.id,
                name: sh.name,
                icon: sh.icon,
                color: sh.color,
                sort_order: sh.sort_order,
            })
            .collect(),
        files: db::list_files(conn, None)?
            .into_iter()
            .map(|f| ExportFile {
                shelf_id: f.shelf_id,
                absolute_path: f.absolute_path,
                name: f.name,
                extension: f.extension,
                size: f.size,
                is_directory: f.is_directory,
                created_at: f.created_at,
                is_pinned: f.is_pinned,
            })
            .collect(),
        settings: ExportSettings {
            theme: Some(s.theme),
            accent_color: Some(s.accent_color),
            file_sort: Some(s.file_sort),
            idle_opacity: Some(s.idle_opacity),
            idle_timeout_sec: Some(s.idle_timeout_sec as f64),
            notifications: Some(s.notifications),
        },
    })
}

fn iso_now() -> String {
    // Days-from-civil (Howard Hinnant) to avoid a date crate for one timestamp.
    let secs = db::now_ms() / 1000;
    let (days, rem) = (secs.div_euclid(86_400), secs.rem_euclid(86_400));
    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = yoe + era * 400 + i64::from(m <= 2);
    format!(
        "{y:04}-{m:02}-{d:02}T{:02}:{:02}:{:02}Z",
        rem / 3600,
        rem % 3600 / 60,
        rem % 60
    )
}

#[derive(Debug, PartialEq)]
pub enum ImportError {
    Invalid(String),
    Db(String),
}

impl From<rusqlite::Error> for ImportError {
    fn from(e: rusqlite::Error) -> Self {
        ImportError::Db(e.to_string())
    }
}

fn validate(data: &StashExport) -> Result<(), ImportError> {
    let bad = |m: &str| Err(ImportError::Invalid(m.into()));
    if data.format != "stash-export" || data.version != 1 {
        return bad("not a Wedge (or Stash) export");
    }
    if data.shelves.len() > 1_000 || data.files.len() > 100_000 {
        return bad("too many items");
    }
    for s in &data.shelves {
        let name = s.name.trim();
        if name.is_empty() || name.chars().count() > 100 || s.id.is_empty() || s.id.len() > 100 {
            return bad("invalid shelf");
        }
        if !db::is_hex_color(&s.color) || s.icon.is_empty() || s.icon.len() > 50 {
            return bad("invalid shelf style");
        }
    }
    for f in &data.files {
        if f.absolute_path.is_empty() || f.absolute_path.chars().count() > 32_767 {
            return bad("invalid path");
        }
        if f.name.is_empty() || f.name.len() > 1_000 || f.extension.len() > 100 || f.size < 0 {
            return bad("invalid file");
        }
    }
    if let Some(c) = &data.settings.accent_color {
        if !db::is_hex_color(c) {
            return bad("invalid accent color");
        }
    }
    Ok(())
}

/// Merge an export into the current data in one transaction. Shelves are
/// matched by name (case-insensitive) or created; existing files are skipped.
pub fn apply_import(
    conn: &Connection,
    raw: &str,
    lang: Language,
) -> Result<(usize, usize), ImportError> {
    let data: StashExport =
        serde_json::from_str(raw).map_err(|e| ImportError::Invalid(e.to_string()))?;
    validate(&data)?;

    let tx = conn.unchecked_transaction()?;
    let mut by_name: HashMap<String, String> = db::list_shelves(&tx)?
        .into_iter()
        .map(|s| (s.name.to_lowercase(), s.id))
        .collect();

    let mut shelves: Vec<&ExportShelf> = data.shelves.iter().collect();
    shelves.sort_by_key(|s| s.sort_order);
    let mut id_map = HashMap::new();
    for s in shelves {
        let name = s.name.trim();
        let key = name.to_lowercase();
        let target = match by_name.get(&key) {
            Some(id) => id.clone(),
            None => {
                let id = db::create_shelf(&tx, name, Some(&s.icon), Some(&s.color))?.id;
                by_name.insert(key, id.clone());
                id
            }
        };
        id_map.insert(s.id.clone(), target);
    }

    let mut by_target: HashMap<&str, Vec<FileInput>> = HashMap::new();
    for f in &data.files {
        if let Some(target) = id_map.get(&f.shelf_id) {
            by_target
                .entry(target.as_str())
                .or_default()
                .push(FileInput {
                    absolute_path: f.absolute_path.clone(),
                    name: f.name.clone(),
                    extension: f.extension.clone(),
                    size: f.size,
                    is_directory: f.is_directory,
                    created_at: f.created_at,
                    is_pinned: f.is_pinned,
                });
        }
    }
    let mut added = 0;
    for (target, files) in &by_target {
        added += db::add_files(&tx, files, target)?.0;
    }

    let st = &data.settings;
    let patch = SettingsPatch {
        theme: st.theme,
        accent_color: st.accent_color.clone(),
        file_sort: st.file_sort,
        idle_opacity: st.idle_opacity,
        idle_timeout_sec: st.idle_timeout_sec,
        notifications: st.notifications,
        ..Default::default()
    };
    db::set_settings(&tx, &patch, lang)?;
    tx.commit()?;
    Ok((by_target.len(), added))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn file(path: &str) -> FileInput {
        FileInput {
            absolute_path: path.into(),
            name: path.rsplit('\\').next().unwrap().into(),
            extension: "txt".into(),
            size: 10,
            is_directory: false,
            created_at: 1,
            is_pinned: false,
        }
    }

    fn seeded() -> Connection {
        let conn = db::open_in_memory(Language::En).unwrap();
        let work = db::list_shelves(&conn).unwrap()[0].id.clone();
        let invoices = db::create_shelf(&conn, "Invoices", None, Some("#00B294")).unwrap();
        db::add_files(&conn, &[file("C:\\a.txt"), file("C:\\b.txt")], &work).unwrap();
        let a = db::list_files(&conn, None)
            .unwrap()
            .into_iter()
            .find(|f| f.name == "a.txt")
            .unwrap();
        db::set_files_pinned(&conn, &[a.id], true).unwrap();
        db::add_files(&conn, &[file("C:\\inv.txt")], &invoices.id).unwrap();
        let patch = SettingsPatch {
            theme: Some(Theme::Light),
            file_sort: Some(FileSort::Name),
            open_hotkey: Some("Alt+Q".into()),
            ..Default::default()
        };
        db::set_settings(&conn, &patch, Language::En).unwrap();
        conn
    }

    fn export_json(conn: &Connection) -> String {
        serde_json::to_string(&build_export(conn, Language::En).unwrap()).unwrap()
    }

    #[test]
    fn round_trips_shelves_files_pins_and_settings() {
        let json = export_json(&seeded());
        let fresh = db::open_in_memory(Language::En).unwrap();
        assert_eq!(apply_import(&fresh, &json, Language::En).unwrap(), (2, 3));

        let shelves = db::list_shelves(&fresh).unwrap();
        let names: Vec<_> = shelves.iter().map(|s| s.name.as_str()).collect();
        assert_eq!(names, ["Work", "Personal", "Temporary", "Invoices"]);
        let work: Vec<_> = db::list_files(&fresh, Some(&shelves[0].id))
            .unwrap()
            .into_iter()
            .map(|f| (f.name, f.is_pinned))
            .collect();
        assert_eq!(
            work,
            [("a.txt".to_string(), true), ("b.txt".to_string(), false)]
        );
        let s = db::get_settings(&fresh, Language::En).unwrap();
        assert_eq!(s.theme, Theme::Light);
        assert_eq!(s.file_sort, FileSort::Name);
        assert_eq!(
            s.open_hotkey,
            db::DEFAULT_HOTKEY,
            "hotkey is machine-specific"
        );
    }

    #[test]
    fn merges_by_shelf_name_and_skips_duplicates() {
        let conn = seeded();
        let json = export_json(&conn);
        assert_eq!(apply_import(&conn, &json, Language::En).unwrap().1, 0);
        let invoices = db::list_shelves(&conn)
            .unwrap()
            .into_iter()
            .filter(|s| s.name == "Invoices")
            .count();
        assert_eq!(invoices, 1);
    }

    #[test]
    fn reads_a_1_x_export() {
        // Shape written by Stash 1.x (TypeScript); extra fields are ignored.
        let json = r##"{"format":"stash-export","version":1,"exportedAt":"2026-10-14T10:00:00.000Z",
          "shelves":[{"id":"x","name":"Old","icon":"folder","color":"#123456","sortOrder":0}],
          "files":[{"shelfId":"x","absolutePath":"D:\\f.pdf","name":"f.pdf","extension":"pdf","size":5,
                    "isDirectory":false,"createdAt":1,"isPinned":false}],
          "settings":{"theme":"dark","idleTimeoutSec":20}}"##;
        let conn = db::open_in_memory(Language::En).unwrap();
        assert_eq!(apply_import(&conn, json, Language::En).unwrap(), (1, 1));
        assert_eq!(
            db::get_settings(&conn, Language::En)
                .unwrap()
                .idle_timeout_sec,
            20
        );
    }

    #[test]
    fn rejects_bad_files_and_changes_nothing() {
        let conn = seeded();
        let before = db::list_files(&conn, None).unwrap().len();
        assert!(matches!(
            apply_import(&conn, r#"{"hello":"world"}"#, Language::En),
            Err(ImportError::Invalid(_))
        ));
        let wrong_version = export_json(&conn).replace("\"version\":1", "\"version\":99");
        assert!(matches!(
            apply_import(&conn, &wrong_version, Language::En),
            Err(ImportError::Invalid(_))
        ));
        let bad_color = export_json(&conn).replace("#00B294", "red");
        assert!(matches!(
            apply_import(&conn, &bad_color, Language::En),
            Err(ImportError::Invalid(_))
        ));
        assert_eq!(db::list_files(&conn, None).unwrap().len(), before);
    }

    #[test]
    fn iso_timestamp_shape() {
        let t = iso_now();
        assert_eq!(t.len(), 20);
        assert!(t.starts_with("20") && t.ends_with('Z'));
    }
}
