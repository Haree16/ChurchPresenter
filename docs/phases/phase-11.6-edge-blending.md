# Phase 11.6: Edge Blending (Multi-Projector Panoramic Displays)

## Overview & Background
In large church auditoriums and worship spaces with ultra-wide stages or curved sanctuaries, standard 16:9 projection cannot achieve sufficient width or resolution without extreme lens throw or optical distortion. Modern churches use **multi-projector panoramic screens** (e.g. 32:9 or 48:9 ultra-wide displays) where two or more projectors overlap horizontally (or vertically) to create a seamless continuous image.

When two projectors overlap, the overlapping region receives light from both projectors, producing a distracting bright stripe ("hotspot" or seam) twice as bright as the rest of the canvas. **Edge Blending** resolves this by applying a calibrated non-linear luminance gradient (gamma-corrected falloff) across the overlap boundary:
- **Projector 1 (Left)**: Fades luminance from 100% down to 0% across its right overlap zone.
- **Projector 2 (Right)**: Fades luminance from 0% up to 100% across its left overlap zone.
- **Combined Optical Image**: $L_{\text{total}}(x) = L_{\text{left}}(x) + L_{\text{right}}(x) = 1.0$ (100% flat uniform luminance across the entire sanctuary wall).

---

## Technical Specifications & Mathematical Formulation

### 1. Overlap Dimension
- Configurable overlap width $W_{\text{overlap}}$ in pixels (typically 120–400 px, or 10%–25% of projector width).
- Target blend edge: `left`, `right`, `top`, `bottom`, or `both_horizontal`.

### 2. Gamma-Corrected Luminance Curve
Human visual perception and projector light valves (DLP, LCD, Laser) respond non-linearly to digital input values. A linear digital ramp creates a visible dark or bright seam in the overlap area. Edge blending uses a power curve:

$$
\alpha(x) = \left( \frac{x}{W_{\text{overlap}}} \right)^\gamma
$$

Where:
- $x \in [0, W_{\text{overlap}}]$ is the distance from the edge.
- $\gamma$ is the projector gamma response (range 1.0 to 3.5, broadcast default **2.2**).

### 3. Black Level Uplift (Light Floor Compensation)
Projection technology cannot produce absolute 0-nit black due to internal light scatter ("light leak"). In the overlap zone, the black levels of both projectors add up ($2 \times \text{black level}$). When displaying dark backgrounds or fading to black during communion, a visible gray band appears in the overlap zone.
- `black_level_lift`: Injects a calibrated black floor lift (0.0% to 15.0%) into the non-overlapping projection areas so the entire panorama maintains an identical black floor.

### 4. Interactive Alignment & Calibration Test Pattern
To physically align projector mounting brackets, zoom, lens shift, and focus, Church Presenter generates an on-screen calibration test pattern:
- **Crosshatch Grid**: 50px precision grid with center convergence crosshair.
- **Overlap Boundary Markers**: High-contrast dotted guides indicating exactly where the overlap region begins and ends.
- **16-Step Grayscale Step Ramp**: Visual reference to verify gamma curve smoothness across the blend seam without banding.
- **Color Convergence Bars**: Red, green, blue, and white bars for chromatic aberration checks.

---

## Architectural Implementation Plan
1. **Database (Migration 35)**:
   - Add columns to `output_configs`:
     - `edge_blend_enabled` (INTEGER, default 0)
     - `edge_blend_edge` (TEXT, default 'none')
     - `edge_blend_overlap_pixels` (INTEGER, default 0)
     - `edge_blend_gamma` (REAL, default 2.2)
     - `edge_blend_black_level_lift` (REAL, default 0.0)
     - `edge_blend_test_pattern` (INTEGER, default 0)
   - Action mappings: `toggle_edge_blend`, `toggle_edge_blend_test_pattern`.
2. **Backend**:
   - `src-tauri/src/models.rs`: Update `OutputConfig` with edge blending fields.
   - `src-tauri/src/db.rs`: Migration 35, CRUD queries, backup import/export.
   - `src-tauri/src/actions.rs`: Dispatch core and actions for edge blend.
   - `src-tauri/src/macros.rs`: Macro step `MacroStep::EdgeBlend`.
   - `src-tauri/src/commands.rs`: Commands `update_output_edge_blend`, `toggle_output_edge_blend`, `toggle_output_edge_blend_test_pattern`.
3. **Frontend**:
   - `src/types/index.ts`: Extend `OutputConfig` and `MacroStep`.
   - `src/services/api.ts`: Edge blending API endpoints and mock store.
   - `src/components/Broadcast/EdgeBlendOverlay.tsx`: CSS/SVG luminance gradient mask & alignment test pattern generator.
   - `src/components/Production/OutputManagerModal.tsx`: Edge Blending configuration card with interactive sliders, curve diagram, and test pattern trigger.
   - `src/components/AudienceWindow.tsx`: Render EdgeBlendOverlay.
4. **Verification**:
   - Vitest suite `tests/edge-blend.test.tsx` and Rust backend tests.
