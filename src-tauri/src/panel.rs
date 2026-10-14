//! The panel window: showing it next to the tray, hiding, toggling.

use std::sync::atomic::Ordering;

use tauri::{AppHandle, Emitter, Manager, PhysicalPosition, Rect, WebviewWindow};

use crate::state::AppState;

pub const LABEL: &str = "panel";

pub fn window(app: &AppHandle) -> Option<WebviewWindow> {
    app.get_webview_window(LABEL)
}

/// Where the tray icon is, if Windows tells us.
fn tray_rect(app: &AppHandle) -> Option<Rect> {
    app.tray_by_id(crate::tray::ID)?.rect().ok().flatten()
}

/// Place the panel flush against the taskbar, horizontally centred on the
/// tray icon (or in the corner when the icon's position is unknown).
fn position(app: &AppHandle, win: &WebviewWindow, anchor: Option<Rect>) {
    let scale_hint = win.scale_factor().unwrap_or(1.0);
    let anchor_point = anchor.map(|r| {
        let p = r.position.to_physical::<f64>(scale_hint);
        let s = r.size.to_physical::<f64>(scale_hint);
        (p.x + s.width / 2.0, p.y)
    });
    let point = anchor_point.or_else(|| app.cursor_position().ok().map(|p| (p.x, p.y)));
    let monitor = point
        .and_then(|(x, y)| app.monitor_from_point(x, y).ok().flatten())
        .or_else(|| app.primary_monitor().ok().flatten());
    let (Some(monitor), Ok(size)) = (monitor, win.outer_size()) else {
        return;
    };

    let work = monitor.work_area();
    let (wx, wy) = (work.position.x, work.position.y);
    let (ww, wh) = (work.size.width as i32, work.size.height as i32);
    let (pw, ph) = (size.width as i32, size.height as i32);
    let taskbar_top = wy > monitor.position().y;

    let x = match anchor_point {
        Some((cx, _)) => cx.round() as i32 - pw / 2,
        None => wx + ww - pw,
    };
    let y = if taskbar_top { wy } else { wy + wh - ph };

    let x = x.clamp(wx, (wx + ww - pw).max(wx));
    let y = y.clamp(wy, (wy + wh - ph).max(wy));
    let _ = win.set_position(PhysicalPosition::new(x, y));
}

pub fn show(app: &AppHandle) {
    let Some(win) = window(app) else { return };
    position(app, &win, tray_rect(app));
    let _ = win.set_always_on_top(true);
    let _ = win.show();
    let _ = win.unminimize();
    let _ = win.set_focus();
    let _ = app.emit("panel-shown", ());
}

/// Slide the panel in at the left or right edge of the screen the cursor is
/// on, vertically centred on the cursor (edge reveal).
pub fn show_at_edge(app: &AppHandle, left: bool, y: i32) {
    let Some(win) = window(app) else { return };
    let cursor_x = app.cursor_position().map(|p| p.x).unwrap_or(0.0);
    let monitor = app
        .monitor_from_point(cursor_x, y as f64)
        .ok()
        .flatten()
        .or_else(|| app.primary_monitor().ok().flatten());
    if let (Some(m), Ok(size)) = (monitor, win.outer_size()) {
        let work = m.work_area();
        let (wx, wy) = (work.position.x, work.position.y);
        let (ww, wh) = (work.size.width as i32, work.size.height as i32);
        let (pw, ph) = (size.width as i32, size.height as i32);
        let x = if left { wx } else { wx + ww - pw };
        let y = (y - ph / 2).clamp(wy, (wy + wh - ph).max(wy));
        let _ = win.set_position(PhysicalPosition::new(x, y));
    }
    let _ = win.set_always_on_top(true);
    let _ = win.show();
    let _ = win.set_focus();
    let _ = app.emit("panel-shown", ());
}

pub fn hide(app: &AppHandle) {
    let Some(win) = window(app) else { return };
    let _ = app.emit("panel-hidden", ());
    let _ = win.hide();
}

pub fn toggle(app: &AppHandle) {
    match window(app) {
        Some(win) if win.is_visible().unwrap_or(false) => hide(app),
        _ => show(app),
    }
}

/// Drop always-on-top so a native dialog (Properties) can sit above the
/// panel; it comes back the next time the panel gets focus.
pub fn yield_to_dialog(app: &AppHandle) {
    if let Some(win) = window(app) {
        let _ = win.set_always_on_top(false);
        app.state::<AppState>()
            .restore_on_top_on_focus
            .store(true, Ordering::SeqCst);
    }
}

pub fn on_focus(app: &AppHandle) {
    let state = app.state::<AppState>();
    if state.restore_on_top_on_focus.swap(false, Ordering::SeqCst) {
        if let Some(win) = window(app) {
            let _ = win.set_always_on_top(true);
        }
    }
}
