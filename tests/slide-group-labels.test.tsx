import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { api } from '../src/services/api';
import { SlideCard } from '../src/components/SlideGrid';
import { readableTextColor } from '../src/services/sectionColors';
import { Slide, SongArrangement } from '../src/types';

const baseSlide: Slide = {
  id: 's1',
  presentationId: 'p1',
  sortOrder: 0,
  title: 'Amazing Grace - Chorus',
  body: 'Amazing grace',
  backgroundColor: '#000000',
  foregroundColor: '#ffffff',
  fontSize: 'large',
  textAlignment: 'center',
  createdAt: '',
  updatedAt: '',
};

const renderCard = (slide: Slide) =>
  render(
    <SlideCard
      slide={slide}
      index={0}
      totalSlides={1}
      isLive={false}
      isNext={false}
      isConfirmingDelete={false}
      onGoLive={vi.fn()}
      onEditSlide={vi.fn()}
      onDuplicateSlide={vi.fn()}
      onRequestDelete={vi.fn()}
      onCancelDelete={vi.fn()}
      onConfirmDelete={vi.fn()}
      onMoveUp={vi.fn()}
      onMoveDown={vi.fn()}
    />
  );

describe('Slide group labels', () => {
  it('shows a coloured tag with the group name on grouped slides', () => {
    renderCard({ ...baseSlide, groupLabel: 'Chorus', groupColor: '#f59e0b' });
    const tag = screen.getByTestId('slide-group-tag');
    expect(tag.textContent).toBe('Chorus');
    expect(tag.style.backgroundColor).toBe('rgb(245, 158, 11)');
  });

  it('shows no tag on ordinary slides or when only one of label/colour is set', () => {
    const { unmount } = renderCard(baseSlide);
    expect(screen.queryByTestId('slide-group-tag')).toBeNull();
    unmount();
    renderCard({ ...baseSlide, groupLabel: 'Chorus', groupColor: null });
    expect(screen.queryByTestId('slide-group-tag')).toBeNull();
  });

  it('picks dark text on light colours and white text on dark colours', () => {
    expect(readableTextColor('#facc15')).toBe('#0b1020'); // yellow
    expect(readableTextColor('#3b82f6')).toBe('#ffffff'); // blue
    expect(readableTextColor('#000000')).toBe('#ffffff');
    expect(readableTextColor('not-a-colour')).toBe('#ffffff');
  });

  it('stamps song slides with group label and colour, following arrangements', async () => {
    const SONG = 'song-amazing-grace';
    const secs = await api.getSongSections(SONG);
    const arrangement: SongArrangement = {
      id: '', songId: SONG, name: 'A B A',
      sectionIds: [secs[0].id, secs[1].id, secs[0].id], isDefault: true,
    };
    await api.saveSongArrangements(SONG, [arrangement]);

    const service = await api.createService({ title: 'Groups' });
    const item = await api.addSongToService(service.id, SONG, undefined, 50);
    const slides = await api.getServiceItemSlides(item.id);

    expect(slides.map((s) => s.groupLabel)).toEqual([secs[0].label, secs[1].label, secs[0].label]);
    expect(slides.every((s) => /^#[0-9a-f]{6}$/i.test(s.groupColor || ''))).toBe(true);
    expect(slides[0].groupColor).toBe(slides[2].groupColor);
  });

  it('stamps slides generated into a presentation, and leaves manual slides ungrouped', async () => {
    const res = await api.generateSlidesFromSong({
      songId: 'song-amazing-grace',
      sectionIds: [],
      createNewPresentation: true,
      newPresentationTitle: 'Grouped',
    });
    expect(res.slides.length).toBeGreaterThan(0);
    expect(res.slides.every((s) => !!s.groupLabel && !!s.groupColor)).toBe(true);

    const manual = await api.createSlide(res.presentationId, { title: 'Announcement', body: 'Hi' });
    expect(manual.groupLabel).toBeNull();
    expect(manual.groupColor).toBeNull();
  });
});
