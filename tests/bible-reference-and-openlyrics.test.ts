import { describe, it, expect } from 'vitest';
import { api } from '../src/services/api';
import {
  parseOpenSongOrOpenLyrics,
  exportSongToOpenLyrics,
  exportAllSongsToOpenLyrics,
} from '../src/components/Songs/SongImportExportModal';
import { isSupportedMedia } from '../src/services/mediaService';

describe('Phase 3: Bible Reference Parser & Song Interchange Formats', () => {
  describe('Bible Reference Parser', () => {
    it('parses chapter and verse range (e.g. John 3:16-18)', async () => {
      const parsed = await api.parseBibleReference('John 3:16-18');
      expect(parsed).not.toBeNull();
      expect(parsed?.book).toBe('John');
      expect(parsed?.chapter).toBe(3);
      expect(parsed?.startVerse).toBe(16);
      expect(parsed?.endVerse).toBe(18);
    });

    it('parses whole chapter (e.g. Psalm 23)', async () => {
      const parsed = await api.parseBibleReference('Psalm 23');
      expect(parsed).not.toBeNull();
      expect(parsed?.book).toBe('Psalm');
      expect(parsed?.chapter).toBe(23);
      expect(parsed?.startVerse).toBe(1);
      expect(parsed?.endVerse).toBeNull();
    });

    it('parses Tamil scripture reference (e.g. மத்தேயு 6:9-13)', async () => {
      const parsed = await api.parseBibleReference('மத்தேயு 6:9-13');
      expect(parsed).not.toBeNull();
      expect(parsed?.book).toBe('மத்தேயு');
      expect(parsed?.chapter).toBe(6);
      expect(parsed?.startVerse).toBe(9);
      expect(parsed?.endVerse).toBe(13);
      expect(parsed?.translation).toBe('Tamil');
    });

    it('parses scripture with explicit translation tag', async () => {
      const parsed = await api.parseBibleReference('Rom 8:38-39 WEB');
      expect(parsed).not.toBeNull();
      expect(parsed?.book).toBe('Rom');
      expect(parsed?.chapter).toBe(8);
      expect(parsed?.startVerse).toBe(38);
      expect(parsed?.endVerse).toBe(39);
      expect(parsed?.translation).toBe('WEB');
    });
  });

  describe('OpenLyrics & OpenSong Interchange XML Parsing', () => {
    it('parses OpenLyrics XML format correctly', () => {
      const openLyricsXml = `<?xml version="1.0" encoding="UTF-8"?>
<song xmlns="http://openlyrics.info/namespace/2009/song" version="0.8">
  <properties>
    <titles>
      <title>Amazing Grace</title>
    </titles>
    <authors>
      <author>John Newton</author>
    </authors>
  </properties>
  <lyrics>
    <verse name="v1">
      <lines>Amazing grace! How sweet the sound\nThat saved a wretch like me!</lines>
    </verse>
    <verse name="c1">
      <lines>Praise God, praise God!</lines>
    </verse>
  </lyrics>
</song>`;

      const result = parseOpenSongOrOpenLyrics(openLyricsXml);
      expect(result).not.toBeNull();
      expect(result?.songs.length).toBe(1);
      expect(result?.songs[0].song.title).toBe('Amazing Grace');
      expect(result?.songs[0].song.author).toBe('John Newton');
      expect(result?.songs[0].sections.length).toBe(2);
      expect(result?.songs[0].sections[0].lyrics).toContain('Amazing grace!');
      expect(result?.songs[0].sections[1].sectionType).toBe('chorus');
    });

    it('parses OpenSong XML format correctly', () => {
      const openSongXml = `<?xml version="1.0" encoding="UTF-8"?>
<song>
  <title>Cornerstone</title>
  <author>Hillsong Worship</author>
  <key>C</key>
  <lyrics>
[V1]
.C          F
 My hope is built on nothing less
.G          C
 Than Jesus' blood and righteousness

[C]
.F      Am     G
 Christ alone, Cornerstone
  </lyrics>
</song>`;

      const result = parseOpenSongOrOpenLyrics(openSongXml);
      expect(result).not.toBeNull();
      expect(result?.songs.length).toBe(1);
      expect(result?.songs[0].song.title).toBe('Cornerstone');
      expect(result?.songs[0].song.author).toBe('Hillsong Worship');
      expect(result?.songs[0].sections.length).toBe(2);
      // Chords lines starting with '.' should be stripped for clean presentation lyrics
      expect(result?.songs[0].sections[0].lyrics).not.toContain('.C');
      expect(result?.songs[0].sections[0].lyrics).toContain('My hope is built on nothing less');
    });
  });

  describe('OpenLyrics Export', () => {
    it('exports a song to valid OpenLyrics XML format', () => {
      const xml = exportSongToOpenLyrics(
        {
          id: 'song-1',
          title: '10,000 Reasons',
          author: 'Matt Redman',
          ccliNumber: '6016351',
          songKey: 'G',
          tags: [],
          language: 'English',
          category: 'Worship',
          createdAt: '',
          updatedAt: '',
        },
        [
          {
            id: 'sec-1',
            songId: 'song-1',
            sectionType: 'chorus',
            label: 'Chorus',
            sortOrder: 0,
            lyrics: 'Bless the Lord O my soul\nO my soul\nWorship His Holy name',
          },
          {
            id: 'sec-2',
            songId: 'song-1',
            sectionType: 'verse',
            label: 'Verse 1',
            sortOrder: 1,
            lyrics: 'The sun comes up it is a new day dawning',
          },
        ]
      );

      expect(xml).toContain('xmlns="http://openlyrics.info/namespace/2009/song"');
      expect(xml).toContain('<title>10,000 Reasons</title>');
      expect(xml).toContain('<author>Matt Redman</author>');
      expect(xml).toContain('<ccliNo>6016351</ccliNo>');
      expect(xml).toContain('<verse name="c1">');
      expect(xml).toContain('Bless the Lord O my soul<br/>O my soul<br/>Worship His Holy name');
      expect(xml).toContain('<verse name="v2">');
    });

    it('exports all songs library to OpenLyrics XML document', () => {
      const xml = exportAllSongsToOpenLyrics({
        version: '1.0.0',
        exportedAt: new Date().toISOString(),
        app: 'Church Presenter',
        themes: [],
        songs: [
          {
            song: {
              id: 'song-1',
              title: 'Song One',
              author: 'Author One',
              ccliNumber: '',
              songKey: 'D',
              tags: [],
              language: 'English',
              category: 'Worship',
              createdAt: '',
              updatedAt: '',
            },
            sections: [
              {
                id: 's1',
                songId: 'song-1',
                sectionType: 'verse',
                label: 'Verse 1',
                sortOrder: 0,
                lyrics: 'Line 1\nLine 2',
              },
            ],
          },
          {
            song: {
              id: 'song-2',
              title: 'Song Two',
              author: 'Author Two',
              ccliNumber: '',
              songKey: 'E',
              tags: [],
              language: 'English',
              category: 'Worship',
              createdAt: '',
              updatedAt: '',
            },
            sections: [],
          },
        ],
      });

      expect(xml).toContain('<songs xmlns="http://openlyrics.info/namespace/2009/song">');
      expect(xml).toContain('<title>Song One</title>');
      expect(xml).toContain('<title>Song Two</title>');
    });
  });

  describe('Phase 4: Media Format Breadth & Validation', () => {
    it('supports modern and church-standard media extensions', () => {
      expect(isSupportedMedia('background.gif')).toBe(true);
      expect(isSupportedMedia('logo.svg')).toBe(true);
      expect(isSupportedMedia('clip.mov')).toBe(true);
      expect(isSupportedMedia('video.mkv')).toBe(true);
      expect(isSupportedMedia('track.aac')).toBe(true);
      expect(isSupportedMedia('audio.m4a')).toBe(true);
      expect(isSupportedMedia('master.flac')).toBe(true);
    });

    it('rejects unsupported media formats with descriptive error', async () => {
      expect(isSupportedMedia('doc.docx')).toBe(false);
      expect(isSupportedMedia('archive.zip')).toBe(false);

      await expect(api.importMediaAsset('document.pdf')).rejects.toThrow(
        /Unsupported media format/
      );
    });
  });

  describe('Phase 3: Stage Message & Presentation Import APIs', () => {
    it('sets and clears stage cue message', async () => {
      const stateWithMessage = await api.setStageMessage('Wrap up in 2 mins');
      expect(stateWithMessage.stageMessage).toBe('Wrap up in 2 mins');

      const clearedState = await api.setStageMessage(null);
      expect(clearedState.stageMessage).toBeNull();
    });

    it('searches Bible verses with keyword search', async () => {
      const results = await api.searchBibleVerses('shepherd', 'KJV', 10);
      expect(Array.isArray(results)).toBe(true);
    });

    it('imports presentation document mock into presentation slides', async () => {
      const pres = await api.importPresentationDocument('test-presentation.pdf', 'Service Slides');
      expect(pres).toBeDefined();
      expect(pres.title).toBe('Service Slides');
    });
  });

  describe('Bible translations list and text import', () => {
    it('lists built-in translations and includes newly imported ones', async () => {
      const before = (await api.listBibleTranslations()).map((t) => t.translation);
      expect(before).toEqual(expect.arrayContaining(['KJV', 'WEB', 'Tamil']));

      const verse = {
        id: 'ESV-43-3-16', translation: 'ESV', book: 'John', bookNumber: 43,
        chapter: 3, verse: 16, text: 'For God so loved the world',
      };
      expect(await api.importBibleText('[...]', 'ESV', [verse])).toBe(1);

      const after = await api.listBibleTranslations();
      const esv = after.find((t) => t.translation === 'ESV');
      expect(esv?.verseCount).toBe(1);
    });

    it('rejects pasted text that no parser recognised', async () => {
      await expect(api.importBibleText('not a bible', 'XYZ', [])).rejects.toThrow(/Unrecognised/);
    });
  });
});
