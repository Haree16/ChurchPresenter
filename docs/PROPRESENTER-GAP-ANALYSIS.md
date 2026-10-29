# ChurchPresenter vs ProPresenter: Gap Analysis

As of 2026-10-29. Online copy: https://claude.ai/artifact/XK2zZmqphsixK24U2RL8km

**Research limits.** ProPresenter 7.0 to 7.7 and the version 21 PowerPoint importer are sourced from vendor and review pages (links below). Release notes for 7.8 to 7.20 and most of version 21 were not found, so confirm the newest features on renewedvision.com before fixing scope. Current pricing was not checked. ChurchPresenter status comes from `plan.md`, `RELEASE-NOTES.md`, the git log and the source tree, not from running the app.

## ProPresenter feature inventory

| Era | Feature | Source |
| --- | --- | --- |
| 6 to 7 | Unlimited main and stage outputs (PP6 allowed one each) | [Media Realm](https://www.mediarealm.com.au/articles/propresenter-7-whats-new/) |
| 6 to 7 | Display, SDI and NDI outputs mixed freely; edge blending and alpha keying included | Media Realm |
| 6 to 7 | Looks: per-screen layer assignment and theme override, switchable mid-service | Media Realm |
| 6 to 7 | Announcements layer: a second document runs alongside the main one | Media Realm |
| 6 to 7 | Rewritten slide editor: shapes, fills, alignment guides, text controls | [Church Motion Graphics](https://www.churchmotiongraphics.com/blog/the-best-new-features-included-in-propresenter-7/) |
| 6 to 7 | Stage display editor with multi-viewers and different looks per stage screen | Church Motion Graphics |
| 6 to 7 | Media Inspector: effects, audio mapping, cropping, rotation, duration, thumbnails | [Renewed Vision](https://renewedvision.com/blog/our-developers-favorite-features-in-propresenter-7) |
| 6 to 7 | Multiple Bible translations on one slide; EasyView; dark UI with search | Church Motion Graphics |
| 6 to 7 | Multi-channel audio routing; live slide reordering; library drag-and-drop sharing | Media Realm |
| 7.5 | Sidebar with Props, Messages, Stage, Audio, Timers | search summary |
| 7.6 | Scrolling text and macros | search summary |
| 7.7 | Search previews, Planning Center upgrade, custom clear groups, custom key mappings, text attributes kept across themes | [Renewed Vision](https://renewedvision.com/blog/propresenter-7-7) |
| 7.10 | Playlist templates | search summary |
| 21 | Native .pptx importer (text, shapes, media, notes, transitions; no SmartArt, charts, 3-D) | [Support article](https://support.renewedvision.com/hc/en-us/articles/45377042213011-Importing-PowerPoint-files-Natively-within-ProPresenter) |
| Current | Cloud sync, ProContent (50,000+ assets), Reflow editor, Stream Deck, timecode follow, DMX, MIDI, 130+ Bible translations, Remote app, streaming and recording | [Renewed Vision](https://renewedvision.com/propresenter/) |

## Gap matrix

Status: Have, Partial, Missing, Skipped (deliberately). "Phase" points to `docs/phases/`.

| Area | ProPresenter | ChurchPresenter | Status | Phase |
| --- | --- | --- | --- | --- |
| Multiple outputs | Unlimited main and stage screens | Multiple outputs exist | Partial | 9 |
| Looks per screen | Layers and theme per output | Looks are global (logo, blackout, props) | Missing | 9 |
| Announcements layer | Second document in parallel | None | Missing | 9 |
| Clear groups | Custom combinations | Logo, media, all, props | Partial | 7 |
| Slide editor | Shapes, guides, 8 layers | 20 elements, no rotate or resize handles | Partial | 9 |
| Themes and templates | Themes, playlist templates | Themes, slide templates, `.cptheme` | Have | |
| Media Inspector | Crop, rotate, effects, audio map | Basic playback only | Missing | 10 |
| Stage display | Editor, multi-viewers, per-screen layouts | Layout editor, one layout for all | Partial | 9 |
| Macros | Many action types, key mapping | 17 actions, operator panel only | Partial | 7 |
| Custom key mapping | Any key to props, macros, menus | Fixed shortcuts | Missing | 7 |
| Timers | Countdown, clocks, stage use | Present | Have | |
| Scrolling text, messages | Scrolling text, messages | Alerts and props, no scroll | Partial | 9 |
| Bible | 130+ translations, multi-translation slides | Importers, FTS5 search, 6 seeded passages | Partial | 8 |
| Songs | SongSelect, lyric import, Reflow editor | Paste import, OpenLyrics, OpenSong, JSON | Partial | 8 |
| CCLI reporting | Copyright and usage reports | None | Missing | 8 |
| Planning Center | Plans sync, attachments | None | Missing | 10 |
| PowerPoint import | Native .pptx, no PowerPoint needed | Needs LibreOffice | Partial | 8 |
| Search | Search previews | Library search, no previews | Partial | 8 |
| Remote control | Remote app | Phone web page, PIN pairing | Have | |
| Stream Deck, MIDI, OSC, DMX | Stream Deck, MIDI, DMX, timecode | OSC, MIDI | Partial | 10 |
| Video input, NDI, SDI, alpha key | Built in | None | Missing | 11 |
| Edge blending | Built in | None | Missing | 11 |
| Streaming and recording | Built in | OBS lower-third overlay | Partial | 11 |
| Audio routing | Multi-channel | Single playback | Missing | 11 |
| Cloud sync | Near-real-time show sync | Offline by design | Skipped | |
| Content library | ProContent 50,000+ assets | User media only | Skipped | |
| Auto-advance | Per-slide timing | One interval for all slides | Partial | 7 |
