//! The edge handle: a slim tab on the side of the screen. Dragging files onto
//! it opens it into a list of shelves to drop on; clicking it opens the
//! panel; dragging it up or down moves it. It steps aside while the panel is
//! open and while a full-screen app (game, video, presentation) is running.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::time::Duration;

use serde_json::Value;
use tauri::{AppHandle, Manager, WebviewWindow, WebviewWindowBuilder};

use crate::db;
use crate::models::EdgeHandle;
use crate::panel;
use crate::state::AppState;

pub const LABEL: &str = "edge";
/// Collapsed: a narrow strip (logical px); the visible tab is drawn inside it.
const COLLAPSED_W: f64 = 18.0;
const COLLAPSED_H: f64 = 112.0;
const EXPANDED_W: f64 = 264.0;
/// Where the handle sits, as a fraction of the work area's height.
const POSITION_KEY: &str = "edgeHandleY";
const DEFAULT_POSITION: f64 = 0.42;

static SIDE: Mutex<Option<EdgeHandle>> = Mutex::new(None);
static EXPANDED: Mutex<Option<f64>> = Mutex::new(None);
/// Cached position (see [`POSITION_KEY`]); updated live while dragging.
static POSITION: Mutex<Option<f64>> = Mutex::new(None);
static PANEL_OPEN: AtomicBool = AtomicBool::new(false);
static FULLSCREEN: AtomicBool = AtomicBool::new(false);

fn side() -> Option<EdgeHandle> {
    *SIDE.lock().unwrap_or_else(|e| e.into_inner())
}

fn position(app: &AppHandle) -> f64 {
    let mut cached = POSITION.lock().unwrap_or_else(|e| e.into_inner());
    if let Some(p) = *cached {
        return p;
    }
    let state = app.state::<AppState>();
    let p = match db::get_raw(&state.db(), POSITION_KEY) {
        Ok(Some(Value::Number(n))) => n.as_f64().unwrap_or(DEFAULT_POSITION).clamp(0.0, 1.0),
        _ => DEFAULT_POSITION,
    };
    *cached = Some(p);
    p
}

/// Where the window goes: (x, y, width, height) in physical pixels.
fn geometry(
    app: &AppHandle,
    side: EdgeHandle,
    expanded: Option<f64>,
) -> Option<(i32, i32, i32, i32)> {
    let monitor = app.primary_monitor().ok().flatten()?;
    let scale = monitor.scale_factor();
    let work = monitor.work_area();
    let (wx, wy) = (work.position.x, work.position.y);
    let (ww, wh) = (work.size.width as i32, work.size.height as i32);
    let (w, h) = match expanded {
        Some(h) => (EXPANDED_W, h.clamp(COLLAPSED_H, wh as f64 / scale * 0.85)),
        None => (COLLAPSED_W, COLLAPSED_H),
    };
    let (w, h) = ((w * scale).round() as i32, (h * scale).round() as i32);
    let center = wy + (position(app) * wh as f64) as i32;
    let y = (center - h / 2).clamp(wy, (wy + wh - h).max(wy));
    let x = match side {
        EdgeHandle::Left => wx,
        _ => wx + ww - w,
    };
    Some((x, y, w, h))
}

/// Move and resize in one step (no flicker of a half-resized window).
fn place(app: &AppHandle, win: &WebviewWindow) {
    let Some(side) = side() else { return };
    let expanded = *EXPANDED.lock().unwrap_or_else(|e| e.into_inner());
    let Some((x, y, w, h)) = geometry(app, side, expanded) else {
        return;
    };
    #[cfg(windows)]
    if let Ok(hwnd) = win.hwnd() {
        use windows::Win32::UI::WindowsAndMessaging::{SetWindowPos, HWND_TOPMOST, SWP_NOACTIVATE};
        unsafe {
            let _ = SetWindowPos(hwnd, Some(HWND_TOPMOST), x, y, w, h, SWP_NOACTIVATE);
        }
        return;
    }
    let _ = win.set_size(tauri::PhysicalSize::new(w as u32, h as u32));
    let _ = win.set_position(tauri::PhysicalPosition::new(x, y));
}

fn update_visibility(app: &AppHandle) {
    let Some(win) = app.get_webview_window(LABEL) else {
        return;
    };
    let hidden = side().is_none_or(|s| s == EdgeHandle::Off)
        || PANEL_OPEN.load(Ordering::SeqCst)
        || FULLSCREEN.load(Ordering::SeqCst);
    // Placed even while hidden: Windows creates it wider than asked.
    place(app, &win);
    if hidden {
        let _ = win.hide();
    } else {
        let _ = win.show();
    }
}

fn create(app: &AppHandle, side: EdgeHandle) -> Option<WebviewWindow> {
    let win = WebviewWindowBuilder::new(app, LABEL, page(app, side))
        .title("Stash")
        .inner_size(COLLAPSED_W, COLLAPSED_H)
        .decorations(false)
        .transparent(true)
        .shadow(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .resizable(false)
        .focused(false)
        .focusable(false)
        .visible(false)
        .disable_drag_drop_handler()
        .build()
        .map_err(|e| log::error!("edge handle window: {e}"))
        .ok()?;
    crate::dragdrop::attach(&win);
    Some(win)
}

fn page(app: &AppHandle, side: EdgeHandle) -> tauri::WebviewUrl {
    let query = match side {
        EdgeHandle::Left => "view=edge&side=left",
        _ => "view=edge&side=right",
    };
    panel::page_url(app, query)
}

/// Show, move or hide the handle to match the setting. Main thread only
/// (it may create the window). The window is created once and kept: a
/// label can't be reused until a destroyed window is gone.
pub fn apply(app: &AppHandle, setting: EdgeHandle) {
    let previous = SIDE
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .replace(setting);
    *EXPANDED.lock().unwrap_or_else(|e| e.into_inner()) = None;
    if setting == EdgeHandle::Off {
        if let Some(w) = app.get_webview_window(LABEL) {
            let _ = w.hide();
        }
        return;
    }
    match app.get_webview_window(LABEL) {
        None => {
            if create(app, setting).is_none() {
                return;
            }
        }
        Some(w) if previous.is_some_and(|p| p != setting && p != EdgeHandle::Off) => {
            // The page draws the tab on the matching side.
            if let tauri::WebviewUrl::External(url) = page(app, setting) {
                let _ = w.navigate(url);
            }
        }
        Some(_) => {}
    }
    update_visibility(app);
}

/// Run `f` on the main thread on a later turn of the event loop.
/// `AppHandle::run_on_main_thread` runs `f` right away when called on the
/// main thread (setup, synchronous commands); creating a window there either
/// deadlocks or leaves its webview unloaded, so post it from another thread.
pub fn on_main_thread(app: &AppHandle, f: impl FnOnce() + Send + 'static) {
    let app = app.clone();
    std::thread::spawn(move || {
        if let Err(e) = app.run_on_main_thread(f) {
            log::error!("main thread task: {e}");
        }
    });
}

/// The panel opened or closed: the handle steps aside meanwhile.
pub fn panel_visible(app: &AppHandle, open: bool) {
    PANEL_OPEN.store(open, Ordering::SeqCst);
    update_visibility(app);
}

#[cfg(windows)]
fn fullscreen_app_running() -> bool {
    use windows::Win32::UI::Shell::{
        SHQueryUserNotificationState, QUNS_BUSY, QUNS_PRESENTATION_MODE,
        QUNS_RUNNING_D3D_FULL_SCREEN,
    };
    match unsafe { SHQueryUserNotificationState() } {
        Ok(s) => s == QUNS_BUSY || s == QUNS_RUNNING_D3D_FULL_SCREEN || s == QUNS_PRESENTATION_MODE,
        Err(_) => false,
    }
}

#[cfg(not(windows))]
fn fullscreen_app_running() -> bool {
    false
}

/// Hide the handle while a full-screen app runs; also follows work-area
/// changes (taskbar moved, resolution changed).
pub fn start_monitor(app: &AppHandle) {
    let app = app.clone();
    std::thread::spawn(move || {
        let mut last_geometry = None;
        loop {
            std::thread::sleep(Duration::from_millis(1500));
            let Some(side) = side().filter(|s| *s != EdgeHandle::Off) else {
                continue;
            };
            let busy = fullscreen_app_running();
            let geometry = geometry(&app, side, None);
            if FULLSCREEN.swap(busy, Ordering::SeqCst) != busy || geometry != last_geometry {
                last_geometry = geometry;
                let handle = app.clone();
                on_main_thread(&app, move || update_visibility(&handle));
            }
        }
    });
}

/// The page opens into a shelf list while files are dragged over it
/// (`height` in CSS px) and closes again afterwards.
#[tauri::command]
pub fn edge_expand(app: AppHandle, expanded: bool, height: Option<f64>) -> Result<(), String> {
    let height = height.filter(|h| h.is_finite()).unwrap_or(COLLAPSED_H);
    *EXPANDED.lock().unwrap_or_else(|e| e.into_inner()) = expanded.then_some(height);
    if let Some(win) = app.get_webview_window(LABEL) {
        place(&app, &win);
    }
    Ok(())
}

/// Dragging the handle: `y` is the pointer's screen position in physical
/// pixels. `save` on release.
#[tauri::command]
pub fn edge_move(app: AppHandle, y: f64, save: bool) -> Result<(), String> {
    if !y.is_finite() {
        return Err("Invalid arguments: y".into());
    }
    let Some(monitor) = app.primary_monitor().ok().flatten() else {
        return Ok(());
    };
    let work = monitor.work_area();
    let fraction = ((y - work.position.y as f64) / work.size.height.max(1) as f64).clamp(0.0, 1.0);
    *POSITION.lock().unwrap_or_else(|e| e.into_inner()) = Some(fraction);
    if save {
        let state = app.state::<AppState>();
        db::set_raw(&state.db(), POSITION_KEY, &serde_json::json!(fraction))
            .map_err(|e| e.to_string())?;
    }
    if let Some(win) = app.get_webview_window(LABEL) {
        place(&app, &win);
    }
    Ok(())
}

/// Clicking the handle opens the panel beside it (or closes it).
#[tauri::command]
pub fn edge_click(app: AppHandle) {
    if panel::window(&app).is_some_and(|w| w.is_visible().unwrap_or(false)) {
        panel::hide(&app);
        return;
    }
    let left = side() == Some(EdgeHandle::Left);
    let y = app
        .get_webview_window(LABEL)
        .and_then(|w| {
            let pos = w.outer_position().ok()?;
            let size = w.outer_size().ok()?;
            Some(pos.y + size.height as i32 / 2)
        })
        .unwrap_or(400);
    panel::show_at_edge(&app, left, y);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn edge_setting_round_trips_as_lowercase() {
        assert_eq!(serde_json::to_value(EdgeHandle::Right).unwrap(), "right");
        let parsed: EdgeHandle = serde_json::from_value(serde_json::json!("off")).unwrap();
        assert_eq!(parsed, EdgeHandle::Off);
    }
}
