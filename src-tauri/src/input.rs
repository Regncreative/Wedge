//! System-wide mouse gestures, via a low-level mouse hook that only runs
//! while a gesture is enabled:
//! - shake the cursor while dragging → a drop shelf opens at the cursor;
//! - push the cursor against a screen edge → the panel slides in.

use std::sync::atomic::{AtomicBool, AtomicU32, AtomicU8, Ordering};
use std::sync::{mpsc, Mutex, OnceLock};

use tauri::AppHandle;

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum MouseEvent {
    Down { x: i32, y: i32, t: u32 },
    Up { x: i32, y: i32, t: u32 },
    Move { x: i32, y: i32, t: u32 },
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum Gesture {
    Shake { x: i32, y: i32 },
    Edge { left: bool, y: i32 },
}

/// Detects a horizontal shake while the left button is held and the cursor
/// has travelled far enough to be a drag.
#[derive(Default)]
pub struct ShakeDetector {
    down: Option<(i32, i32)>,
    dragging: bool,
    fired: bool,
    last_x: i32,
    dir: i32,
    segment: i32,
    reversals: Vec<u32>,
}

impl ShakeDetector {
    const DRAG_THRESHOLD: i32 = 12;
    const MIN_SEGMENT: i32 = 35;
    const REVERSALS: usize = 4;
    const WINDOW_MS: u32 = 800;

    pub fn feed(&mut self, ev: MouseEvent) -> Option<Gesture> {
        match ev {
            MouseEvent::Down { x, y, .. } => {
                *self = Self { down: Some((x, y)), last_x: x, ..Default::default() };
                None
            }
            MouseEvent::Up { .. } => {
                *self = Self::default();
                None
            }
            MouseEvent::Move { x, y, t } => {
                let (dx0, dy0) = self.down?;
                if !self.dragging {
                    self.dragging = (x - dx0).abs().max((y - dy0).abs()) > Self::DRAG_THRESHOLD;
                    self.last_x = x;
                    return None;
                }
                if self.fired {
                    return None;
                }
                let dx = x - self.last_x;
                self.last_x = x;
                if dx == 0 {
                    return None;
                }
                let dir = dx.signum();
                if dir == self.dir {
                    self.segment += dx.abs();
                    return None;
                }
                // Direction changed: count it if the previous stroke was long enough.
                if self.dir != 0 && self.segment >= Self::MIN_SEGMENT {
                    self.reversals.push(t);
                    self.reversals.retain(|&r| t.wrapping_sub(r) <= Self::WINDOW_MS);
                    if self.reversals.len() >= Self::REVERSALS {
                        self.fired = true;
                        return Some(Gesture::Shake { x, y });
                    }
                }
                self.dir = dir;
                self.segment = dx.abs();
                None
            }
        }
    }
}

/// Detects the cursor resting against the left or right edge of the
/// desktop (middle 70% only, so corners and the taskbar keep working).
pub struct EdgeDetector {
    pub left_edge: i32,
    pub right_edge: i32,
    pub top: i32,
    pub bottom: i32,
    since: Option<u32>,
    armed: bool,
}

impl EdgeDetector {
    const DWELL_MS: u32 = 350;
    const REARM_DISTANCE: i32 = 40;

    pub fn new(left_edge: i32, right_edge: i32, top: i32, bottom: i32) -> Self {
        Self { left_edge, right_edge, top, bottom, since: None, armed: true }
    }

    /// `side`: 1 = left, 2 = right.
    pub fn feed(&mut self, ev: MouseEvent, side: u8, button_down: bool) -> Option<Gesture> {
        let MouseEvent::Move { x, y, t } = ev else {
            return None;
        };
        let left = side == 1;
        let edge_x = if left { self.left_edge } else { self.right_edge };
        let distance = (x - edge_x).abs();
        if distance > Self::REARM_DISTANCE {
            self.armed = true;
        }
        let band = (self.bottom - self.top) * 15 / 100;
        let in_band = y > self.top + band && y < self.bottom - band;
        if button_down || !self.armed || distance > 0 || !in_band {
            self.since = None;
            return None;
        }
        let since = *self.since.get_or_insert(t);
        if t.wrapping_sub(since) >= Self::DWELL_MS {
            self.since = None;
            self.armed = false;
            return Some(Gesture::Edge { left, y });
        }
        None
    }
}

// ── Hook plumbing ─────────────────────────────────────────

static SHAKE_ENABLED: AtomicBool = AtomicBool::new(false);
static EDGE_SIDE: AtomicU8 = AtomicU8::new(0);
static HOOK_THREAD: AtomicU32 = AtomicU32::new(0);
static SENDER: OnceLock<Mutex<Option<mpsc::Sender<MouseEvent>>>> = OnceLock::new();

fn sender() -> &'static Mutex<Option<mpsc::Sender<MouseEvent>>> {
    SENDER.get_or_init(|| Mutex::new(None))
}

/// Apply the settings: start the hook if any gesture is on, stop it otherwise.
pub fn configure(app: &AppHandle, shake: bool, edge: crate::models::EdgeReveal) {
    SHAKE_ENABLED.store(shake, Ordering::SeqCst);
    EDGE_SIDE.store(
        match edge {
            crate::models::EdgeReveal::Off => 0,
            crate::models::EdgeReveal::Left => 1,
            crate::models::EdgeReveal::Right => 2,
        },
        Ordering::SeqCst,
    );
    let wanted = shake || edge != crate::models::EdgeReveal::Off;
    let running = HOOK_THREAD.load(Ordering::SeqCst) != 0;
    if wanted && !running {
        imp::start(app.clone());
    } else if !wanted && running {
        imp::stop();
    }
}

fn dispatch(app: &AppHandle, gesture: Gesture) {
    let app2 = app.clone();
    let _ = app.run_on_main_thread(move || match gesture {
        Gesture::Shake { x, y } => crate::dropshelf::show_at(&app2, x, y),
        Gesture::Edge { left, y } => crate::panel::show_at_edge(&app2, left, y),
    });
}

#[cfg(windows)]
mod imp {
    use super::*;
    use windows::Win32::Foundation::{LPARAM, LRESULT, WPARAM};
    use windows::Win32::System::LibraryLoader::GetModuleHandleW;
    use windows::Win32::System::Threading::GetCurrentThreadId;
    use windows::Win32::UI::WindowsAndMessaging::{
        CallNextHookEx, DispatchMessageW, GetMessageW, GetSystemMetrics, PostThreadMessageW,
        SetWindowsHookExW, TranslateMessage, UnhookWindowsHookEx, MSG, MSLLHOOKSTRUCT,
        SM_CXVIRTUALSCREEN, SM_CYVIRTUALSCREEN, SM_XVIRTUALSCREEN, SM_YVIRTUALSCREEN, WH_MOUSE_LL,
        WM_LBUTTONDOWN, WM_LBUTTONUP, WM_MOUSEMOVE, WM_QUIT,
    };

    unsafe extern "system" fn hook(code: i32, wparam: WPARAM, lparam: LPARAM) -> LRESULT {
        if code >= 0 {
            let info = unsafe { &*(lparam.0 as *const MSLLHOOKSTRUCT) };
            let (x, y, t) = (info.pt.x, info.pt.y, info.time);
            let ev = match wparam.0 as u32 {
                WM_MOUSEMOVE => Some(MouseEvent::Move { x, y, t }),
                WM_LBUTTONDOWN => Some(MouseEvent::Down { x, y, t }),
                WM_LBUTTONUP => Some(MouseEvent::Up { x, y, t }),
                _ => None,
            };
            // Never block here: Windows drops hooks that are slow.
            if let (Some(ev), Ok(guard)) = (ev, sender().try_lock()) {
                if let Some(tx) = guard.as_ref() {
                    let _ = tx.send(ev);
                }
            }
        }
        unsafe { CallNextHookEx(None, code, wparam, lparam) }
    }

    pub fn start(app: AppHandle) {
        let (tx, rx) = mpsc::channel::<MouseEvent>();
        *sender().lock().unwrap_or_else(|e| e.into_inner()) = Some(tx);

        // Gesture logic, off the hook thread.
        std::thread::spawn(move || {
            let (vx, vy, vw, vh) = unsafe {
                (
                    GetSystemMetrics(SM_XVIRTUALSCREEN),
                    GetSystemMetrics(SM_YVIRTUALSCREEN),
                    GetSystemMetrics(SM_CXVIRTUALSCREEN),
                    GetSystemMetrics(SM_CYVIRTUALSCREEN),
                )
            };
            let mut shake = ShakeDetector::default();
            let mut edge = EdgeDetector::new(vx, vx + vw - 1, vy, vy + vh);
            let mut button_down = false;
            for ev in rx {
                match ev {
                    MouseEvent::Down { .. } => button_down = true,
                    MouseEvent::Up { .. } => button_down = false,
                    MouseEvent::Move { .. } => {}
                }
                if SHAKE_ENABLED.load(Ordering::Relaxed) {
                    if let Some(g) = shake.feed(ev) {
                        dispatch(&app, g);
                    }
                }
                let side = EDGE_SIDE.load(Ordering::Relaxed);
                if side != 0 {
                    if let Some(g) = edge.feed(ev, side, button_down) {
                        dispatch(&app, g);
                    }
                }
            }
        });

        // The hook needs a thread with a message loop.
        std::thread::spawn(|| unsafe {
            let module = GetModuleHandleW(None).ok();
            let Ok(handle) = SetWindowsHookExW(WH_MOUSE_LL, Some(hook), module.map(Into::into), 0)
            else {
                log::warn!("mouse hook unavailable");
                return;
            };
            HOOK_THREAD.store(GetCurrentThreadId(), Ordering::SeqCst);
            let mut msg = MSG::default();
            while GetMessageW(&mut msg, None, 0, 0).as_bool() {
                let _ = TranslateMessage(&msg);
                DispatchMessageW(&msg);
            }
            let _ = UnhookWindowsHookEx(handle);
            HOOK_THREAD.store(0, Ordering::SeqCst);
        });
    }

    pub fn stop() {
        *sender().lock().unwrap_or_else(|e| e.into_inner()) = None;
        let id = HOOK_THREAD.load(Ordering::SeqCst);
        if id != 0 {
            unsafe {
                let _ = PostThreadMessageW(id, WM_QUIT, WPARAM(0), LPARAM(0));
            }
        }
    }
}

#[cfg(not(windows))]
mod imp {
    use super::*;
    pub fn start(_: AppHandle) {}
    pub fn stop() {}
}

#[cfg(test)]
mod tests {
    use super::*;

    fn mv(x: i32, t: u32) -> MouseEvent {
        MouseEvent::Move { x, y: 500, t }
    }

    #[test]
    fn a_quick_shake_while_dragging_opens_the_shelf() {
        let mut d = ShakeDetector::default();
        assert_eq!(d.feed(MouseEvent::Down { x: 500, y: 500, t: 0 }), None);
        assert_eq!(d.feed(mv(530, 10)), None); // starts a drag
        let mut fired = None;
        let mut t = 20;
        for x in [600, 520, 600, 520, 600, 520] {
            if let Some(g) = d.feed(mv(x, t)) {
                fired = Some(g);
                break;
            }
            t += 60;
        }
        assert!(matches!(fired, Some(Gesture::Shake { .. })), "{fired:?}");
        // Only once per drag.
        assert_eq!(d.feed(mv(600, t + 10)), None);
    }

    #[test]
    fn no_shake_without_a_held_button_or_when_slow() {
        let mut d = ShakeDetector::default();
        for (i, x) in [600, 520, 600, 520, 600, 520].iter().enumerate() {
            assert_eq!(d.feed(mv(*x, i as u32 * 50)), None, "button not held");
        }
        let mut slow = ShakeDetector::default();
        slow.feed(MouseEvent::Down { x: 500, y: 500, t: 0 });
        slow.feed(mv(530, 10));
        for (i, x) in [600, 520, 600, 520, 600, 520].iter().enumerate() {
            assert_eq!(slow.feed(mv(*x, 20 + i as u32 * 400)), None, "too slow");
        }
        let mut tiny = ShakeDetector::default();
        tiny.feed(MouseEvent::Down { x: 500, y: 500, t: 0 });
        tiny.feed(mv(530, 10));
        for (i, x) in [540, 530, 540, 530, 540, 530].iter().enumerate() {
            assert_eq!(tiny.feed(mv(*x, 20 + i as u32 * 40)), None, "jitter is not a shake");
        }
    }

    #[test]
    fn resting_on_the_edge_reveals_once() {
        let mut e = EdgeDetector::new(0, 1919, 0, 1080);
        let at = |x: i32, y: i32, t: u32| MouseEvent::Move { x, y, t };
        assert_eq!(e.feed(at(0, 540, 0), 1, false), None);
        assert_eq!(e.feed(at(0, 541, 200), 1, false), None);
        assert!(matches!(e.feed(at(0, 542, 400), 1, false), Some(Gesture::Edge { left: true, .. })));
        // Staying there doesn't fire again until the cursor leaves.
        assert_eq!(e.feed(at(0, 542, 900), 1, false), None);
        e.feed(at(200, 542, 1000), 1, false);
        e.feed(at(0, 542, 1100), 1, false);
        assert!(e.feed(at(0, 542, 1500), 1, false).is_some());
    }

    #[test]
    fn edge_ignores_corners_drags_and_the_other_side() {
        let mut e = EdgeDetector::new(0, 1919, 0, 1080);
        let at = |x: i32, y: i32, t: u32| MouseEvent::Move { x, y, t };
        e.feed(at(0, 20, 0), 1, false);
        assert_eq!(e.feed(at(0, 20, 500), 1, false), None, "corner");
        e.feed(at(0, 540, 600), 1, true);
        assert_eq!(e.feed(at(0, 540, 1100), 1, true), None, "while dragging");
        e.feed(at(1919, 540, 1200), 1, false);
        assert_eq!(e.feed(at(1919, 540, 1700), 1, false), None, "other side");
    }
}
