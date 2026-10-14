//! File-system access that never blocks the UI thread.

use std::path::Path;
use std::time::{Duration, UNIX_EPOCH};

use crate::models::FileInput;

/// How long a single existence check may take before the path counts as
/// unreachable (e.g. a disconnected network share).
const CHECK_TIMEOUT: Duration = Duration::from_millis(1500);

/// `Some(true/false)` when the check finished, `None` when it timed out.
pub async fn check_path(path: &str) -> Option<bool> {
    let owned = path.to_owned();
    let probe = tauri::async_runtime::spawn_blocking(move || Path::new(&owned).exists());
    match tokio::time::timeout(CHECK_TIMEOUT, probe).await {
        Ok(Ok(exists)) => Some(exists),
        Ok(Err(_)) => Some(false),
        Err(_) => None,
    }
}

/// True only when the path was confirmed reachable.
pub async fn is_reachable(path: &str) -> bool {
    check_path(path).await == Some(true)
}

/// Check many paths concurrently.
pub async fn check_all(paths: Vec<String>) -> Vec<Option<bool>> {
    let handles: Vec<_> = paths
        .into_iter()
        .map(|p| tauri::async_runtime::spawn(async move { check_path(&p).await }))
        .collect();
    let mut out = Vec::with_capacity(handles.len());
    for h in handles {
        out.push(h.await.unwrap_or(None));
    }
    out
}

/// Metadata for a file dropped onto the panel (blocking; run off the main thread).
pub fn collect_meta(path: &str) -> Option<FileInput> {
    let p = Path::new(path);
    let meta = std::fs::metadata(p).ok()?;
    let is_directory = meta.is_dir();
    let ms = |t: std::io::Result<std::time::SystemTime>| {
        t.ok()
            .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
            .map(|d| d.as_millis() as i64)
    };
    Some(FileInput {
        absolute_path: path.to_string(),
        name: p.file_name()?.to_string_lossy().into_owned(),
        extension: if is_directory {
            String::new()
        } else {
            p.extension()
                .map(|e| e.to_string_lossy().to_lowercase())
                .unwrap_or_default()
        },
        size: if is_directory { 0 } else { meta.len() as i64 },
        is_directory,
        created_at: ms(meta.created()).or(ms(meta.modified())).unwrap_or(0),
        is_pinned: false,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn collects_metadata() {
        let dir = tempfile::tempdir().unwrap();
        let f = dir.path().join("Report.PDF");
        std::fs::write(&f, b"12345").unwrap();
        let meta = collect_meta(f.to_str().unwrap()).unwrap();
        assert_eq!(meta.name, "Report.PDF");
        assert_eq!(meta.extension, "pdf");
        assert_eq!(meta.size, 5);
        assert!(!meta.is_directory);

        let d = collect_meta(dir.path().to_str().unwrap()).unwrap();
        assert!(d.is_directory);
        assert_eq!(d.extension, "");
        assert!(collect_meta(dir.path().join("missing").to_str().unwrap()).is_none());
    }

    #[tokio::test]
    async fn checks_existence() {
        let dir = tempfile::tempdir().unwrap();
        let f = dir.path().join("here.txt");
        std::fs::write(&f, b"x").unwrap();
        let results = check_all(vec![
            f.to_string_lossy().into_owned(),
            dir.path().join("gone.txt").to_string_lossy().into_owned(),
        ])
        .await;
        assert_eq!(results, [Some(true), Some(false)]);
    }
}
