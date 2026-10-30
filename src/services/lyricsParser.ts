import { SectionType, SongSection } from '../types';

export interface ParsedSection {
  sectionType: SectionType;
  label: string;
  lyrics: string;
}

export interface ExtractedSongMetadata {
  cleanedText: string;
  ccliNumber?: string;
  author?: string;
  copyright?: string;
  title?: string;
}

const HEADER_RE =
  /^\[?\s*(verse|chorus|pre[\s-]?chorus|bridge|intro|outro|ending|refrain|tag|interlude|v|c|b)\s*(\d*)\s*\]?\s*:?$/i;

// Recognises musical chord roots and common church chord extensions
// e.g. G, C#m, F#m7, Bbmaj7, Dsus4, Cadd9, D/F#, Bm7b5, C7#9, C(add9)
const CHORD_TOKEN_RE =
  /^[A-G](?:#|b)?(?:maj|major|min|minor|m|M|dim|aug|sus[249]?|add[249]?|[0-9]{1,2}|[\+\°]|b5|#5|b9|#9|#11|b13)*(?:\([^\)]+\))*(?:\/[A-G](?:#|b)?)?$/;

const INLINE_BRACKET_CHORD_RE =
  /\[\s*([A-G](?:#|b)?(?:maj|major|min|minor|m|M|dim|aug|sus[249]?|add[249]?|[0-9]{1,2}|[\+\°]|b5|#5|b9|#9|#11|b13)*(?:\([^\)]+\))*(?:\/[A-G](?:#|b)?)?)\s*\]/g;

/** Check whether a single word or token is a chord symbol or musical annotation. */
export function isChordToken(token: string): boolean {
  const t = token.replace(/^[\(\[\{]/, '').replace(/[\)\]\}]$/, '');
  if (!t) return false;
  if (/^(?:N\.?C\.?)$/i.test(t)) return true;
  if (/^(?:\|+|[\/\\]+|x\d+|\d+x|\.|\:|\%|\-)$/i.test(t)) return true;
  if (/^(?:intro|outro|interlude|tag|bridge|chorus|verse|repeat|ending|solo)$/i.test(t)) return true;
  return CHORD_TOKEN_RE.test(t);
}

/** Check whether an entire line is composed of chord symbols rather than lyrics. */
export function isChordLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return false;
  // Section headers like "Verse 1" or "[Chorus]" are not chord lines
  if (HEADER_RE.test(trimmed)) return false;

  const tokens = trimmed.split(/\s+/);
  if (tokens.length === 0) return false;

  let actualChords = 0;
  for (const token of tokens) {
    const clean = token.replace(/^[\(\[\{]/, '').replace(/[\)\]\}]$/, '');
    if (CHORD_TOKEN_RE.test(clean) || /^(?:N\.?C\.?)$/i.test(clean)) {
      actualChords++;
    } else if (!isChordToken(token)) {
      return false; // Contains regular words, definitely not a chord line
    }
  }

  // A chord line must have at least one actual chord or N.C. token
  return actualChords > 0;
}

/**
 * Strips both inline bracketed chords (e.g. `[G]Amazing [D]grace`)
 * and dedicated chord lines above lyrics (e.g. `G   D\nAmazing grace`).
 */
export function stripChords(text: string): string {
  // 1. Remove inline bracketed chords
  const withoutInline = text.replace(INLINE_BRACKET_CHORD_RE, '');

  // 2. Remove dedicated chord lines
  const lines = withoutInline.split('\n');
  const resultLines: string[] = [];

  for (const line of lines) {
    if (isChordLine(line)) {
      continue;
    }
    // Clean up excessive spaces caused by inline chord removal while keeping indentation minimal
    const cleaned = line.replace(/[ \t]{2,}/g, ' ');
    resultLines.push(cleaned);
  }

  return resultLines.join('\n');
}

/**
 * Extracts CCLI song number, author, copyright, and cleans boilerplate
 * (such as SongSelect disclaimers and church CCLI license lines) from pasted text.
 */
export function extractSongMetadata(raw: string): ExtractedSongMetadata {
  const text = raw.replace(/\r\n?/g, '\n').replace(/^﻿/, '').trim();
  if (!text) return { cleanedText: '' };

  const lines = text.split('\n');

  let ccliNumber: string | undefined;
  let author: string | undefined;
  let copyright: string | undefined;
  let title: string | undefined;

  // Detect title: if the very first non-empty line of the text is not a header,
  // is relatively short, and is followed by an empty line or a section header.
  const firstNonEmptyIdx = lines.findIndex((l) => l.trim().length > 0);
  let titleLineIdx = -1;
  if (firstNonEmptyIdx >= 0) {
    const candidate = lines[firstNonEmptyIdx].trim();
    if (!HEADER_RE.test(candidate) && candidate.length <= 80 && !isChordLine(candidate)) {
      const nextNonEmptyIdx = lines.findIndex((l, idx) => idx > firstNonEmptyIdx && l.trim().length > 0);
      if (nextNonEmptyIdx >= 0) {
        const nextLine = lines[nextNonEmptyIdx].trim();
        if (HEADER_RE.test(nextLine) || nextNonEmptyIdx > firstNonEmptyIdx + 1) {
          title = candidate;
          titleLineIdx = firstNonEmptyIdx;
        }
      }
    }
  }

  const cleanedLines: string[] = [];
  let inFooter = false;

  for (let i = 0; i < lines.length; i++) {
    if (i === titleLineIdx) {
      continue; // Title line is captured in metadata, strip from lyrics
    }

    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) {
      cleanedLines.push(line);
      continue;
    }

    // Check for CCLI Song Number (e.g. "CCLI Song # 7115744" or "CCLI Song Number: 7115744")
    // Notice: ignore "CCLI License #" which is the church's license, not the song number
    const ccliSongMatch = trimmed.match(/ccli\s*(?:song)?\s*(?:#|no\.?|number)?\s*:?\s*(\d{4,10})/i);
    const isLicenseLine = /ccli\s*licen[sc]e/i.test(trimmed);

    if (ccliSongMatch && !isLicenseLine) {
      ccliNumber = ccliSongMatch[1];
      inFooter = true;
      continue; // Strip from lyrics
    }

    if (isLicenseLine) {
      inFooter = true;
      continue; // Strip church license from lyrics
    }

    // Check for copyright lines: "© 2018 Capitol CMG", "(c) 2016 Sinach", "Copyright 2020..."
    if (/^(?:©|\(c\)|copyright)\b/i.test(trimmed) || /©\s*\d{4}|\(c\)\s*\d{4}/i.test(trimmed)) {
      copyright = trimmed;
      inFooter = true;
      continue; // Strip from lyrics
    }

    // Check for explicit author lines
    const authorMatch = trimmed.match(
      /^(?:words\s+(?:and|&)\s+music\s+by|written\s+by|author\s*:?|words\s+by)\s*:?\s*(.+)$/i
    );
    if (authorMatch) {
      author = authorMatch[1].trim();
      continue; // Strip from lyrics
    }

    // Check for SongSelect disclaimer boilerplate
    if (
      /for use solely with the songselect|all rights reserved|www\.ccli\.com|songselect®|terms of use/i.test(
        trimmed
      )
    ) {
      inFooter = true;
      continue; // Strip boilerplate from lyrics
    }

    // If we are in the footer section and see a line before copyright / after CCLI Song #
    // like "Chris Tomlin | Ed Cash | Matt Redman" or "Osinachi Kalu Okoro Egbu"
    if (inFooter && !author && !HEADER_RE.test(trimmed) && trimmed.length < 150) {
      author = trimmed;
      continue;
    }

    cleanedLines.push(line);
  }

  return {
    cleanedText: cleanedLines.join('\n').trim(),
    ccliNumber,
    author,
    copyright,
    title,
  };
}

function typeForKeyword(word: string): SectionType {
  const w = word.toLowerCase().replace(/[\s-]/g, '');
  if (w === 'v' || w === 'verse') return 'verse';
  if (w === 'c' || w === 'chorus') return 'chorus';
  if (w === 'b' || w === 'bridge') return 'bridge';
  if (w === 'prechorus') return 'pre_chorus';
  if (w === 'intro') return 'intro';
  if (w === 'outro' || w === 'ending') return 'outro';
  if (w === 'refrain') return 'refrain';
  return 'custom';
}

function titleCase(s: string): string {
  return s.replace(/[\s-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Splits pasted lyrics into song sections. Blank lines separate sections; a line such as
 * "Verse 1", "[Chorus]" or "Bridge:" on its own names the section that follows it.
 * Unnamed blocks become "Verse N".
 */
export function parseLyricsText(
  raw: string,
  options?: { stripChords?: boolean }
): ParsedSection[] {
  let text = raw.replace(/\r\n?/g, '\n').replace(/^﻿/, '').trim();
  if (!text) return [];

  if (options?.stripChords) {
    text = stripChords(text).trim();
    if (!text) return [];
  }

  const blocks = text.split(/\n[ \t]*\n+/).map((b) => b.trim()).filter(Boolean);
  const sections: ParsedSection[] = [];
  let pendingHeader: { type: SectionType; label: string } | null = null;
  let verseCount = 0;

  for (const block of blocks) {
    const lines = block.split('\n').map((l) => l.replace(/\s+$/, ''));
    const m = lines[0].trim().match(HEADER_RE);
    let header: { type: SectionType; label: string } | null = pendingHeader;
    let body = lines;

    if (m) {
      const type = typeForKeyword(m[1]);
      const word = m[1].length <= 1 ? { v: 'Verse', c: 'Chorus', b: 'Bridge' }[m[1].toLowerCase()]! : titleCase(m[1]);
      header = { type, label: m[2] ? `${word} ${m[2]}` : word };
      body = lines.slice(1);
    }
    pendingHeader = null;

    const lyrics = body.join('\n').trim();
    if (!lyrics) {
      // header on its own line: it names the next block
      if (m) pendingHeader = header;
      continue;
    }

    if (header) {
      if (header.type === 'verse') verseCount += 1;
      sections.push({ sectionType: header.type, label: header.label, lyrics });
    } else {
      verseCount += 1;
      sections.push({ sectionType: 'verse', label: `Verse ${verseCount}`, lyrics });
    }
  }
  return sections;
}

/** Convert a list of SongSections into clean reflow text with [Section Name] headers. */
export function sectionsToText(sections: SongSection[]): string {
  return sections
    .map((s) => {
      const header = s.label.trim();
      const body = s.lyrics.trim();
      return `[${header}]\n${body}`;
    })
    .join('\n\n');
}

/**
 * Converts reflow text back into SongSections, preserving existing section IDs,
 * custom colors, and notes where section labels match.
 */
export function textToSections(
  text: string,
  existingSections: SongSection[] = [],
  songId: string = ''
): SongSection[] {
  const parsed = parseLyricsText(text);
  const now = Date.now();

  return parsed.map((p, idx) => {
    // Attempt to match an existing section by label or exact index
    const existing =
      existingSections.find((e) => e.label.toLowerCase() === p.label.toLowerCase()) ||
      existingSections[idx];

    return {
      id: existing?.id || `sec-${now}-${idx}-${Math.random().toString(36).slice(2, 7)}`,
      songId: existing?.songId || songId,
      sectionType: p.sectionType,
      label: p.label,
      lyrics: p.lyrics,
      sortOrder: idx,
      notes: existing?.notes || '',
      color: existing?.color,
    };
  });
}

