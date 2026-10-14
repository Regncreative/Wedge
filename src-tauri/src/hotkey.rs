//! Global shortcuts: one opens the panel, the other fills the selected
//! file's path into an Open/Save dialog.

use std::sync::Mutex;

use tauri::{AppHandle, Manager};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};

use crate::state::AppState;

#[derive(Clone, Copy)]
pub enum Action {
    OpenPanel,
    PasteIntoDialog,
}

fn slot(state: &AppState, action: Action) -> &Mutex<Option<String>> {
    match action {
        Action::OpenPanel => &state.hotkey,
        Action::PasteIntoDialog => &state.paste_hotkey,
    }
}

fn register(app: &AppHandle, accelerator: &str, action: Action) -> bool {
    app.global_shortcut()
        .on_shortcut(accelerator, move |app, _shortcut, event| {
            if event.state != ShortcutState::Pressed {
                return;
            }
            match action {
                Action::OpenPanel => crate::panel::toggle(app),
                Action::PasteIntoDialog => crate::commands_extra::paste_into_dialog(app),
            }
        })
        .is_ok()
}

/// Swap one shortcut. If the new one can't be registered (taken by another
/// app, or invalid) the previous one is restored and `false` is returned, so
/// the user is never left without a working shortcut.
pub fn reregister_action(app: &AppHandle, accelerator: &str, action: Action) -> bool {
    let state = app.state::<AppState>();
    let mut current = slot(&state, action).lock().unwrap_or_else(|e| e.into_inner());
    if current.as_deref() == Some(accelerator) {
        return true;
    }
    let previous = current.take();
    if let Some(prev) = &previous {
        let _ = app.global_shortcut().unregister(prev.as_str());
    }
    if register(app, accelerator, action) {
        *current = Some(accelerator.to_string());
        return true;
    }
    log::warn!("Failed to register hotkey: {accelerator}");
    if let Some(prev) = previous {
        if register(app, &prev, action) {
            *current = Some(prev);
        }
    }
    false
}

/// The panel shortcut.
pub fn reregister(app: &AppHandle, accelerator: &str) -> bool {
    reregister_action(app, accelerator, Action::OpenPanel)
}
