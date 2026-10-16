//! "Add to Wedge" in File Explorer's context menu, for the Microsoft Store
//! (MSIX) build. A package can't write the registry keys the regular
//! installer uses, so it declares this COM class instead (see
//! msix/AppxManifest.xml) and Explorer loads it in a surrogate process inside
//! the package. On Windows 11 the entry is in the first menu, not under
//! "Show more options".

use std::ffi::c_void;
use std::path::PathBuf;
use std::process::Command;

use windows::core::{
    implement, w, IUnknown, Interface, Ref, Result, BOOL, GUID, HRESULT, HSTRING, PCWSTR, PWSTR,
};
use windows::Storage::ApplicationData;
use windows::Win32::Foundation::{
    CLASS_E_CLASSNOTAVAILABLE, CLASS_E_NOAGGREGATION, E_FAIL, E_NOTIMPL, E_POINTER, HMODULE,
    S_FALSE,
};
use windows::Win32::Globalization::GetUserDefaultUILanguage;
use windows::Win32::System::Com::{CoTaskMemFree, IBindCtx, IClassFactory, IClassFactory_Impl};
use windows::Win32::System::LibraryLoader::{
    GetModuleFileNameW, GetModuleHandleExW, GET_MODULE_HANDLE_EX_FLAG_FROM_ADDRESS,
    GET_MODULE_HANDLE_EX_FLAG_UNCHANGED_REFCOUNT,
};
use windows::Win32::UI::Shell::{
    IEnumExplorerCommand, IExplorerCommand, IExplorerCommand_Impl, IShellItemArray, SHStrDupW,
    ECF_DEFAULT, ECS_ENABLED, ECS_HIDDEN, SIGDN_FILESYSPATH,
};

/// Must match the Clsid in msix/AppxManifest.xml.
const CLSID: GUID = GUID::from_u128(0xad0d80b7_29c0_48a9_831f_32740a5cbf44);
/// Wedge writes this file in its data folder (the package's LocalState) once
/// the user agreed to the entry, and removes it when it's switched off.
const ON_FLAG: &str = "context-menu-on";

/// wedge.exe, next to this DLL in the package.
fn wedge_exe() -> Option<PathBuf> {
    let mut module = HMODULE::default();
    unsafe {
        GetModuleHandleExW(
            GET_MODULE_HANDLE_EX_FLAG_FROM_ADDRESS | GET_MODULE_HANDLE_EX_FLAG_UNCHANGED_REFCOUNT,
            PCWSTR(wedge_exe as *const () as *const u16),
            &mut module,
        )
        .ok()?;
    }
    let mut buf = [0u16; 2048];
    let len = unsafe { GetModuleFileNameW(Some(module), &mut buf) } as usize;
    let dll = PathBuf::from(String::from_utf16_lossy(&buf[..len]));
    Some(dll.parent()?.join("wedge.exe"))
}

/// The label in Windows' language, like the rest of Wedge: Turkish
/// (LANG_TURKISH) and Russian (LANG_RUSSIAN), English otherwise.
fn title() -> PCWSTR {
    match unsafe { GetUserDefaultUILanguage() } & 0x3ff {
        0x1f => w!("Wedge’e ekle"),
        0x19 => w!("Добавить в Wedge"),
        _ => w!("Add to Wedge"),
    }
}

fn switched_on() -> bool {
    ApplicationData::Current()
        .and_then(|data| data.LocalFolder())
        .and_then(|folder| folder.Path())
        .map(|path| PathBuf::from(path.to_string()).join(ON_FLAG).exists())
        .unwrap_or(false)
}

fn selected_paths(items: Ref<IShellItemArray>) -> Result<Vec<String>> {
    let Some(items) = items.as_ref() else {
        return Ok(Vec::new());
    };
    let mut out = Vec::new();
    for i in 0..unsafe { items.GetCount()? } {
        let item = unsafe { items.GetItemAt(i)? };
        // Items that aren't files or folders on disk (a phone, a zip's insides) have no path.
        if let Ok(name) = unsafe { item.GetDisplayName(SIGDN_FILESYSPATH) } {
            if let Ok(path) = unsafe { name.to_string() } {
                out.push(path);
            }
            unsafe { CoTaskMemFree(Some(name.0 as *const c_void)) };
        }
    }
    Ok(out)
}

#[implement(IExplorerCommand)]
struct AddToWedge;

impl IExplorerCommand_Impl for AddToWedge_Impl {
    fn GetTitle(&self, _: Ref<IShellItemArray>) -> Result<PWSTR> {
        unsafe { SHStrDupW(title()) }
    }

    fn GetIcon(&self, _: Ref<IShellItemArray>) -> Result<PWSTR> {
        let exe = wedge_exe().ok_or(E_FAIL)?;
        unsafe { SHStrDupW(&HSTRING::from(format!("{},0", exe.display()))) }
    }

    fn GetToolTip(&self, _: Ref<IShellItemArray>) -> Result<PWSTR> {
        Err(E_NOTIMPL.into())
    }

    fn GetCanonicalName(&self) -> Result<GUID> {
        Ok(CLSID)
    }

    fn GetState(&self, _: Ref<IShellItemArray>, _: BOOL) -> Result<u32> {
        Ok(if switched_on() {
            ECS_ENABLED.0
        } else {
            ECS_HIDDEN.0
        } as u32)
    }

    /// Hands the files to Wedge the way the regular installer's entry does:
    /// `wedge.exe --add <path>...` (a running Wedge receives them).
    fn Invoke(&self, items: Ref<IShellItemArray>, _: Ref<IBindCtx>) -> Result<()> {
        let paths = selected_paths(items)?;
        if paths.is_empty() {
            return Ok(());
        }
        let exe = wedge_exe().ok_or(E_FAIL)?;
        Command::new(exe)
            .arg("--add")
            .args(paths)
            .spawn()
            .map_err(|_| E_FAIL)?;
        Ok(())
    }

    fn GetFlags(&self) -> Result<u32> {
        Ok(ECF_DEFAULT.0 as u32)
    }

    fn EnumSubCommands(&self) -> Result<IEnumExplorerCommand> {
        Err(E_NOTIMPL.into())
    }
}

#[implement(IClassFactory)]
struct Factory;

impl IClassFactory_Impl for Factory_Impl {
    fn CreateInstance(
        &self,
        outer: Ref<IUnknown>,
        iid: *const GUID,
        object: *mut *mut c_void,
    ) -> Result<()> {
        if object.is_null() {
            return Err(E_POINTER.into());
        }
        unsafe { *object = std::ptr::null_mut() };
        if outer.is_some() {
            return Err(CLASS_E_NOAGGREGATION.into());
        }
        let command: IExplorerCommand = AddToWedge.into();
        unsafe { command.query(iid, object).ok() }
    }

    fn LockServer(&self, _: BOOL) -> Result<()> {
        Ok(())
    }
}

/// # Safety
/// Called by COM with valid pointers.
#[no_mangle]
pub unsafe extern "system" fn DllGetClassObject(
    clsid: *const GUID,
    iid: *const GUID,
    object: *mut *mut c_void,
) -> HRESULT {
    if clsid.is_null() || iid.is_null() || object.is_null() {
        return E_POINTER;
    }
    unsafe { *object = std::ptr::null_mut() };
    if unsafe { *clsid } != CLSID {
        return CLASS_E_CLASSNOTAVAILABLE;
    }
    let factory: IClassFactory = Factory.into();
    unsafe { factory.query(iid, object) }
}

#[no_mangle]
pub extern "system" fn DllCanUnloadNow() -> HRESULT {
    S_FALSE
}
