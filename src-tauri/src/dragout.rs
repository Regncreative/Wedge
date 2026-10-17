//! Dragging files out of Wedge into other apps (OLE drag and drop).
//!
//! The files travel in the shell's own data object, as from File Explorer.
//! Copy and move are both allowed, as File Explorer allows them: some apps
//! (Steam's chat) refuse a drop they may only copy. "Preferred DropEffect"
//! asks for a copy, so File Explorer still copies unless Shift is held, and
//! Wedge never deletes anything after a move.
//!
//! Whether the files were taken: OLE's own answer isn't enough. Steam's chat
//! (Chromium) ends a drag it refused, with the no-drop cursor showing, as a
//! drop that took nothing, which used to empty the pocket; and a target may
//! take the files yet report no effect. So the cursor the target showed
//! last counts too: a drop over a target that showed it would take them.

use std::path::PathBuf;
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::Arc;

#[cfg(windows)]
pub use imp::drag_files;

#[cfg(not(windows))]
pub fn drag_files(_paths: &[PathBuf], _icon_png: &[u8]) -> Result<bool, String> {
    Ok(false)
}

/// Straight RGBA to the premultiplied BGRA a drag image bitmap takes.
fn to_premultiplied_bgra(rgba: &[u8]) -> Vec<u8> {
    let mut out = Vec::with_capacity(rgba.len());
    for &[r, g, b, a] in rgba.as_chunks::<4>().0 {
        let mul = |c: u8| ((c as u32 * a as u32 + 127) / 255) as u8;
        out.extend_from_slice(&[mul(b), mul(g), mul(r), a]);
    }
    out
}

#[cfg(windows)]
mod imp {
    use super::*;
    use std::mem::ManuallyDrop;
    use std::os::windows::ffi::OsStrExt;

    use windows::Win32::Foundation::{
        GlobalFree, COLORREF, DRAGDROP_S_CANCEL, DRAGDROP_S_DROP, DRAGDROP_S_USEDEFAULTCURSORS,
        POINT, SIZE,
    };
    use windows::Win32::Graphics::Gdi::{CreateBitmap, DeleteObject, HBITMAP};
    use windows::Win32::System::Com::{
        CoCreateInstance, IDataObject, CLSCTX_INPROC_SERVER, DVASPECT_CONTENT, FORMATETC,
        STGMEDIUM, STGMEDIUM_0, TYMED_HGLOBAL,
    };
    use windows::Win32::System::DataExchange::RegisterClipboardFormatW;
    use windows::Win32::System::Memory::{GlobalAlloc, GlobalLock, GlobalUnlock, GMEM_MOVEABLE};
    use windows::Win32::System::Ole::{
        DoDragDrop, IDropSource, IDropSource_Impl, OleInitialize, DROPEFFECT, DROPEFFECT_COPY,
        DROPEFFECT_LINK, DROPEFFECT_MOVE, DROPEFFECT_NONE,
    };
    use windows::Win32::System::SystemServices::{MK_LBUTTON, MODIFIERKEYS_FLAGS};
    use windows::Win32::UI::Shell::Common::ITEMIDLIST;
    use windows::Win32::UI::Shell::{
        BHID_DataObject, CLSID_DragDropHelper, IDragSourceHelper, ILCreateFromPathW, ILFree,
        SHCreateShellItemArrayFromIDLists, SHDRAGIMAGE,
    };
    use windows_core::{implement, w, BOOL, HRESULT, PCWSTR};

    /// Ends the drag on Escape (cancel) or when the left button comes up
    /// (drop), and remembers the effect the target under the cursor showed.
    #[implement(IDropSource)]
    struct Source {
        shown: Arc<AtomicU32>,
    }

    impl IDropSource_Impl for Source_Impl {
        fn QueryContinueDrag(&self, escape: BOOL, keys: MODIFIERKEYS_FLAGS) -> HRESULT {
            if escape.as_bool() {
                DRAGDROP_S_CANCEL
            } else if keys & MK_LBUTTON == MODIFIERKEYS_FLAGS(0) {
                DRAGDROP_S_DROP
            } else {
                HRESULT(0)
            }
        }

        fn GiveFeedback(&self, effect: DROPEFFECT) -> HRESULT {
            self.shown.store(effect.0, Ordering::SeqCst);
            DRAGDROP_S_USEDEFAULTCURSORS
        }
    }

    /// Drag `paths` with `icon_png` under the cursor until the drag ends;
    /// whether a target took them. Runs on the UI thread (OLE needs it).
    pub fn drag_files(paths: &[PathBuf], icon_png: &[u8]) -> Result<bool, String> {
        unsafe {
            let _ = OleInitialize(None);
            let data = data_object(paths).map_err(|e| e.to_string())?;
            prefer_copy(&data);
            set_image(&data, icon_png);
            let shown = Arc::new(AtomicU32::new(DROPEFFECT_NONE.0));
            let source: IDropSource = Source {
                shown: shown.clone(),
            }
            .into();
            let mut effect = DROPEFFECT_NONE;
            let hr = DoDragDrop(
                &data,
                &source,
                DROPEFFECT_COPY | DROPEFFECT_MOVE,
                &mut effect,
            );
            let shown = DROPEFFECT(shown.load(Ordering::SeqCst));
            let taken = took(hr, effect, shown);
            log::info!(
                "[drag] {} file(s): {}, effect {}, last shown {} -> {}",
                paths.len(),
                if hr == DRAGDROP_S_DROP {
                    "dropped"
                } else {
                    "cancelled"
                },
                effect.0,
                shown.0,
                if taken { "taken" } else { "not taken" }
            );
            Ok(taken)
        }
    }

    /// Dropped over a target that took the files, or showed it would. The
    /// scroll bit (DROPEFFECT_SCROLL) only says the target can scroll.
    pub(super) fn took(hr: HRESULT, effect: DROPEFFECT, shown: DROPEFFECT) -> bool {
        let any =
            |e: DROPEFFECT| e.0 & (DROPEFFECT_COPY | DROPEFFECT_MOVE | DROPEFFECT_LINK).0 != 0;
        hr == DRAGDROP_S_DROP && (any(effect) || any(shown))
    }

    /// The shell's data object for the files: what File Explorer drags.
    unsafe fn data_object(paths: &[PathBuf]) -> windows_core::Result<IDataObject> {
        let ids: Vec<*mut ITEMIDLIST> = paths
            .iter()
            .map(|p| {
                let wide: Vec<u16> = p.as_os_str().encode_wide().chain(Some(0)).collect();
                ILCreateFromPathW(PCWSTR(wide.as_ptr()))
            })
            .filter(|id| !id.is_null())
            .collect();
        let list: Vec<*const ITEMIDLIST> = ids.iter().map(|id| id.cast_const()).collect();
        let items = SHCreateShellItemArrayFromIDLists(&list);
        for id in ids {
            ILFree(Some(id.cast_const()));
        }
        items?.BindToHandler(None, &BHID_DataObject)
    }

    /// "Preferred DropEffect": copy. File Explorer reads it for its default.
    unsafe fn prefer_copy(data: &IDataObject) {
        let format = FORMATETC {
            cfFormat: RegisterClipboardFormatW(w!("Preferred DropEffect")) as u16,
            ptd: std::ptr::null_mut(),
            dwAspect: DVASPECT_CONTENT.0,
            lindex: -1,
            tymed: TYMED_HGLOBAL.0 as u32,
        };
        let Ok(global) = GlobalAlloc(GMEM_MOVEABLE, 4) else {
            return;
        };
        let ptr = GlobalLock(global) as *mut u32;
        if ptr.is_null() {
            let _ = GlobalFree(Some(global));
            return;
        }
        *ptr = DROPEFFECT_COPY.0;
        let _ = GlobalUnlock(global);
        let medium = STGMEDIUM {
            tymed: TYMED_HGLOBAL.0 as u32,
            u: STGMEDIUM_0 { hGlobal: global },
            pUnkForRelease: ManuallyDrop::new(None),
        };
        // On success the data object owns the memory.
        if data.SetData(&format, &medium, true).is_err() {
            let _ = GlobalFree(Some(global));
        }
    }

    /// The picture under the cursor (File Explorer's drag image helper).
    unsafe fn set_image(data: &IDataObject, png: &[u8]) {
        let Ok(image) = image::load_from_memory(png) else {
            return;
        };
        let rgba = image.to_rgba8();
        let (w, h) = rgba.dimensions();
        let bits = to_premultiplied_bgra(rgba.as_raw());
        let bitmap: HBITMAP = CreateBitmap(w as i32, h as i32, 1, 32, Some(bits.as_ptr().cast()));
        if bitmap.is_invalid() {
            return;
        }
        let shown = CoCreateInstance::<_, IDragSourceHelper>(
            &CLSID_DragDropHelper,
            None,
            CLSCTX_INPROC_SERVER,
        )
        .and_then(|helper| {
            let image = SHDRAGIMAGE {
                sizeDragImage: SIZE {
                    cx: w as i32,
                    cy: h as i32,
                },
                ptOffset: POINT { x: 0, y: 0 },
                hbmpDragImage: bitmap,
                crColorKey: COLORREF(0),
            };
            helper.InitializeFromBitmap(&image, data)
        });
        // The helper owns the bitmap once it took it.
        if shown.is_err() {
            let _ = DeleteObject(bitmap.into());
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn drag_image_pixels_are_premultiplied_bgra() {
        // Opaque red, half-transparent white, fully transparent green.
        let rgba = [255, 0, 0, 255, 255, 255, 255, 128, 0, 255, 0, 0];
        assert_eq!(
            to_premultiplied_bgra(&rgba),
            [0, 0, 255, 255, 128, 128, 128, 128, 0, 0, 0, 0]
        );
    }

    #[cfg(windows)]
    #[test]
    fn a_drop_that_took_nothing_is_not_a_drop() {
        use windows::Win32::Foundation::{DRAGDROP_S_CANCEL, DRAGDROP_S_DROP};
        use windows::Win32::System::Ole::{
            DROPEFFECT_COPY, DROPEFFECT_MOVE, DROPEFFECT_NONE, DROPEFFECT_SCROLL,
        };
        // Refused: the no-drop cursor, then "dropped" with no effect.
        assert!(!imp::took(
            DRAGDROP_S_DROP,
            DROPEFFECT_NONE,
            DROPEFFECT_NONE
        ));
        // Taken, but the target reports no effect (Chromium).
        assert!(imp::took(DRAGDROP_S_DROP, DROPEFFECT_NONE, DROPEFFECT_MOVE));
        // File Explorer copying (it shows copy with the scroll bit).
        let explorer = DROPEFFECT_COPY | DROPEFFECT_SCROLL;
        assert!(imp::took(DRAGDROP_S_DROP, DROPEFFECT_COPY, explorer));
        // A target that only scrolls hasn't taken anything.
        assert!(!imp::took(
            DRAGDROP_S_DROP,
            DROPEFFECT_NONE,
            DROPEFFECT_SCROLL
        ));
        // Escape.
        assert!(!imp::took(
            DRAGDROP_S_CANCEL,
            DROPEFFECT_NONE,
            DROPEFFECT_COPY
        ));
    }
}
