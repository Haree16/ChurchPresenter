# Phase 11.4: Alpha Key (Key and Fill Dual Outputs for Hardware Video Switchers)

## Goal
Provide broadcast-grade Alpha Key (Key & Fill / Luma Key) dual output capabilities in Church Presenter, allowing churches to send pristine graphic overlays (lyrics, lower thirds, scriptures, title cards, announcements) to professional hardware vision mixers (Blackmagic ATEM, Roland, Ross Carbonite, vMix, TriCaster) with anti-aliased transparency cutouts and zero color fringing.

---

## Technical Architecture & Key/Fill Principles

In professional broadcast video engineering, hardware switchers achieve anti-aliased transparency over live camera feeds using two synchronized video channels:
1. **Fill Channel**:
   - Contains the full-color graphics (rendered lyrics, lower thirds, badges, speaker labels, sermon titles).
   - In **Straight Alpha** mode, the background is transparent.
   - In **Premultiplied Alpha** mode, color pixels are pre-multiplied against a black background (`#000000`), matching ATEM Linear/External Keyer specifications.
2. **Key Channel (Alpha Matte / Mask)**:
   - A synchronized luminance mask representing the spatial opacity of every pixel in the Fill channel:
     - 100% opaque regions (text bodies, solid badges) = Pure White (`#FFFFFF`, RGB 255, 255, 255).
     - 100% transparent regions (backgrounds) = Pure Black (`#000000`, RGB 0, 0, 0).
     - Fractional opacity regions (anti-aliased font edges, drop shadows, blurred glows, translucent panels) = Proportional Grayscale luminance (`#010101` to `#FEFEFE`).
3. **Output Routing Modes**:
   - **Dual Window / Dual Monitor Mode**:
     - Window A (Fill) routed to Display/SDI Output 1 (e.g. `?window=alpha_fill`).
     - Window B (Key Matte) routed to Display/SDI Output 2 (e.g. `?window=alpha_key`).
   - **Side-by-Side (Split Horizontal)**:
     - Single 3840x1080 canvas with Fill rendered on the left half (1920x1080) and Key rendered on the right half (1920x1080).
     - Designed for single-head dual-link SDI / HDMI hardware converters (Decimator MD-HX, Blackmagic Mini Converter).
   - **Over-Under (Split Vertical)**:
     - Single 1920x2160 canvas with Fill on top and Key on bottom.

---

## Acceptance Criteria

1. **SQLite Database Migration 33**:
   - `alpha_key_configs` table storing configuration:
     - `id`, `is_enabled`, `is_active`, `mode` (`dual_window`, `side_by_side`, `stacked`), `content_source` (`overlay`, `audience`), `fill_monitor_id`, `key_monitor_id`, `combined_monitor_id`, `premultiplied`, `key_gain`, `key_invert`, `key_clip_percent`, `created_at`, `updated_at`.
   - Backup/Restore data integration.
2. **Backend Rust Models & Commands**:
   - `AlphaKeyConfig`, `AlphaKeyStatus`.
   - Commands: `get_alpha_key_config`, `update_alpha_key_config`, `toggle_alpha_key`, `get_alpha_key_status`, `open_alpha_window`, `close_alpha_window`.
3. **Action Registry & Macro Engine**:
   - Registered actions: `toggle_alpha_key`, `open_alpha_key_outputs`, `close_alpha_key_outputs`.
   - `MacroStep::AlphaKey { command: String }` supporting `toggle`, `turn_on`, `turn_off`.
4. **Renderer & Window Architecture**:
   - `src/components/Broadcast/AlphaKeyView.tsx` rendering Fill, Key Matte, and Combined views.
   - Synchronized state streaming from `PresentationState` and `LivestreamOverlayConfig`.
   - In `App.tsx`, route windows: `alpha_fill`, `alpha_key`, `alpha_combined`.
5. **Operator Controls & Production Integrations UI**:
   - Tab in `ProductionIntegrationsModal.tsx` ("Alpha Key (Key & Fill)"):
     - Live side-by-side preview monitors for Fill and Key Matte.
     - Dual Window vs Side-by-Side selector.
     - Content source selector (Livestream Lower Thirds vs Full Presentation Slides).
     - Monitor assignment pickers and quick Launch/Close controls.
     - Gain, Clip, Invert, and Premultiplied toggles.
   - Macro editor support in `MacroManagerModal.tsx`.
6. **Testing & Verification**:
   - Unit tests for backend database migration and commands.
   - Vitest test suite in `tests/alpha-key.test.tsx` verifying configuration, mask computation, macro execution, and UI controls.
