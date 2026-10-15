//! The Stash window lives on a screen edge: a column of shelf tabs that is
//! tucked in at rest (a few pixels show), peeks out under the cursor, comes
//! out while a file is being dragged anywhere (see dragwatch.rs), and opens
//! into a drawer. The page draws all of it. The window keeps one size (big
//! enough for the drawer) and this module sets, per mode, the part of it
//! that catches the cursor (a window region), so at rest nothing but the
//! visible slivers can catch a click. Changing the region is instant;
//! resizing the web view on every hover would stutter.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::time::Duration;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager, WebviewWindow};

use crate::db;
use crate::models::EdgeHandle;
use crate::state::AppState;

pub const LABEL: &str = "panel";

/// What the edge window shows.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Mode {
    /// Tucked in: only a sliver of each tab shows.
    Idle,
    /// The cursor is at the edge: the tabs come out.
    Peek,
    /// A file is being dragged: the tabs are out, ready for a drop.
    Drag,
    /// The drawer is open.
    Open,
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EdgeState {
    pub mode: Mode,
    pub side: EdgeHandle,
}

// Logical pixels; keep in step with the page (styles/globals.css, `--tab-*`,
// `--drawer-*`).
const TAB_STEP: f64 = 62.0;
const TABS_PAD: f64 = 22.0;
/// Tucked in: the slivers and a few pixels around them.
const IDLE_W: f64 = 14.0;
/// Tabs out, with room for one to reach 20px further and for shadows.
const OUT_W: f64 = 248.0;
const DRAWER_W: f64 = 440.0;
/// The drawer's height, when the screen has room for it.
const DRAWER_H: f64 = 620.0;
/// Room around the drawer for its shadow.
const DRAWER_PAD: f64 = 32.0;
/// Room beside the drawer for the tabs hanging off it.
const TAB_OUT: f64 = 72.0;
const MARGIN: f64 = 10.0;

static STATE: Mutex<EdgeState> = Mutex::new(EdgeState {
    mode: Mode::Idle,
    side: EdgeHandle::Right,
});
/// A full-screen app (game, video, presentation) is in front.
static FULLSCREEN: AtomicBool = AtomicBool::new(false);

pub fn window(app: &AppHandle) -> Option<WebviewWindow> {
    app.get_webview_window(LABEL)
}

pub fn state() -> EdgeState {
    *STATE.lock().unwrap_or_else(|e| e.into_inner())
}

/// The drawer is open (the panel is "shown").
pub fn is_open() -> bool {
    state().mode == Mode::Open
}

/// URL of the app's own page with a query (e.g. `view=widget`), for extra
/// windows. `WebviewUrl::App` can't carry a query string, so this reuses the
/// panel's origin (tauri.localhost in builds, the dev server in development).
pub fn page_url(app: &AppHandle, query: &str) -> tauri::WebviewUrl {
    match window(app).and_then(|w| w.url().ok()) {
        Some(mut url) => {
            url.set_path("/");
            url.set_query(Some(query));
            url.set_fragment(None);
            tauri::WebviewUrl::External(url)
        }
        None => tauri::WebviewUrl::App("index.html".into()),
    }
}

/// Height of the tab column: one tab per shelf (the pocket included).
fn tabs_height(app: &AppHandle) -> f64 {
    let state = app.state::<AppState>();
    let n = db::list_shelves(&state.db()).map(|s| s.len()).unwrap_or(4) as f64;
    n * TAB_STEP + TABS_PAD * 2.0
}

/// The window on screen, physical pixels.
#[derive(Debug, Clone, Copy, PartialEq)]
struct Frame {
    x: i32,
    y: i32,
    w: i32,
    h: i32,
    /// The tab column, from the window's top.
    column_top: i32,
    column_h: i32,
    scale: f64,
}

/// Where the window goes: on the edge of the primary monitor's work area,
/// centred, tall enough for the drawer and the tab column.
fn frame(app: &AppHandle, side: EdgeHandle) -> Option<Frame> {
    let monitor = app.primary_monitor().ok().flatten()?;
    let scale = monitor.scale_factor();
    let work = monitor.work_area();
    let (wx, wy) = (work.position.x, work.position.y);
    let (ww, wh) = (work.size.width as i32, work.size.height as i32);
    let max_h = wh as f64 / scale - 2.0 * MARGIN;
    let column = tabs_height(app).min(max_h);
    let h = (DRAWER_H + 2.0 * DRAWER_PAD).max(column).min(max_h);
    let px = |v: f64| (v * scale).round() as i32;
    let (w, h, column_h) = (px(DRAWER_W + TAB_OUT), px(h), px(column));
    let x = match side {
        EdgeHandle::Left => wx,
        _ => wx + ww - w,
    };
    Some(Frame {
        x,
        y: wy + (wh - h) / 2,
        w,
        h,
        column_top: (h - column_h) / 2,
        column_h,
        scale,
    })
}

/// The part of the window that catches the cursor in a mode: (left, top,
/// right, bottom) from the window's corner, physical pixels. The rest lets
/// clicks through to whatever is below.
fn area(f: &Frame, s: EdgeState) -> (i32, i32, i32, i32) {
    let width = match s.mode {
        Mode::Open => return (0, 0, f.w, f.h),
        Mode::Peek | Mode::Drag => OUT_W,
        Mode::Idle => IDLE_W,
    };
    let width = (width * f.scale).round() as i32;
    let (top, bottom) = (f.column_top, f.column_top + f.column_h);
    match s.side {
        EdgeHandle::Left => (0, top, width, bottom),
        _ => (f.w - width, top, f.w, bottom),
    }
}

fn hidden(s: EdgeState) -> bool {
    s.mode != Mode::Open && (s.side == EdgeHandle::Off || FULLSCREEN.load(Ordering::SeqCst))
}

/// Where a hidden window waits: off every screen.
const PARKED: i32 = -32000;

/// Keep Windows from painting a title bar onto the page. Undecorated windows
/// keep a caption style (tao sets it again on every style change), and a
/// window with a region (see `place`) gets that caption drawn by Windows
/// itself, over the page, each time it gains or loses focus.
#[cfg(windows)]
mod no_caption {
    use windows::Win32::Foundation::{HWND, LPARAM, LRESULT, WPARAM};
    use windows::Win32::UI::Shell::{DefSubclassProc, SetWindowSubclass};
    use windows::Win32::UI::WindowsAndMessaging::{
        GetWindowLongPtrW, SetWindowLongPtrW, SetWindowPos, GWL_STYLE, STYLESTRUCT,
        SWP_FRAMECHANGED, SWP_NOACTIVATE, SWP_NOMOVE, SWP_NOSIZE, SWP_NOZORDER, WM_NCACTIVATE,
        WM_NCPAINT, WM_STYLECHANGING, WS_CAPTION, WS_SYSMENU, WS_THICKFRAME,
    };

    const FRAME: u32 = WS_CAPTION.0 | WS_SYSMENU.0 | WS_THICKFRAME.0;

    unsafe extern "system" fn proc(
        hwnd: HWND,
        msg: u32,
        wparam: WPARAM,
        lparam: LPARAM,
        _id: usize,
        _data: usize,
    ) -> LRESULT {
        unsafe {
            match msg {
                // (De)activate as usual; -1 tells Windows not to repaint a caption.
                WM_NCACTIVATE => DefSubclassProc(hwnd, msg, wparam, LPARAM(-1)),
                // There is no frame to paint.
                WM_NCPAINT => LRESULT(0),
                WM_STYLECHANGING if wparam.0 as i32 == GWL_STYLE.0 => {
                    let change = &mut *(lparam.0 as *mut STYLESTRUCT);
                    change.styleNew &= !FRAME;
                    DefSubclassProc(hwnd, msg, wparam, lparam)
                }
                _ => DefSubclassProc(hwnd, msg, wparam, lparam),
            }
        }
    }

    /// On the thread that owns the window.
    pub fn install(hwnd: HWND) {
        unsafe {
            let _ = SetWindowSubclass(hwnd, Some(proc), 1, 0);
            let style = GetWindowLongPtrW(hwnd, GWL_STYLE);
            SetWindowLongPtrW(hwnd, GWL_STYLE, style & !(FRAME as isize));
            let _ = SetWindowPos(
                hwnd,
                None,
                0,
                0,
                0,
                0,
                SWP_FRAMECHANGED | SWP_NOMOVE | SWP_NOSIZE | SWP_NOZORDER | SWP_NOACTIVATE,
            );
        }
    }
}

/// Get the edge window ready (at startup, on the main thread).
pub fn prepare(app: &AppHandle) {
    #[cfg(windows)]
    if let Some(hwnd) = window(app).and_then(|w| w.hwnd().ok()) {
        no_caption::install(hwnd);
    }
}

/// Place the window and set the part that catches the cursor, without
/// taking focus. The window is created visible (off-screen, see
/// tauri.conf.json) and stays "visible" for good: hiding parks it
/// off-screen. Showing and hiding through the window API would activate it,
/// and tao re-hides a window it believes hidden whenever its style changes.
fn place(app: &AppHandle, s: EdgeState) {
    let Some(win) = window(app) else { return };
    let Some(f) = frame(app, s.side) else {
        return;
    };
    let (x, y) = if hidden(s) {
        (PARKED, PARKED)
    } else {
        (f.x, f.y)
    };
    #[cfg(windows)]
    if let Ok(hwnd) = win.hwnd() {
        use windows::Win32::Foundation::RECT;
        use windows::Win32::Graphics::Gdi::{CreateRectRgn, SetWindowRgn};
        use windows::Win32::UI::WindowsAndMessaging::{
            GetWindowRect, SetWindowPos, HWND_TOPMOST, SWP_NOACTIVATE, SWP_NOMOVE, SWP_NOSIZE,
        };
        let (l, t, r, b) = area(&f, s);
        unsafe {
            // Move only when needed: a resize, even to the same size, makes
            // the web view lay out again.
            let mut now = RECT::default();
            let _ = GetWindowRect(hwnd, &mut now);
            let same = (
                now.left,
                now.top,
                now.right - now.left,
                now.bottom - now.top,
            ) == (x, y, f.w, f.h);
            let flags = if same {
                SWP_NOACTIVATE | SWP_NOMOVE | SWP_NOSIZE
            } else {
                SWP_NOACTIVATE
            };
            let _ = SetWindowPos(hwnd, Some(HWND_TOPMOST), x, y, f.w, f.h, flags);
            // The window owns the region from here on.
            let _ = SetWindowRgn(hwnd, Some(CreateRectRgn(l, t, r, b)), true);
        }
        return;
    }
    let _ = win.set_size(tauri::PhysicalSize::new(f.w as u32, f.h as u32));
    let _ = win.set_position(tauri::PhysicalPosition::new(x, y));
}

/// Switch mode: place the window and tell the page. Leaving or entering the
/// drawer also sends `panel-hidden` / `panel-shown`.
pub fn set_mode(app: &AppHandle, mode: Mode) {
    let (before, now) = {
        let mut s = STATE.lock().unwrap_or_else(|e| e.into_inner());
        let before = *s;
        s.mode = mode;
        (before, *s)
    };
    place(app, now);
    let _ = app.emit_to(LABEL, "edge-mode", now);
    if before.mode != Mode::Open && mode == Mode::Open {
        let _ = app.emit("panel-shown", ());
    } else if before.mode == Mode::Open && mode != Mode::Open {
        let _ = app.emit("panel-hidden", ());
    }
}

/// Open the drawer and give it the keyboard (tray, hotkey, second launch).
pub fn show(app: &AppHandle) {
    set_mode(app, Mode::Open);
    if let Some(win) = window(app) {
        let _ = win.set_always_on_top(true);
        let _ = win.set_focus();
    }
}

pub fn hide(app: &AppHandle) {
    set_mode(app, Mode::Idle);
}

pub fn toggle(app: &AppHandle) {
    if is_open() {
        hide(app)
    } else {
        show(app)
    }
}

/// The side setting changed (or at startup).
pub fn apply_side(app: &AppHandle, side: EdgeHandle) {
    let mode = {
        let mut s = STATE.lock().unwrap_or_else(|e| e.into_inner());
        s.side = side;
        s.mode
    };
    set_mode(app, mode);
}

/// Shelves were added or removed: the tab column changed height.
pub fn relayout(app: &AppHandle) {
    place(app, state());
}

/// A file drag started or ended somewhere in Windows (dragwatch.rs).
pub fn on_drag(app: &AppHandle, active: bool) {
    let _ = app.emit_to(LABEL, "edge-drag", active);
    let s = state();
    if active {
        let can_pop = s.side != EdgeHandle::Off && !FULLSCREEN.load(Ordering::SeqCst);
        if can_pop && matches!(s.mode, Mode::Idle | Mode::Peek) {
            set_mode(app, Mode::Drag);
        }
        return;
    }
    // The page tucks the tabs in once it has handled a drop; this is only a
    // fallback in case it doesn't.
    let app = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_millis(2500));
        if state().mode == Mode::Drag && !crate::dragwatch::active() {
            let handle = app.clone();
            let _ = app.run_on_main_thread(move || set_mode(&handle, Mode::Idle));
        }
    });
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

/// Hide the tabs while a full-screen app runs, and follow work-area changes
/// (taskbar moved, resolution changed).
pub fn start_monitor(app: &AppHandle) {
    let app = app.clone();
    std::thread::spawn(move || {
        let mut last = None;
        loop {
            std::thread::sleep(Duration::from_millis(1500));
            let busy = fullscreen_app_running();
            let frame = frame(&app, state().side);
            if FULLSCREEN.swap(busy, Ordering::SeqCst) != busy || frame != last {
                last = frame;
                let handle = app.clone();
                let _ = app.run_on_main_thread(move || place(&handle, state()));
            }
        }
    });
}

/// Drop always-on-top so a native dialog (Properties) can sit above the
/// drawer; it comes back the next time the window gets focus.
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

#[tauri::command]
pub fn edge_state() -> EdgeState {
    state()
}

/// Where the window catches the cursor right now: [x, y, width, height] on
/// screen, physical pixels.
#[tauri::command]
pub fn edge_area(app: AppHandle) -> Option<[i32; 4]> {
    let s = state();
    let f = frame(&app, s.side)?;
    let (x, y) = if hidden(s) {
        (PARKED, PARKED)
    } else {
        (f.x, f.y)
    };
    let (l, t, r, b) = area(&f, s);
    Some([x + l, y + t, r - l, b - t])
}

/// The page asks for a mode (hover → peek, a drag over the sliver → drag,
/// a tab click → open, done → idle).
#[tauri::command]
pub fn edge_mode(app: AppHandle, mode: Mode) {
    set_mode(&app, mode);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn modes_and_sides_serialize_for_the_page() {
        let s = EdgeState {
            mode: Mode::Drag,
            side: EdgeHandle::Left,
        };
        assert_eq!(
            serde_json::to_value(s).unwrap(),
            serde_json::json!({ "mode": "drag", "side": "left" })
        );
        let m: Mode = serde_json::from_value(serde_json::json!("open")).unwrap();
        assert_eq!(m, Mode::Open);
    }

    #[test]
    fn only_the_slivers_catch_the_cursor_at_rest() {
        let f = Frame {
            x: 1408,
            y: 200,
            w: 512,
            h: 684,
            column_top: 196,
            column_h: 292,
            scale: 1.0,
        };
        let s = |mode, side| EdgeState { mode, side };
        assert_eq!(
            area(&f, s(Mode::Idle, EdgeHandle::Right)),
            (498, 196, 512, 488)
        );
        assert_eq!(
            area(&f, s(Mode::Peek, EdgeHandle::Right)),
            (264, 196, 512, 488)
        );
        assert_eq!(
            area(&f, s(Mode::Drag, EdgeHandle::Left)),
            (0, 196, 248, 488)
        );
        assert_eq!(area(&f, s(Mode::Open, EdgeHandle::Right)), (0, 0, 512, 684));
        let hi = Frame { scale: 1.5, ..f };
        assert_eq!(area(&hi, s(Mode::Idle, EdgeHandle::Right)).0, 512 - 21);
    }

    #[test]
    fn hidden_only_when_off_or_full_screen_and_closed() {
        let s = |mode, side| EdgeState { mode, side };
        assert!(!hidden(s(Mode::Idle, EdgeHandle::Right)));
        assert!(hidden(s(Mode::Idle, EdgeHandle::Off)));
        // The drawer opens from the tray or hotkey even with the tabs off.
        assert!(!hidden(s(Mode::Open, EdgeHandle::Off)));
    }
}
