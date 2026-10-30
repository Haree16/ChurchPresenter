import { describe, it, expect } from 'vitest';
import {
  parseLyricsText,
  stripChords,
  isChordLine,
  extractSongMetadata,
  sectionsToText,
  textToSections,
} from '../src/services/lyricsParser';
import { SongSection } from '../src/types';

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

describe('chord detection and stripping', () => {
  it('identifies dedicated chord lines correctly', () => {
    expect(isChordLine('G   C   D   Em')).toBe(true);
    expect(isChordLine('Em7    Cadd9    Dsus4    G/B')).toBe(true);
    expect(isChordLine('| G . . . | D/F# . . . |')).toBe(true);
    expect(isChordLine('A   Bm7   F#m   E')).toBe(true);
    expect(isChordLine('N.C.')).toBe(true);

    // Regular lyric lines must NOT be identified as chord lines
    expect(isChordLine('Amazing grace how sweet the sound')).toBe(false);
    expect(isChordLine('A mighty fortress is our God')).toBe(false);
    expect(isChordLine('I will sing of the mercies of the Lord')).toBe(false);
    expect(isChordLine('God is good all the time')).toBe(false);
    expect(isChordLine('[Verse 1]')).toBe(false);
  });

  it('strips inline bracketed chords from lyrics', () => {
    const input = '[G]Amazing [D]grace how [Em]sweet the [C]sound\nThat [G]saved a [D]wretch like [G]me';
    const cleaned = stripChords(input);
    expect(cleaned).toBe('Amazing grace how sweet the sound\nThat saved a wretch like me');
  });

  it('strips slash chords and complex extensions in brackets', () => {
    const input = 'Hear our [D/F#]prayer, O [C#m7(b5)]Lord and [Bbmaj7]grant us peace';
    const cleaned = stripChords(input);
    expect(cleaned).toBe('Hear our prayer, O Lord and grant us peace');
  });

  it('strips dedicated chord lines above lyrics', () => {
    const input = `[Verse 1]
G           C           G
Amazing grace how sweet the sound
Em          D/F#        G
That saved a wretch like me`;

    const cleaned = stripChords(input);
    expect(cleaned).toBe(`[Verse 1]
Amazing grace how sweet the sound
That saved a wretch like me`);
  });

  it('allows parseLyricsText to strip chords automatically when option is true', () => {
    const input = `Verse 1
G       C
Line one
D       G
Line two`;

    const sections = parseLyricsText(input, { stripChords: true });
    expect(sections).toHaveLength(1);
    expect(sections[0].lyrics).toBe('Line one\nLine two');
  });
});

describe('extractSongMetadata', () => {
  it('extracts CCLI Song number, authors, copyright and strips SongSelect boilerplate', () => {
    const raw = `Way Maker

Verse 1
You are here moving in our midst
I worship You I worship You

Chorus
You are Way Maker Miracle Worker
Light in the darkness my God that is who You are

CCLI Song # 7115744
Osinachi Kalu Okoro Egbu
© 2016 Sinach (Admin. by SLIC Inspire)
For use solely with the SongSelect® Terms of Use. All rights reserved. www.ccli.com
CCLI License # 123456`;

    const meta = extractSongMetadata(raw);
    expect(meta.ccliNumber).toBe('7115744');
    expect(meta.author).toBe('Osinachi Kalu Okoro Egbu');
    expect(meta.copyright).toBe('© 2016 Sinach (Admin. by SLIC Inspire)');
    expect(meta.title).toBe('Way Maker');

    // The cleaned text should contain the lyrics without the footer boilerplate
    expect(meta.cleanedText).not.toContain('7115744');
    expect(meta.cleanedText).not.toContain('SongSelect');
    expect(meta.cleanedText).not.toContain('CCLI License');
    expect(meta.cleanedText).toContain('You are here moving in our midst');
    expect(meta.cleanedText).toContain('You are Way Maker');
  });

  it('extracts explicit Words and Music by format', () => {
    const raw = `Verse 1
Holy, holy, holy

Words and Music by Matt Redman and Jonas Myrin
Copyright 2012 Thankyou Music
CCLI Song Number: 6016351`;

    const meta = extractSongMetadata(raw);
    expect(meta.ccliNumber).toBe('6016351');
    expect(meta.author).toBe('Matt Redman and Jonas Myrin');
    expect(meta.copyright).toBe('Copyright 2012 Thankyou Music');
    expect(meta.cleanedText).toBe('Verse 1\nHoly, holy, holy');
  });
});

describe('sectionsToText and textToSections (Reflow editing)', () => {
  const existing: SongSection[] = [
    {
      id: 'sec-1',
      songId: 'song-1',
      sectionType: 'verse',
      label: 'Verse 1',
      lyrics: 'Line 1\nLine 2',
      sortOrder: 0,
      color: '#ff0000',
    },
    {
      id: 'sec-2',
      songId: 'song-1',
      sectionType: 'chorus',
      label: 'Chorus',
      lyrics: 'Sing praise',
      sortOrder: 1,
    },
  ];

  it('serializes sections to reflow text with bracketed headers', () => {
    const text = sectionsToText(existing);
    expect(text).toBe('[Verse 1]\nLine 1\nLine 2\n\n[Chorus]\nSing praise');
  });

  it('deserializes reflow text back into sections preserving matched IDs and colors', () => {
    const editedText = `[Verse 1]
Line 1 updated
Line 2 updated

[Chorus]
Sing praise louder

[Bridge]
New bridge words`;

    const updated = textToSections(editedText, existing, 'song-1');
    expect(updated).toHaveLength(3);

    // Verse 1 matched by label
    expect(updated[0].id).toBe('sec-1');
    expect(updated[0].color).toBe('#ff0000');
    expect(updated[0].lyrics).toBe('Line 1 updated\nLine 2 updated');
    expect(updated[0].sortOrder).toBe(0);

    // Chorus matched by label
    expect(updated[1].id).toBe('sec-2');
    expect(updated[1].lyrics).toBe('Sing praise louder');
    expect(updated[1].sortOrder).toBe(1);

    // New bridge
    expect(updated[2].label).toBe('Bridge');
    expect(updated[2].sectionType).toBe('bridge');
    expect(updated[2].lyrics).toBe('New bridge words');
    expect(updated[2].id).not.toBe('sec-1');
    expect(updated[2].id).not.toBe('sec-2');
    expect(updated[2].sortOrder).toBe(2);
  });
});

