import { describe, it, expect } from 'vitest';
import { api } from '../src/services/api';
import { parseOpenSongOrOpenLyrics } from '../src/components/Songs/SongImportExportModal';

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
});
