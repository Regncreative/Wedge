//! Phone → PC: while the user has the "Receive from phone" sheet open, a
//! small web server on the local network accepts uploads. The URL (shown as
//! a QR code) contains a random token; it stops after 15 minutes or when the
//! sheet closes. Received files land on the "From phone" shelf.

use std::io::Read;
use std::net::UdpSocket;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, OnceLock};
use std::time::{Duration, Instant};

use serde::Serialize;
use tauri::{AppHandle, Manager};

use crate::actions::unique_path;
use crate::models::Language;
use crate::state::AppState;

const LIFETIME: Duration = Duration::from_secs(15 * 60);
const MAX_UPLOAD: u64 = 4 * 1024 * 1024 * 1024;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PhoneSession {
    pub url: String,
    pub qr_svg: String,
    pub expires_at: i64,
}

struct Running {
    session: PhoneSession,
    stop: Arc<AtomicBool>,
}

fn running() -> &'static Mutex<Option<Running>> {
    static R: OnceLock<Mutex<Option<Running>>> = OnceLock::new();
    R.get_or_init(|| Mutex::new(None))
}

/// The address other devices on the network can reach us at.
pub fn local_ip() -> Option<std::net::IpAddr> {
    // No packet is sent; connecting a UDP socket just picks the outgoing interface.
    let socket = UdpSocket::bind("0.0.0.0:0").ok()?;
    socket.connect("8.8.8.8:80").ok()?;
    socket.local_addr().ok().map(|a| a.ip())
}

pub fn percent_decode(s: &str) -> String {
    let bytes = s.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        match bytes[i] {
            b'%' if i + 2 < bytes.len() => {
                let hex = std::str::from_utf8(&bytes[i + 1..i + 3]).ok();
                match hex.and_then(|h| u8::from_str_radix(h, 16).ok()) {
                    Some(b) => {
                        out.push(b);
                        i += 3;
                    }
                    None => {
                        out.push(b'%');
                        i += 1;
                    }
                }
            }
            b'+' => {
                out.push(b' ');
                i += 1;
            }
            b => {
                out.push(b);
                i += 1;
            }
        }
    }
    String::from_utf8_lossy(&out).into_owned()
}

/// A safe file name from whatever the phone sent.
pub fn sanitize_name(raw: &str) -> String {
    let base = raw.rsplit(['/', '\\']).next().unwrap_or("");
    let clean: String = base
        .chars()
        .filter(|c| !r#"<>:"|?*"#.contains(*c) && !c.is_control())
        .take(120)
        .collect();
    let clean = clean.trim().trim_matches('.').to_string();
    if clean.is_empty() {
        "upload".into()
    } else {
        clean
    }
}

fn page(lang: Language) -> String {
    let (title, pick, sending, done, failed) = match lang {
        Language::Tr => (
            "Stash’e gönder",
            "Dosya seç",
            "Gönderiliyor…",
            "Gönderildi ✓",
            "Gönderilemedi",
        ),
        Language::En => (
            "Send to Stash",
            "Choose files",
            "Sending…",
            "Sent ✓",
            "Failed",
        ),
    };
    format!(
        r#"<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{title}</title><style>
body{{font-family:system-ui,sans-serif;margin:0;padding:24px;background:#0f172a;color:#f1f5f9}}
h1{{font-size:22px;margin:8px 0 20px}}label{{display:block;padding:18px;border-radius:14px;background:#2563eb;text-align:center;font-weight:600;font-size:17px}}
input{{display:none}}ul{{list-style:none;padding:0;margin-top:20px}}li{{padding:10px 0;border-bottom:1px solid #334155;display:flex;justify-content:space-between;gap:12px;word-break:break-all}}
</style></head><body><h1>{title}</h1><label>{pick}<input id="f" type="file" multiple></label><ul id="l"></ul>
<script>
const f=document.getElementById('f'),l=document.getElementById('l');
f.onchange=async()=>{{for(const file of f.files){{const li=document.createElement('li');li.textContent=file.name;const s=document.createElement('span');s.textContent='{sending}';li.appendChild(s);l.prepend(li);
try{{const r=await fetch(location.pathname+'/upload?name='+encodeURIComponent(file.name),{{method:'PUT',body:file}});s.textContent=r.ok?'{done}':'{failed}'}}catch(e){{s.textContent='{failed}'}}}}f.value=''}};
</script></body></html>"#
    )
}

/// Serve until `stop` is set or the lifetime ends. `on_file` gets each saved upload.
pub fn serve(
    server: tiny_http::Server,
    token: String,
    inbox: PathBuf,
    lang: Language,
    stop: Arc<AtomicBool>,
    on_file: impl Fn(PathBuf),
) {
    let started = Instant::now();
    let base = format!("/{token}");
    let upload = format!("/{token}/upload");
    while !stop.load(Ordering::SeqCst) && started.elapsed() < LIFETIME {
        let Ok(Some(mut req)) = server.recv_timeout(Duration::from_millis(300)) else {
            continue;
        };
        let url = req.url().to_string();
        let (path, query) = url.split_once('?').unwrap_or((url.as_str(), ""));
        let html =
            tiny_http::Header::from_bytes("Content-Type", "text/html; charset=utf-8").unwrap();
        let response = match (req.method(), path) {
            (tiny_http::Method::Get, p) if p == base => {
                tiny_http::Response::from_string(page(lang)).with_header(html)
            }
            (tiny_http::Method::Put | tiny_http::Method::Post, p) if p == upload => {
                let name = query
                    .split('&')
                    .find_map(|kv| kv.strip_prefix("name="))
                    .map(percent_decode)
                    .map(|n| sanitize_name(&n))
                    .unwrap_or_else(|| "upload".into());
                match save_upload(&inbox, &name, req.as_reader()) {
                    Ok(dest) => {
                        on_file(dest);
                        tiny_http::Response::from_string("ok")
                    }
                    Err(e) => {
                        log::warn!("phone upload failed: {e}");
                        tiny_http::Response::from_string("error").with_status_code(500)
                    }
                }
            }
            _ => tiny_http::Response::from_string("not found").with_status_code(404),
        };
        let _ = req.respond(response);
    }
}

fn save_upload(inbox: &Path, name: &str, body: &mut dyn Read) -> std::io::Result<PathBuf> {
    std::fs::create_dir_all(inbox)?;
    let p = Path::new(name);
    let stem = p
        .file_stem()
        .map(|s| s.to_string_lossy().into_owned())
        .unwrap_or_default();
    let ext = p
        .extension()
        .map(|e| e.to_string_lossy().into_owned())
        .unwrap_or_default();
    let dest = unique_path(inbox, &stem, &ext);
    let mut file = std::fs::File::create(&dest)?;
    let copied = std::io::copy(&mut body.take(MAX_UPLOAD + 1), &mut file)?;
    if copied > MAX_UPLOAD {
        drop(file);
        let _ = std::fs::remove_file(&dest);
        return Err(std::io::Error::other("upload too large"));
    }
    Ok(dest)
}

#[tauri::command]
pub fn phone_start(app: AppHandle) -> Result<PhoneSession, String> {
    let mut slot = running().lock().map_err(|e| e.to_string())?;
    if let Some(r) = slot.as_ref() {
        if !r.stop.load(Ordering::SeqCst) {
            return Ok(r.session.clone());
        }
    }
    // Tests stay on loopback (no firewall prompt, no network needed).
    let loopback = std::env::var_os("STASH_PHONE_LOOPBACK").is_some();
    let ip = if loopback {
        std::net::IpAddr::from([127, 0, 0, 1])
    } else {
        local_ip().ok_or("no network")?
    };
    let bind = if loopback { "127.0.0.1:0" } else { "0.0.0.0:0" };
    let server = tiny_http::Server::http(bind).map_err(|e| e.to_string())?;
    let port = server
        .server_addr()
        .to_ip()
        .map(|a| a.port())
        .ok_or("no port")?;
    let token = uuid::Uuid::new_v4().simple().to_string();
    let url = format!("http://{ip}:{port}/{token}");
    let qr_svg = qrcode::QrCode::new(url.as_bytes())
        .map_err(|e| e.to_string())?
        .render::<qrcode::render::svg::Color>()
        .min_dimensions(220, 220)
        .quiet_zone(true)
        .build();
    let session = PhoneSession {
        url,
        qr_svg,
        expires_at: crate::db::now_ms() + LIFETIME.as_millis() as i64,
    };
    let stop = Arc::new(AtomicBool::new(false));
    *slot = Some(Running {
        session: session.clone(),
        stop: stop.clone(),
    });

    let state = app.state::<AppState>();
    let inbox = state.data_dir.join("inbox");
    let lang = state.language;
    let app2 = app.clone();
    std::thread::spawn(move || {
        serve(server, token, inbox, lang, stop.clone(), |path| {
            crate::services::ingest(&app2, &[path.to_string_lossy().into_owned()], "phone", None);
        });
        stop.store(true, Ordering::SeqCst);
    });
    Ok(session)
}

#[tauri::command]
pub fn phone_stop() {
    if let Ok(mut slot) = running().lock() {
        if let Some(r) = slot.take() {
            r.stop.store(true, Ordering::SeqCst);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    use std::net::TcpStream;

    #[test]
    fn decodes_and_sanitizes_names() {
        assert_eq!(percent_decode("IMG%20001%2Ejpg"), "IMG 001.jpg");
        assert_eq!(percent_decode("%C3%A7i%C3%A7ek.png"), "çiçek.png");
        assert_eq!(percent_decode("100%"), "100%");
        assert_eq!(sanitize_name("../../Windows/evil.exe"), "evil.exe");
        assert_eq!(sanitize_name("a<b>:c?.txt"), "abc.txt");
        assert_eq!(sanitize_name(".."), "upload");
    }

    fn http(port: u16, request: &str, body: &[u8]) -> String {
        let mut s = TcpStream::connect(("127.0.0.1", port)).unwrap();
        s.write_all(request.as_bytes()).unwrap();
        s.write_all(body).unwrap();
        let mut out = String::new();
        s.read_to_string(&mut out).unwrap();
        out
    }

    #[test]
    fn serves_the_page_and_saves_uploads_only_with_the_token() {
        let dir = tempfile::tempdir().unwrap();
        let inbox = dir.path().join("inbox");
        let server = tiny_http::Server::http("127.0.0.1:0").unwrap();
        let port = server.server_addr().to_ip().unwrap().port();
        let stop = Arc::new(AtomicBool::new(false));
        let received = Arc::new(Mutex::new(Vec::new()));
        let (stop2, received2, inbox2) = (stop.clone(), received.clone(), inbox.clone());
        let handle = std::thread::spawn(move || {
            serve(server, "tok123".into(), inbox2, Language::En, stop2, |p| {
                received2.lock().unwrap().push(p)
            })
        });

        let page = http(
            port,
            "GET /tok123 HTTP/1.1\r\nHost: x\r\nConnection: close\r\n\r\n",
            b"",
        );
        assert!(page.starts_with("HTTP/1.1 200") && page.contains("Send to Stash"));

        let wrong = http(
            port,
            "GET /nope HTTP/1.1\r\nHost: x\r\nConnection: close\r\n\r\n",
            b"",
        );
        assert!(wrong.starts_with("HTTP/1.1 404"));
        let sneaky = http(
            port,
            "PUT /nope/upload?name=x.txt HTTP/1.1\r\nHost: x\r\nContent-Length: 2\r\nConnection: close\r\n\r\n",
            b"hi",
        );
        assert!(sneaky.starts_with("HTTP/1.1 404"));

        let body = b"photo-bytes";
        let req = format!(
            "PUT /tok123/upload?name=..%2F..%2FIMG%201.jpg HTTP/1.1\r\nHost: x\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
            body.len()
        );
        assert!(http(port, &req, body).starts_with("HTTP/1.1 200"));

        stop.store(true, Ordering::SeqCst);
        handle.join().unwrap();
        let got = received.lock().unwrap().clone();
        assert_eq!(got, [inbox.join("IMG 1.jpg")]);
        assert_eq!(std::fs::read(&got[0]).unwrap(), body);
    }
}
