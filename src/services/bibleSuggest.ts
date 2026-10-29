import { BibleSuggestion, BibleVerse } from '../types';

export const DEFAULT_SUGGESTION_LIMIT = 8;
export const MAX_SUGGESTION_LIMIT = 20;
const MAX_INPUT_CHARS = 60;
const MAX_NUMBER_CHOICES = 5;

/** A few common abbreviations for the browser-only store; the desktop app knows the full table. */
const MOCK_ALIASES: Record<string, number> = { gen: 1, ps: 19, psa: 19, mt: 40, mat: 40, jn: 43, jhn: 43, rom: 45, rev: 66 };

export interface PartialReference {
  book: string;
  chapter?: number;
  inVerse: boolean;
  startVerse?: number;
  inRange: boolean;
  endVerse?: number;
}

const isLetter = (c: string) => /\p{L}/u.test(c) || /[஀-௿]/.test(c);
const squash = (s: string) => s.replace(/[\s.]/g, '').toLowerCase();
const positive = (t: string): number | null => (/^\d{1,9}$/.test(t) && Number(t) > 0 ? Number(t) : null);

/** Splits what is typed into book text and numbers; null when it cannot be a reference. */
export function splitPartialReference(input: string): PartialReference | null {
  const s = input.trim();
  if (!s || [...s].length > MAX_INPUT_CHARS) return null;
  const chars = [...s];
  let last = -1;
  chars.forEach((c, i) => {
    if (isLetter(c)) last = i;
  });
  if (last < 0) return null;
  const book = chars.slice(0, last + 1).join('').trim().replace(/\.+$/, '').trim();
  const tail = chars.slice(last + 1).join('').replace(/^[.\s]+/, '').replace(/\./g, ':').replace(/[–—]/g, '-');
  const out: PartialReference = { book, inVerse: false, inRange: false };
  if (!tail) return out;

  const colon = tail.indexOf(':');
  const chapterText = (colon < 0 ? tail : tail.slice(0, colon)).trim();
  const chapter = positive(chapterText);
  if (chapter == null) return null;
  out.chapter = chapter;
  if (colon >= 0) {
    out.inVerse = true;
    const v = tail.slice(colon + 1).trim();
    const dash = v.indexOf('-');
    const startText = (dash < 0 ? v : v.slice(0, dash)).trim();
    if (startText) {
      const start = positive(startText);
      if (start == null) return null;
      out.startVerse = start;
    }
    if (dash >= 0) {
      out.inRange = true;
      const endText = v.slice(dash + 1).trim();
      if (endText) {
        const end = positive(endText);
        if (end == null) return null;
        out.endVerse = end;
      }
    }
  }
  return out;
}

/** Numbers from `available` whose digits start with `typed` (typing 1 offers 1, 10, 11 ...). */
const startingWith = (typed: number, available: number[]): number[] =>
  available.filter((n) => String(n).startsWith(String(typed))).slice(0, MAX_NUMBER_CHOICES);

/** Browser-store version of the desktop suggestions, built from the stored verses. */
export function suggestFromVerses(input: string, translation: string, verses: BibleVerse[], limit = DEFAULT_SUGGESTION_LIMIT): BibleSuggestion[] {
  const max = Math.min(Math.max(limit, 1), MAX_SUGGESTION_LIMIT);
  const partial = splitPartialReference(input);
  if (!partial) return [];
  const typed = squash(partial.book);
  if (!typed) return [];
  const alias = MOCK_ALIASES[typed];
  const afterSpace = /\s$/.test(input);

  // the books, chapters and verses that are really there (a partial import can have gaps)
  const books = new Map<number, { name: string; chapters: Map<number, number[]> }>();
  for (const v of verses) {
    if (v.translation.toLowerCase() !== translation.toLowerCase()) continue;
    let b = books.get(v.bookNumber);
    if (!b) books.set(v.bookNumber, (b = { name: v.book, chapters: new Map() }));
    const list = b.chapters.get(v.chapter) ?? [];
    if (!list.includes(v.verse)) list.push(v.verse);
    b.chapters.set(v.chapter, list);
  }

  const out: BibleSuggestion[] = [];
  for (const [number, book] of [...books.entries()].sort((a, b) => a[0] - b[0])) {
    if (out.length >= max) break;
    if (!(squash(book.name).startsWith(typed) || alias === number)) continue;
    const chapters = [...book.chapters.keys()].sort((a, b) => a - b);
    const make = (label: string, chapter?: number, start?: number, end?: number): BibleSuggestion => ({
      label, book: book.name, bookNumber: number, chapter: chapter ?? null, startVerse: start ?? null, endVerse: end ?? null,
    });
    if (partial.chapter == null) {
      if (afterSpace) chapters.slice(0, MAX_NUMBER_CHOICES).forEach((c) => out.push(make(`${book.name} ${c}`, c)));
      else out.push(make(book.name));
      continue;
    }
    const chapter = partial.chapter;
    if (!partial.inVerse) {
      startingWith(chapter, chapters).forEach((c) => out.push(make(`${book.name} ${c}`, c)));
      continue;
    }
    const inChapter = (book.chapters.get(chapter) ?? []).sort((a, b) => a - b);
    if (inChapter.length === 0) continue;
    const { startVerse: start, inRange, endVerse: end } = partial;
    if (start == null) inChapter.slice(0, MAX_NUMBER_CHOICES).forEach((v) => out.push(make(`${book.name} ${chapter}:${v}`, chapter, v, v)));
    else if (!inRange) startingWith(start, inChapter).forEach((v) => out.push(make(`${book.name} ${chapter}:${v}`, chapter, v, v)));
    else if (end == null) {
      if (inChapter.includes(start)) {
        inChapter.filter((v) => v >= start).slice(0, MAX_NUMBER_CHOICES).forEach((v) => out.push(make(`${book.name} ${chapter}:${start}-${v}`, chapter, start, v)));
      }
    } else if (start <= end && inChapter.includes(start) && inChapter.includes(end)) {
      out.push(make(`${book.name} ${chapter}:${start}-${end}`, chapter, start, end));
    }
  }
  return out.slice(0, max);
}
