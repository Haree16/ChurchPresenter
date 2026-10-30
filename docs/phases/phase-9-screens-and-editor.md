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

## 9.2 Announcements layer [COMPLETED]
- **Implemented**: Added `AnnouncementsState` to `PresentationState` in `models.rs` and frontend `types/index.ts`.
- **Independent State Execution**: In `presentation.rs`, added `set_announcements_presentation_core`, `set_announcements_slide_core`, `next_announcements_slide_core`, `previous_announcements_slide_core`, and `clear_announcements_core`.
- **Target Outputs Filtering**: Announcements layer routes specifically to designated target outputs (e.g. Foyer, Stage, Overlay). Sanctuary/audience outputs continue rendering the main sermon/worship presentation unchanged.
- **Looping & Auto-Advance**: Configurable loop at end and background auto-advance ticker thread (`spawn_announcements_loop`) that automatically advances foyer slides on schedule.
- **Clearing Logic**: Clears independently via operator panel and is automatically included in `clear_all` and `clear_group` (with `'announcements'` layer).
- **Operator Panel**: Added `AnnouncementsControl` component to `PreviewPanel`, displaying second live slot thumbnail, slide position (`Slide X of Y`), interval control, loop toggle, and dedicated next/prev/clear buttons.
- **Verification**: Verified with both Cargo unit tests and Vitest component/integration test suite (`tests/announcements-layer.test.tsx`). Main presentation and announcements layer operate independently without collisions.

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
