//! Quick actions on shelf files: zip, convert or shrink images, copy into a folder.
//! All blocking; call from a worker thread.

use std::fs::File;
use std::io::{self, Write};
use std::path::{Path, PathBuf};

/// `dir/stem.ext`, or `dir/stem (2).ext`, `(3)`… if taken.
pub fn unique_path(dir: &Path, stem: &str, ext: &str) -> PathBuf {
    let name = |n: u32| {
        let suffix = if n == 1 {
            String::new()
        } else {
            format!(" ({n})")
        };
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
            let stem = path
                .file_stem()
                .map(|s| s.to_string_lossy())
                .unwrap_or_default();
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

/// JPEG and WebP quality: visually indistinguishable from the original for
/// photos and screenshots, at a fraction of the size.
const JPEG_QUALITY: u8 = 82;
const WEBP_QUALITY: f32 = 80.0;
/// "Reduce size" scales anything larger than this (longest side) down.
const SHRINK_MAX_SIDE: u32 = 2560;

/// A converted image: where it went and the sizes before and after.
#[derive(Debug, Clone, PartialEq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Converted {
    #[serde(skip)]
    pub path: PathBuf,
    pub name: String,
    pub before: u64,
    pub after: u64,
}

fn has_transparency(img: &image::DynamicImage) -> bool {
    img.color().has_alpha() && img.to_rgba8().pixels().any(|p| p.0[3] < 255)
}

fn encode(img: &image::DynamicImage, format: ImageFormat, dest: &Path) -> Result<(), String> {
    use image::codecs::{jpeg::JpegEncoder, png};
    let file = File::create(dest).map_err(|e| e.to_string())?;
    let mut out = io::BufWriter::new(file);
    let result = match format {
        // JPEG has no alpha channel.
        ImageFormat::Jpg => img
            .to_rgb8()
            .write_with_encoder(JpegEncoder::new_with_quality(&mut out, JPEG_QUALITY))
            .map_err(|e| e.to_string()),
        ImageFormat::Png => img
            .write_with_encoder(png::PngEncoder::new_with_quality(
                &mut out,
                png::CompressionType::Best,
                png::FilterType::Adaptive,
            ))
            .map_err(|e| e.to_string()),
        // The image crate only writes lossless WebP, which is often larger
        // than the source; libwebp's lossy mode is what people expect.
        ImageFormat::Webp => {
            let rgba = img.to_rgba8();
            let encoded = webp::Encoder::from_rgba(&rgba, rgba.width(), rgba.height())
                .encode_simple(false, WEBP_QUALITY)
                .map_err(|e| format!("webp: {e:?}"))?;
            out.write_all(&encoded).map_err(|e| e.to_string())
        }
    };
    let result = result.and_then(|_| out.flush().map_err(|e| e.to_string()));
    drop(out);
    if result.is_err() {
        let _ = std::fs::remove_file(dest);
    }
    result
}

fn stem_of(src: &Path) -> String {
    src.file_stem()
        .map(|s| s.to_string_lossy().into_owned())
        .unwrap_or_default()
}

fn converted(src: &Path, dest: PathBuf) -> Converted {
    let size = |p: &Path| std::fs::metadata(p).map(|m| m.len()).unwrap_or(0);
    Converted {
        name: dest
            .file_name()
            .map(|n| n.to_string_lossy().into_owned())
            .unwrap_or_default(),
        before: size(src),
        after: size(&dest),
        path: dest,
    }
}

/// Convert an image to another format, writing a new file next to it.
pub fn convert_image(src: &Path, format: ImageFormat) -> Result<Converted, String> {
    let img = image::open(src).map_err(|e| e.to_string())?;
    let dir = src.parent().unwrap_or(Path::new("."));
    let dest = unique_path(dir, &stem_of(src), format.ext());
    encode(&img, format, &dest)?;
    Ok(converted(src, dest))
}

/// What "reduce size" made of an image.
#[derive(Debug, Clone, PartialEq)]
pub enum Shrunk {
    Done(Converted),
    /// The result wasn't smaller than the original; nothing was kept.
    AlreadySmall,
}

/// Write a smaller copy next to the image (`<stem>-<suffix>.<ext>`): scaled
/// to at most 2560 px, JPEG for photos and WebP when there is transparency
/// (WebP sources stay WebP). Never keeps a result that isn't smaller.
pub fn shrink_image(src: &Path, suffix: &str) -> Result<Shrunk, String> {
    let img = image::open(src).map_err(|e| e.to_string())?;
    let img = if img.width().max(img.height()) > SHRINK_MAX_SIDE {
        img.resize(
            SHRINK_MAX_SIDE,
            SHRINK_MAX_SIDE,
            image::imageops::FilterType::Lanczos3,
        )
    } else {
        img
    };
    let is_webp = src
        .extension()
        .is_some_and(|e| e.eq_ignore_ascii_case("webp"));
    let format = if is_webp || has_transparency(&img) {
        ImageFormat::Webp
    } else {
        ImageFormat::Jpg
    };
    let dir = src.parent().unwrap_or(Path::new("."));
    let dest = unique_path(dir, &format!("{}-{suffix}", stem_of(src)), format.ext());
    encode(&img, format, &dest)?;
    let result = converted(src, dest);
    if result.after >= result.before {
        let _ = std::fs::remove_file(&result.path);
        return Ok(Shrunk::AlreadySmall);
    }
    Ok(Shrunk::Done(result))
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
    copy_into_paths(paths, dest_dir).map(|c| c.len())
}

/// Like [`copy_into`], returning where each copy went.
pub fn copy_into_paths(paths: &[PathBuf], dest_dir: &Path) -> io::Result<Vec<PathBuf>> {
    let mut copied = Vec::with_capacity(paths.len());
    for p in paths {
        let stem = p
            .file_stem()
            .map(|s| s.to_string_lossy().into_owned())
            .unwrap_or_default();
        let ext = if p.is_dir() {
            String::new()
        } else {
            p.extension()
                .map(|e| e.to_string_lossy().into_owned())
                .unwrap_or_default()
        };
        let target = unique_path(dest_dir, &stem, &ext);
        if p.is_dir() {
            copy_dir(p, &target)?;
        } else {
            std::fs::copy(p, &target)?;
        }
        copied.push(target);
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
        assert_eq!(
            unique_path(dir.path(), "a", "zip"),
            dir.path().join("a.zip")
        );
        std::fs::write(dir.path().join("a.zip"), b"").unwrap();
        assert_eq!(
            unique_path(dir.path(), "a", "zip"),
            dir.path().join("a (2).zip")
        );
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
        zip_paths(
            &[a.join("report.txt"), b.join("report.txt"), a.join("sub")],
            &dest,
        )
        .unwrap();

        let mut archive = zip::ZipArchive::new(File::open(&dest).unwrap()).unwrap();
        let mut read = |name: &str| {
            let mut s = String::new();
            archive
                .by_name(name)
                .unwrap()
                .read_to_string(&mut s)
                .unwrap();
            s
        };
        assert_eq!(read("report.txt"), "A");
        assert_eq!(read("report (2).txt"), "B");
        assert_eq!(read("sub/deep.txt"), "D");
    }

    /// A noisy "photo": compresses like a real one, not like a flat colour.
    fn photo(w: u32, h: u32, alpha: u8) -> image::RgbaImage {
        image::RgbaImage::from_fn(w, h, |x, y| {
            let n = (x.wrapping_mul(7919) ^ y.wrapping_mul(104_729)) % 61;
            image::Rgba([(x % 256) as u8, (y % 256) as u8, (n * 4) as u8, alpha])
        })
    }

    #[test]
    fn converts_images_and_reports_sizes() {
        let dir = tempfile::tempdir().unwrap();
        let src = dir.path().join("photo.png");
        photo(400, 200, 255).save(&src).unwrap();

        let jpg = convert_image(&src, ImageFormat::Jpg).unwrap();
        assert_eq!(jpg.path, dir.path().join("photo.jpg"));
        assert_eq!(jpg.name, "photo.jpg");
        assert!(jpg.before > 0 && jpg.after > 0);
        let out = image::open(&jpg.path).unwrap();
        assert_eq!((out.width(), out.height()), (400, 200));

        // Lossy WebP: well under the lossless PNG it came from.
        let webp = convert_image(&src, ImageFormat::Webp).unwrap();
        assert!(webp.after < webp.before / 2, "{webp:?}");
        assert_eq!(image::open(&webp.path).unwrap().width(), 400);

        let png = convert_image(&jpg.path, ImageFormat::Png).unwrap();
        assert_eq!(png.path, dir.path().join("photo (2).png"));

        let not_image = dir.path().join("x.txt");
        std::fs::write(&not_image, b"hi").unwrap();
        assert!(convert_image(&not_image, ImageFormat::Png).is_err());
    }

    #[test]
    fn shrinking_scales_down_and_never_grows() {
        let dir = tempfile::tempdir().unwrap();
        let big = dir.path().join("big.png");
        photo(3000, 1500, 255).save(&big).unwrap();
        let Shrunk::Done(out) = shrink_image(&big, "small").unwrap() else {
            panic!("expected a smaller file");
        };
        assert_eq!(out.path, dir.path().join("big-small.jpg"));
        assert!(out.after < out.before);
        let img = image::open(&out.path).unwrap();
        assert_eq!((img.width(), img.height()), (2560, 1280));

        // Transparency survives (WebP, not JPEG).
        let logo = dir.path().join("logo.png");
        photo(300, 300, 120).save(&logo).unwrap();
        let Shrunk::Done(out) = shrink_image(&logo, "small").unwrap() else {
            panic!("expected a smaller file");
        };
        assert_eq!(out.path, dir.path().join("logo-small.webp"));

        // A tiny, already-compressed JPEG can't get smaller: nothing is kept.
        let tiny = dir.path().join("tiny.jpg");
        image::DynamicImage::ImageRgba8(photo(8, 8, 255))
            .to_rgb8()
            .write_with_encoder(image::codecs::jpeg::JpegEncoder::new_with_quality(
                File::create(&tiny).unwrap(),
                30,
            ))
            .unwrap();
        assert_eq!(shrink_image(&tiny, "small").unwrap(), Shrunk::AlreadySmall);
        assert!(!dir.path().join("tiny-small.jpg").exists());
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

        assert_eq!(
            copy_into(&[src.join("a.txt"), src.join("folder")], &dest).unwrap(),
            2
        );
        assert_eq!(
            std::fs::read_to_string(dest.join("a.txt")).unwrap(),
            "existing"
        );
        assert_eq!(
            std::fs::read_to_string(dest.join("a (2).txt")).unwrap(),
            "new"
        );
        assert_eq!(
            std::fs::read_to_string(dest.join("folder").join("b.txt")).unwrap(),
            "b"
        );
    }
}
