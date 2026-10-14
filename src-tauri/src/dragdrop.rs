//! Files dropped from Explorer, read through WebView2's own drop handling.
//!
//! Tauri's drop handler registers OLE drop targets on the webview's child
//! windows once, when the window is created; WebView2 recreates some of
//! those windows (in other processes), so drops onto windows opened later
//! were accepted only some of the time. Instead, the page handles the HTML
//! `drop` event itself and hands the dropped `File` objects to
//! `chrome.webview.postMessageWithAdditionalObjects("stash-drop:<json>")`;
//! WebView2 turns them into `ICoreWebView2File`s that carry the real path.
//! The paths go back to the page as a `stash-drop-paths` event with the
//! same JSON, so the page knows where the files were dropped.

use serde::Serialize;
use tauri::{Emitter, EventTarget, Manager, WebviewWindow};

pub const MESSAGE_PREFIX: &str = "stash-drop:";
pub const EVENT: &str = "stash-drop-paths";

#[derive(Serialize, Clone)]
struct Dropped {
    /// What the page sent with the files (drop position, target).
    info: serde_json::Value,
    paths: Vec<String>,
}

/// The JSON after the prefix, if `message` is one of ours.
fn parse(message: &str) -> Option<serde_json::Value> {
    let json = message.strip_prefix(MESSAGE_PREFIX)?;
    serde_json::from_str(json).ok()
}

/// Let `window` receive file drops. Call once per window, after creating it.
pub fn attach(window: &WebviewWindow) {
    #[cfg(windows)]
    {
        let label = window.label().to_string();
        let app = window.app_handle().clone();
        let result = window.with_webview(move |pw| {
            if let Err(e) = imp::listen(pw.controller(), move |info, paths| {
                let _ = app.emit_to(
                    EventTarget::webview_window(&label),
                    EVENT,
                    Dropped { info, paths },
                );
            }) {
                log::error!("drop handler: {e}");
            }
        });
        if let Err(e) = result {
            log::error!("drop handler: {e}");
        }
    }
}

#[cfg(windows)]
mod imp {
    use webview2_com::Microsoft::Web::WebView2::Win32::{
        ICoreWebView2Controller, ICoreWebView2Controller4, ICoreWebView2File,
        ICoreWebView2FileSystemHandle, ICoreWebView2WebMessageReceivedEventArgs2,
    };
    use webview2_com::{take_pwstr, WebMessageReceivedEventHandler};
    use windows::core::{Interface, PWSTR};

    pub fn listen(
        controller: ICoreWebView2Controller,
        on_drop: impl Fn(serde_json::Value, Vec<String>) + 'static,
    ) -> windows::core::Result<()> {
        unsafe {
            // WebView2 must take the drop itself (Tauri turns this off when
            // its own handler is enabled).
            if let Ok(c4) = controller.cast::<ICoreWebView2Controller4>() {
                c4.SetAllowExternalDrop(true)?;
            }
            let webview = controller.CoreWebView2()?;
            let handler = WebMessageReceivedEventHandler::create(Box::new(move |_, args| {
                let Some(args) = args else { return Ok(()) };
                let mut raw = PWSTR::null();
                // Fails for non-string messages, which aren't ours.
                if args.TryGetWebMessageAsString(&mut raw).is_err() {
                    return Ok(());
                }
                let Some(info) = super::parse(&take_pwstr(raw)) else {
                    return Ok(());
                };
                let paths = match args.cast::<ICoreWebView2WebMessageReceivedEventArgs2>() {
                    Ok(args) => paths(&args),
                    Err(_) => Vec::new(),
                };
                if !paths.is_empty() {
                    on_drop(info, paths);
                }
                Ok(())
            }));
            let mut token = 0i64;
            webview.add_WebMessageReceived(&handler, &mut token)?;
        }
        Ok(())
    }

    /// Paths of the `File` / `FileSystemHandle` objects sent with the message.
    unsafe fn paths(args: &ICoreWebView2WebMessageReceivedEventArgs2) -> Vec<String> {
        let mut out = Vec::new();
        let Ok(objects) = (unsafe { args.AdditionalObjects() }) else {
            return out;
        };
        let mut count = 0u32;
        if unsafe { objects.Count(&mut count) }.is_err() {
            return out;
        }
        for i in 0..count {
            let Ok(object) = (unsafe { objects.GetValueAtIndex(i) }) else {
                continue;
            };
            let mut raw = PWSTR::null();
            let ok = if let Ok(file) = object.cast::<ICoreWebView2File>() {
                unsafe { file.Path(&mut raw) }.is_ok()
            } else if let Ok(handle) = object.cast::<ICoreWebView2FileSystemHandle>() {
                unsafe { handle.Path(&mut raw) }.is_ok()
            } else {
                false
            };
            if ok {
                let path = take_pwstr(raw);
                if !path.is_empty() && !out.contains(&path) {
                    out.push(path);
                }
            }
        }
        out
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_prefixed_json_messages_are_drops() {
        assert_eq!(
            parse(r#"stash-drop:{"x":1,"y":2}"#),
            Some(serde_json::json!({"x":1,"y":2}))
        );
        assert_eq!(parse(r#"{"cmd":"list_files"}"#), None);
        assert_eq!(parse("stash-drop:not json"), None);
    }
}
