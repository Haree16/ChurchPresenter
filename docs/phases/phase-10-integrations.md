# Phase 10: Integrations and hardware control

Goal: connect to the tools churches already use. Effort: about 6 to 8 weeks. Depends on Phase 7.4 (macros over OSC and MIDI).

Done when: a Planning Center plan imports into a service and a Stream Deck page runs a service.

## 10.1 Planning Center
- Ask first whether target churches use it (open question).
- OAuth or personal access token stored in the OS keyring, never in the backup file (backups already strip credentials).
- Import a plan's items as a service; refresh on demand; map song items to library songs by title or CCLI number.
- Offline-first rule: the app must work with no network; the sync is manual.

## 10.2 Stream Deck and other control
- Ship a Stream Deck profile or documented OSC presets using the existing OSC paths.
- Add DMX output (lighting scenes on slide change) behind a setting, off by default.
- Timecode follow is optional; defer unless requested.

## 10.3 Media Inspector
- Per-media settings: crop, rotation, volume, trim in/out, loop. Stored with the media asset and applied in `AudienceView`.
- Thumbnails for video in the media library.

## 10.4 Auto-updater
- Tauri updater plugin with a signed update feed; check on start, never install during a live service.

## 10.5 Remote hardening
From `plan.md` gap 16: remote and OSC listeners are plain HTTP and password-less OSC.
- TLS for the phone remote (self-signed with a pairing-time fingerprint check).
- Optional OSC shared secret.

## Risks
- Planning Center API terms and rate limits; read them before building.
- Updater needs a signing key and hosting decision.
