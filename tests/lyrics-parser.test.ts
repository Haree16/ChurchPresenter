import { describe, it, expect } from 'vitest';
import { parseLyricsText } from '../src/services/lyricsParser';

describe('parseLyricsText', () => {
  it('splits on blank lines and numbers unnamed blocks as verses', () => {
    const s = parseLyricsText('line a\nline b\n\nline c\n\n\nline d');
    expect(s.map((x) => x.label)).toEqual(['Verse 1', 'Verse 2', 'Verse 3']);
    expect(s[0].lyrics).toBe('line a\nline b');
  });

  it('uses header lines (plain, bracketed, colon) and strips them from lyrics', () => {
    const s = parseLyricsText('Verse 1\nfirst\n\n[Chorus]\nsing\n\nBridge:\nturn\n\nPre-Chorus\nrise');
    expect(s.map((x) => [x.sectionType, x.label])).toEqual([
      ['verse', 'Verse 1'],
      ['chorus', 'Chorus'],
      ['bridge', 'Bridge'],
      ['pre_chorus', 'Pre Chorus'],
    ]);
    expect(s[1].lyrics).toBe('sing');
  });

  it('applies a header-only block to the next block and handles CRLF', () => {
    const s = parseLyricsText('Chorus\r\n\r\nholy holy\r\n');
    expect(s).toHaveLength(1);
    expect(s[0]).toMatchObject({ sectionType: 'chorus', lyrics: 'holy holy' });
  });

  it('returns nothing for empty text and keeps Tamil lyrics', () => {
    expect(parseLyricsText('  \n ')).toEqual([]);
    expect(parseLyricsText('ஆதியிலே தேவன்')[0].lyrics).toBe('ஆதியிலே தேவன்');
  });
});
