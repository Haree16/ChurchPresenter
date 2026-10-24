# Security & Network Hardening Guide

Church Presenter operates in local church local-area networks (LAN / Wi-Fi), which are often shared between AV staff, musicians, guest speakers, and congregation members. This guide details the security defenses engineered into the application to prevent unauthorized control, presentation disruption, and credential leaks.

---

## 1. Content Security Policy (CSP)

Tauri enforces a strict Content Security Policy defined in `src-tauri/tauri.conf.json`:

```
default-src 'self'; 
img-src 'self' asset: https://asset.localhost data: blob:; 
media-src 'self' asset: https://asset.localhost data: blob:; 
style-src 'self' 'unsafe-inline'; 
font-src 'self' data:; 
connect-src 'self' ws: http:; 
script-src 'self';
```

### Protections Provided
- **No Remote Script Execution**: Only compiled, cryptographically signed local JavaScript bundles can execute.
- **Controlled Media Origins**: Audio, video, and image assets can only load from local application storage (`asset:` / `https://asset.localhost`) or in-memory blobs.
- **No Third-Party Analytics**: Zero telemetry, tracking pixels, or external CDN requests.

---

## 2. Tauri IPC Capability Permissions

In Tauri 2, IPC commands (`invoke`) are strictly gated by capability files located in `src-tauri/capabilities/default.json`.

Permissions are scoped exclusively to known application windows:
```json
{
  "windows": ["main", "audience", "stage", "overlay"]
}
```
If an unauthorized webview or external browser context attempts to call Tauri Rust backend commands, Tauri rejects the call with an immediate permission denial.

---

## 3. Local Mobile Remote Control Security

The embedded micro-server (`tiny_http`) serves a mobile web remote at `http://<lan-ip>:8088/remote`. To prevent congregation members on church Wi-Fi from hijacking the presentation:

### 3.1 6-Digit PIN Pairing Handshake
- When a phone or tablet connects, it must submit the 6-digit PIN displayed on the operator monitor.
- Entering the correct PIN issues a secure 32-character hexadecimal session token stored in SQLite.

### 3.2 Operator Approval Queue
- Even with the correct PIN, new devices enter a **Pending Approval** state.
- The operator must explicitly click **Approve** in the Remote Control settings before the device can issue presentation commands.

### 3.3 Fine-Grained Device Permissions
The operator can configure granular rights per connected remote device:
- `canNavigate`: Advance or reverse slides
- `canBlackout`: Toggle screen blackout
- `canTakeLive`: Trigger live slides
- `canControlTimer`: Start/pause countdown timers

### 3.4 Rate Limiting & Brute-Force Guard
- The HTTP server enforces a rate limit of **10 requests per second per client IP address**.
- Rapid PIN guessing attempts trigger HTTP `429 Too Many Requests` responses.

---

## 4. Livestream & OBS Overlay Token Protection

- The OBS browser source endpoint requires an authentication token:
  ```
  http://<lan-ip>:8088/overlay?token=<secure-token>
  ```
- Unauthorized requests without the token are rejected with HTTP `401 Unauthorized`.
- Operators can regenerate/rotate the token with one click in the **Overlay Settings** modal if the token is ever compromised.

---

## 5. Open Sound Control (OSC) Network Filtering

- **Port Binding**: Listens on a configurable UDP port (default 8000).
- **Command Allowlist**: Only explicit paths matching `/cp/*` (`/cp/next`, `/cp/prev`, `/cp/blackout`, `/cp/clear`, `/cp/live`, `/cp/slide/*`, `/cp/item/*`, `/cp/timer/*`) are accepted.
- **Configurable Enable/Disable**: Operators can disable specific OSC commands or shut down the UDP listener completely during non-service hours.

---

## 6. Media Sandboxing & Path Traversal Prevention

- When operators import images, videos, or audio tracks, files are copied into the app-managed `media/` directory under randomly generated UUID filenames:
  ```
  ~/.local/share/church-presenter/media/<uuid>.<ext>
  ```
- File extensions are strictly validated against a known whitelist (`jpg`, `jpeg`, `png`, `webp`, `mp4`, `webm`, `mp3`, `wav`, `ogg`).
- Relative path sequences (`../`, `..\`) are stripped to prevent arbitrary file read vulnerabilities.

---

## 7. Backup Credential Sanitization

When exporting database backups (`BackupData` schema version `6.0.0`), sensitive mobile remote session tokens and authentication hashes in the `remote_devices` table are replaced with `"[SANITIZED]"` before writing to disk.
