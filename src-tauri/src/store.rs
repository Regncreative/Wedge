//! The Microsoft Store build (`--features store`), packaged as MSIX. A package
//! changes a few things: the Store installs updates, Windows starts the app
//! through the package's startup task (a Run key written from inside a
//! package goes nowhere), and data lives in the package's LocalState, a real
//! folder that File Explorer can open (%APPDATA% is redirected).

use std::path::{Path, PathBuf};

use windows::core::HSTRING;
use windows::ApplicationModel::{StartupTask, StartupTaskState};
use windows::Storage::ApplicationData;

/// Must match the TaskId in the package manifest (msix/AppxManifest.xml).
const STARTUP_TASK: &str = "WedgeStartup";
/// The context-menu entry is declared by the package and always present; the
/// Explorer extension (msix/shell-ext) only shows it while this file exists in
/// the data folder, so nothing appears before the user agreed.
const CONTEXT_MENU_ON: &str = "context-menu-on";

fn local_state() -> Option<PathBuf> {
    let folder = ApplicationData::Current().ok()?.LocalFolder().ok()?;
    Some(PathBuf::from(folder.Path().ok()?.to_string()))
}

/// The package's LocalState. On the first start it takes over the data of a
/// Wedge installed outside the Store (copied, so that install keeps working).
pub fn data_dir(app_data: &Path) -> Option<PathBuf> {
    let dir = local_state()?;
    if !dir.join("stash.db").exists() {
        let old = app_data.join("Wedge");
        if old.join("stash.db").exists() {
            if let Err(e) = copy_dir(&old, &dir) {
                log::warn!("[wedge] copying data from {}: {e}", old.display());
            }
        }
    }
    Some(dir)
}

fn copy_dir(from: &Path, to: &Path) -> std::io::Result<()> {
    std::fs::create_dir_all(to)?;
    for entry in std::fs::read_dir(from)? {
        let entry = entry?;
        let target = to.join(entry.file_name());
        if entry.file_type()?.is_dir() {
            // WebView2's own profile is rebuilt; logs start over.
            if entry.file_name() != "EBWebView" && entry.file_name() != "logs" {
                copy_dir(&entry.path(), &target)?;
            }
        } else {
            std::fs::copy(entry.path(), &target)?;
        }
    }
    Ok(())
}

/// Turn "start with Windows" on or off. Windows asks nothing for a full-trust
/// app; if the user switched it off in Task Manager, enabling does nothing.
pub fn set_startup_task(enabled: bool) -> windows::core::Result<()> {
    let task = StartupTask::GetAsync(&HSTRING::from(STARTUP_TASK))?.join()?;
    match (enabled, task.State()?) {
        (true, StartupTaskState::Disabled) => {
            task.RequestEnableAsync()?.join()?;
        }
        (false, StartupTaskState::Enabled) => task.Disable()?,
        _ => {}
    }
    Ok(())
}

pub fn set_context_menu(data_dir: &Path, enabled: bool) -> std::io::Result<()> {
    let flag = data_dir.join(CONTEXT_MENU_ON);
    if enabled {
        std::fs::write(flag, b"")
    } else {
        match std::fs::remove_file(flag) {
            Err(e) if e.kind() != std::io::ErrorKind::NotFound => Err(e),
            _ => Ok(()),
        }
    }
}

pub fn context_menu_registered(data_dir: &Path) -> bool {
    data_dir.join(CONTEXT_MENU_ON).exists()
}
