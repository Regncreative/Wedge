//! Plain text from files, for content search. Covers text and code files,
//! Office Open XML / OpenDocument (Word, Excel, PowerPoint) and PDF.

use std::io::Read;
use std::path::Path;

/// Upper bound on indexed text per file.
const MAX_CHARS: usize = 200_000;
/// Files larger than this are not read for indexing.
const MAX_FILE_BYTES: u64 = 50 * 1024 * 1024;

const TEXT_EXTS: &[&str] = &[
    "txt", "md", "markdown", "csv", "tsv", "log", "json", "xml", "html", "htm", "css", "js", "ts",
    "tsx", "jsx", "py", "rs", "go", "java", "c", "cpp", "h", "hpp", "cs", "rb", "php", "swift",
    "kt", "sql", "sh", "ps1", "bat", "yml", "yaml", "toml", "ini", "cfg", "rtf", "srt", "vtt",
];

fn truncate(mut s: String) -> String {
    if s.len() > MAX_CHARS {
        let mut cut = MAX_CHARS;
        while !s.is_char_boundary(cut) {
            cut -= 1;
        }
        s.truncate(cut);
    }
    s
}

/// Text inside the XML parts of an Office/OpenDocument zip. Tags become
/// spaces so words from adjacent cells or runs don't merge.
fn zipped_xml_text(path: &Path, part: impl Fn(&str) -> bool) -> Option<String> {
    let file = std::fs::File::open(path).ok()?;
    let mut archive = zip::ZipArchive::new(file).ok()?;
    let mut out = String::new();
    let names: Vec<String> = archive.file_names().map(str::to_string).collect();
    for name in names.into_iter().filter(|n| part(n)) {
        let mut xml = String::new();
        if archive.by_name(&name).ok()?.read_to_string(&mut xml).is_err() {
            continue;
        }
        out.push_str(&strip_tags(&xml));
        out.push('\n');
        if out.len() > MAX_CHARS {
            break;
        }
    }
    Some(out)
}

pub fn strip_tags(xml: &str) -> String {
    let mut out = String::with_capacity(xml.len() / 2);
    let mut in_tag = false;
    for c in xml.chars() {
        match c {
            '<' => {
                in_tag = true;
                out.push(' ');
            }
            '>' => in_tag = false,
            _ if !in_tag => out.push(c),
            _ => {}
        }
    }
    let decoded = out
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&apos;", "'")
        .replace("&amp;", "&");
    decoded.split_whitespace().collect::<Vec<_>>().join(" ")
}

/// Extract searchable text. `None` means the type isn't supported or the
/// file couldn't be read; callers index an empty string so it isn't retried.
pub fn extract(path: &Path) -> Option<String> {
    let meta = std::fs::metadata(path).ok()?;
    if !meta.is_file() || meta.len() > MAX_FILE_BYTES {
        return None;
    }
    let ext = path
        .extension()
        .map(|e| e.to_string_lossy().to_lowercase())
        .unwrap_or_default();
    let text = match ext.as_str() {
        e if TEXT_EXTS.contains(&e) => {
            let bytes = std::fs::read(path).ok()?;
            String::from_utf8_lossy(&bytes[..bytes.len().min(MAX_CHARS * 2)]).into_owned()
        }
        "docx" => zipped_xml_text(path, |n| n.starts_with("word/") && n.ends_with(".xml"))?,
        "pptx" => zipped_xml_text(path, |n| n.starts_with("ppt/slides/slide") && n.ends_with(".xml"))?,
        "xlsx" => zipped_xml_text(path, |n| {
            n == "xl/sharedStrings.xml" || (n.starts_with("xl/worksheets/") && n.ends_with(".xml"))
        })?,
        "odt" | "ods" | "odp" => zipped_xml_text(path, |n| n == "content.xml")?,
        "pdf" => {
            // pdf-extract panics on some malformed files; contain it.
            let owned = path.to_path_buf();
            std::panic::catch_unwind(move || pdf_extract::extract_text(&owned).ok())
                .ok()
                .flatten()?
        }
        _ => return None,
    };
    Some(truncate(text))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    #[test]
    fn strips_xml_markup_and_entities() {
        let xml = r#"<w:p><w:r><w:t>Fatura</w:t></w:r><w:r><w:t>Tom &amp; Jerry</w:t></w:r></w:p>"#;
        assert_eq!(strip_tags(xml), "Fatura Tom & Jerry");
    }

    #[test]
    fn reads_text_files_and_skips_binaries() {
        let dir = tempfile::tempdir().unwrap();
        let md = dir.path().join("notes.md");
        std::fs::write(&md, "Toplantı notları").unwrap();
        assert_eq!(extract(&md).unwrap(), "Toplantı notları");
        let exe = dir.path().join("app.exe");
        std::fs::write(&exe, [0u8, 1, 2]).unwrap();
        assert_eq!(extract(&exe), None);
    }

    #[test]
    fn reads_word_documents() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("letter.docx");
        let mut zip = zip::ZipWriter::new(std::fs::File::create(&path).unwrap());
        let opts = zip::write::SimpleFileOptions::default();
        zip.start_file("word/document.xml", opts).unwrap();
        zip.write_all(b"<w:document><w:body><w:p><w:t>Kira sozlesmesi</w:t></w:p></w:body></w:document>")
            .unwrap();
        zip.start_file("docProps/app.xml", opts).unwrap();
        zip.write_all(b"<Application>Word</Application>").unwrap();
        zip.finish().unwrap();
        let text = extract(&path).unwrap();
        assert!(text.contains("Kira sozlesmesi"));
        assert!(!text.contains("Application"), "only document parts are read");
    }

    /// A minimal one-page PDF with the given ASCII text.
    fn tiny_pdf(text: &str) -> Vec<u8> {
        let stream = format!("BT /F1 18 Tf 72 720 Td ({text}) Tj ET");
        let objects = [
            "<< /Type /Catalog /Pages 2 0 R >>".to_string(),
            "<< /Type /Pages /Kids [3 0 R] /Count 1 >>".to_string(),
            "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>".to_string(),
            format!("<< /Length {} >>\nstream\n{stream}\nendstream", stream.len()),
            "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>".to_string(),
        ];
        let mut pdf = b"%PDF-1.4\n".to_vec();
        let mut offsets = Vec::new();
        for (i, obj) in objects.iter().enumerate() {
            offsets.push(pdf.len());
            pdf.extend(format!("{} 0 obj\n{obj}\nendobj\n", i + 1).bytes());
        }
        let xref = pdf.len();
        pdf.extend(format!("xref\n0 {}\n0000000000 65535 f \n", objects.len() + 1).bytes());
        for off in offsets {
            pdf.extend(format!("{off:010} 00000 n \n").bytes());
        }
        pdf.extend(
            format!("trailer\n<< /Size {} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n", objects.len() + 1)
                .bytes(),
        );
        pdf
    }

    #[test]
    fn reads_pdfs_and_survives_broken_ones() {
        let dir = tempfile::tempdir().unwrap();
        let good = dir.path().join("invoice.pdf");
        std::fs::write(&good, tiny_pdf("Invoice 2026-114 total due")).unwrap();
        let text = extract(&good).expect("pdf text");
        assert!(text.contains("Invoice 2026-114"), "got {text:?}");

        let broken = dir.path().join("broken.pdf");
        std::fs::write(&broken, b"%PDF-1.4\nthis is not really a pdf").unwrap();
        assert_eq!(extract(&broken), None);
    }

    #[test]
    fn caps_very_long_text() {
        let s = truncate("ğ".repeat(MAX_CHARS));
        assert!(s.len() <= MAX_CHARS);
        assert!(s.chars().all(|c| c == 'ğ'));
    }
}
