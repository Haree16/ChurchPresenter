import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { api } from '../src/services/api';
import { cleanQuery, findInText } from '../src/services/textSearch';
import { SongLibraryView } from '../src/components/Songs/SongLibraryView';
import { LibraryPanel } from '../src/components/LibraryPanel';
import { SearchPreview } from '../src/components/SearchPreview';
import { Presentation } from '../src/types';

const find = (text: string, q: string) => {
  const c = cleanQuery(q);
  const m = c ? findInText(text, c) : null;
  return m && { before: m.preview.before, matched: m.preview.matched, after: m.preview.after, rank: m.rank };
};

describe('search text matching', () => {
  it('cleans and bounds the query', () => {
    expect(cleanQuery('  amazing   grace ')).toBe('amazing grace');
    expect(cleanQuery('a')).toBeNull();
    expect(cleanQuery('   ')).toBeNull();
    expect(cleanQuery('x'.repeat(100))).not.toBeNull();
    expect(cleanQuery('x'.repeat(101))).toBeNull();
    expect(cleanQuery('அன்பு')).toBe('அன்பு');
  });

  it('finds a phrase ignoring case, with the text around it', () => {
    expect(find('Amazing grace, how sweet the sound', 'HOW SWEET')).toEqual({ before: 'Amazing grace, ', matched: 'how sweet', after: ' the sound', rank: 0 });
    expect(find('Amazing grace', 'amazing')).toEqual({ before: '', matched: 'Amazing', after: ' grace', rank: 0 });
  });

  it('finds a phrase that runs over a line break', () => {
    const r = find('Amazing grace how sweet the sound\nThat saved a wretch like me', 'sound that saved')!;
    expect(r).toMatchObject({ rank: 0, matched: 'sound That saved', before: 'Amazing grace how sweet the ', after: ' a wretch like me' });
  });

  it('shows only the lines with the match, and cuts long lines', () => {
    expect(find('First line\nthe quick brown fox\nLast line', 'brown')).toMatchObject({ before: 'the quick ', matched: 'brown', after: ' fox' });
    const long = `${'word '.repeat(30)}needle ${'tail '.repeat(30)}`;
    const r = find(long, 'needle')!;
    expect(r.before.startsWith('…')).toBe(true);
    expect(r.after.endsWith('…')).toBe(true);
    expect([...r.before].length).toBeLessThanOrEqual(38);
  });

  it('accepts all the words in any order as a weaker match, and needs every word', () => {
    const r = find('Grace was sweet, and the sound was amazing', 'sound sweet')!;
    expect(r.rank).toBe(1);
    expect(r.matched).toBe('sweet');
    expect(find('Grace was sweet', 'sound sweet')).toBeNull();
  });

  it('works in other scripts and never fails on odd text', () => {
    expect(find('கர்த்தர் என் மேய்ப்பராயிருக்கிறார்\nநான் தாழ்ச்சியடையேன்', 'மேய்ப்பர')).toMatchObject({ before: 'கர்த்தர் என் ', matched: 'மேய்ப்பர' });
    expect(find('Ünïcode Straße', 'ÜNÏCODE')).not.toBeNull();
    expect(find('', 'grace')).toBeNull();
    expect(find('%_\\ grace', '%_')).not.toBeNull();
    expect(find('a😀b grace', '😀b')).not.toBeNull();
  });
});

describe('search (browser store)', () => {
  it('finds a song by a line of its lyrics, once, with the section', async () => {
    const hits = await api.searchSongLyrics('wretch like me');
    const grace = hits.find((h) => h.songId === 'song-amazing-grace')!;
    expect(grace.sectionLabel).toBe('Verse 1');
    expect(grace.matched.toLowerCase()).toBe('wretch like me');
    expect(hits.filter((h) => h.songId === 'song-amazing-grace')).toHaveLength(1);
    expect(await api.searchSongLyrics('x')).toEqual([]);
    expect(await api.searchSongLyrics('zzzznotthere')).toEqual([]);
  });

  it('finds a presentation by the text on a slide, with the slide number', async () => {
    const hits = await api.searchSlideText('wretch like me');
    const hit = hits.find((h) => h.presentationId === 'pres-1')!;
    expect(hit.slideNumber).toBe(1);
    expect(hit.matched.toLowerCase()).toBe('wretch like me');
  });
});

describe('SearchPreview', () => {
  it('marks the match and shows lyrics as plain text, never markup', () => {
    const { container } = render(<SearchPreview preview={{ before: 'a <b>bold</b> ', matched: 'grace', after: ' <img src=x onerror=alert(1)>' }} label="Verse 1" />);
    expect(container.querySelector('mark')!.textContent).toBe('grace');
    expect(container.querySelector('b')).toBeNull();
    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByTestId('search-preview').textContent).toBe('Verse 1a <b>bold</b> grace <img src=x onerror=alert(1)>');
  });
});

describe('song list', () => {
  const open = () => render(<SongLibraryView presentations={[]} currentPresentationId={null} onSlidesGenerated={vi.fn()} />);
  const search = (text: string) => fireEvent.change(screen.getByPlaceholderText(/Search lyrics/), { target: { value: text } });

  it('finds a song by its lyrics and shows where', async () => {
    open();
    await screen.findAllByText('Amazing Grace');
    search('wretch like');
    const preview = await screen.findByTestId('search-preview');
    expect(preview.textContent).toContain('Verse 1');
    expect(preview.querySelector('mark')!.textContent!.toLowerCase()).toBe('wretch like');
    expect(screen.getAllByText('Amazing Grace').length).toBeGreaterThan(0);
    expect(screen.getByText(/1 SONG FOUND/)).toBeTruthy();
  });

  it('finds songs by title without a preview, and clears the preview when the search is cleared', async () => {
    open();
    await screen.findAllByText('Amazing Grace');
    search('Amazing');
    await waitFor(() => expect(screen.getByText(/SONG.* FOUND/)).toBeTruthy());
    search('wretch like');
    await screen.findByTestId('search-preview');
    search('');
    await waitFor(() => expect(screen.queryByTestId('search-preview')).toBeNull());
  });

  it('does not show a preview from older text while the new text is still being searched', async () => {
    open();
    await screen.findAllByText('Amazing Grace');
    search('wretch like');
    await screen.findByTestId('search-preview');
    search('wretch lik'); // the old result belongs to different text, so it is not shown at once
    expect(screen.queryByTestId('search-preview')).toBeNull();
    await screen.findByTestId('search-preview');
  });
});

describe('presentation list', () => {
  it('finds a presentation by text on its slides and shows which slide', async () => {
    const presentations: Presentation[] = await api.listPresentations();
    render(
      <LibraryPanel
        presentations={presentations}
        selectedPresentationId={null}
        onSelectPresentation={vi.fn()}
        onCreatePresentation={vi.fn()}
        onUpdatePresentation={vi.fn()}
        onDuplicatePresentation={vi.fn()}
        onDeletePresentation={vi.fn()}
      />
    );
    fireEvent.change(screen.getByPlaceholderText(/Search songs/), { target: { value: 'wretch like' } });
    const preview = await screen.findByTestId('search-preview');
    expect(preview.textContent).toContain('Slide 1');
    expect(preview.querySelector('mark')!.textContent!.toLowerCase()).toBe('wretch like');
  });
});
