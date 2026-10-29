# Phase 11: Broadcast (only if users ask)

Goal: video-production outputs and inputs. Effort: 8+ weeks, each item separable. Start an item only when a church asks for it.

Done when: per item, below.

| Item | Done when | Notes |
| --- | --- | --- |
| Recording | The audience output records to a file | Simplest; try first |
| OBS WebSocket | Operator can switch an OBS scene from a macro step | Needs OBS 28+ |
| Live video input | A camera feed appears as a slide or layer | Platform capture APIs differ on Linux and Windows |
| Alpha key | A key and fill pair goes to a second output | Needs hardware or NDI |
| NDI output | Audience output is visible as an NDI source | Check NDI SDK licence before any code |
| Edge blending | Two projectors blend across an overlap | Per-output setting in `output_configs` |
| Audio routing | Choose an output device per audio item | Single playback today |

## Decision gates
- Before NDI: read the SDK licence and decide whether bundling is allowed.
- Before live input: pick a capture library for Linux and Windows.
- Each item gets its own plan file when started.
