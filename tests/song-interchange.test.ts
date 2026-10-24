import { describe, it, expect } from 'vitest';
import { api } from '../src/services/api';
import { SongExportData } from '../src/types';

describe('Phase 2: Song Interchange JSON Export & Import', () => {
  it('exports a single song to documented versioned JSON', async () => {
    const songs = await api.listSongs();
    const songId = songs[0].id;

    const exported = await api.exportSong(songId);
    expect(exported.version).toBe('1.0.0');
    expect(exported.app).toBe('ChurchPresenter');
    expect(exported.exportedAt).toBeDefined();
    expect(exported.songs.length).toBe(1);
    expect(exported.songs[0].song.id).toBe(songId);
    expect(exported.songs[0].sections.length).toBeGreaterThan(0);
  });

  it('exports all songs and presentation themes in library', async () => {
    const exported = await api.exportAllSongs();
    expect(exported.songs.length).toBeGreaterThanOrEqual(2);
    expect(exported.themes).toBeDefined();
    expect(exported.themes?.length).toBeGreaterThanOrEqual(4);
  });

  it('imports songs with "skip" duplicate strategy', async () => {
    // Export existing
    const exported = await api.exportAllSongs();
    const existingCount = (await api.listSongs()).length;

    // Re-import with 'skip'
    const result = await api.importSongs(exported, { duplicateMode: 'skip' });
    expect(result.skippedCount).toBe(exported.songs.length);
    expect(result.importedCount).toBe(0);

    const countAfter = (await api.listSongs()).length;
    expect(countAfter).toBe(existingCount);
  });

  it('imports songs with "copy" duplicate strategy', async () => {
    const songs = await api.listSongs();
    const singleExport = await api.exportSong(songs[0].id);

    const result = await api.importSongs(singleExport, { duplicateMode: 'copy' });
    expect(result.importedCount).toBe(1);
    expect(result.skippedCount).toBe(0);

    // Verify copy exists with suffix
    const all = await api.listSongs();
    const copy = all.find((s) => s.title.includes('(Imported)'));
    expect(copy).toBeDefined();
  });

  it('imports songs with "update" duplicate strategy', async () => {
    const songs = await api.listSongs();
    const targetSong = songs[0];
    const exportData = await api.exportSong(targetSong.id);

    // Modify export data
    exportData.songs[0].song.author = 'Updated Author Name';
    exportData.songs[0].sections[0].lyrics = 'Updated lyric line 1\nLine 2';

    const result = await api.importSongs(exportData, { duplicateMode: 'update' });
    expect(result.updatedCount).toBe(1);

    const updated = await api.getSong(targetSong.id);
    expect(updated?.song.author).toBe('Updated Author Name');
    expect(updated?.sections[0].lyrics).toBe('Updated lyric line 1\nLine 2');
  });

  it('rejects malformed or incomplete song JSON payloads', async () => {
    const malformed = {
      version: '1.0.0',
      app: 'ChurchPresenter',
      // Missing songs array
    } as unknown as SongExportData;

    await expect(
      api.importSongs(malformed, { duplicateMode: 'skip' })
    ).rejects.toThrow(/missing required "songs" array/i);
  });
});
