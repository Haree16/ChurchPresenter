//! Loopback HTTP server for the app's media folder.
//!
//! WebKitGTK cannot stream `<video>`/`<audio>` from Tauri's custom `asset://` scheme (the player
//! fails with MEDIA_ERR_SRC_NOT_SUPPORTED), so playable media is served over plain HTTP with
//! Range support instead. It only binds 127.0.0.1 and only serves files directly inside `media/`.

use std::fs::File;
use std::io::{Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};
use std::sync::OnceLock;

use tiny_http::{Header, Response, Server, StatusCode};

static PORT: OnceLock<u16> = OnceLock::new();

pub fn port() -> Option<u16> {
    PORT.get().copied()
}

fn content_type(path: &Path) -> &'static str {
    match path.extension().and_then(|e| e.to_str()).map(|e| e.to_ascii_lowercase()).as_deref() {
        Some("mp4") | Some("m4v") => "video/mp4",
        Some("webm") => "video/webm",
        Some("mov") => "video/quicktime",
        Some("ogv") => "video/ogg",
        Some("mp3") => "audio/mpeg",
        Some("wav") => "audio/wav",
        Some("ogg") | Some("oga") => "audio/ogg",
        Some("m4a") => "audio/mp4",
        Some("png") => "image/png",
        Some("jpg") | Some("jpeg") => "image/jpeg",
        Some("gif") => "image/gif",
        Some("webp") => "image/webp",
        _ => "application/octet-stream",
    }
}

/// Resolve a request path like `/media/<file>` to a file directly inside `media_dir`.
fn resolve(media_dir: &Path, url_path: &str) -> Option<PathBuf> {
    let path = url_path.split('?').next().unwrap_or("");
    let name = path.strip_prefix("/media/")?;
    let name = percent_decode(name);
    if name.is_empty() || name.contains('/') || name.contains('\\') || name.contains("..") {
        return None;
    }
    let file = media_dir.join(name);
    file.is_file().then_some(file)
}

fn percent_decode(s: &str) -> String {
    let bytes = s.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            if let Ok(v) = u8::from_str_radix(&s[i + 1..i + 3], 16) {
                out.push(v);
                i += 3;
                continue;
            }
        }
        out.push(bytes[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

/// Parse `bytes=start-end` (single range) against a file of `len` bytes.
fn parse_range(header: &str, len: u64) -> Option<(u64, u64)> {
    let spec = header.trim().strip_prefix("bytes=")?;
    let (start, end) = spec.split_once('-')?;
    if start.is_empty() {
        let suffix: u64 = end.parse().ok()?;
        return Some((len.saturating_sub(suffix), len.checked_sub(1)?));
    }
    let start: u64 = start.parse().ok()?;
    let end: u64 = if end.is_empty() { len.checked_sub(1)? } else { end.parse().ok()? };
    (start <= end && start < len).then(|| (start, end.min(len - 1)))
}

fn header(name: &str, value: &str) -> Header {
    Header::from_bytes(name.as_bytes(), value.as_bytes()).expect("valid header")
}

fn handle(media_dir: &Path, request: tiny_http::Request) {
    let Some(file_path) = resolve(media_dir, request.url()) else {
        let _ = request.respond(Response::empty(StatusCode(404)));
        return;
    };
    let Ok(mut file) = File::open(&file_path) else {
        let _ = request.respond(Response::empty(StatusCode(404)));
        return;
    };
    let len = file.metadata().map(|m| m.len()).unwrap_or(0);
    let range_header = request
        .headers()
        .iter()
        .find(|h| h.field.equiv("Range"))
        .map(|h| h.value.as_str().to_string());

    let mut headers = vec![
        header("Content-Type", content_type(&file_path)),
        header("Accept-Ranges", "bytes"),
        header("Access-Control-Allow-Origin", "*"),
    ];

    match range_header {
        Some(h) => match parse_range(&h, len) {
            Some((start, end)) => {
                let count = end - start + 1;
                if file.seek(SeekFrom::Start(start)).is_err() {
                    let _ = request.respond(Response::empty(StatusCode(500)));
                    return;
                }
                headers.push(header("Content-Range", &format!("bytes {}-{}/{}", start, end, len)));
                let response = Response::new(
                    StatusCode(206),
                    headers,
                    file.take(count),
                    Some(count as usize),
                    None,
                );
                let _ = request.respond(response);
            }
            None => {
                let response = Response::empty(StatusCode(416))
                    .with_header(header("Content-Range", &format!("bytes */{}", len)));
                let _ = request.respond(response);
            }
        },
        None => {
            let response = Response::new(StatusCode(200), headers, file, Some(len as usize), None);
            let _ = request.respond(response);
        }
    }
}

/// Start the server (idempotent) and return its port.
pub fn start(media_dir: PathBuf) -> Result<u16, String> {
    if let Some(p) = port() {
        return Ok(p);
    }
    let server = Server::http("127.0.0.1:0").map_err(|e| e.to_string())?;
    let port = server
        .server_addr()
        .to_ip()
        .map(|a| a.port())
        .ok_or_else(|| "media server has no IP address".to_string())?;
    let _ = PORT.set(port);
    std::thread::spawn(move || {
        for request in server.incoming_requests() {
            let dir = media_dir.clone();
            std::thread::spawn(move || handle(&dir, request));
        }
    });
    Ok(port)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn range_parsing() {
        assert_eq!(parse_range("bytes=0-99", 1000), Some((0, 99)));
        assert_eq!(parse_range("bytes=500-", 1000), Some((500, 999)));
        assert_eq!(parse_range("bytes=-100", 1000), Some((900, 999)));
        assert_eq!(parse_range("bytes=0-5000", 1000), Some((0, 999)));
        assert_eq!(parse_range("bytes=2000-", 1000), None);
    }

    #[test]
    fn rejects_traversal() {
        let dir = std::env::temp_dir();
        assert!(resolve(&dir, "/media/../etc/passwd").is_none());
        assert!(resolve(&dir, "/media/%2e%2e%2fsecret").is_none());
        assert!(resolve(&dir, "/other/file.mp4").is_none());
    }
}
