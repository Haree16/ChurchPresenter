import { describe, it, expect } from 'vitest';
import { api } from '../src/services/api';
import {
  exportSongToOpenLyrics,
  exportAllSongsToOpenLyrics,
  parseOpenSongOrOpenLyrics,
} from '../src/components/Songs/SongImportExportModal';
import { Song, SongArrangement, SongSection } from '../src/types';

const now = new Date().toISOString();

async function makeSong(title: string) {
  const { song } = await api.createSong({ title, language: 'English', category: 'Worship', tags: [] } as Partial<Song>);
  const mk = (label: string, sectionType: SongSection['sectionType'], order: number, color?: string): SongSection => ({
    id: '', songId: song.id, sectionType, label, lyrics: `${label} line 1\n${label} line 2`,
    sortOrder: order, color: color ?? null, createdAt: now, updatedAt: now,
  });
  const sections = await api.saveSongSections(song.id, [mk('Verse 1', 'verse', 0), mk('Chorus', 'chorus', 1, '#123456')]);
  const arr: SongArrangement = {
    id: '', songId: song.id, name: 'V C V C', isDefault: true,
    sectionIds: [sections[0].id, sections[1].id, sections[0].id, sections[1].id],
  };
  await api.saveSongArrangements(song.id, [arr]);
  return { song, sections };
}

const labelsOf = async (songId: string) => {
  const secs = await api.getSongSections(songId);
  return (await api.getSongArrangements(songId)).map((a) =>
    a.sectionIds.map((id) => secs.find((s) => s.id === id)?.label ?? 'MISSING')
  );
};

describe('Song export keeps arrangements and colours', () => {
  it('JSON export contains arrangements and section colours', async () => {
    const { song } = await makeSong('Export Me');
    const data = await api.exportSong(song.id);
    expect(data.songs[0].arrangements).toHaveLength(1);
    expect(data.songs[0].sections[1].color).toBe('#123456');
    expect((await api.exportAllSongs([song.id])).songs[0].arrangements).toHaveLength(1);
  });

  it('import "copy" gives the copy its own sections and arrangement', async () => {
    const { song } = await makeSong('Copy Me');
    const data = JSON.parse(JSON.stringify(await api.exportSong(song.id)));
    await api.importSongs(data, { duplicateMode: 'copy' });

    const copy = (await api.listSongs()).find((s) => s.title === 'Copy Me (Imported)')!;
    expect(await labelsOf(copy.id)).toEqual([['Verse 1', 'Chorus', 'Verse 1', 'Chorus']]);
    const copySecs = (await api.getSongSections(copy.id)).map((s) => s.id);
    const copyArr = (await api.getSongArrangements(copy.id))[0];
    expect(copyArr.sectionIds.every((id) => copySecs.includes(id))).toBe(true);
    expect(await labelsOf(song.id)).toEqual([['Verse 1', 'Chorus', 'Verse 1', 'Chorus']]);
  });

  it('import "update" replaces arrangements and never leaves dangling ones', async () => {
    const { song } = await makeSong('Update Me');
    const data = JSON.parse(JSON.stringify(await api.exportSong(song.id)));
    data.songs[0].arrangements = [
      { id: 'x', songId: song.id, name: 'Short', isDefault: true, sectionIds: [data.songs[0].sections[1].id] },
    ];
    await api.importSongs(data, { duplicateMode: 'update' });
    expect(await labelsOf(song.id)).toEqual([['Chorus']]);

    data.songs[0].arrangements = [];
    await api.importSongs(data, { duplicateMode: 'update' });
    expect(await api.getSongArrangements(song.id)).toEqual([]);
  });

  it('files from older versions without an arrangements field still import', async () => {
    const { song } = await makeSong('Legacy');
    const data = JSON.parse(JSON.stringify(await api.exportSong(song.id)));
    delete data.songs[0].arrangements;
    const res = await api.importSongs(data, { duplicateMode: 'update' });
    expect(res.errorCount).toBe(0);
  });

  it('duplicating a song copies its arrangements', async () => {
    const { song } = await makeSong('Dup Me');
    const dup = await api.duplicateSong(song.id);
    expect(dup.arrangements).toHaveLength(1);
    expect(await labelsOf(dup.song.id)).toEqual([['Verse 1', 'Chorus', 'Verse 1', 'Chorus']]);
  });
});

describe('OpenLyrics verse order', () => {
  const song = { id: 's', title: 'T', tags: [], language: 'English', category: 'x', createdAt: now, updatedAt: now } as Song;
  const secs: SongSection[] = [
    { id: 'a', songId: 's', sectionType: 'verse', label: 'Verse 1', lyrics: 'one\ntwo', sortOrder: 0 },
    { id: 'b', songId: 's', sectionType: 'chorus', label: 'Chorus', lyrics: 'sing\nloud', sortOrder: 1 },
  ];

  it('writes the default arrangement as <verseOrder>', () => {
    const arr: SongArrangement = { id: 'x', songId: 's', name: 'N', isDefault: true, sectionIds: ['a', 'b', 'a', 'b'] };
    const xml = exportSongToOpenLyrics(song, secs, [arr]);
    expect(xml).toContain('<verseOrder>v1 c2 v1 c2</verseOrder>');
  });

  it('writes no verseOrder without a default arrangement', () => {
    expect(exportSongToOpenLyrics(song, secs, [])).not.toContain('verseOrder');
    const nonDefault: SongArrangement = { id: 'x', songId: 's', name: 'N', isDefault: false, sectionIds: ['a'] };
    expect(exportSongToOpenLyrics(song, secs, [nonDefault])).not.toContain('verseOrder');
  });

  it('exports every song of a multi-song file with its own order', () => {
    const arr: SongArrangement = { id: 'x', songId: 's', name: 'N', isDefault: true, sectionIds: ['b', 'a'] };
    const xml = exportAllSongsToOpenLyrics({
      version: '1', exportedAt: now, app: 'x', themes: [],
      songs: [{ song, sections: secs, arrangements: [arr] }, { song, sections: secs }],
    });
    expect(xml.match(/<verseOrder>/g)).toHaveLength(1);
    expect(xml).toContain('<verseOrder>c2 v1</verseOrder>');
  });

  it('round-trips: verse order becomes the default arrangement and line breaks survive', () => {
    const arr: SongArrangement = { id: 'x', songId: 's', name: 'N', isDefault: true, sectionIds: ['a', 'b', 'a', 'b'] };
    const xml = exportSongToOpenLyrics(song, secs, [arr]);
    const parsed = parseOpenSongOrOpenLyrics(xml)!;
    const item = parsed.songs[0];

    expect(item.sections.map((s) => s.lyrics)).toEqual(['one\ntwo', 'sing\nloud']);
    expect(item.arrangements).toHaveLength(1);
    expect(item.arrangements![0].isDefault).toBe(true);
    const labels = item.arrangements![0].sectionIds.map((id) => item.sections.find((s) => s.id === id)!.label);
    expect(labels).toEqual(['v1', 'c2', 'v1', 'c2']);
  });

  it('ignores verse-order names that match no verse, and files without one', () => {
    const xml = `<song xmlns="http://openlyrics.info/namespace/2009/song"><properties><titles><title>X</title></titles><verseOrder>v1 zz</verseOrder></properties><lyrics><verse name="v1"><lines>hi</lines></verse></lyrics></song>`;
    const parsed = parseOpenSongOrOpenLyrics(xml)!;
    expect(parsed.songs[0].arrangements![0].sectionIds).toHaveLength(1);

    const none = parseOpenSongOrOpenLyrics(xml.replace('<verseOrder>v1 zz</verseOrder>', ''))!;
    expect(none.songs[0].arrangements).toEqual([]);
  });
});
