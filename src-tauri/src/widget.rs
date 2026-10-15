//! Desktop widgets: a shelf pinned to the desktop as a small window that
//! stays below other windows. Open widgets and their positions are restored
//! at startup.

use serde_json::{Map, Value};
use tauri::{AppHandle, Manager, PhysicalPosition, WebviewWindowBuilder};

use crate::db;
use crate::state::AppState;

const PREFIX: &str = "widget-";

pub fn label(shelf_id: &str) -> String {
    format!("{PREFIX}{shelf_id}")
}

pub fn shelf_of(label: &str) -> Option<&str> {
    label.strip_prefix(PREFIX)
}

fn stored(app: &AppHandle) -> Map<String, Value> {
    let state = app.state::<AppState>();
    let raw = db::get_raw(&state.db(), "widgets");
    match raw {
        Ok(Some(Value::Object(m))) => m,
        _ => Map::new(),
    }
}

fn store(app: &AppHandle, widgets: Map<String, Value>) {
    let state = app.state::<AppState>();
    let _ = db::set_raw(&state.db(), "widgets", &Value::Object(widgets));
}

fn open_window(app: &AppHandle, shelf_id: &str, pos: Option<(i32, i32)>) -> Result<(), String> {
    let label = label(shelf_id);
    if let Some(w) = app.get_webview_window(&label) {
        let _ = w.show();
        return Ok(());
    }
    let url = crate::panel::page_url(app, &format!("view=widget&shelf={shelf_id}"));
    let win = WebviewWindowBuilder::new(app, &label, url)
        .title("Wedge")
        .inner_size(280.0, 360.0)
        .min_inner_size(220.0, 200.0)
        .decorations(false)
        .transparent(true)
        .shadow(false)
        .always_on_bottom(true)
        .skip_taskbar(true)
        .resizable(true)
        .visible(false)
        .disable_drag_drop_handler()
        .build()
        .map_err(|e| e.to_string())?;
    crate::dragdrop::attach(&win);
    if let Some((x, y)) = pos {
        let _ = win.set_position(PhysicalPosition::new(x, y));
    }
    let _ = win.show();
    Ok(())
}

// Async: creating a window from a synchronous command deadlocks on Windows.
#[tauri::command]
pub async fn open_widget(app: AppHandle, shelf_id: String) -> Result<bool, String> {
    crate::commands::check_id(&shelf_id)?;
    open_window(&app, &shelf_id, None)?;
    let mut widgets = stored(&app);
    widgets.entry(shelf_id).or_insert(Value::Null);
    store(&app, widgets);
    Ok(true)
}

#[tauri::command]
pub async fn close_widget(app: AppHandle, shelf_id: String) -> Result<bool, String> {
    crate::commands::check_id(&shelf_id)?;
    if let Some(w) = app.get_webview_window(&label(&shelf_id)) {
        let _ = w.destroy();
    }
    let mut widgets = stored(&app);
    widgets.remove(&shelf_id);
    store(&app, widgets);
    Ok(true)
}

/// Remember where the user put a widget.
pub fn on_moved(app: &AppHandle, label: &str, x: i32, y: i32) {
    let Some(shelf_id) = shelf_of(label) else {
        return;
    };
    let mut widgets = stored(app);
    if widgets.contains_key(shelf_id) {
        widgets.insert(shelf_id.to_string(), serde_json::json!({ "x": x, "y": y }));
        store(app, widgets);
    }
}

/// Reopen the widgets that were open last time (skipping deleted shelves).
pub fn restore(app: &AppHandle) {
    let shelves: Vec<String> = {
        let state = app.state::<AppState>();
        let conn = state.db();
        db::list_shelves(&conn)
            .unwrap_or_default()
            .into_iter()
            .map(|s| s.id)
            .collect()
    };
    let mut widgets = stored(app);
    widgets.retain(|id, _| shelves.contains(id));
    for (id, pos) in &widgets {
        let pos = pos
            .get("x")
            .and_then(Value::as_i64)
            .zip(pos.get("y").and_then(Value::as_i64))
            .map(|(x, y)| (x as i32, y as i32));
        if let Err(e) = open_window(app, id, pos) {
            log::warn!("widget {id}: {e}");
        }
    }
    store(app, widgets);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn labels_round_trip() {
        let l = label("1b4e28ba-2fa1-11d2-883f-0016d3cca427");
        assert_eq!(shelf_of(&l), Some("1b4e28ba-2fa1-11d2-883f-0016d3cca427"));
        assert_eq!(shelf_of("panel"), None);
    }
}
