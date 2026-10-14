//! Data types shared with the React panel (serialized as camelCase JSON,
//! matching `src/shared/types.ts`).

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Shelf {
    pub id: String,
    pub name: String,
    pub icon: String,
    pub color: String,
    pub created_at: i64,
    pub sort_order: i64,
    /// "normal", or an automatic shelf: "downloads", "screenshots", "phone", "clipboard".
    pub kind: String,
    /// Files older than this many hours are removed automatically (temporary shelf).
    pub expire_hours: Option<i64>,
    /// Shared shelf: the folder it mirrors. Adding a file copies it there and
    /// the folder's contents (from anyone sharing it) show up on the shelf.
    pub folder: Option<String>,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct StashFile {
    pub id: String,
    pub shelf_id: String,
    pub absolute_path: String,
    pub name: String,
    pub extension: String,
    pub size: i64,
    pub is_directory: bool,
    pub created_at: i64,
    pub added_at: i64,
    pub last_accessed: Option<i64>,
    pub is_pinned: bool,
    pub note: String,
    /// Comma-separated tags.
    pub tags: String,
    /// When to show a reminder notification (ms since epoch).
    pub remind_at: Option<i64>,
    /// How it got here: "manual", "downloads", "screenshots", "phone", "clipboard", "shared".
    pub source: String,
    /// Filled in by the command layer after an (async) existence check.
    pub exists: bool,
}

/// A file about to be stored on a shelf.
#[derive(Debug, Clone, PartialEq)]
pub struct FileInput {
    pub absolute_path: String,
    pub name: String,
    pub extension: String,
    pub size: i64,
    pub is_directory: bool,
    pub created_at: i64,
    /// Used when restoring an export; new drops are never pinned.
    pub is_pinned: bool,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ShelfStats {
    pub shelf_count: i64,
    pub file_count: i64,
    pub total_size: i64,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AddFilesResult {
    pub added: usize,
    pub skipped: usize,
    pub shelf_id: String,
    pub shelf_name: String,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Theme {
    System,
    Light,
    Dark,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Language {
    Tr,
    En,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum FileSort {
    Added,
    Name,
    Recent,
    Size,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum EdgeHandle {
    Off,
    Left,
    Right,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum UpdateChannel {
    Stable,
    Beta,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AppSettings {
    pub theme: Theme,
    pub accent_color: String,
    pub start_with_windows: bool,
    pub language: Language,
    pub open_hotkey: String,
    pub default_shelf_id: String,
    /// Last shelf the user viewed — restored when the panel opens.
    pub last_shelf_id: String,
    pub notifications: bool,
    pub file_sort: FileSort,
    /// Panel opacity after the idle timeout (0.10–0.70).
    pub idle_opacity: f64,
    /// Seconds without mouse activity before fading (5–60).
    pub idle_timeout_sec: i64,
    pub update_channel: UpdateChannel,
    /// First-run welcome has been dismissed.
    pub onboarding_done: bool,
    /// New files in Downloads land on the Downloads shelf.
    pub watch_downloads: bool,
    /// New screenshots land on the Screenshots shelf.
    pub watch_screenshots: bool,
    /// A small handle on this screen edge: drop files on it, click to open the panel.
    pub edge_handle: EdgeHandle,
    /// "Add to Stash" in Explorer's right-click menu.
    pub context_menu: bool,
}

/// A partial settings update from the panel. Unknown keys are rejected.
#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SettingsPatch {
    pub theme: Option<Theme>,
    pub accent_color: Option<String>,
    pub start_with_windows: Option<bool>,
    /// Accepted for compatibility but ignored: the language follows Windows.
    pub language: Option<Language>,
    pub open_hotkey: Option<String>,
    pub default_shelf_id: Option<String>,
    pub last_shelf_id: Option<String>,
    pub notifications: Option<bool>,
    pub file_sort: Option<FileSort>,
    pub idle_opacity: Option<f64>,
    pub idle_timeout_sec: Option<f64>,
    pub update_channel: Option<UpdateChannel>,
    pub onboarding_done: Option<bool>,
    pub watch_downloads: Option<bool>,
    pub watch_screenshots: Option<bool>,
    pub edge_handle: Option<EdgeHandle>,
    pub context_menu: Option<bool>,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(tag = "state", rename_all = "kebab-case")]
pub enum UpdateStatus {
    Idle,
    Checking,
    Available { version: String },
    NotAvailable { version: String },
    Downloading { percent: u32 },
    Downloaded { version: String },
    Error { message: String },
    Dev,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OpResult {
    pub ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

impl OpResult {
    pub fn ok() -> Self {
        Self {
            ok: true,
            error: None,
        }
    }
    pub fn err(error: impl Into<String>) -> Self {
        Self {
            ok: false,
            error: Some(error.into()),
        }
    }
}
