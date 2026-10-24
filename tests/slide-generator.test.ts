import { describe, it, expect } from 'vitest';
import { api } from '../src/services/api';
import { SlideGenerationOptions } from '../src/types';

describe('Phase 2: Lyric-to-Slide Generation & Grouping Rules', () => {
  it('splits lyrics by natural stanzas (blank lines)', async () => {
    // Multi-stanza verse
    const testSong = await api.createSong(
      {
        title: 'Stanza Test Song',
        language: 'English',
        category: 'Hymn',
        tags: [],
      },
      [
        {
          id: 'stanza-sec-1',
          songId: '',
          sectionType: 'verse',
          label: 'Verse 1',
          lyrics:
            'Line 1 of stanza 1\nLine 2 of stanza 1\n\nLine 1 of stanza 2\nLine 2 of stanza 2',
          sortOrder: 0,
        },
      ]
    );

    const options: SlideGenerationOptions = {
      songId: testSong.song.id,
      sectionIds: [testSong.sections[0].id],
      createNewPresentation: true,
      newPresentationTitle: 'Stanza Presentation',
    };

    const result = await api.generateSlidesFromSong(options);
    expect(result.slides.length).toBe(2);
    expect(result.slides[0].body).toBe('Line 1 of stanza 1\nLine 2 of stanza 1');
    expect(result.slides[1].body).toBe('Line 1 of stanza 2\nLine 2 of stanza 2');
    expect(result.slides[0].title).toContain('Verse 1 (1/2)');
    expect(result.slides[1].title).toContain('Verse 1 (2/2)');
  });

  it('splits lyrics by fixed lines per slide (e.g. 2 lines per slide)', async () => {
    const testSong = await api.createSong(
      {
        title: 'Lines Split Song',
        language: 'Tamil',
        category: 'Worship',
        tags: [],
      },
      [
        {
          id: 'lines-sec-1',
          songId: '',
          sectionType: 'verse',
          label: 'சரணங்கள்',
          lyrics: 'வரி 1\nவரி 2\nவரி 3\nவரி 4\nவரி 5',
          sortOrder: 0,
        },
      ]
    );

    const options: SlideGenerationOptions = {
      songId: testSong.song.id,
      sectionIds: [testSong.sections[0].id],
      linesPerSlide: 2,
      createNewPresentation: true,
      newPresentationTitle: 'Tamil 2-Line Slides',
    };

    const result = await api.generateSlidesFromSong(options);
    // 5 lines / 2 = 3 slides (2 lines, 2 lines, 1 line)
    expect(result.slides.length).toBe(3);
    expect(result.slides[0].body).toBe('வரி 1\nவரி 2');
    expect(result.slides[1].body).toBe('வரி 3\nவரி 4');
    expect(result.slides[2].body).toBe('வரி 5');
  });

  it('splits lyrics by custom delimiter (e.g. "---")', async () => {
    const testSong = await api.createSong(
      {
        title: 'Custom Delimiter Song',
        language: 'English',
        category: 'Worship',
        tags: [],
      },
      [
        {
          id: 'delim-sec-1',
          songId: '',
          sectionType: 'chorus',
          label: 'Chorus',
          lyrics: 'Section Part A\nStill Part A\n---\nSection Part B',
          sortOrder: 0,
        },
      ]
    );

    const options: SlideGenerationOptions = {
      songId: testSong.song.id,
      sectionIds: [testSong.sections[0].id],
      customDelimiter: '---',
      createNewPresentation: true,
      newPresentationTitle: 'Delimiter Slides',
    };

    const result = await api.generateSlidesFromSong(options);
    expect(result.slides.length).toBe(2);
    expect(result.slides[0].body).toBe('Section Part A\nStill Part A');
    expect(result.slides[1].body).toBe('Section Part B');
  });

  it('applies theme formatting and snapshots it into slides', async () => {
    const themes = await api.listThemes();
    expect(themes.length).toBeGreaterThan(0);
    const goldTheme = themes.find((t) => t.id === 'theme-tamil-classical') || themes[0];

    const testSong = await api.createSong(
      {
        title: 'Theme Applied Song',
        language: 'Tamil',
        category: 'Worship',
        tags: [],
      },
      [
        {
          id: 'th-sec-1',
          songId: '',
          sectionType: 'chorus',
          label: 'பல்லவி',
          lyrics: 'என் கண்மலையானவரே உம்மைப் போற்றுவேன்',
          sortOrder: 0,
        },
      ]
    );

    const result = await api.generateSlidesFromSong({
      songId: testSong.song.id,
      sectionIds: [testSong.sections[0].id],
      themeId: goldTheme.id,
      createNewPresentation: true,
      newPresentationTitle: 'Theme Test Pres',
    });

    const slide = result.slides[0];
    expect(slide.backgroundColor).toBe(goldTheme.backgroundColor);
    expect(slide.foregroundColor).toBe(goldTheme.textColor);
    expect(slide.fontSize).toBe(goldTheme.fontSize);
    expect(slide.textAlignment).toBe(goldTheme.textAlignment);
    expect(slide.textShadow).toBe(goldTheme.textShadow);
  });
});
