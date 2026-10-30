# Phase 9: Screens, Looks and editor

Goal: match ProPresenter 7's multi-screen model and bring the slide editor closer to it. Effort: about 6 to 8 weeks. Depends on Phase 7.

Done when: the main screen and a lobby screen show different content and themes at the same time, switched by one Look.

## 9.1 Per-screen Looks [COMPLETED]
Today a Look (`looks.rs`) stores logo, blackout and props globally.
- **Implemented**: Added `ScreenLookConfig` (`output_id`, `logo`, `blackout`, `prop_ids`, `theme_id`) and `screen_configs: Vec<ScreenLookConfig>` to `Look`.
- **Database**: Migration 24 adds `screen_configs TEXT` column to `looks` table.
- **Backward Compatibility**: Any Look without `screen_configs` or with an empty list applies globally across all outputs. Screens without an override seamlessly inherit global layers.
- **State & Manager**: Added `ScreenLayers` struct and `screen_layers` map in `PresentationState`. `PresentationManager` isolates per-screen state via `set_look_layers_core` and `set_screen_layer_core`.
- **API & UI**:
  - `apply_look` Tauri command and frontend API take optional `target_output_id`.
  - `LooksControl` panel features a Target selector (All Screens vs. specific output), per-screen override indicator badge, and a Per-Screen Looks Grid modal to customize logo, blackout, props, and theme overrides per screen.
  - `AudienceView` respects per-screen layer overrides and theme overrides based on its target `outputId`.
- **Verification**: All Rust and Vitest test suites pass (including tests proving that applying a Look to one output leaves other outputs untouched).

## 9.2 Announcements layer
- A second presentation or service item that plays on chosen outputs while the main one is operated separately (state split in `presentation.rs`).
- Operator panel: a second live slot with its own next/previous; clears independently; included in Clear All.
- Typical use: looping foyer slides before service.

## 9.3 Per-screen stage layouts
Today there is one stage layout for all stage screens (`stage_layout.rs`).
- Key layouts by stage output id; the editor picks which screen it edits.
- Add a multi-viewer panel (shows what a chosen main output displays).

## 9.4 Editor polish
- Rotate and resize handles on elements; alignment guides and snapping.
- Draw elements on the stage display and the phone preview (not done today).
- "New slide from template" button.

## 9.5 Scrolling text and messages
- Props gain a scroll mode (speed, direction); a message prop for lobby tickers.
- Cleared by Clear All and `clear_props`.

## Risks
- Splitting presentation state for the announcements layer touches the core of `presentation.rs`; write tests first and keep the single-layer path unchanged.
