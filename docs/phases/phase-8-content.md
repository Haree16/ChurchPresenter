# Phase 8: Content and licensing

Goal: make song, Bible and slide content good enough that a church can switch without losing material. Effort: about 6 to 8 weeks. Can start after Phase 7.1.

Done when: a church can import its songs and a PowerPoint deck, build a service with real Bible text, and produce a CCLI report.

## 8.1 Bible library
Today: importers and FTS5 search exist; only about six passages are seeded and autocomplete uses a short hard-coded list.
- Decide which public-domain translations ship (e.g. KJV, WEB) and confirm each licence. Open question for the owner.
- DONE: autocomplete built from the imported verses (book, chapter, verse) instead of the hard-coded list of ten passages. Backend `bible_suggest.rs` (command `suggest_bible_references`); the Bible lookup box calls it. It only offers books, chapters and verses that exist, so a partial import (like the seeded John 3:16-18) never offers verses that are missing. Matches by name prefix or abbreviation in any language ("jn", "ps", "யோவ"). A space after a book offers its first chapters. Arrow keys (Up/Down, wrapping), Enter to pick and Escape to close work in the box.
- Side-by-side translation layout on a slide: DONE. `AudienceView` renders dual-translation Bible slides (`chunk[0].translation / sec_tr`) in a side-by-side dual column grid layout with column translation badges and a dividing line.
- Full USFM file: DONE. The complete Tamil IRV Bible (66 files) parses to 31,103 verses in 66 books, no empty verses. Re-run with `BIBLE_DIR=/folder cargo test real_bible_files -- --ignored --nocapture` (or `BIBLE_FILES=/a:/b`). Not done: a full Zefania file (no real sample available).

## 8.2 CCLI reporting
Status: done, except matching CCLI's official file layout (see below). Migration 22, `ccli.rs`.
- Licence number: Settings > General > "CCLI licence number" (digits only, 4 to 10). Each song's CCLI number and copyright are now editable in the song's info (the fields existed but had no editor).
- Counting rule: a song is counted once per service per day, the first time one of its service items goes live (by slide, next-item, jump or auto-advance). Stepping through its slides, going live again, or the same song twice in one service adds nothing. The same song in another service the same day counts again.
- The log copies the song's title, CCLI number, author and copyright, so reports stay right after a rename or delete. It is included in backup and restore.
- Report: Songs view > report button. Quick ranges (this/last month, last 90 days, this/last year) or any dates up to five years; songs with counts and dates; warnings for a missing licence number and for songs with no CCLI number; "Download CSV" (UTF-8 with a byte-order mark so Tamil titles open correctly; cells that start with `=`, `+`, `-` or `@` are defused).
- Not covered:
  - The CSV layout is our own (licence, range, then Song title / CCLI song number / Author / Copyright / Times used / Dates used). It is not CCLI's official upload format; check their current format and adjust `reportToCsv`.
  - Only songs that go live from a service are counted. Songs shown from a presentation, or as pasted text, are not.
  - Nothing is counted for services run before this release.
  - A mistaken use can be removed through the API (`delete_song_usage`), but there is no button for it yet.
- Tests: counting rules, report grouping and ranges, backup, the live hook (including crossing into the next item), CSV, and the three screens.

## 8.3 Song import
- ProPresenter song files and EasyWorship exports, keeping group names. Collect real sample files first.
- SongSelect lyric paste & chord-stripping: DONE. `lyricsParser.ts` (`stripChords`, `extractSongMetadata`) and `SongPasteModal.tsx`. Automatically strips inline chords (`[G]`, `[Am7]`, `[D/F#]`) and chord lines above lyrics. Auto-detects and populates CCLI Song #, Author/Songwriters, and Copyright, while cleaning out SongSelect disclaimer boilerplate and church license numbers.
- Reflow-style bulk edit: DONE. `LyricsEditor.tsx`. Toggle between Section Cards view and "Bulk Edit as Text (Reflow)". Edits all lyrics in a full-height editor with section headers (`[Verse 1]`, `[Chorus]`, `[Bridge]`), quick insertion buttons, one-click "Strip chords", live section count pill, and bidirectional synchronization with structured cards retaining existing IDs and custom group colors.

## 8.4 Native PowerPoint import
Status: done. `pptx_import.rs`, command `import_pptx_native`; new crates `zip` (reading the file) and `quick-xml`.
- A `.pptx` is read directly into editable slides: no PowerPoint, LibreOffice or `pdftoppm` needed. The Library "Import" button uses it for `.pptx`; `.pdf` and old `.ppt` still go through the picture route.
- Title and body placeholders become the slide's text (title first, then the rest top to bottom). Text boxes, pictures, filled rectangles and ellipses become positioned slide elements (percent of the slide), in drawing order. Groups keep their position and scale. Backgrounds (solid, theme colour through the master's colour map, or a picture) are kept; the text colour follows the background.
- Tables come in as plain text, one line per row with " | " between cells. Hidden shapes are skipped. Text colours that would be hard to read on the page or on the coloured card behind them are replaced by black or white.
- Reported back to the user after import (shown under the Library search with "Import as pictures instead" and "Dismiss"): speaker notes, transitions and animations, charts, SmartArt, video and audio, other embedded objects, pictures in formats a browser cannot show (EMF, WMF, SVG, TIFF), shapes other than rectangles and ellipses, rotated items (shown unrotated), text shortened to 500 characters, and slides with more than 20 extra items.
- Safety: the file is untrusted. Limits: 200 MB file, 500 slides, 20,000 zip parts, 20 MB per XML part, 25 MB per picture, 300 MB of pictures, XML nested at most 64 deep, 500 shapes per slide. Names inside the zip are never used as file paths; pictures are identified by their first bytes, not their name; unknown XML entities are dropped, never expanded. If anything fails, no presentation or picture folder is left behind.
- Checked against seven real PowerPoint decks (design templates, 6 to 31 slides, with charts, tables, groups and pictures): all import without error and give valid slides. Re-run with `PPTX_FILES=/a.pptx:/b.pptx cargo test real_files -- --ignored --nocapture` (add `PPTX_DETAIL=1` to see every item).
- Not done, by choice or for lack of a way to check: exact fonts and font families, line spacing and bullet styles beyond a "•" prefix, picture cropping, text and shape effects (glow, reflection, 3-D, gradients beyond the first colour), shape outlines, charts and SmartArt as editable objects, speaker notes (the slide model has no notes field), transitions and animations, mixed formatting inside one text box (the first run's size, weight and colour apply to the whole box).
- Not checked on real decks made by PowerPoint itself or by Google Slides export other than the seven above; church decks with unusual layouts may show differences. The "Import as pictures instead" button is the fallback and needs LibreOffice.

## 8.5 Search and templates
Status: done. Both parts have backend (`search.rs`, `service_templates.rs`; migration 23) and screens.

Search previews
- The song search box said "Search lyrics, title, Tamil..." but only searched title, alternate title, tags, author and category. It now searches lyrics too.
- Songs: each result with a lyric match shows the section ("Verse 1") and the line with the found words marked. Presentations: the library search now also searches slide titles and text, and shows "Slide N" with the matched line.
- Matching ignores case, treats a line break as a space (a phrase over two lines is found), and works for Tamil. A whole phrase ranks above "all the words, anywhere in the section". One result per song or presentation (its best section or slide).
- Not done: a thumbnail view of results (text previews only); searching the Bible from this box (it has its own search); searching inside service items or sermon notes.

Service templates
- Services list > bookmark icon on a service: "Save as template" (name defaults to the service title). Services list > "Templates": pick one, set the title and optional date, then Create.
- A template keeps the order of items and the slides of each. Songs and scripture are left as empty slots by default ("Worship song" / "Scripture reading" lines to fill in, which are dividers); tick "Keep the songs and scripture" to copy them, including the song link so they still count for CCLI.
- A new service shares nothing with its template or other services made from it; a service that fails halfway is removed. Templates are included in backup and restore. Limits: 50 templates, 100 items each.
- Not done: editing a template (save a new one and delete the old); filling an empty slot with a song in one step (add the song after the slot and delete the slot).
- Check by eye: the Services column header now holds "Templates" and "New" side by side; confirm it fits at narrow widths.
