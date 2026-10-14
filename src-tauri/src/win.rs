//! Windows shell integration: file icons, thumbnails and the Properties sheet.

use base64::Engine;

/// PNG of the shell icon (`thumbnail = false`) or image thumbnail
/// (`thumbnail = true`) for a file, as Explorer would show it. Blocking.
pub fn shell_image_png(path: &str, size: i32, thumbnail: bool) -> Option<Vec<u8>> {
    let (width, height, rgba) = imp::shell_image(path, size, thumbnail)?;
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
        DeleteObject, GetDC, GetDIBits, GetObjectW, ReleaseDC, BITMAP, BITMAPINFO, BITMAPINFOHEADER,
        BI_RGB, DIB_RGB_COLORS, HGDIOBJ,
    };
    use windows::Win32::System::Com::{CoInitializeEx, COINIT_APARTMENTTHREADED};
    use windows::Win32::UI::Shell::{
        IShellItemImageFactory, SHCreateItemFromParsingName, ShellExecuteExW, SEE_MASK_INVOKEIDLIST,
        SHELLEXECUTEINFOW, SIIGBF_BIGGERSIZEOK, SIIGBF_ICONONLY, SIIGBF_RESIZETOFIT,
        SIIGBF_THUMBNAILONLY,
    };
    use windows::Win32::UI::WindowsAndMessaging::SW_SHOW;

    pub fn shell_image(path: &str, size: i32, thumbnail: bool) -> Option<(u32, u32, Vec<u8>)> {
        unsafe {
            // Harmless if COM is already initialized on this thread.
            let _ = CoInitializeEx(None, COINIT_APARTMENTTHREADED);
            let factory: IShellItemImageFactory =
                SHCreateItemFromParsingName(&HSTRING::from(path), None).ok()?;
            let flags = if thumbnail {
                SIIGBF_THUMBNAILONLY | SIIGBF_RESIZETOFIT
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
    pub fn shell_image(_: &str, _: i32, _: bool) -> Option<(u32, u32, Vec<u8>)> {
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
    fn renders_a_real_shell_icon() {
        let dir = tempfile::tempdir().unwrap();
        let f = dir.path().join("note.txt");
        std::fs::write(&f, b"x").unwrap();
        let url = shell_image_data_url(f.to_str().unwrap(), 48, false).expect("icon");
        assert!(url.starts_with("data:image/png;base64,"));
    }
}
