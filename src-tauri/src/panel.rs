//! The Wedge window lives on a screen edge: a column of shelf tabs that is
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
use crate::models::{EdgeAlign, EdgeHandle, MonitorInfo, MONITOR_CURSOR, MONITOR_PRIMARY};
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
/// Tucked in and hidden away: just the edge itself, so the strip doesn't
/// take clicks meant for the scroll bar of a window beside it.
const HIDDEN_W: f64 = 3.0;
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
/// The tabs sit on a border between two displays (see `borders_display`).
static INNER: AtomicBool = AtomicBool::new(false);
/// The tabs leave the screen when tucked in (the edgeAutoHide setting).
static AUTO_HIDE: AtomicBool = AtomicBool::new(false);

/// Which display and where along its edge (Settings).
struct Placement {
    monitor: String,
    align: EdgeAlign,
}
static PLACEMENT: Mutex<Placement> = Mutex::new(Placement {
    monitor: String::new(),
    align: EdgeAlign::Center,
});
/// With "the display with the mouse": the display the tabs are on now.
static CURSOR_MONITOR: Mutex<Option<String>> = Mutex::new(None);

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
    /// Another display lies past the edge beside the tab column.
    inner: bool,
}

/// The display the tabs live on. While the chosen one is gone (unplugged),
/// the main display, until it's back.
fn monitor(app: &AppHandle) -> Option<tauri::Monitor> {
    let wanted = match PLACEMENT
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .monitor
        .as_str()
    {
        MONITOR_CURSOR => CURSOR_MONITOR
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .clone(),
        MONITOR_PRIMARY | "" => None,
        name => Some(name.to_string()),
    };
    wanted
        .and_then(|name| {
            app.available_monitors()
                .ok()?
                .into_iter()
                .find(|m| m.name().is_some_and(|n| *n == name))
        })
        .or_else(|| app.primary_monitor().ok().flatten())
}

/// With "the display with the mouse": take the display the cursor is on.
/// Called while the tabs are tucked in, and as they come out. Says whether
/// that's another display than before.
fn follow_cursor(app: &AppHandle) -> bool {
    if PLACEMENT.lock().unwrap_or_else(|e| e.into_inner()).monitor != MONITOR_CURSOR {
        return false;
    }
    let Ok(pos) = app.cursor_position() else {
        return false;
    };
    let Ok(Some(m)) = app.monitor_from_point(pos.x, pos.y) else {
        return false;
    };
    let mut now = CURSOR_MONITOR.lock().unwrap_or_else(|e| e.into_inner());
    let moved = *now != m.name().cloned();
    *now = m.name().cloned();
    moved
}

/// The tab column's top in a window `h` tall: at the top, middle or bottom,
/// where the page puts it (globals.css, `data-align`).
fn column_top(align: EdgeAlign, h: i32, column_h: i32, inset: i32) -> i32 {
    match align {
        EdgeAlign::Top => inset.min(h - column_h),
        EdgeAlign::Center => (h - column_h) / 2,
        EdgeAlign::Bottom => (h - column_h - inset).max(0),
    }
}

/// Where the window goes: on the edge of the chosen display's work area, at
/// the top, middle or bottom, tall enough for the drawer and the tab column.
fn frame(app: &AppHandle, side: EdgeHandle) -> Option<Frame> {
    let monitor = monitor(app)?;
    let align = PLACEMENT.lock().unwrap_or_else(|e| e.into_inner()).align;
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
    let y = match align {
        EdgeAlign::Top => wy + px(MARGIN),
        EdgeAlign::Center => wy + (wh - h) / 2,
        EdgeAlign::Bottom => wy + wh - h - px(MARGIN),
    };
    // At the top or bottom the first or last tab lines up with the drawer.
    let column_top = column_top(align, h, column_h, px(DRAWER_PAD - TABS_PAD));
    let rect = |m: &tauri::Monitor| {
        let (p, s) = (m.position(), m.size());
        (p.x, p.y, s.width as i32, s.height as i32)
    };
    let others: Vec<_> = app
        .available_monitors()
        .unwrap_or_default()
        .iter()
        .filter(|m| m.name() != monitor.name())
        .map(rect)
        .collect();
    let top = y + column_top;
    let inner = borders_display(side, rect(&monitor), &others, top, top + column_h);
    Some(Frame {
        x,
        y,
        w,
        h,
        column_top,
        column_h,
        scale,
        inner,
    })
}

/// Whether another display touches this edge of `me` beside the tab column
/// (`top..bottom`). The cursor doesn't stop at such an edge, it crosses it on
/// the way to that display, so the tabs there wait to see it stay (#44).
/// Rectangles are (x, y, width, height) in physical pixels.
fn borders_display(
    side: EdgeHandle,
    me: (i32, i32, i32, i32),
    others: &[(i32, i32, i32, i32)],
    top: i32,
    bottom: i32,
) -> bool {
    others.iter().any(|&(x, y, w, h)| {
        let touches = match side {
            EdgeHandle::Left => (x + w - me.0).abs() <= 1,
            _ => (x - (me.0 + me.2)).abs() <= 1,
        };
        touches && y < bottom && y + h > top
    })
}

/// The displays, for Settings.
#[tauri::command]
pub fn list_monitors(app: AppHandle) -> Vec<MonitorInfo> {
    let primary = app
        .primary_monitor()
        .ok()
        .flatten()
        .and_then(|m| m.name().cloned());
    let mut list: Vec<MonitorInfo> = app
        .available_monitors()
        .unwrap_or_default()
        .iter()
        .filter_map(|m| {
            let id = m.name()?.clone();
            Some(MonitorInfo {
                number: display_number(&id),
                width: m.size().width,
                height: m.size().height,
                primary: primary.as_ref() == Some(&id),
                id,
            })
        })
        .collect();
    list.sort_by_key(|m| m.number);
    list
}

/// Windows' number for a display: "\\.\DISPLAY2" is 2.
fn display_number(name: &str) -> u32 {
    name.trim_start_matches(r"\\.\DISPLAY").parse().unwrap_or(0)
}

/// The part of the window that catches the cursor in a mode: (left, top,
/// right, bottom) from the window's corner, physical pixels. The rest lets
/// clicks through to whatever is below.
fn area(f: &Frame, s: EdgeState, auto_hide: bool) -> (i32, i32, i32, i32) {
    let width = match s.mode {
        Mode::Open => return (0, 0, f.w, f.h),
        Mode::Peek | Mode::Drag => OUT_W,
        Mode::Idle if auto_hide => HIDDEN_W,
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
    if INNER.swap(f.inner, Ordering::SeqCst) != f.inner {
        log::info!(
            "[edge] {}",
            if f.inner {
                "on a border between displays: the tabs wait for the cursor to stay"
            } else {
                "on an outer edge"
            }
        );
        let _ = app.emit_to(LABEL, "edge-inner", f.inner);
    }
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
        let (l, t, r, b) = area(&f, s, AUTO_HIDE.load(Ordering::SeqCst));
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
            // Moving onto a display with another scale makes Windows resize
            // the window for it on the way (WM_DPICHANGED): put it back.
            let mut after = RECT::default();
            let _ = GetWindowRect(hwnd, &mut after);
            if (
                after.left,
                after.top,
                after.right - after.left,
                after.bottom - after.top,
            ) != (x, y, f.w, f.h)
            {
                let _ = SetWindowPos(hwnd, Some(HWND_TOPMOST), x, y, f.w, f.h, SWP_NOACTIVATE);
            }
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
    // Coming out: on the display with the mouse, if that's the setting. Not
    // for a hover: the cursor is on the tabs already, and on a border between
    // two displays it may be on the next one by now, which took the tabs
    // over there (#44).
    if before.mode == Mode::Idle && !matches!(mode, Mode::Idle | Mode::Peek) {
        follow_cursor(app);
    }
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

/// The display or position setting changed (or at startup).
pub fn apply_placement(app: &AppHandle, monitor: &str, align: EdgeAlign) {
    {
        let mut p = PLACEMENT.lock().unwrap_or_else(|e| e.into_inner());
        p.monitor = monitor.to_string();
        p.align = align;
    }
    follow_cursor(app);
    place(app, state());
}

/// The hide-away setting changed (or at startup).
pub fn apply_auto_hide(app: &AppHandle, on: bool) {
    AUTO_HIDE.store(on, Ordering::SeqCst);
    place(app, state());
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

/// Why the tabs should step aside right now, if they should: a game, a video
/// or a presentation in full screen. Windows' own answer is only trusted for
/// Direct3D full screen and presentation mode; its general "busy"
/// (QUNS_BUSY) stayed on without any full-screen app on some Windows 10 PCs,
/// which hid the tabs for good. Otherwise the window in front has to fill
/// the primary monitor, where the tabs are (Chromium checks the same way).
#[cfg(windows)]
fn fullscreen_app() -> Option<String> {
    use windows::Win32::UI::Shell::{
        SHQueryUserNotificationState, QUNS_PRESENTATION_MODE, QUNS_RUNNING_D3D_FULL_SCREEN,
    };
    match unsafe { SHQueryUserNotificationState() } {
        Ok(s) if s == QUNS_RUNNING_D3D_FULL_SCREEN => Some("Direct3D full screen".into()),
        Ok(s) if s == QUNS_PRESENTATION_MODE => Some("presentation mode".into()),
        _ => full_screen_window(),
    }
}

#[cfg(not(windows))]
fn fullscreen_app() -> Option<String> {
    None
}

/// The foreground window, if it fills the primary monitor: its class, for
/// the log.
#[cfg(windows)]
fn full_screen_window() -> Option<String> {
    use windows::Win32::Foundation::RECT;
    use windows::Win32::Graphics::Gdi::{
        GetMonitorInfoW, MonitorFromWindow, MONITORINFO, MONITOR_DEFAULTTONULL,
    };
    use windows::Win32::UI::WindowsAndMessaging::{
        GetClassNameW, GetForegroundWindow, GetWindowLongW, GetWindowRect,
        GetWindowThreadProcessId, IsIconic, IsWindowVisible, IsZoomed, GWL_EXSTYLE, GWL_STYLE,
        MONITORINFOF_PRIMARY,
    };
    unsafe {
        let hwnd = GetForegroundWindow();
        if hwnd.0.is_null()
            || !IsWindowVisible(hwnd).as_bool()
            || IsIconic(hwnd).as_bool()
            // A maximized window fills the screen when the taskbar hides itself.
            || IsZoomed(hwnd).as_bool()
        {
            return None;
        }
        let mut pid = 0;
        GetWindowThreadProcessId(hwnd, Some(&mut pid));
        if pid == std::process::id() {
            return None;
        }
        let mut buf = [0u16; 64];
        let n = GetClassNameW(hwnd, &mut buf) as usize;
        let class = String::from_utf16_lossy(&buf[..n]);
        if is_shell_window(&class) {
            return None;
        }
        let monitor = MonitorFromWindow(hwnd, MONITOR_DEFAULTTONULL);
        let mut info = MONITORINFO {
            cbSize: std::mem::size_of::<MONITORINFO>() as u32,
            ..Default::default()
        };
        if monitor.is_invalid()
            || !GetMonitorInfoW(monitor, &mut info).as_bool()
            || info.dwFlags & MONITORINFOF_PRIMARY == 0
        {
            return None;
        }
        let mut r = RECT::default();
        GetWindowRect(hwnd, &mut r).ok()?;
        let m = info.rcMonitor;
        let window = (r.left, r.top, r.right, r.bottom);
        let screen = (m.left, m.top, m.right, m.bottom);
        let style = GetWindowLongW(hwnd, GWL_STYLE) as u32;
        let ex_style = GetWindowLongW(hwnd, GWL_EXSTYLE) as u32;
        fills_monitor(window, screen, style, ex_style).then(|| format!("{class} fills the screen"))
    }
}

/// The desktop and the taskbar cover the screen but aren't full-screen apps.
fn is_shell_window(class: &str) -> bool {
    matches!(
        class,
        "Progman" | "WorkerW" | "Shell_TrayWnd" | "Shell_SecondaryTrayWnd"
    )
}

/// A window (left, top, right, bottom) fills a monitor the way a full-screen
/// game, video or browser does: all of it, without a frame. Windows with a
/// resizing or dialog frame and tool windows don't count.
fn fills_monitor(
    w: (i32, i32, i32, i32),
    m: (i32, i32, i32, i32),
    style: u32,
    ex_style: u32,
) -> bool {
    const WS_DLGFRAME: u32 = 0x0040_0000;
    const WS_THICKFRAME: u32 = 0x0004_0000;
    const WS_EX_TOOLWINDOW: u32 = 0x0000_0080;
    const WS_EX_WINDOWEDGE: u32 = 0x0000_0100;
    let covers = w.0 <= m.0 && w.1 <= m.1 && w.2 >= m.2 && w.3 >= m.3;
    covers
        && style & (WS_DLGFRAME | WS_THICKFRAME) == 0
        && ex_style & (WS_EX_TOOLWINDOW | WS_EX_WINDOWEDGE) == 0
}

/// Hide the tabs while a full-screen app runs, and follow work-area changes
/// (taskbar moved, resolution changed).
pub fn start_monitor(app: &AppHandle) {
    let app = app.clone();
    std::thread::spawn(move || {
        let mut last = None;
        let mut tick = 0u32;
        loop {
            std::thread::sleep(Duration::from_millis(250));
            tick = (tick + 1) % 6;
            // Tucked in, the tabs follow the mouse across displays (if set),
            // soon enough to be there when it reaches the edge. The rest
            // runs every 1.5 s.
            let moved = state().mode == Mode::Idle && follow_cursor(&app);
            if !moved && tick != 0 {
                continue;
            }
            let reason = fullscreen_app();
            let busy = reason.is_some();
            let changed = FULLSCREEN.swap(busy, Ordering::SeqCst) != busy;
            if changed {
                match &reason {
                    Some(why) => log::info!("[edge] tabs step aside: {why}"),
                    None => log::info!("[edge] tabs back"),
                }
            }
            let frame = frame(&app, state().side);
            if changed || frame != last {
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
    let (l, t, r, b) = area(&f, s, AUTO_HIDE.load(Ordering::SeqCst));
    Some([x + l, y + t, r - l, b - t])
}

/// Whether the tabs sit on a border between two displays, for the page.
#[tauri::command]
pub fn edge_inner() -> bool {
    INNER.load(Ordering::SeqCst)
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
            inner: false,
        };
        let s = |mode, side| EdgeState { mode, side };
        assert_eq!(
            area(&f, s(Mode::Idle, EdgeHandle::Right), false),
            (498, 196, 512, 488)
        );
        // Hidden away: only the edge catches the cursor.
        assert_eq!(
            area(&f, s(Mode::Idle, EdgeHandle::Right), true),
            (509, 196, 512, 488)
        );
        assert_eq!(area(&f, s(Mode::Peek, EdgeHandle::Right), true).0, 264);
        assert_eq!(
            area(&f, s(Mode::Peek, EdgeHandle::Right), false),
            (264, 196, 512, 488)
        );
        assert_eq!(
            area(&f, s(Mode::Drag, EdgeHandle::Left), false),
            (0, 196, 248, 488)
        );
        assert_eq!(
            area(&f, s(Mode::Open, EdgeHandle::Right), false),
            (0, 0, 512, 684)
        );
        let hi = Frame { scale: 1.5, ..f };
        assert_eq!(
            area(&hi, s(Mode::Idle, EdgeHandle::Right), false).0,
            512 - 21
        );
    }

    #[test]
    fn hidden_only_when_off_or_full_screen_and_closed() {
        let s = |mode, side| EdgeState { mode, side };
        assert!(!hidden(s(Mode::Idle, EdgeHandle::Right)));
        assert!(hidden(s(Mode::Idle, EdgeHandle::Off)));
        // The drawer opens from the tray or hotkey even with the tabs off.
        assert!(!hidden(s(Mode::Open, EdgeHandle::Off)));
    }

    #[test]
    fn only_frameless_windows_filling_the_monitor_count_as_full_screen() {
        let screen = (0, 0, 1366, 768);
        // A game or a browser in full screen; some reach past the edges.
        assert!(fills_monitor((0, 0, 1366, 768), screen, 0, 0));
        assert!(fills_monitor((-8, -8, 1374, 776), screen, 0, 0));
        // A window on the work area, above the taskbar.
        assert!(!fills_monitor((0, 0, 1366, 728), screen, 0, 0));
        // Covering the screen with a resizing frame, or as a tool window.
        assert!(!fills_monitor((0, 0, 1366, 768), screen, 0x0004_0000, 0));
        assert!(!fills_monitor((0, 0, 1366, 768), screen, 0, 0x80));
        // A second monitor's coordinates work the same.
        assert!(fills_monitor(
            (1366, 0, 3286, 1080),
            (1366, 0, 3286, 1080),
            0,
            0
        ));
    }

    #[test]
    fn the_tab_column_sits_at_the_top_middle_or_bottom() {
        // A 684px window, a 478px column, 10px from the edge at top or bottom.
        assert_eq!(column_top(EdgeAlign::Top, 684, 478, 10), 10);
        assert_eq!(column_top(EdgeAlign::Center, 684, 478, 10), 103);
        assert_eq!(column_top(EdgeAlign::Bottom, 684, 478, 10), 196);
        // A column as tall as the window fills it whatever the setting.
        for align in [EdgeAlign::Top, EdgeAlign::Center, EdgeAlign::Bottom] {
            assert_eq!(column_top(align, 684, 684, 10), 0);
        }
    }

    #[test]
    fn a_display_past_the_edge_beside_the_tabs_makes_it_a_border() {
        // The main display, a second one to its right, a third above.
        let main = (0, 0, 1920, 1080);
        let others = [(1920, 0, 1920, 1080), (1097, -1080, 1920, 1080)];
        assert!(borders_display(EdgeHandle::Right, main, &others, 400, 680));
        assert!(!borders_display(EdgeHandle::Left, main, &others, 400, 680));
        // The second display, seen from itself: its left edge is the border.
        let second = (1920, 0, 1920, 1080);
        assert!(borders_display(EdgeHandle::Left, second, &[main], 400, 680));
        assert!(!borders_display(
            EdgeHandle::Right,
            second,
            &[main],
            400,
            680
        ));
        // A display to the right but beside other heights doesn't count.
        let low = [(1920, 900, 1920, 1080)];
        assert!(!borders_display(EdgeHandle::Right, main, &low, 400, 680));
        assert!(borders_display(EdgeHandle::Right, main, &low, 400, 1000));
        // One display alone has outer edges only.
        assert!(!borders_display(EdgeHandle::Right, main, &[], 400, 680));
    }

    #[test]
    fn displays_are_numbered_like_windows_does() {
        assert_eq!(display_number(r"\\.\DISPLAY1"), 1);
        assert_eq!(display_number(r"\\.\DISPLAY12"), 12);
        assert_eq!(display_number("something else"), 0);
    }

    #[test]
    fn the_desktop_and_taskbar_are_not_full_screen_apps() {
        assert!(is_shell_window("Progman"));
        assert!(is_shell_window("WorkerW"));
        assert!(is_shell_window("Shell_TrayWnd"));
        assert!(!is_shell_window("Chrome_WidgetWin_1"));
    }
}
