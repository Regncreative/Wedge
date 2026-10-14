//! Quick actions on shelf files: zip, convert/resize images, copy into a folder.
//! All blocking; call from a worker thread.

use std::fs::File;
use std::io::{self, Write};
use std::path::{Path, PathBuf};

/// `dir/stem.ext`, or `dir/stem (2).ext`, `(3)`… if taken.
pub fn unique_path(dir: &Path, stem: &str, ext: &str) -> PathBuf {
    let name = |n: u32| {
        let suffix = if n == 1 { String::new() } else { format!(" ({n})") };
        if ext.is_empty() {
            format!("{stem}{suffix}")
        } else {
            format!("{stem}{suffix}.{ext}")
        }
    };
    (1..)
        .map(|n| dir.join(name(n)))
        .find(|p| !p.exists())
        .expect("unbounded range")
}

fn add_to_zip<W: Write + io::Seek>(
    zip: &mut zip::ZipWriter<W>,
    path: &Path,
    name_in_zip: &str,
) -> io::Result<()> {
    let opts = zip::write::SimpleFileOptions::default()
        .compression_method(zip::CompressionMethod::Deflated)
        .large_file(true);
    if path.is_dir() {
        zip.add_directory(format!("{name_in_zip}/"), opts)?;
        for entry in std::fs::read_dir(path)? {
            let entry = entry?;
            let child = format!("{name_in_zip}/{}", entry.file_name().to_string_lossy());
            add_to_zip(zip, &entry.path(), &child)?;
        }
    } else {
        zip.start_file(name_in_zip, opts)?;
        io::copy(&mut File::open(path)?, zip)?;
    }
    Ok(())
}

/// Zip files and folders into `dest`. Duplicate names get a numeric suffix.
pub fn zip_paths(paths: &[PathBuf], dest: &Path) -> io::Result<()> {
    let mut zip = zip::ZipWriter::new(File::create(dest)?);
    let mut used = std::collections::HashSet::new();
    for p in paths {
        let base = p
            .file_name()
            .map(|n| n.to_string_lossy().into_owned())
            .unwrap_or_else(|| "item".into());
        let mut name = base.clone();
        let mut n = 2;
        while !used.insert(name.to_lowercase()) {
            let path = Path::new(&base);
            let stem = path.file_stem().map(|s| s.to_string_lossy()).unwrap_or_default();
            name = match path.extension() {
                Some(ext) => format!("{stem} ({n}).{}", ext.to_string_lossy()),
                None => format!("{stem} ({n})"),
            };
            n += 1;
        }
        add_to_zip(&mut zip, p, &name)?;
    }
    zip.finish()?;
    Ok(())
}

#[derive(Debug, Clone, Copy, PartialEq, serde::Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ImageFormat {
    Jpg,
    Png,
    Webp,
}

impl ImageFormat {
    fn ext(self) -> &'static str {
        match self {
            ImageFormat::Jpg => "jpg",
            ImageFormat::Png => "png",
            ImageFormat::Webp => "webp",
        }
    }
}

/// Convert (and optionally shrink so the longest side is `max_side`) an image,
/// writing a new file next to the original. Returns the new file's path.
pub fn convert_image(src: &Path, format: ImageFormat, max_side: Option<u32>) -> Result<PathBuf, String> {
    let img = image::open(src).map_err(|e| e.to_string())?;
    let img = match max_side {
        Some(max) if img.width().max(img.height()) > max => {
            img.resize(max, max, image::imageops::FilterType::Lanczos3)
        }
        _ => img,
    };
    let stem = src.file_stem().map(|s| s.to_string_lossy().into_owned()).unwrap_or_default();
    let stem = match max_side {
        Some(max) => format!("{stem}-{max}px"),
        None => stem,
    };
    let dir = src.parent().unwrap_or(Path::new("."));
    let dest = unique_path(dir, &stem, format.ext());
    let result = match format {
        // JPEG has no alpha channel.
        ImageFormat::Jpg => image::DynamicImage::ImageRgb8(img.to_rgb8())
            .save_with_format(&dest, image::ImageFormat::Jpeg),
        ImageFormat::Png => img.save_with_format(&dest, image::ImageFormat::Png),
        ImageFormat::Webp => image::DynamicImage::ImageRgba8(img.to_rgba8())
            .save_with_format(&dest, image::ImageFormat::WebP),
    };
    result.map_err(|e| e.to_string())?;
    Ok(dest)
}

fn copy_dir(src: &Path, dest: &Path) -> io::Result<()> {
    std::fs::create_dir_all(dest)?;
    for entry in std::fs::read_dir(src)? {
        let entry = entry?;
        let target = dest.join(entry.file_name());
        if entry.file_type()?.is_dir() {
            copy_dir(&entry.path(), &target)?;
        } else {
            std::fs::copy(entry.path(), target)?;
        }
    }
    Ok(())
}

/// Copy files and folders into `dest_dir` without overwriting. Returns how many were copied.
pub fn copy_into(paths: &[PathBuf], dest_dir: &Path) -> io::Result<usize> {
    let mut copied = 0;
    for p in paths {
        let stem = p.file_stem().map(|s| s.to_string_lossy().into_owned()).unwrap_or_default();
        let ext = if p.is_dir() {
            String::new()
        } else {
            p.extension().map(|e| e.to_string_lossy().into_owned()).unwrap_or_default()
        };
        let target = unique_path(dest_dir, &stem, &ext);
        if p.is_dir() {
            copy_dir(p, &target)?;
        } else {
            std::fs::copy(p, &target)?;
        }
        copied += 1;
    }
    Ok(copied)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Read;

    #[test]
    fn unique_names_do_not_overwrite() {
        let dir = tempfile::tempdir().unwrap();
        assert_eq!(unique_path(dir.path(), "a", "zip"), dir.path().join("a.zip"));
        std::fs::write(dir.path().join("a.zip"), b"").unwrap();
        assert_eq!(unique_path(dir.path(), "a", "zip"), dir.path().join("a (2).zip"));
    }

    #[test]
    fn zips_files_folders_and_duplicate_names() {
        let dir = tempfile::tempdir().unwrap();
        let a = dir.path().join("one");
        let b = dir.path().join("two");
        std::fs::create_dir_all(a.join("sub")).unwrap();
        std::fs::create_dir_all(&b).unwrap();
        std::fs::write(a.join("report.txt"), b"A").unwrap();
        std::fs::write(b.join("report.txt"), b"B").unwrap();
        std::fs::write(a.join("sub").join("deep.txt"), b"D").unwrap();

        let dest = dir.path().join("out.zip");
        zip_paths(&[a.join("report.txt"), b.join("report.txt"), a.join("sub")], &dest).unwrap();

        let mut archive = zip::ZipArchive::new(File::open(&dest).unwrap()).unwrap();
        let mut read = |name: &str| {
            let mut s = String::new();
            archive.by_name(name).unwrap().read_to_string(&mut s).unwrap();
            s
        };
        assert_eq!(read("report.txt"), "A");
        assert_eq!(read("report (2).txt"), "B");
        assert_eq!(read("sub/deep.txt"), "D");
    }

    #[test]
    fn converts_and_resizes_images() {
        let dir = tempfile::tempdir().unwrap();
        let src = dir.path().join("photo.png");
        image::RgbaImage::from_pixel(400, 200, image::Rgba([10, 200, 30, 128]))
            .save(&src)
            .unwrap();

        let jpg = convert_image(&src, ImageFormat::Jpg, Some(100)).unwrap();
        assert_eq!(jpg, dir.path().join("photo-100px.jpg"));
        let out = image::open(&jpg).unwrap();
        assert_eq!((out.width(), out.height()), (100, 50));

        let webp = convert_image(&src, ImageFormat::Webp, None).unwrap();
        assert_eq!(image::open(webp).unwrap().width(), 400);

        let not_image = dir.path().join("x.txt");
        std::fs::write(&not_image, b"hi").unwrap();
        assert!(convert_image(&not_image, ImageFormat::Png, None).is_err());
    }

    #[test]
    fn copies_into_a_folder_without_overwriting() {
        let dir = tempfile::tempdir().unwrap();
        let src = dir.path().join("src");
        let dest = dir.path().join("dest");
        std::fs::create_dir_all(src.join("folder")).unwrap();
        std::fs::create_dir_all(&dest).unwrap();
        std::fs::write(src.join("a.txt"), b"new").unwrap();
        std::fs::write(src.join("folder").join("b.txt"), b"b").unwrap();
        std::fs::write(dest.join("a.txt"), b"existing").unwrap();

        assert_eq!(copy_into(&[src.join("a.txt"), src.join("folder")], &dest).unwrap(), 2);
        assert_eq!(std::fs::read_to_string(dest.join("a.txt")).unwrap(), "existing");
        assert_eq!(std::fs::read_to_string(dest.join("a (2).txt")).unwrap(), "new");
        assert_eq!(std::fs::read_to_string(dest.join("folder").join("b.txt")).unwrap(), "b");
    }
}
