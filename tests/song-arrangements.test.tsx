import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { api } from '../src/services/api';
import { ArrangementEditor } from '../src/components/Songs/ArrangementEditor';
import { sectionColor, DEFAULT_SECTION_COLORS } from '../src/services/sectionColors';
import { SongArrangement, SongSection } from '../src/types';

const SONG = 'song-amazing-grace';

const arr = (name: string, ids: string[], isDefault = false): SongArrangement => ({
  id: '',
  songId: SONG,
  name,
  sectionIds: ids,
  isDefault,
});

describe('Song arrangements and group colours', () => {
  it('falls back to the section type colour unless a custom colour is set', () => {
    expect(sectionColor({ sectionType: 'chorus', color: null })).toBe(DEFAULT_SECTION_COLORS.chorus);
    expect(sectionColor({ sectionType: 'chorus', color: '#123456' })).toBe('#123456');
  });

  it('saves arrangements, drops unknown sections and keeps a single default', async () => {
    const secs = await api.getSongSections(SONG);
    const [a, b] = [secs[0].id, secs[1].id];

    const saved = await api.saveSongArrangements(SONG, [
      arr('  Full  ', [a, b, 'ghost', a], true),
      arr('', [b], true),
    ]);

    expect(saved[0].name).toBe('Full');
    expect(saved[0].sectionIds).toEqual([a, b, a]);
    expect(saved.map((s) => s.isDefault)).toEqual([true, false]);
    expect(saved[1].name).toBe('Arrangement 2');
    expect(await api.getSongArrangements(SONG)).toHaveLength(2);
  });

  it('adds a song to a service following the default arrangement, repeats included', async () => {
    const secs = await api.getSongSections(SONG);
    await api.saveSongArrangements(SONG, [arr('Thrice', [secs[0].id, secs[0].id, secs[0].id], true)]);

    const service = await api.createService({ title: 'Arrangement service' });
    const item = await api.addSongToService(service.id, SONG, undefined, 50);
    const slides = await api.getServiceItemSlides(item.id);

    expect(slides).toHaveLength(3);
    expect(slides[0].body).toBe(slides[2].body);
  });

  it('generates slides in arrangement order, and explicit section ids still win', async () => {
    const secs = await api.getSongSections(SONG);
    const [a, b] = [secs[0].id, secs[1].id];
    const saved = await api.saveSongArrangements(SONG, [arr('B then A', [b, a], true)]);

    const viaArrangement = await api.generateSlidesFromSong({
      songId: SONG,
      sectionIds: [],
      arrangementId: saved[0].id,
      createNewPresentation: true,
      newPresentationTitle: 'Arr',
    });
    expect(viaArrangement.slides[0].title).toContain(secs[1].label);

    const explicit = await api.generateSlidesFromSong({
      songId: SONG,
      sectionIds: [a],
      createNewPresentation: true,
      newPresentationTitle: 'Explicit',
    });
    expect(explicit.slides.every((s) => s.title.includes(secs[0].label))).toBe(true);
  });

  describe('ArrangementEditor', () => {
    const sections: SongSection[] = [
      { id: 's1', songId: 'x', sectionType: 'verse', label: 'Verse 1', lyrics: 'a', sortOrder: 0 },
      { id: 's2', songId: 'x', sectionType: 'chorus', label: 'Chorus', lyrics: 'b', sortOrder: 1 },
    ];

    it('creates a default arrangement containing every section', () => {
      const onChange = vi.fn();
      render(<ArrangementEditor sections={sections} arrangements={[]} onChange={onChange} />);
      fireEvent.click(screen.getByTestId('add-arrangement-btn'));

      const created: SongArrangement[] = onChange.mock.calls[0][0];
      expect(created).toHaveLength(1);
      expect(created[0].sectionIds).toEqual(['s1', 's2']);
      expect(created[0].isDefault).toBe(true);
    });

    it('lets the same section be added again and reordered', () => {
      const onChange = vi.fn();
      const start: SongArrangement[] = [
        { id: 'a1', songId: 'x', name: 'Main', sectionIds: ['s1', 's2'], isDefault: true },
      ];
      render(<ArrangementEditor sections={sections} arrangements={start} onChange={onChange} />);

      fireEvent.click(screen.getAllByRole('button', { name: 'Chorus' })[0]); // "Add: Chorus"
      expect(onChange.mock.calls[0][0][0].sectionIds).toEqual(['s1', 's2', 's2']);

      fireEvent.click(screen.getAllByLabelText('Move down')[0]);
      expect(onChange.mock.calls[1][0][0].sectionIds).toEqual(['s2', 's1']);
    });

    it('promotes another arrangement to default when the default is deleted', () => {
      const onChange = vi.fn();
      const start: SongArrangement[] = [
        { id: 'a1', songId: 'x', name: 'One', sectionIds: ['s1'], isDefault: true },
        { id: 'a2', songId: 'x', name: 'Two', sectionIds: ['s2'], isDefault: false },
      ];
      render(<ArrangementEditor sections={sections} arrangements={start} onChange={onChange} />);
      fireEvent.click(screen.getByRole('button', { name: /Delete/ }));

      const after: SongArrangement[] = onChange.mock.calls[0][0];
      expect(after).toHaveLength(1);
      expect(after[0].id).toBe('a2');
      expect(after[0].isDefault).toBe(true);
    });
  });
});
