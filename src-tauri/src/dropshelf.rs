//! The floating drop shelf: a small window that appears at the cursor when
//! the user shakes the mouse while dragging. Files dropped on it collect on
//! the "Drop shelf" (kept 24 hours) until they are dragged out together.

use tauri::{
    AppHandle, Manager, PhysicalPosition, WebviewUrl, WebviewWindow, WebviewWindowBuilder,
};

use crate::db;
use crate::i18n;
use crate::models::Shelf;
use crate::state::AppState;

pub const LABEL: &str = "dropshelf";
const WIDTH: f64 = 260.0;
const HEIGHT: f64 = 320.0;
const EXPIRE_HOURS: i64 = 24;

fn window(app: &AppHandle) -> Option<WebviewWindow> {
    if let Some(w) = app.get_webview_window(LABEL) {
        return Some(w);
    }
    WebviewWindowBuilder::new(app, LABEL, WebviewUrl::App("index.html?view=drop".into()))
        .title("Stash")
        .inner_size(WIDTH, HEIGHT)
        .decorations(false)
        .transparent(true)
        .shadow(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .resizable(false)
        .focused(false)
        .visible(false)
        .build()
        .map_err(|e| log::error!("drop shelf window: {e}"))
        .ok()
}

/// The shelf the drop window fills, created (as a 24-hour shelf) on first use.
pub fn shelf(app: &AppHandle) -> rusqlite::Result<Shelf> {
    let state = app.state::<AppState>();
    let conn = state.db();
    if let Some(s) = db::shelf_of_kind(&conn, "drop")? {
        return Ok(s);
    }
    let (name, icon, color) = i18n::kind_shelf(state.language, "drop");
    let mut s = db::ensure_kind_shelf(&conn, "drop", name, icon, color)?;
    db::set_shelf_expiry(&conn, &s.id, Some(EXPIRE_HOURS))?;
    s.expire_hours = Some(EXPIRE_HOURS);
    Ok(s)
}

/// Show the drop window next to the cursor without taking focus (the drag
/// that triggered it is still in progress).
pub fn show_at(app: &AppHandle, x: i32, y: i32) {
    let Some(win) = window(app) else { return };
    let scale = win.scale_factor().unwrap_or(1.0);
    let (w, h) = ((WIDTH * scale) as i32, (HEIGHT * scale) as i32);
    let (mut px, mut py) = (x + (24.0 * scale) as i32, y - h / 2);
    if let Ok(Some(m)) = app.monitor_from_point(x as f64, y as f64) {
        let work = m.work_area();
        let (wx, wy) = (work.position.x, work.position.y);
        let (ww, wh) = (work.size.width as i32, work.size.height as i32);
        if px + w > wx + ww {
            px = x - w - (24.0 * scale) as i32; // flip to the left of the cursor
        }
        px = px.clamp(wx, (wx + ww - w).max(wx));
        py = py.clamp(wy, (wy + wh - h).max(wy));
    }
    let _ = win.set_position(PhysicalPosition::new(px, py));
    let _ = win.set_always_on_top(true);
    let _ = win.show();
    let _ = tauri::Emitter::emit_to(&win, LABEL, "drop-shelf-shown", ());
}

pub fn hide(app: &AppHandle) {
    if let Some(w) = app.get_webview_window(LABEL) {
        let _ = w.hide();
    }
}

#[tauri::command]
pub fn drop_shelf(app: AppHandle) -> Result<Shelf, String> {
    shelf(&app).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn hide_drop_shelf(app: AppHandle) {
    hide(&app);
}
