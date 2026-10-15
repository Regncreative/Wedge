//! Notes in the log when the UI thread stops answering, so a freeze ("Wedge
//! is not responding") leaves a trace: how long it lasted. Every few seconds
//! a no-op is queued on the UI thread; if it hasn't run by the next check,
//! the thread is stuck.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;

use tauri::AppHandle;

const EVERY: Duration = Duration::from_secs(5);

pub fn start(app: &AppHandle) {
    let app = app.clone();
    let spawned = std::thread::Builder::new()
        .name("watchdog".into())
        .spawn(move || {
            let answered = Arc::new(AtomicBool::new(true));
            let mut stuck = 0u64;
            loop {
                std::thread::sleep(EVERY);
                if !answered.swap(false, Ordering::SeqCst) {
                    // The last ping is still waiting; don't queue another.
                    stuck += 1;
                    if stuck == 1 {
                        log::warn!("UI thread not answering for {}s", EVERY.as_secs());
                    }
                    continue;
                }
                if stuck > 0 {
                    log::warn!(
                        "UI thread answered again after about {}s",
                        stuck * EVERY.as_secs()
                    );
                    stuck = 0;
                }
                let flag = answered.clone();
                if app
                    .run_on_main_thread(move || flag.store(true, Ordering::SeqCst))
                    .is_err()
                {
                    return; // shutting down
                }
            }
        });
    if let Err(e) = spawned {
        log::warn!("watchdog: {e}");
    }
}
