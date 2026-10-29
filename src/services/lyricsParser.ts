import { SectionType } from '../types';

export interface ParsedSection {
  sectionType: SectionType;
  label: string;
  lyrics: string;
}

const HEADER_RE =
  /^\[?\s*(verse|chorus|pre[\s-]?chorus|bridge|intro|outro|ending|refrain|tag|interlude|v|c|b)\s*(\d*)\s*\]?\s*:?$/i;

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
export function parseLyricsText(raw: string): ParsedSection[] {
  const text = raw.replace(/\r\n?/g, '\n').replace(/^﻿/, '').trim();
  if (!text) return [];

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
