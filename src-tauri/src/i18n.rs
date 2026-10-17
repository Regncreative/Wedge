//! Strings shown by the native side (tray menu, notifications). The panel's
//! own strings live in src/shared/locales/; keep wording in sync.

use crate::models::Language;

/// The Windows display language when Wedge has it, English otherwise.
/// STASH_LANG (`en`, `tr`, `ru`, `fr`, `es`, `de`, `pt`, `it`, `pl` or `ja`)
/// overrides it, so tests and screenshots don't depend on the machine.
pub fn system_language() -> Language {
    match std::env::var("STASH_LANG") {
        Ok(lang) if !lang.is_empty() => language_for(Some(&lang)),
        _ => language_for(sys_locale::get_locale().as_deref()),
    }
}

/// Matches on the language part only, so pt-PT gets the Brazilian strings
/// and fr-CA the French ones.
pub fn language_for(locale: Option<&str>) -> Language {
    let raw = locale.unwrap_or_default().to_lowercase().replace('_', "-");
    match raw.split('-').next().unwrap_or_default() {
        "tr" => Language::Tr,
        "ru" => Language::Ru,
        "fr" => Language::Fr,
        "es" => Language::Es,
        "de" => Language::De,
        "pt" => Language::Pt,
        "it" => Language::It,
        "pl" => Language::Pl,
        "ja" => Language::Ja,
        _ => Language::En,
    }
}

/// One value per language: Turkish, English, Russian, French, Spanish,
/// German, Portuguese, Italian, Polish, Japanese.
fn pick<T: Copy>(lang: Language, [tr, en, ru, fr, es, de, pt, it, pl, ja]: [T; 10]) -> T {
    match lang {
        Language::Tr => tr,
        Language::En => en,
        Language::Ru => ru,
        Language::Fr => fr,
        Language::Es => es,
        Language::De => de,
        Language::Pt => pt,
        Language::It => it,
        Language::Pl => pl,
        Language::Ja => ja,
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

const FR: Strings = Strings {
    tray_open: "Ouvrir",
    tray_settings: "Réglages",
    tray_check_updates: "Rechercher des mises à jour",
    tray_quit: "Quitter Wedge",
    update_title: "Mise à jour de Wedge",
    update_ready_title: "Wedge est prêt",
    update_error: "Échec de la mise à jour",
    hotkey_taken: "Le raccourci du tiroir est utilisé par une autre application. Choisissez-en un autre dans les réglages.",
    reminder_title: "Rappel Wedge",
    context_menu_label: "Ajouter à Wedge",
    shrunk_suffix: "réduit",
};

const ES: Strings = Strings {
    tray_open: "Abrir",
    tray_settings: "Ajustes",
    tray_check_updates: "Buscar actualizaciones",
    tray_quit: "Salir de Wedge",
    update_title: "Actualización de Wedge",
    update_ready_title: "Wedge está listo",
    update_error: "Error al actualizar",
    hotkey_taken: "Otra aplicación usa el atajo del cajón. Elige otro en Ajustes.",
    reminder_title: "Recordatorio de Wedge",
    context_menu_label: "Añadir a Wedge",
    shrunk_suffix: "reducido",
};

const DE: Strings = Strings {
    tray_open: "Öffnen",
    tray_settings: "Einstellungen",
    tray_check_updates: "Nach Updates suchen",
    tray_quit: "Wedge beenden",
    update_title: "Wedge-Update",
    update_ready_title: "Wedge ist bereit",
    update_error: "Update fehlgeschlagen",
    hotkey_taken: "Das Tastenkürzel für die Schublade wird von einer anderen App verwendet. Wähle in den Einstellungen ein neues.",
    reminder_title: "Wedge-Erinnerung",
    context_menu_label: "Zu Wedge hinzufügen",
    shrunk_suffix: "klein",
};

const PT: Strings = Strings {
    tray_open: "Abrir",
    tray_settings: "Configurações",
    tray_check_updates: "Verificar atualizações",
    tray_quit: "Sair do Wedge",
    update_title: "Atualização do Wedge",
    update_ready_title: "O Wedge está pronto",
    update_error: "Falha na atualização",
    hotkey_taken:
        "O atalho da gaveta está sendo usado por outro app. Escolha outro nas Configurações.",
    reminder_title: "Lembrete do Wedge",
    context_menu_label: "Adicionar ao Wedge",
    shrunk_suffix: "reduzido",
};

const IT: Strings = Strings {
    tray_open: "Apri",
    tray_settings: "Impostazioni",
    tray_check_updates: "Controlla aggiornamenti",
    tray_quit: "Esci da Wedge",
    update_title: "Aggiornamento di Wedge",
    update_ready_title: "Wedge è pronto",
    update_error: "Aggiornamento non riuscito",
    hotkey_taken: "La scorciatoia del cassetto è usata da un’altra app. Scegline una nuova nelle Impostazioni.",
    reminder_title: "Promemoria di Wedge",
    context_menu_label: "Aggiungi a Wedge",
    shrunk_suffix: "ridotto",
};

const PL: Strings = Strings {
    tray_open: "Otwórz",
    tray_settings: "Ustawienia",
    tray_check_updates: "Sprawdź aktualizacje",
    tray_quit: "Zamknij Wedge",
    update_title: "Aktualizacja Wedge",
    update_ready_title: "Wedge jest gotowy",
    update_error: "Aktualizacja nie powiodła się",
    hotkey_taken: "Skrót szuflady jest używany przez inną aplikację. Wybierz nowy w ustawieniach.",
    reminder_title: "Przypomnienie Wedge",
    context_menu_label: "Dodaj do Wedge",
    shrunk_suffix: "mały",
};

const JA: Strings = Strings {
    tray_open: "開く",
    tray_settings: "設定",
    tray_check_updates: "更新を確認",
    tray_quit: "Wedge を終了",
    update_title: "Wedge の更新",
    update_ready_title: "Wedge の準備ができました",
    update_error: "更新に失敗しました",
    hotkey_taken: "引き出しのショートカットは別のアプリが使っています。設定で新しいショートカットを選んでください。",
    reminder_title: "Wedge リマインダー",
    context_menu_label: "Wedge に追加",
    shrunk_suffix: "縮小",
};

pub fn strings(lang: Language) -> &'static Strings {
    pick(lang, [&TR, &EN, &RU, &FR, &ES, &DE, &PT, &IT, &PL, &JA])
}

/// Russian plural forms: 1 файл, 2 файла, 5 файлов (and 11 файлов, 21 файл).
fn ru_plural<'a>(n: usize, one: &'a str, few: &'a str, many: &'a str) -> &'a str {
    match (n % 10, n % 100) {
        (1, m) if m != 11 => one,
        (2..=4, m) if !(12..=14).contains(&m) => few,
        _ => many,
    }
}

/// Polish plural forms: 1 plik, 2 pliki, 5 plików (and 12 plików, 22 pliki,
/// but 21 plików: only 1 itself takes the singular).
fn pl_plural<'a>(n: usize, one: &'a str, few: &'a str, many: &'a str) -> &'a str {
    match (n, n % 10, n % 100) {
        (1, _, _) => one,
        (_, 2..=4, m) if !(12..=14).contains(&m) => few,
        _ => many,
    }
}

/// Name, icon and color of an automatic shelf.
pub fn kind_shelf(lang: Language, kind: &str) -> (&'static str, &'static str, &'static str) {
    let (names, icon, color) = match kind {
        "pocket" => (
            [
                "Cep",
                "Pocket",
                "Карман",
                "Poche",
                "Bolsillo",
                "Tasche",
                "Bolso",
                "Tasca",
                "Kieszeń",
                "ポケット",
            ],
            "pocket",
            "#ECEAE4",
        ),
        "downloads" => (
            [
                "İndirilenler",
                "Downloads",
                "Загрузки",
                "Téléchargements",
                "Descargas",
                "Downloads",
                "Downloads",
                "Download",
                "Pobrane",
                "ダウンロード",
            ],
            "download",
            "#F6BB45",
        ),
        "screenshots" => (
            [
                "Ekran görüntüleri",
                "Screenshots",
                "Скриншоты",
                "Captures",
                "Capturas",
                "Screenshots",
                "Capturas",
                "Screenshot",
                "Zrzuty ekranu",
                "スクリーンショット",
            ],
            "camera",
            "#C79BFF",
        ),
        "phone" => (
            [
                "Telefondan",
                "From phone",
                "С телефона",
                "Du mobile",
                "Del teléfono",
                "Vom Handy",
                "Do celular",
                "Dal telefono",
                "Z telefonu",
                "スマホから",
            ],
            "smartphone",
            "#43D8AA",
        ),
        "clipboard" => (
            [
                "Pano",
                "Clipboard",
                "Буфер обмена",
                "Presse-papiers",
                "Portapapeles",
                "Zwischenablage",
                "Área de transferência",
                "Appunti",
                "Schowek",
                "クリップボード",
            ],
            "clipboard",
            "#FF8A65",
        ),
        "drop" => (
            [
                "Bırakılanlar",
                "Drop shelf",
                "Пойманные",
                "Déposés",
                "Soltados",
                "Abgelegt",
                "Soltos",
                "Rilasciati",
                "Upuszczone",
                "ドロップ",
            ],
            "inbox",
            "#2563EB",
        ),
        _ => (
            [
                "Gelen kutusu",
                "Inbox",
                "Входящие",
                "Boîte de réception",
                "Bandeja de entrada",
                "Eingang",
                "Caixa de entrada",
                "In arrivo",
                "Odebrane",
                "受信トレイ",
            ],
            "inbox",
            "#2563EB",
        ),
    };
    (pick(lang, names), icon, color)
}

pub fn files_added(lang: Language, n: usize, shelf: &str) -> String {
    let one = n == 1;
    match lang {
        Language::Tr => format!("✓ {n} dosya eklendi · {shelf}"),
        Language::En => format!("✓ {n} files added · {shelf}"),
        Language::Ru => format!(
            "✓ {n} {} · {shelf}",
            ru_plural(n, "файл добавлен", "файла добавлено", "файлов добавлено")
        ),
        // French takes the singular for 0 and 1.
        Language::Fr => format!(
            "✓ {n} {} · {shelf}",
            if n < 2 {
                "fichier ajouté"
            } else {
                "fichiers ajoutés"
            }
        ),
        Language::Es => format!(
            "✓ {n} {} · {shelf}",
            if one {
                "archivo añadido"
            } else {
                "archivos añadidos"
            }
        ),
        Language::De => format!(
            "✓ {n} {} · {shelf}",
            if one {
                "Datei hinzugefügt"
            } else {
                "Dateien hinzugefügt"
            }
        ),
        Language::Pt => format!(
            "✓ {n} {} · {shelf}",
            if one {
                "arquivo adicionado"
            } else {
                "arquivos adicionados"
            }
        ),
        Language::It => format!(
            "✓ {n} {} · {shelf}",
            if one {
                "file aggiunto"
            } else {
                "file aggiunti"
            }
        ),
        Language::Pl => format!(
            "✓ Dodano {n} {} · {shelf}",
            pl_plural(n, "plik", "pliki", "plików")
        ),
        Language::Ja => format!("✓ {n} 件のファイルを追加しました · {shelf}"),
    }
}

pub fn update_downloading(lang: Language, v: &str) -> String {
    match lang {
        Language::Tr => format!("{v} sürümü indiriliyor…"),
        Language::En => format!("Downloading {v}…"),
        Language::Ru => format!("Загрузка {v}…"),
        Language::Fr => format!("Téléchargement de {v}…"),
        Language::Es => format!("Descargando {v}…"),
        Language::De => format!("{v} wird heruntergeladen…"),
        Language::Pt => format!("Baixando {v}…"),
        Language::It => format!("Download di {v}…"),
        Language::Pl => format!("Pobieranie {v}…"),
        Language::Ja => format!("{v} をダウンロードしています…"),
    }
}

pub fn update_ready(lang: Language, v: &str) -> String {
    match lang {
        Language::Tr => format!("{v} indirildi. Yeniden başlatınca kurulur."),
        Language::En => format!("{v} downloaded. Restart to install."),
        Language::Ru => format!("{v} загружена. Перезапустите, чтобы установить."),
        Language::Fr => format!("{v} téléchargée. Redémarrez pour l’installer."),
        Language::Es => format!("{v} descargada. Reinicia para instalarla."),
        Language::De => format!("{v} heruntergeladen. Zum Installieren neu starten."),
        Language::Pt => format!("{v} baixada. Reinicie para instalar."),
        Language::It => format!("{v} scaricata. Riavvia per installarla."),
        Language::Pl => format!("Pobrano {v}. Uruchom ponownie, aby zainstalować."),
        Language::Ja => format!("{v} をダウンロードしました。再起動するとインストールされます。"),
    }
}

pub fn up_to_date(lang: Language, v: &str) -> String {
    match lang {
        Language::Tr => format!("Güncelsiniz ({v})"),
        Language::En => format!("You’re up to date ({v})"),
        Language::Ru => format!("У вас последняя версия ({v})"),
        Language::Fr => format!("Vous êtes à jour ({v})"),
        Language::Es => format!("Estás al día ({v})"),
        Language::De => format!("Du bist auf dem neuesten Stand ({v})"),
        Language::Pt => format!("Você está com a versão mais recente ({v})"),
        Language::It => format!("Sei aggiornato ({v})"),
        Language::Pl => format!("Masz najnowszą wersję ({v})"),
        Language::Ja => format!("最新の状態です（{v}）"),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn picks_the_language_part_of_the_locale() {
        assert_eq!(language_for(Some("tr-TR")), Language::Tr);
        assert_eq!(language_for(Some("tr")), Language::Tr);
        assert_eq!(language_for(Some("TR_tr")), Language::Tr);
        assert_eq!(language_for(Some("ru-RU")), Language::Ru);
        assert_eq!(language_for(Some("ru")), Language::Ru);
        assert_eq!(language_for(Some("fr-CA")), Language::Fr);
        assert_eq!(language_for(Some("es-MX")), Language::Es);
        assert_eq!(language_for(Some("de_AT")), Language::De);
        assert_eq!(language_for(Some("pt-BR")), Language::Pt);
        assert_eq!(language_for(Some("pt-PT")), Language::Pt);
        assert_eq!(language_for(Some("it-IT")), Language::It);
        assert_eq!(language_for(Some("pl-PL")), Language::Pl);
        assert_eq!(language_for(Some("ja-JP")), Language::Ja);
        assert_eq!(language_for(Some("en-US")), Language::En);
        assert_eq!(language_for(Some("uk-UA")), Language::En);
        assert_eq!(language_for(Some("zh-Hans-CN")), Language::En);
        assert_eq!(language_for(Some("")), Language::En);
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

    #[test]
    fn polish_plurals() {
        let f = |n| pl_plural(n, "plik", "pliki", "plików");
        assert_eq!(
            [0, 1, 2, 4, 5, 12, 14, 21, 22, 25, 102, 112].map(f),
            [
                "plików", "plik", "pliki", "pliki", "plików", "plików", "plików", "plików",
                "pliki", "plików", "pliki", "plików"
            ]
        );
    }

    #[test]
    fn plural_notifications() {
        assert_eq!(files_added(Language::Fr, 1, "A"), "✓ 1 fichier ajouté · A");
        assert_eq!(
            files_added(Language::Fr, 3, "A"),
            "✓ 3 fichiers ajoutés · A"
        );
        assert_eq!(
            files_added(Language::De, 1, "A"),
            "✓ 1 Datei hinzugefügt · A"
        );
        assert_eq!(files_added(Language::Pl, 3, "A"), "✓ Dodano 3 pliki · A");
        assert_eq!(
            files_added(Language::Ja, 3, "A"),
            "✓ 3 件のファイルを追加しました · A"
        );
    }

    #[test]
    fn automatic_shelves_are_named_in_the_language() {
        assert_eq!(kind_shelf(Language::De, "pocket").0, "Tasche");
        assert_eq!(kind_shelf(Language::Pl, "downloads").0, "Pobrane");
        assert_eq!(kind_shelf(Language::Ja, "anything else").0, "受信トレイ");
    }
}
