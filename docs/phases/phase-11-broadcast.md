# Phase 11: Broadcast (only if users ask)

Goal: video-production outputs and inputs. Effort: 8+ weeks, each item separable. Start an item only when a church asks for it.

Done when: per item, below.

| Item | Done when | Notes | Plan | Status |
| --- | --- | --- | --- | --- |
| 11.1 Recording | The audience output records to a file | Simplest; try first | [phase-11.1-recording.md](phase-11.1-recording.md) | **Completed** |
| 11.2 OBS WebSocket | Operator can switch an OBS scene from a macro step | Needs OBS 28+ | [phase-11.2-obs-websocket.md](phase-11.2-obs-websocket.md) | **Completed** |
| 11.3 Live video input | A camera feed appears as a slide or layer | Platform capture APIs differ on Linux and Windows | | Open |
| 11.4 Alpha key | A key and fill pair goes to a second output | Needs hardware or NDI | | Open |
| 11.5 NDI output | Audience output is visible as an NDI source | Check NDI SDK licence before any code | | Open |
| 11.6 Edge blending | Two projectors blend across an overlap | Per-output setting in `output_configs` | | Open |
| 11.7 Audio routing | Choose an output device per audio item | Single playback today | | Open |

## Decision gates
- Before NDI: read the SDK licence and decide whether bundling is allowed.
- Before live input: pick a capture library for Linux and Windows.
- Each item gets its own plan file when started.
