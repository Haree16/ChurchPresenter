import { LyricHit, SearchPreview, Slide, SlideHit, SongSection } from '../types';

export const MIN_QUERY_CHARS = 2;
export const MAX_QUERY_CHARS = 100;
const CONTEXT_CHARS = 36;

/** Lower-case one character, keeping a 1:1 match with the original so positions stay valid. */
const fold = (c: string): string => [...c.toLowerCase()][0] ?? c;
const isSpace = (c: string): boolean => /\s/u.test(c);

/** The query with whitespace runs collapsed to one space, or null if it is too short or too long to search. */
export function cleanQuery(raw: string): string | null {
  const q = raw.trim().split(/\s+/).filter(Boolean).join(' ');
  const n = [...q].length;
  return n >= MIN_QUERY_CHARS && n <= MAX_QUERY_CHARS ? q : null;
}

/** Where `needle` (folded, single spaces) occurs in `hay`: `[start, end)` in characters. A space matches any run of whitespace. */
function findChars(hay: string[], needle: string[], from = 0): [number, number] | null {
  if (needle.length === 0) return null;
  outer: for (let s = from; s < hay.length; s++) {
    let i = s;
    for (const n of needle) {
      if (n === ' ') {
        if (i >= hay.length || !isSpace(hay[i])) continue outer;
        while (i < hay.length && isSpace(hay[i])) i++;
      } else {
        if (i >= hay.length || fold(hay[i]) !== n) continue outer;
        i++;
      }
    }
    return [s, i];
  }
  return null;
}

const flat = (chars: string[]): string => chars.map((c) => (isSpace(c) ? ' ' : c)).join('').split(' ').filter(Boolean).join(' ');

function previewOf(chars: string[], start: number, end: number): SearchPreview {
  let lineStart = start;
  while (lineStart > 0 && chars[lineStart - 1] !== '\n') lineStart--;
  let lineEnd = end;
  while (lineEnd < chars.length && chars[lineEnd] !== '\n') lineEnd++;
  const lo = Math.max(lineStart, start - CONTEXT_CHARS);
  const hi = Math.min(lineEnd, end + CONTEXT_CHARS);
  let before = flat(chars.slice(lo, start));
  let after = flat(chars.slice(end, hi));
  if (start > lo && isSpace(chars[start - 1]) && before) before += ' ';
  if (end < hi && isSpace(chars[end]) && after) after = ' ' + after;
  if (lo > lineStart) before = '…' + before;
  if (hi < lineEnd) after += '…';
  return { before, matched: flat(chars.slice(start, end)), after };
}

export interface TextMatch {
  preview: SearchPreview;
  /** 0: the whole phrase was found; 1: every word was found, but not together. */
  rank: 0 | 1;
}

/** Finds `query` (see `cleanQuery`) in `text`: the whole phrase, else every word of it. */
export function findInText(text: string, query: string): TextMatch | null {
  const chars = [...text];
  const q = [...query].map(fold);
  const whole = findChars(chars, q);
  if (whole) return { preview: previewOf(chars, whole[0], whole[1]), rank: 0 };
  const words = query.split(' ').filter(Boolean).map((w) => [...w].map(fold));
  if (words.length < 2) return null;
  let first: [number, number] | null = null;
  for (const w of words) {
    const found = findChars(chars, w);
    if (!found) return null;
    if (!first || found[0] < first[0]) first = found;
  }
  return first ? { preview: previewOf(chars, first[0], first[1]), rank: 1 } : null;
}

const byRankThenTitle = <T extends { rank: number }>(a: [string, T], b: [string, T]) =>
  a[1].rank - b[1].rank || a[0].toLowerCase().localeCompare(b[0].toLowerCase());

/** Browser-store version of the desktop lyric search: one hit per song, its best section. */
export function searchLyrics(query: string, sections: SongSection[], titleOf: (songId: string) => string, limit = 100): LyricHit[] {
  const q = cleanQuery(query);
  if (!q) return [];
  const best = new Map<string, [string, LyricHit]>();
  for (const sec of [...sections].sort((a, b) => a.songId.localeCompare(b.songId) || a.sortOrder - b.sortOrder)) {
    const m = findInText(sec.lyrics, q);
    if (!m) continue;
    const hit: LyricHit = { songId: sec.songId, sectionId: sec.id, sectionLabel: sec.label, ...m.preview, rank: m.rank };
    const existing = best.get(sec.songId);
    if (!existing) best.set(sec.songId, [titleOf(sec.songId), hit]);
    else if (hit.rank < existing[1].rank) existing[1] = hit;
  }
  return [...best.values()].sort(byRankThenTitle).slice(0, Math.min(Math.max(limit, 1), 500)).map(([, h]) => h);
}

/** Browser-store version of the desktop slide search: one hit per presentation, its best slide. */
export function searchSlides(query: string, slides: Slide[], titleOf: (presentationId: string) => string, limit = 100): SlideHit[] {
  const q = cleanQuery(query);
  if (!q) return [];
  const best = new Map<string, [string, SlideHit]>();
  const byPres = new Map<string, Slide[]>();
  for (const s of slides) byPres.set(s.presentationId, [...(byPres.get(s.presentationId) ?? []), s]);
  for (const [presId, list] of byPres) {
    list.sort((a, b) => a.sortOrder - b.sortOrder).forEach((slide, i) => {
      const m = findInText(`${slide.title}\n${slide.body}`, q);
      if (!m) return;
      const hit: SlideHit = { presentationId: presId, slideId: slide.id, slideNumber: i + 1, ...m.preview, rank: m.rank };
      const existing = best.get(presId);
      if (!existing) best.set(presId, [titleOf(presId), hit]);
      else if (hit.rank < existing[1].rank) existing[1] = hit;
    });
  }
  return [...best.values()].sort(byRankThenTitle).slice(0, Math.min(Math.max(limit, 1), 500)).map(([, h]) => h);
}
