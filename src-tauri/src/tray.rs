//! System tray icon and its menu.

use std::time::Duration;

use tauri::image::Image;
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager};

use crate::i18n;
use crate::panel;
use crate::state::AppState;
use crate::updater;

pub const ID: &str = "main";

pub fn create(app: &AppHandle) -> tauri::Result<()> {
    let t = i18n::strings(app.state::<AppState>().language);
    let open = MenuItem::with_id(app, "open", t.tray_open, true, None::<&str>)?;
    let settings = MenuItem::with_id(app, "settings", t.tray_settings, true, None::<&str>)?;
    let updates = MenuItem::with_id(app, "updates", t.tray_check_updates, true, None::<&str>)?;
    let quit_item = MenuItem::with_id(app, "quit", t.tray_quit, true, None::<&str>)?;
    let sep1 = PredefinedMenuItem::separator(app)?;
    let sep2 = PredefinedMenuItem::separator(app)?;
    let menu = Menu::with_items(app, &[&open, &sep1, &settings, &updates, &sep2, &quit_item])?;

    TrayIconBuilder::with_id(ID)
        .icon(Image::from_bytes(include_bytes!("../icons/tray.png"))?)
        .tooltip("Stash")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                panel::toggle(tray.app_handle());
            }
        })
        .on_menu_event(|app, event| match event.id().as_ref() {
            "open" => panel::show(app),
            "settings" => {
                panel::show(app);
                let app = app.clone();
                tauri::async_runtime::spawn(async move {
                    // Let the panel mount before navigating.
                    tokio::time::sleep(Duration::from_millis(150)).await;
                    let _ = app.emit("navigate-settings", ());
                });
            }
            "updates" => {
                let app = app.clone();
                tauri::async_runtime::spawn(async move {
                    if updater::has_pending(&app) {
                        updater::install(&app);
                    } else {
                        updater::check(&app, true).await;
                    }
                });
            }
            "quit" => quit(app),
            _ => {}
        })
        .build(app)?;
    Ok(())
}

/// Quit, installing a downloaded update on the way out.
pub fn quit(app: &AppHandle) {
    if updater::has_pending(app) {
        updater::install(app);
    }
    app.exit(0);
}
