//! The global shortcut that opens the panel.

use tauri::{AppHandle, Manager};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};

use crate::state::AppState;

fn register(app: &AppHandle, accelerator: &str) -> bool {
    app.global_shortcut()
        .on_shortcut(accelerator, |app, _shortcut, event| {
            if event.state == ShortcutState::Pressed {
                crate::panel::toggle(app);
            }
        })
        .is_ok()
}

/// Swap the shortcut. If the new one can't be registered (taken by another
/// app, or invalid) the previous one is restored and `false` is returned, so
/// the user is never left without a working shortcut.
pub fn reregister(app: &AppHandle, accelerator: &str) -> bool {
    let state = app.state::<AppState>();
    let mut current = state.hotkey.lock().unwrap_or_else(|e| e.into_inner());
    if current.as_deref() == Some(accelerator) {
        return true;
    }
    let previous = current.take();
    if let Some(prev) = &previous {
        let _ = app.global_shortcut().unregister(prev.as_str());
    }
    if register(app, accelerator) {
        *current = Some(accelerator.to_string());
        return true;
    }
    log::warn!("Failed to register hotkey: {accelerator}");
    if let Some(prev) = previous {
        if register(app, &prev) {
            *current = Some(prev);
        }
    }
    false
}
