//! Windows shell integration: file icons, thumbnails and the Properties sheet.

use std::sync::{mpsc, Mutex, OnceLock};
use std::time::Duration;

use base64::Engine;

type Rgba = (u32, u32, Vec<u8>);
type Job = (String, i32, bool, mpsc::Sender<Option<Rgba>>);

/// The shell's icon/thumbnail extraction misbehaves when called from many
/// threads at once (most calls fail), so it runs on long-lived
/// single-threaded-apartment workers, one request at a time: one for icons
/// and one for thumbnails, so a slow thumbnail (a long video, a file still
/// in the cloud) never holds up icons.
fn worker(thumbnails: bool) -> Option<mpsc::Sender<Job>> {
    static ICONS: OnceLock<Mutex<mpsc::Sender<Job>>> = OnceLock::new();
    static THUMBNAILS: OnceLock<Mutex<mpsc::Sender<Job>>> = OnceLock::new();
    let (cell, name) = if thumbnails {
        (&THUMBNAILS, "shell-thumbnails")
    } else {
        (&ICONS, "shell-icons")
    };
    let sender = cell.get_or_init(|| {
        let (tx, rx) = mpsc::channel::<Job>();
        let spawned = std::thread::Builder::new()
            .name(name.into())
            .spawn(move || {
                imp::init_sta();
                for (path, size, thumbnail, reply) in rx {
                    let _ = reply.send(imp::shell_image(&path, size, thumbnail));
                }
            });
        if let Err(e) = spawned {
            log::error!("shell image worker: {e}");
        }
        Mutex::new(tx)
    });
    sender.lock().ok().map(|s| s.clone())
}

/// PNG of the shell icon (`thumbnail = false`) or image thumbnail
/// (`thumbnail = true`) for a file, as Explorer would show it. Blocking.
pub fn shell_image_png(path: &str, size: i32, thumbnail: bool) -> Option<Vec<u8>> {
    shell_image_png_within(path, size, thumbnail, None)
}

/// [`shell_image_png`], giving up after `wait` (the request still finishes
/// in the background).
pub fn shell_image_png_within(
    path: &str,
    size: i32,
    thumbnail: bool,
    wait: Option<Duration>,
) -> Option<Vec<u8>> {
    let (reply, response) = mpsc::channel();
    worker(thumbnail)?
        .send((path.to_owned(), size, thumbnail, reply))
        .ok()?;
    let (width, height, rgba) = match wait {
        Some(wait) => response.recv_timeout(wait).ok()??,
        None => response.recv().ok()??,
    };
    let mut png_bytes = Vec::new();
    {
        let mut encoder = png::Encoder::new(&mut png_bytes, width, height);
        encoder.set_color(png::ColorType::Rgba);
        encoder.set_depth(png::BitDepth::Eight);
        let mut writer = encoder.write_header().ok()?;
        writer.write_image_data(&rgba).ok()?;
    }
    Some(png_bytes)
}

/// Same as [`shell_image_png`], as a data URL for an `<img>`.
pub fn shell_image_data_url(path: &str, size: i32, thumbnail: bool) -> Option<String> {
    let png_bytes = shell_image_png(path, size, thumbnail)?;
    Some(format!(
        "data:image/png;base64,{}",
        base64::engine::general_purpose::STANDARD.encode(png_bytes)
    ))
}

/// Open Explorer's Properties sheet for a file. Must run on the UI thread.
pub fn show_properties(path: &str) -> bool {
    imp::show_properties(path)
}

/// The primary mouse button is held down right now. Asked only when one of
/// Wedge's own drags is about to start: one started after the button was
/// let go would drop at once, wherever the cursor happens to be.
#[cfg(windows)]
pub fn primary_button_down() -> bool {
    use windows::Win32::UI::Input::KeyboardAndMouse::{GetAsyncKeyState, VK_LBUTTON, VK_RBUTTON};
    use windows::Win32::UI::WindowsAndMessaging::{GetSystemMetrics, SM_SWAPBUTTON};
    unsafe {
        let key = if GetSystemMetrics(SM_SWAPBUTTON) != 0 {
            VK_RBUTTON
        } else {
            VK_LBUTTON
        };
        (GetAsyncKeyState(key.0 as i32) as u16 & 0x8000) != 0
    }
}

#[cfg(not(windows))]
pub fn primary_button_down() -> bool {
    true
}

/// A file that is only a placeholder for one in the cloud (OneDrive,
/// Google Drive, Dropbox online-only): reading it would download it.
#[cfg(windows)]
fn in_the_cloud(path: &str) -> bool {
    use std::os::windows::fs::MetadataExt;
    const OFFLINE: u32 = 0x1000;
    const RECALL_ON_OPEN: u32 = 0x40000;
    const RECALL_ON_DATA_ACCESS: u32 = 0x40_0000;
    std::fs::symlink_metadata(path)
        .map(|m| m.file_attributes() & (OFFLINE | RECALL_ON_OPEN | RECALL_ON_DATA_ACCESS) != 0)
        .unwrap_or(false)
}

/// Convert premultiplied BGRA (what GDI returns) to straight RGBA.
pub fn bgra_premultiplied_to_rgba(mut px: Vec<u8>) -> Vec<u8> {
    // Bitmaps without an alpha channel come back fully transparent.
    let has_alpha = px.as_chunks::<4>().0.iter().any(|p| p[3] != 0);
    for p in px.as_chunks_mut::<4>().0 {
        let (b, g, r, a) = (p[0], p[1], p[2], p[3]);
        if !has_alpha {
            p.copy_from_slice(&[r, g, b, 255]);
        } else if a == 0 {
            p.copy_from_slice(&[0, 0, 0, 0]);
        } else {
            let un = |c: u8| ((c as u32 * 255 + a as u32 / 2) / a as u32).min(255) as u8;
            p.copy_from_slice(&[un(r), un(g), un(b), a]);
        }
    }
    px
}

#[cfg(windows)]
mod imp {
    use std::ffi::c_void;

    use windows::core::{w, HSTRING, PCWSTR};
    use windows::Win32::Foundation::SIZE;
    use windows::Win32::Graphics::Gdi::{
        DeleteObject, GetDC, GetDIBits, GetObjectW, ReleaseDC, BITMAP, BITMAPINFO,
        BITMAPINFOHEADER, BI_RGB, DIB_RGB_COLORS, HGDIOBJ,
    };
    use windows::Win32::System::Com::{CoInitializeEx, COINIT_APARTMENTTHREADED};
    use windows::Win32::UI::Shell::{
        IShellItemImageFactory, SHCreateItemFromParsingName, ShellExecuteExW,
        SEE_MASK_INVOKEIDLIST, SHELLEXECUTEINFOW, SIIGBF_BIGGERSIZEOK, SIIGBF_ICONONLY,
        SIIGBF_INCACHEONLY, SIIGBF_RESIZETOFIT, SIIGBF_THUMBNAILONLY,
    };
    use windows::Win32::UI::WindowsAndMessaging::SW_SHOW;

    /// Called once on the worker thread, which lives for the whole session.
    pub fn init_sta() {
        unsafe {
            let _ = CoInitializeEx(None, COINIT_APARTMENTTHREADED);
        }
    }

    pub fn shell_image(path: &str, size: i32, thumbnail: bool) -> Option<super::Rgba> {
        unsafe {
            let factory: IShellItemImageFactory =
                SHCreateItemFromParsingName(&HSTRING::from(path), None).ok()?;
            let flags = if thumbnail {
                // A file still in the cloud: only a thumbnail Windows already
                // has; making one would download the file (or hang offline).
                let cached = if super::in_the_cloud(path) {
                    SIIGBF_INCACHEONLY
                } else {
                    Default::default()
                };
                SIIGBF_THUMBNAILONLY | SIIGBF_RESIZETOFIT | cached
            } else {
                SIIGBF_ICONONLY | SIIGBF_BIGGERSIZEOK
            };
            let hbmp = factory.GetImage(SIZE { cx: size, cy: size }, flags).ok()?;

            let mut bm = BITMAP::default();
            let got = GetObjectW(
                HGDIOBJ(hbmp.0),
                std::mem::size_of::<BITMAP>() as i32,
                Some(&mut bm as *mut _ as *mut c_void),
            );
            let result = if got == 0 || bm.bmWidth <= 0 || bm.bmHeight <= 0 {
                None
            } else {
                let (w, h) = (bm.bmWidth, bm.bmHeight);
                let mut info = BITMAPINFO {
                    bmiHeader: BITMAPINFOHEADER {
                        biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
                        biWidth: w,
                        biHeight: -h, // top-down rows
                        biPlanes: 1,
                        biBitCount: 32,
                        biCompression: BI_RGB.0,
                        ..Default::default()
                    },
                    ..Default::default()
                };
                let mut buf = vec![0u8; (w * h * 4) as usize];
                let dc = GetDC(None);
                let lines = GetDIBits(
                    dc,
                    hbmp,
                    0,
                    h as u32,
                    Some(buf.as_mut_ptr() as *mut c_void),
                    &mut info,
                    DIB_RGB_COLORS,
                );
                ReleaseDC(None, dc);
                (lines == h).then(|| (w as u32, h as u32, super::bgra_premultiplied_to_rgba(buf)))
            };
            let _ = DeleteObject(HGDIOBJ(hbmp.0));
            result
        }
    }

    pub fn show_properties(path: &str) -> bool {
        let file = HSTRING::from(path);
        let mut info = SHELLEXECUTEINFOW {
            cbSize: std::mem::size_of::<SHELLEXECUTEINFOW>() as u32,
            fMask: SEE_MASK_INVOKEIDLIST,
            lpVerb: w!("properties"),
            lpFile: PCWSTR(file.as_ptr()),
            nShow: SW_SHOW.0,
            ..Default::default()
        };
        unsafe { ShellExecuteExW(&mut info).is_ok() }
    }
}

#[cfg(not(windows))]
mod imp {
    pub fn init_sta() {}
    pub fn shell_image(_: &str, _: i32, _: bool) -> Option<super::Rgba> {
        None
    }
    pub fn show_properties(_: &str) -> bool {
        false
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn unpremultiplies_and_swaps_channels() {
        // BGRA premultiplied: half-transparent pure red → r=128 stored, a=128.
        let px = bgra_premultiplied_to_rgba(vec![0, 0, 128, 128, 0, 0, 0, 0]);
        assert_eq!(px, [255, 0, 0, 128, 0, 0, 0, 0]);
    }

    #[test]
    fn treats_alphaless_bitmaps_as_opaque() {
        let px = bgra_premultiplied_to_rgba(vec![10, 20, 30, 0]);
        assert_eq!(px, [30, 20, 10, 255]);
    }

    #[cfg(windows)]
    #[test]
    fn renders_icons_concurrently() {
        let dir = tempfile::tempdir().unwrap();
        let paths: Vec<String> = [
            "a.mp3", "b.png", "c.png", "d.txt", "e.pdf", "f.zip", "g.svg", "h.docx",
        ]
        .iter()
        .map(|n| {
            let p = dir.path().join(n);
            std::fs::write(&p, b"x").unwrap();
            p.to_string_lossy().into_owned()
        })
        .collect();
        let handles: Vec<_> = paths
            .iter()
            .cloned()
            .map(|p| std::thread::spawn(move || (shell_image_png(&p, 48, false).is_some(), p)))
            .collect();
        let failed: Vec<String> = handles
            .into_iter()
            .map(|h| h.join().unwrap())
            .filter(|(ok, _)| !ok)
            .map(|(_, p)| p)
            .collect();
        assert!(failed.is_empty(), "no icon for {failed:?}");
    }

    #[cfg(windows)]
    #[test]
    fn renders_a_real_shell_icon() {
        let dir = tempfile::tempdir().unwrap();
        let f = dir.path().join("note.txt");
        std::fs::write(&f, b"x").unwrap();
        let url = shell_image_data_url(f.to_str().unwrap(), 48, false).expect("icon");
        assert!(url.starts_with("data:image/png;base64,"));
    }
}
