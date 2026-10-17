//! Wedge — a file shelf on the edge of the screen.

pub mod actions;
pub mod commands;
pub mod commands_extra;
pub mod db;
pub mod dragdrop;
pub mod dragout;
pub mod dragwatch;
pub mod files;
pub mod hotkey;
pub mod i18n;
pub mod models;
pub mod panel;
pub mod phone;
pub mod services;
pub mod shared;
pub mod shell;
pub mod state;
#[cfg(feature = "store")]
pub mod store;
pub mod textract;
pub mod transfer;
pub mod tray;
pub mod updater;
pub mod watchdog;
pub mod widget;
pub mod win;

use tauri::{Manager, RunEvent, WindowEvent};
use tauri_plugin_log::{RotationStrategy, Target, TargetKind};

use crate::state::AppState;

/// Files sent from Explorer's context menu. With several files selected,
/// Explorer may start one process per file; batch them briefly so the user
/// gets one confirmation.
fn add_from_explorer(app: &tauri::AppHandle, paths: Vec<String>) {
    use std::sync::{Mutex, OnceLock};
    static PENDING: OnceLock<Mutex<Vec<String>>> = OnceLock::new();
    let pending = PENDING.get_or_init(|| Mutex::new(Vec::new()));
    let first = {
        let mut list = pending.lock().unwrap_or_else(|e| e.into_inner());
        let first = list.is_empty();
        list.extend(paths);
        first
    };
    if !first {
        return;
    }
    let app = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_millis(400));
        let batch = std::mem::take(&mut *pending.lock().unwrap_or_else(|e| e.into_inner()));
        let state = app.state::<AppState>();
        let (target, notify) = {
            let conn = state.db();
            match db::get_settings(&conn, state.language) {
                Ok(s) => (
                    db::manual_shelf(&conn, &s.last_shelf_id, &s.default_shelf_id).ok(),
                    s.notifications,
                ),
                Err(_) => (None, true),
            }
        };
        let Some(change) = services::ingest(&app, &batch, "manual", target.as_deref()) else {
            return;
        };
        let visible = panel::is_open();
        if change.added > 0 && notify && !visible {
            use tauri_plugin_notification::NotificationExt;
            let _ = app
                .notification()
                .builder()
                .title("Wedge")
                .body(i18n::files_added(
                    state.language,
                    change.added,
                    &change.shelf_name,
                ))
                .show();
        }
    });
}

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
        .plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            // "Add to Wedge" from Explorer launches us with --add <path>.
            let paths = shell::paths_from_args(&argv);
            if paths.is_empty() {
                panel::show(app);
            } else {
                add_from_explorer(app, paths);
            }
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
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(move |app| {
            log::info!(
                "[wedge] v{} starting (tauri {})",
                app.package_info().version,
                tauri::VERSION
            );
            let language = i18n::system_language();
            let conn = db::open(&data_dir.join("stash.db"), language)?;
            if let Some(old) = state::old_data_dir().filter(|old| *old != data_dir) {
                match db::rebase_paths(&conn, &old, &data_dir) {
                    Ok(0) => {}
                    Ok(n) => log::info!(
                        "[wedge] {n} files followed the data folder to {}",
                        data_dir.display()
                    ),
                    Err(e) => log::warn!("[wedge] moving file paths: {e}"),
                }
            }
            {
                // The pocket: a tab at the top of the edge that holds files for later.
                let (name, icon, color) = i18n::kind_shelf(language, "pocket");
                db::ensure_kind_shelf(&conn, "pocket", name, icon, color)?;
            }
            let settings = db::get_settings(&conn, language)?;
            services::announce_changes(app.handle(), &conn);
            app.manage(AppState::new(conn, data_dir.clone(), language));

            let handle = app.handle();
            if let Some(panel) = panel::window(handle) {
                dragdrop::attach(&panel);
            }
            tray::create(handle)?;
            // Explorer's menu and starting with Windows change the person's
            // Windows: only once they agreed on the welcome screen.
            if settings.onboarding_done {
                commands::sync_context_menu(handle, settings.context_menu);
                // The package's startup task starts out off, also when the
                // settings came from a Wedge installed from GitHub.
                #[cfg(feature = "store")]
                {
                    let handle = handle.clone();
                    let enabled = settings.start_with_windows;
                    std::thread::spawn(move || commands::sync_autostart(&handle, enabled));
                }
            }
            watchdog::start(handle);
            panel::prepare(handle);
            panel::apply_placement(handle, &settings.edge_monitor, settings.edge_align);
            panel::apply_auto_hide(handle, settings.edge_auto_hide);
            panel::apply_side(handle, settings.edge_handle);
            panel::start_monitor(handle);
            dragwatch::start(handle);
            let launch_paths = shell::paths_from_args(&std::env::args().collect::<Vec<_>>());
            if !launch_paths.is_empty() {
                add_from_explorer(handle, launch_paths);
            }
            if !hotkey::reregister(handle, &settings.open_hotkey) && settings.notifications {
                // Another app owns the shortcut; tell the user instead of failing silently.
                use tauri_plugin_notification::NotificationExt;
                let _ = handle
                    .notification()
                    .builder()
                    .title("Wedge")
                    .body(i18n::strings(language).hotkey_taken)
                    .show();
            }
            if settings.onboarding_done {
                commands::sync_autostart(handle, settings.start_with_windows);
            }
            updater::schedule_startup_check(handle);
            services::restart_watchers(handle);
            services::start_background_jobs(handle);
            shared::restart_watcher(handle);
            {
                let handle = handle.clone();
                std::thread::spawn(move || shared::refresh(&handle, None));
            }
            // The edge handle and widgets are created when the panel's page
            // reports in (`app_ready`): a second webview started while the
            // panel's is still starting never finishes loading.
            // Silent launch: the panel stays hidden until tray click / hotkey.
            // (End-to-end tests ask for it to be shown right away.)
            if std::env::var_os("STASH_SHOW_ON_START").is_some() {
                panel::show(handle);
            }
            log::info!("[wedge] ready");
            Ok(())
        })
        .on_window_event(|window, event| {
            let is_panel = window.label() == panel::LABEL;
            match event {
                WindowEvent::CloseRequested { api, .. } => {
                    api.prevent_close();
                    if is_panel {
                        panel::hide(window.app_handle());
                    } else {
                        let _ = window.hide();
                    }
                }
                WindowEvent::Focused(true) if is_panel => panel::on_focus(window.app_handle()),
                WindowEvent::Moved(pos) => {
                    widget::on_moved(window.app_handle(), window.label(), pos.x, pos.y)
                }
                _ => {}
            }
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
            commands::open_shelf_folder,
            commands::copy_path,
            commands::show_properties,
            commands::file_icon,
            commands::file_preview,
            commands::start_drag,
            commands::list_shelves,
            commands::create_shelf,
            commands::rename_shelf,
            commands::delete_shelf,
            commands::create_shared_shelf,
            commands::set_shelf_style,
            commands::get_stats,
            commands::get_settings,
            commands::set_settings,
            commands::app_version,
            commands::app_ready,
            commands::open_releases,
            commands::open_logs_folder,
            commands::quit_app,
            commands::export_data,
            commands::import_data,
            commands::check_for_updates,
            commands::install_update,
            commands::update_status,
            commands_extra::set_file_note,
            commands_extra::set_reminder,
            commands_extra::set_shelf_expiry,
            commands_extra::list_rules,
            commands_extra::add_rule,
            commands_extra::delete_rule,
            commands_extra::search_content,
            commands_extra::zip_files,
            commands_extra::convert_images,
            commands_extra::shrink_images,
            commands_extra::collect_files,
            commands_extra::copy_paths,
            commands_extra::open_files,
            commands_extra::start_drag_zip,
            commands_extra::paste_clipboard,
            commands_extra::save_clip,
            commands_extra::quick_look,
            commands_extra::pick_folder,
            panel::edge_state,
            panel::edge_mode,
            panel::edge_area,
            panel::list_monitors,
            phone::phone_start,
            phone::phone_stop,
            widget::open_widget,
            widget::close_widget,
        ])
        .build(tauri::generate_context!())
        .expect("failed to build Wedge");

    app.run(|_app, event| {
        // Stay alive in the tray when the panel is closed; app.exit(code)
        // (tray → Quit) still exits.
        if let RunEvent::ExitRequested {
            api, code: None, ..
        } = event
        {
            api.prevent_exit();
        }
    });
}
