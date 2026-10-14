//! Strings shown by the native side (tray menu, notifications). The panel's
//! own strings live in src/shared/locales/; keep wording in sync.

use crate::models::Language;

/// Turkish for Turkish Windows; English for everything else.
pub fn system_language() -> Language {
    language_for(sys_locale::get_locale().as_deref())
}

pub fn language_for(locale: Option<&str>) -> Language {
    let raw = locale.unwrap_or_default().to_lowercase().replace('_', "-");
    if raw == "tr" || raw.starts_with("tr-") {
        Language::Tr
    } else {
        Language::En
    }
}

pub struct Strings {
    pub tray_open: &'static str,
    pub tray_settings: &'static str,
    pub tray_check_updates: &'static str,
    pub tray_quit: &'static str,
    pub update_title: &'static str,
    pub update_ready_title: &'static str,
    pub update_error: &'static str,
    pub hotkey_taken: &'static str,
    pub reminder_title: &'static str,
}

const TR: Strings = Strings {
    tray_open: "Aç",
    tray_settings: "Ayarlar",
    tray_check_updates: "Güncellemeleri denetle",
    tray_quit: "Stash’ten çık",
    update_title: "Stash güncellemesi",
    update_ready_title: "Stash hazır",
    update_error: "Güncelleme başarısız",
    hotkey_taken: "Panel kısayolu başka bir uygulama tarafından kullanılıyor. Ayarlar’dan yeni bir kısayol seçebilirsin.",
    reminder_title: "Stash hatırlatma",
};

const EN: Strings = Strings {
    tray_open: "Open",
    tray_settings: "Settings",
    tray_check_updates: "Check for updates",
    tray_quit: "Quit Stash",
    update_title: "Stash update",
    update_ready_title: "Stash is ready",
    update_error: "Update failed",
    hotkey_taken: "The panel shortcut is used by another app. Pick a new one in Settings.",
    reminder_title: "Stash reminder",
};

pub fn strings(lang: Language) -> &'static Strings {
    match lang {
        Language::Tr => &TR,
        Language::En => &EN,
    }
}

/// Name, icon and color of an automatic shelf.
pub fn kind_shelf(lang: Language, kind: &str) -> (&'static str, &'static str, &'static str) {
    let tr = lang == Language::Tr;
    match kind {
        "downloads" => (if tr { "İndirilenler" } else { "Downloads" }, "download", "#0078D4"),
        "screenshots" => (if tr { "Ekran görüntüleri" } else { "Screenshots" }, "camera", "#8764B8"),
        "phone" => (if tr { "Telefondan" } else { "From phone" }, "smartphone", "#038387"),
        "clipboard" => (if tr { "Pano" } else { "Clipboard" }, "clipboard", "#CA5010"),
        _ => (if tr { "Gelen kutusu" } else { "Inbox" }, "inbox", "#2563EB"),
    }
}

pub fn files_added(lang: Language, n: usize, shelf: &str) -> String {
    match lang {
        Language::Tr => format!("✓ {n} dosya eklendi · {shelf}"),
        Language::En => format!("✓ {n} files added · {shelf}"),
    }
}

pub fn update_downloading(lang: Language, v: &str) -> String {
    match lang {
        Language::Tr => format!("{v} sürümü indiriliyor…"),
        Language::En => format!("Downloading {v}…"),
    }
}

pub fn update_ready(lang: Language, v: &str) -> String {
    match lang {
        Language::Tr => format!("{v} indirildi. Yeniden başlatınca kurulur."),
        Language::En => format!("{v} downloaded. Restart to install."),
    }
}

pub fn up_to_date(lang: Language, v: &str) -> String {
    match lang {
        Language::Tr => format!("Güncelsiniz ({v})"),
        Language::En => format!("You’re up to date ({v})"),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn picks_turkish_only_for_turkish_locales() {
        assert_eq!(language_for(Some("tr-TR")), Language::Tr);
        assert_eq!(language_for(Some("tr")), Language::Tr);
        assert_eq!(language_for(Some("TR_tr")), Language::Tr);
        assert_eq!(language_for(Some("en-US")), Language::En);
        assert_eq!(language_for(Some("de-DE")), Language::En);
        assert_eq!(language_for(None), Language::En);
    }
}
