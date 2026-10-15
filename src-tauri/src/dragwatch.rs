//! Notices when a file drag starts anywhere in Windows, so the shelf tabs
//! can come out right away.
//!
//! While files are dragged from Explorer, the desktop, browsers and most
//! apps, the shell shows a "SysDragImage" window (the picture that follows
//! the cursor) and destroys it when the drag ends. An out-of-context WinEvent
//! hook reports when such a window is shown or goes away; no keyboard or
//! mouse input is read.

use std::sync::atomic::{AtomicIsize, Ordering};
use std::sync::OnceLock;
use std::time::Duration;

use tauri::AppHandle;

static APP: OnceLock<AppHandle> = OnceLock::new();
/// The drag image window of the drag in progress (0 = none).
static ACTIVE: AtomicIsize = AtomicIsize::new(0);

/// A drag is in progress.
pub fn active() -> bool {
    ACTIVE.load(Ordering::SeqCst) != 0
}

/// Window class of the shell's drag image.
const DRAG_IMAGE_CLASS: &str = "SysDragImage";

fn notify(active: bool) {
    let Some(app) = APP.get() else { return };
    let handle = app.clone();
    // Called on the hook thread: hand over to the main thread.
    let _ = app.run_on_main_thread(move || crate::panel::on_drag(&handle, active));
}

#[cfg(windows)]
mod imp {
    use super::*;
    use windows::Win32::Foundation::HWND;
    use windows::Win32::UI::Accessibility::{SetWinEventHook, HWINEVENTHOOK};
    use windows::Win32::UI::WindowsAndMessaging::{
        DispatchMessageW, GetClassNameW, GetMessageW, IsWindow, IsWindowVisible, TranslateMessage,
        EVENT_OBJECT_DESTROY, EVENT_OBJECT_HIDE, EVENT_OBJECT_SHOW, MSG, OBJID_WINDOW,
        WINEVENT_OUTOFCONTEXT, WINEVENT_SKIPOWNPROCESS,
    };

    fn class_of(hwnd: HWND) -> String {
        let mut buf = [0u16; 64];
        let n = unsafe { GetClassNameW(hwnd, &mut buf) } as usize;
        String::from_utf16_lossy(&buf[..n])
    }

    unsafe extern "system" fn on_event(
        _hook: HWINEVENTHOOK,
        event: u32,
        hwnd: HWND,
        id_object: i32,
        _id_child: i32,
        _thread: u32,
        _time: u32,
    ) {
        if id_object != OBJID_WINDOW.0 || hwnd.0.is_null() {
            return;
        }
        let raw = hwnd.0 as isize;
        if event == EVENT_OBJECT_SHOW {
            if class_of(hwnd) == DRAG_IMAGE_CLASS && ACTIVE.swap(raw, Ordering::SeqCst) != raw {
                notify(true);
            }
        } else if (event == EVENT_OBJECT_HIDE || event == EVENT_OBJECT_DESTROY)
            && ACTIVE
                .compare_exchange(raw, 0, Ordering::SeqCst, Ordering::SeqCst)
                .is_ok()
        {
            notify(false);
        }
    }

    pub fn run() {
        // Events arrive through this thread's message loop.
        std::thread::spawn(|| unsafe {
            let hook = SetWinEventHook(
                EVENT_OBJECT_DESTROY,
                EVENT_OBJECT_HIDE,
                None,
                Some(on_event),
                0,
                0,
                WINEVENT_OUTOFCONTEXT | WINEVENT_SKIPOWNPROCESS,
            );
            if hook.is_invalid() {
                log::warn!("drag watcher unavailable");
                return;
            }
            let mut msg = MSG::default();
            while GetMessageW(&mut msg, None, 0, 0).as_bool() {
                let _ = TranslateMessage(&msg);
                DispatchMessageW(&msg);
            }
        });
        // Safety net: if a drag image vanished without an event, end the drag.
        std::thread::spawn(|| loop {
            std::thread::sleep(Duration::from_millis(400));
            let raw = ACTIVE.load(Ordering::SeqCst);
            if raw == 0 {
                continue;
            }
            let hwnd = HWND(raw as *mut _);
            let gone =
                unsafe { !IsWindow(Some(hwnd)).as_bool() || !IsWindowVisible(hwnd).as_bool() };
            if gone
                && ACTIVE
                    .compare_exchange(raw, 0, Ordering::SeqCst, Ordering::SeqCst)
                    .is_ok()
            {
                notify(false);
            }
        });
    }
}

/// Start watching for drags (once).
pub fn start(app: &AppHandle) {
    if APP.set(app.clone()).is_err() {
        return;
    }
    #[cfg(windows)]
    imp::run();
}
