//! Stash — a file shelf in the Windows system tray.

pub mod commands;
pub mod db;
pub mod files;
pub mod hotkey;
pub mod i18n;
pub mod models;
pub mod panel;
pub mod state;
pub mod transfer;
pub mod tray;
pub mod updater;
pub mod win;

use tauri::{Manager, RunEvent, WindowEvent};
use tauri_plugin_log::{RotationStrategy, Target, TargetKind};

use crate::state::AppState;

pub fn run() {
    let data_dir = state::data_dir();
    let _ = std::fs::create_dir_all(&data_dir);

    let mut log_targets = vec![Target::new(TargetKind::Folder {
        path: data_dir.join("logs"),
        file_name: Some("main".into()),
    })];
    if cfg!(debug_assertions) {
        log_targets.push(Target::new(TargetKind::Stdout));
    }

    std::panic::set_hook(Box::new(|info| {
        log::error!("panic: {info}");
    }));

    let app = tauri::Builder::default()
        // Must be first: a second launch only brings up the running panel.
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            panel::show(app);
        }))
        .plugin(
            tauri_plugin_log::Builder::new()
                .targets(log_targets)
                .level(log::LevelFilter::Info)
                .max_file_size(2 * 1024 * 1024)
                .rotation_strategy(RotationStrategy::KeepOne)
                .build(),
        )
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(move |app| {
            log::info!(
                "[stash] v{} starting (tauri {})",
                app.package_info().version,
                tauri::VERSION
            );
            let language = i18n::system_language();
            let conn = db::open(&data_dir.join("stash.db"), language)?;
            let settings = db::get_settings(&conn, language)?;
            app.manage(AppState::new(conn, data_dir.clone(), language));

            let handle = app.handle();
            tray::create(handle)?;
            hotkey::reregister(handle, &settings.open_hotkey);
            commands::sync_autostart(handle, settings.start_with_windows);
            updater::schedule_startup_check(handle);
            // Silent launch: the panel stays hidden until tray click / hotkey.
            // (End-to-end tests ask for it to be shown right away.)
            if std::env::var_os("STASH_SHOW_ON_START").is_some() {
                panel::show(handle);
            }
            log::info!("[stash] ready");
            Ok(())
        })
        .on_window_event(|window, event| match event {
            WindowEvent::CloseRequested { api, .. } => {
                api.prevent_close();
                panel::hide(window.app_handle());
            }
            WindowEvent::Focused(true) => panel::on_focus(window.app_handle()),
            _ => {}
        })
        .invoke_handler(tauri::generate_handler![
            commands::hide_panel,
            commands::set_pinned,
            commands::is_pinned,
            commands::list_files,
            commands::add_files,
            commands::remove_files,
            commands::clear_missing_files,
            commands::pin_files,
            commands::move_file,
            commands::open_file,
            commands::reveal_file,
            commands::copy_path,
            commands::show_properties,
            commands::file_icon,
            commands::file_preview,
            commands::start_drag,
            commands::list_shelves,
            commands::create_shelf,
            commands::rename_shelf,
            commands::delete_shelf,
            commands::get_stats,
            commands::get_settings,
            commands::set_settings,
            commands::app_version,
            commands::open_releases,
            commands::open_logs_folder,
            commands::export_data,
            commands::import_data,
            commands::check_for_updates,
            commands::install_update,
            commands::update_status,
        ])
        .build(tauri::generate_context!())
        .expect("failed to build Stash");

    app.run(|_app, event| {
        // Stay alive in the tray when the panel is closed; app.exit(code)
        // (tray → Quit) still exits.
        if let RunEvent::ExitRequested { api, code: None, .. } = event {
            api.prevent_exit();
        }
    });
}
