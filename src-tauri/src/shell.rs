//! Explorer integration: the "Add to Stash" context-menu entry, files on the
//! clipboard, and filling a path into an Open/Save dialog.

/// Paths passed as `stash.exe --add <path>...` (Explorer's context menu).
pub fn paths_from_args(args: &[String]) -> Vec<String> {
    let mut out = Vec::new();
    let mut collecting = false;
    for arg in args {
        if arg == "--add" {
            collecting = true;
        } else if arg.starts_with("--") {
            collecting = false;
        } else if collecting && !arg.trim().is_empty() {
            out.push(arg.trim_matches('"').to_string());
        }
    }
    out
}

/// Text to put into a file dialog's name box: one path as is, several quoted.
pub fn dialog_text(paths: &[String]) -> String {
    match paths {
        [one] => one.clone(),
        many => many
            .iter()
            .map(|p| format!("\"{p}\""))
            .collect::<Vec<_>>()
            .join(" "),
    }
}

#[cfg(windows)]
mod imp {
    use std::path::Path;

    use windows::core::{w, HSTRING, PCWSTR};
    use windows::Win32::Foundation::{HWND, LPARAM, WPARAM};
    use windows::Win32::System::DataExchange::{CloseClipboard, GetClipboardData, OpenClipboard};
    use windows::Win32::System::Ole::CF_HDROP;
    use windows::Win32::UI::Shell::{DragQueryFileW, HDROP};
    use windows::Win32::UI::WindowsAndMessaging::{
        FindWindowExW, GetClassNameW, GetDlgItem, GetForegroundWindow, SendMessageW, WM_SETTEXT,
    };
    use winreg::enums::HKEY_CURRENT_USER;
    use winreg::RegKey;

    const KEYS: [&str; 2] = [
        r"Software\Classes\*\shell\Stash",
        r"Software\Classes\Directory\shell\Stash",
    ];

    pub fn set_context_menu(enabled: bool, label: &str, exe: &Path) -> std::io::Result<()> {
        let hkcu = RegKey::predef(HKEY_CURRENT_USER);
        for key in KEYS {
            if !enabled {
                let _ = hkcu.delete_subkey_all(key);
                continue;
            }
            let (verb, _) = hkcu.create_subkey(key)?;
            verb.set_value("", &label)?;
            verb.set_value("Icon", &format!("\"{}\",0", exe.display()))?;
            // Several selected files are passed to one process.
            verb.set_value("MultiSelectModel", &"Player")?;
            let (command, _) = verb.create_subkey("command")?;
            command.set_value("", &format!("\"{}\" --add \"%1\"", exe.display()))?;
        }
        Ok(())
    }

    pub fn context_menu_registered() -> bool {
        RegKey::predef(HKEY_CURRENT_USER)
            .open_subkey(KEYS[0])
            .is_ok()
    }

    /// Files copied in Explorer (Ctrl+C), if any.
    pub fn clipboard_files() -> Vec<String> {
        let mut out = Vec::new();
        unsafe {
            if OpenClipboard(None).is_err() {
                return out;
            }
            if let Ok(handle) = GetClipboardData(CF_HDROP.0 as u32) {
                let drop = HDROP(handle.0);
                let count = DragQueryFileW(drop, u32::MAX, None);
                for i in 0..count {
                    let len = DragQueryFileW(drop, i, None) as usize;
                    let mut buf = vec![0u16; len + 1];
                    DragQueryFileW(drop, i, Some(&mut buf));
                    out.push(String::from_utf16_lossy(&buf[..len]));
                }
            }
            let _ = CloseClipboard();
        }
        out
    }

    fn class_of(hwnd: HWND) -> String {
        let mut buf = [0u16; 64];
        let n = unsafe { GetClassNameW(hwnd, &mut buf) } as usize;
        String::from_utf16_lossy(&buf[..n])
    }

    /// Put `text` into the file name box of the focused Open/Save dialog.
    pub fn fill_file_dialog(text: &str) -> bool {
        unsafe {
            let dialog = GetForegroundWindow();
            if dialog.0.is_null() || class_of(dialog) != "#32770" {
                return false;
            }
            // The common file dialog's name box: ComboBoxEx32 (id 1148) → ComboBox → Edit,
            // or a plain Edit in older/Save variants.
            let Ok(combo) = GetDlgItem(Some(dialog), 0x47C) else {
                return false;
            };
            let inner = FindWindowExW(Some(combo), None, w!("ComboBox"), PCWSTR::null()).ok();
            let edit = inner
                .and_then(|cb| FindWindowExW(Some(cb), None, w!("Edit"), PCWSTR::null()).ok())
                .or_else(|| FindWindowExW(Some(combo), None, w!("Edit"), PCWSTR::null()).ok())
                .unwrap_or(combo);
            let wide = HSTRING::from(text);
            SendMessageW(
                edit,
                WM_SETTEXT,
                Some(WPARAM(0)),
                Some(LPARAM(wide.as_ptr() as isize)),
            );
            true
        }
    }
}

#[cfg(not(windows))]
mod imp {
    use std::path::Path;
    pub fn set_context_menu(_: bool, _: &str, _: &Path) -> std::io::Result<()> {
        Ok(())
    }
    pub fn context_menu_registered() -> bool {
        false
    }
    pub fn clipboard_files() -> Vec<String> {
        Vec::new()
    }
    pub fn fill_file_dialog(_: &str) -> bool {
        false
    }
}

pub use imp::{clipboard_files, context_menu_registered, fill_file_dialog, set_context_menu};

#[cfg(test)]
mod tests {
    use super::*;

    fn args(a: &[&str]) -> Vec<String> {
        a.iter().map(|s| s.to_string()).collect()
    }

    #[test]
    fn reads_paths_after_add() {
        assert_eq!(
            paths_from_args(&args(&["stash.exe", "--add", "C:\\a.pdf", "C:\\b c.txt"])),
            ["C:\\a.pdf", "C:\\b c.txt"]
        );
        assert!(paths_from_args(&args(&["stash.exe"])).is_empty());
        assert!(paths_from_args(&args(&["stash.exe", "C:\\stray.txt"])).is_empty());
        assert_eq!(
            paths_from_args(&args(&[
                "stash.exe",
                "--add",
                "\"C:\\q.txt\"",
                "--other",
                "x"
            ])),
            ["C:\\q.txt"]
        );
    }

    #[test]
    fn quotes_several_paths_for_a_file_dialog() {
        assert_eq!(dialog_text(&args(&["C:\\a b.txt"])), "C:\\a b.txt");
        assert_eq!(
            dialog_text(&args(&["C:\\a.txt", "C:\\b.txt"])),
            "\"C:\\a.txt\" \"C:\\b.txt\""
        );
    }

    #[cfg(windows)]
    #[test]
    fn registers_and_removes_the_context_menu() {
        // Uses the real HKCU key, so never touch an existing (installed) entry.
        if context_menu_registered() {
            return;
        }
        let exe = std::env::current_exe().unwrap();
        set_context_menu(true, "Add to Stash (test)", &exe).unwrap();
        assert!(context_menu_registered());
        set_context_menu(false, "", &exe).unwrap();
        assert!(!context_menu_registered());
    }
}
