//! Strings shown by the native side (tray menu, notifications). The panel's
//! own strings live in src/shared/locales/; keep wording in sync.

use crate::models::Language;

/// Turkish or Russian for Windows in those languages; English for everything
/// else. STASH_LANG (`en`, `tr` or `ru`) overrides it, so tests and screenshots
/// don't depend on the machine.
pub fn system_language() -> Language {
    match std::env::var("STASH_LANG") {
        Ok(lang) if !lang.is_empty() => language_for(Some(&lang)),
        _ => language_for(sys_locale::get_locale().as_deref()),
    }
}

pub fn language_for(locale: Option<&str>) -> Language {
    let raw = locale.unwrap_or_default().to_lowercase().replace('_', "-");
    if raw == "tr" || raw.starts_with("tr-") {
        Language::Tr
    } else if raw == "ru" || raw.starts_with("ru-") {
        Language::Ru
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
    pub context_menu_label: &'static str,
    /// Appended to the name of a reduced-size image copy.
    pub shrunk_suffix: &'static str,
}

const TR: Strings = Strings {
    tray_open: "Aç",
    tray_settings: "Ayarlar",
    tray_check_updates: "Güncellemeleri denetle",
    tray_quit: "Wedge’ten çık",
    update_title: "Wedge güncellemesi",
    update_ready_title: "Wedge hazır",
    update_error: "Güncelleme başarısız",
    hotkey_taken: "Çekmece kısayolu başka bir uygulama tarafından kullanılıyor. Ayarlar’dan yeni bir kısayol seçebilirsin.",
    reminder_title: "Wedge hatırlatma",
    context_menu_label: "Wedge’e ekle",
    shrunk_suffix: "küçük",
};

const EN: Strings = Strings {
    tray_open: "Open",
    tray_settings: "Settings",
    tray_check_updates: "Check for updates",
    tray_quit: "Quit Wedge",
    update_title: "Wedge update",
    update_ready_title: "Wedge is ready",
    update_error: "Update failed",
    hotkey_taken: "The drawer shortcut is used by another app. Pick a new one in Settings.",
    reminder_title: "Wedge reminder",
    context_menu_label: "Add to Wedge",
    shrunk_suffix: "small",
};

const RU: Strings = Strings {
    tray_open: "Открыть",
    tray_settings: "Настройки",
    tray_check_updates: "Проверить обновления",
    tray_quit: "Выйти из Wedge",
    update_title: "Обновление Wedge",
    update_ready_title: "Wedge готов",
    update_error: "Ошибка обновления",
    hotkey_taken: "Горячая клавиша панели занята другим приложением. Выберите новую в настройках.",
    reminder_title: "Напоминание Wedge",
    context_menu_label: "Добавить в Wedge",
    shrunk_suffix: "мини",
};

pub fn strings(lang: Language) -> &'static Strings {
    match lang {
        Language::Tr => &TR,
        Language::En => &EN,
        Language::Ru => &RU,
    }
}

/// Russian plural forms: 1 файл, 2 файла, 5 файлов (and 11 файлов, 21 файл).
fn ru_plural<'a>(n: usize, one: &'a str, few: &'a str, many: &'a str) -> &'a str {
    match (n % 10, n % 100) {
        (1, m) if m != 11 => one,
        (2..=4, m) if !(12..=14).contains(&m) => few,
        _ => many,
    }
}

/// Name, icon and color of an automatic shelf.
pub fn kind_shelf(lang: Language, kind: &str) -> (&'static str, &'static str, &'static str) {
    // [Turkish, English, Russian], icon, color
    let ([tr, en, ru], icon, color) = match kind {
        "pocket" => (["Cep", "Pocket", "Карман"], "pocket", "#ECEAE4"),
        "downloads" => (
            ["İndirilenler", "Downloads", "Загрузки"],
            "download",
            "#F6BB45",
        ),
        "screenshots" => (
            ["Ekran görüntüleri", "Screenshots", "Скриншоты"],
            "camera",
            "#C79BFF",
        ),
        "phone" => (
            ["Telefondan", "From phone", "С телефона"],
            "smartphone",
            "#43D8AA",
        ),
        "clipboard" => (
            ["Pano", "Clipboard", "Буфер обмена"],
            "clipboard",
            "#FF8A65",
        ),
        "drop" => (
            ["Bırakılanlar", "Drop shelf", "Брошенные"],
            "inbox",
            "#2563EB",
        ),
        _ => (["Gelen kutusu", "Inbox", "Входящие"], "inbox", "#2563EB"),
    };
    let name = match lang {
        Language::Tr => tr,
        Language::En => en,
        Language::Ru => ru,
    };
    (name, icon, color)
}

pub fn files_added(lang: Language, n: usize, shelf: &str) -> String {
    match lang {
        Language::Tr => format!("✓ {n} dosya eklendi · {shelf}"),
        Language::En => format!("✓ {n} files added · {shelf}"),
        Language::Ru => format!(
            "✓ {n} {} · {shelf}",
            ru_plural(n, "файл добавлен", "файла добавлено", "файлов добавлено")
        ),
    }
}

pub fn update_downloading(lang: Language, v: &str) -> String {
    match lang {
        Language::Tr => format!("{v} sürümü indiriliyor…"),
        Language::En => format!("Downloading {v}…"),
        Language::Ru => format!("Загрузка {v}…"),
    }
}

pub fn update_ready(lang: Language, v: &str) -> String {
    match lang {
        Language::Tr => format!("{v} indirildi. Yeniden başlatınca kurulur."),
        Language::En => format!("{v} downloaded. Restart to install."),
        Language::Ru => format!("{v} загружена. Перезапустите, чтобы установить."),
    }
}

pub fn up_to_date(lang: Language, v: &str) -> String {
    match lang {
        Language::Tr => format!("Güncelsiniz ({v})"),
        Language::En => format!("You’re up to date ({v})"),
        Language::Ru => format!("У вас последняя версия ({v})"),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn picks_turkish_and_russian_for_their_locales_only() {
        assert_eq!(language_for(Some("tr-TR")), Language::Tr);
        assert_eq!(language_for(Some("tr")), Language::Tr);
        assert_eq!(language_for(Some("TR_tr")), Language::Tr);
        assert_eq!(language_for(Some("ru-RU")), Language::Ru);
        assert_eq!(language_for(Some("ru")), Language::Ru);
        assert_eq!(language_for(Some("en-US")), Language::En);
        assert_eq!(language_for(Some("de-DE")), Language::En);
        assert_eq!(language_for(Some("uk-UA")), Language::En);
        assert_eq!(language_for(None), Language::En);
    }

    #[test]
    fn russian_plurals() {
        let f = |n| ru_plural(n, "файл", "файла", "файлов");
        assert_eq!(
            [1, 2, 4, 5, 11, 12, 14, 21, 22, 25, 101, 111].map(f),
            [
                "файл",
                "файла",
                "файла",
                "файлов",
                "файлов",
                "файлов",
                "файлов",
                "файл",
                "файла",
                "файлов",
                "файл",
                "файлов"
            ]
        );
    }
}
