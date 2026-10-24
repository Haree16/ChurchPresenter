import { describe, it, expect } from 'vitest';
import { api } from '../src/services/api';
import { Song, SongSection } from '../src/types';

describe('Phase 2: Song Library & Tamil Lyrics Management', () => {
  it('lists existing songs including pre-seeded Tamil and English worship songs', async () => {
    const songs = await api.listSongs();
    expect(songs.length).toBeGreaterThanOrEqual(2);

    const tamilSong = songs.find(
      (s) => s.title.includes('கண்மலையானவரே') || s.language === 'Tamil'
    );
    expect(tamilSong).toBeDefined();
    expect(tamilSong?.language).toBe('Tamil');

    const englishSong = songs.find((s) => s.title.includes('Amazing Grace'));
    expect(englishSong).toBeDefined();
    expect(englishSong?.language).toBe('English');
  });

  it('creates a new song with sections and Tamil Unicode text', async () => {
    const songData: Partial<Song> = {
      title: 'இயேசுவே என் தெய்வம்',
      alternateTitle: 'Jesus My God',
      language: 'Tamil',
      category: 'Worship',
      author: 'Rev. Paul',
      songKey: 'E Minor',
      tempo: 72,
      tags: ['worship', 'adoration', 'tamil'],
    };

    const initialSections: SongSection[] = [
      {
        id: 'sec-test-1',
        songId: '',
        sectionType: 'verse',
        label: 'Verse 1',
        lyrics: 'இயேசுவே என் தெய்வம்\nஉம்மை நான் பணிந்திடுவேன்\nஎன் வாழ்நாளெல்லாம்\nஉம்மையே துதித்திடுவேன்',
        sortOrder: 0,
        notes: 'Lead guitar starts',
      },
      {
        id: 'sec-test-2',
        songId: '',
        sectionType: 'chorus',
        label: 'Chorus',
        lyrics: 'அல்லேலூயா அல்லேலூயா\nஆமென் அல்லேலூயா',
        sortOrder: 1,
        notes: 'Full band enters',
      },
    ];

    const created = await api.createSong(songData, initialSections);
    expect(created.song.id).toBeDefined();
    expect(created.song.title).toBe('இயேசுவே என் தெய்வம்');
    expect(created.sections.length).toBe(2);
    expect(created.sections[0].lyrics).toContain('இயேசுவே');
    expect(created.sections[1].sectionType).toBe('chorus');

    // Retrieve by ID
    const retrieved = await api.getSong(created.song.id);
    expect(retrieved).not.toBeNull();
    expect(retrieved?.song.title).toBe('இயேசுவே என் தெய்வம்');
    expect(retrieved?.sections.length).toBe(2);
  });

  it('updates song metadata and saves modified sections atomically', async () => {
    const songs = await api.listSongs();
    const song = songs[0];

    // Update metadata
    const updatedSong: Song = {
      ...song,
      tempo: 80,
      tags: [...song.tags, 'revival'],
    };
    const savedSong = await api.updateSong(updatedSong);
    expect(savedSong.tempo).toBe(80);
    expect(savedSong.tags).toContain('revival');

    // Fetch existing sections
    const sections = await api.getSongSections(song.id);
    expect(sections.length).toBeGreaterThan(0);

    // Add a bridge section
    const newSection: SongSection = {
      id: 'sec-new-bridge',
      songId: song.id,
      sectionType: 'bridge',
      label: 'Bridge',
      lyrics: 'Holy Holy is the Lord Almighty',
      sortOrder: sections.length,
    };
    const updatedSections = [...sections, newSection];
    const savedSections = await api.saveSongSections(song.id, updatedSections);

    expect(savedSections.length).toBe(sections.length + 1);
    expect(savedSections.find((s) => s.sectionType === 'bridge')).toBeDefined();
  });

  it('searches songs across title, alternate title, lyric text, and tags', async () => {
    // Search by Tamil text
    const searchTamil = await api.searchSongs('கண்மலையானவரே');
    expect(searchTamil.length).toBeGreaterThanOrEqual(1);
    expect(searchTamil[0].title).toContain('கண்மலையானவரே');

    // Search by English lyric text inside sections
    const searchLyrics = await api.searchSongs('wretch like me');
    expect(searchLyrics.length).toBeGreaterThanOrEqual(1);
    expect(searchLyrics[0].title).toContain('Amazing Grace');

    // Search with language filter
    const searchFilter = await api.searchSongs('', 'Tamil');
    expect(searchFilter.every((s) => s.language.toLowerCase() === 'tamil')).toBe(true);
  });

  it('duplicates a song with all its sections and "(Copy)" suffix', async () => {
    const songs = await api.listSongs();
    const original = songs[0];

    const duplicated = await api.duplicateSong(original.id);
    expect(duplicated.song.id).not.toBe(original.id);
    expect(duplicated.song.title).toContain('(Copy)');
    expect(duplicated.sections.length).toBeGreaterThan(0);
    expect(duplicated.sections[0].songId).toBe(duplicated.song.id);
  });

  it('deletes a song with confirmation without corrupting presentations (Snapshot Guarantee)', async () => {
    // 1. Create a temporary song
    const tempSong = await api.createSong(
      {
        title: 'Temporary Service Song',
        language: 'English',
        category: 'Worship',
        tags: [],
      },
      [
        {
          id: 'temp-sec-1',
          songId: '',
          sectionType: 'verse',
          label: 'Verse 1',
          lyrics: 'This lyric is used in Sunday service.',
          sortOrder: 0,
        },
      ]
    );

    // 2. Generate slides into a presentation (snapshot)
    const gen = await api.generateSlidesFromSong({
      songId: tempSong.song.id,
      sectionIds: [tempSong.sections[0].id],
      createNewPresentation: true,
      newPresentationTitle: 'Sunday Service Presentation',
    });

    const slidesBefore = await api.getSlides(gen.presentationId);
    expect(slidesBefore.length).toBe(1);
    expect(slidesBefore[0].body).toContain('This lyric is used in Sunday service.');

    // 3. Delete the song from library
    await api.deleteSong(tempSong.song.id);
    const lookup = await api.getSong(tempSong.song.id);
    expect(lookup).toBeNull();

    // 4. Verify that the presentation slide remains 100% intact!
    const slidesAfter = await api.getSlides(gen.presentationId);
    expect(slidesAfter.length).toBe(1);
    expect(slidesAfter[0].body).toContain('This lyric is used in Sunday service.');
  });
});
