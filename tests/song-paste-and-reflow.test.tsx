import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { SongPasteModal } from '../src/components/Songs/SongPasteModal';
import { LyricsEditor } from '../src/components/Songs/LyricsEditor';
import { AudienceView } from '../src/components/AudienceView';
import { api } from '../src/services/api';
import { SongSection } from '../src/types';

describe('SongPasteModal component', () => {
  it('renders modal when open and auto-detects CCLI metadata and strips chords on input', async () => {
    const onCreated = vi.fn();
    const onClose = vi.fn();

    const samplePaste = `10,000 Reasons (Bless The Lord)

Verse 1
[G]The sun comes [C]up, it's a [G]new day [D]dawning
[Em]It's time to [C]sing Your [G]song [D]again

Chorus
G                   C
Bless the Lord, O my soul
G                   D
O my soul, worship His holy name

CCLI Song # 6016351
Jonas Myrin | Matt Redman
© 2011 Atlas Mountain Songs; sixsteps Music; Thankyou Music
For use solely with the SongSelect® Terms of Use. All rights reserved. www.ccli.com
CCLI License # 999999`;

    render(<SongPasteModal isOpen={true} onClose={onClose} onCreated={onCreated} />);

    // Check presence of new metadata fields and chord toggle
    expect(screen.getByLabelText('Song title')).toBeDefined();
    expect(screen.getByLabelText('CCLI number')).toBeDefined();
    expect(screen.getByLabelText('Author')).toBeDefined();
    expect(screen.getByLabelText('Copyright')).toBeDefined();
    expect(screen.getByText(/Strip chords/)).toBeDefined();

    // Paste lyrics into textarea
    const textarea = screen.getByLabelText('Lyrics');
    fireEvent.change(textarea, { target: { value: samplePaste } });

    // Auto-detection should fill title, CCLI number, author, copyright
    await waitFor(() => {
      expect((screen.getByLabelText('Song title') as HTMLInputElement).value).toBe('10,000 Reasons (Bless The Lord)');
      expect((screen.getByLabelText('CCLI number') as HTMLInputElement).value).toBe('6016351');
      expect((screen.getByLabelText('Author') as HTMLInputElement).value).toContain('Jonas Myrin');
      expect((screen.getByLabelText('Copyright') as HTMLInputElement).value).toContain('2011 Atlas Mountain Songs');
      expect(screen.getByText(/Detected CCLI #6016351/)).toBeDefined();
    });

    // Preview should display 2 recognized sections with chords stripped
    expect(screen.getByText(/recognized/i)).toBeDefined();
    expect(screen.getByText('Verse 1')).toBeDefined();
    expect(screen.getByText('Chorus')).toBeDefined();
    const versePreview = screen.getByText(/The sun comes up, it's a new day dawning/);
    expect(versePreview.textContent).not.toContain('[G]');

    // Mock api.createSong and submit
    const createSongSpy = vi.spyOn(api, 'createSong').mockResolvedValueOnce({
      song: {
        id: 'test-song-id',
        title: '10,000 Reasons (Bless The Lord)',
        language: 'Tamil',
        category: 'Worship',
        tags: [],
        author: 'Jonas Myrin | Matt Redman',
        copyright: '© 2011 Atlas Mountain Songs; sixsteps Music; Thankyou Music',
        ccliNumber: '6016351',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      sections: [],
    });

    const createBtn = screen.getByRole('button', { name: 'Create song' });
    fireEvent.click(createBtn);

    await waitFor(() => {
      expect(createSongSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          title: '10,000 Reasons (Bless The Lord)',
          ccliNumber: '6016351',
          author: 'Jonas Myrin | Matt Redman',
          copyright: expect.stringContaining('2011 Atlas Mountain Songs'),
        }),
        expect.any(Array)
      );
      expect(onCreated).toHaveBeenCalledWith('test-song-id', '10,000 Reasons (Bless The Lord)');
      expect(onClose).toHaveBeenCalled();
    });

    createSongSpy.mockRestore();
  });
});

describe('LyricsEditor Reflow Bulk Edit', () => {
  const initialSections: SongSection[] = [
    {
      id: 'sec-1',
      songId: 'song-1',
      sectionType: 'verse',
      label: 'Verse 1',
      lyrics: 'Line one\nLine two',
      sortOrder: 0,
      color: '#3b82f6',
    },
    {
      id: 'sec-2',
      songId: 'song-1',
      sectionType: 'chorus',
      label: 'Chorus',
      lyrics: 'Praise the Lord',
      sortOrder: 1,
    },
  ];

  it('toggles between Cards view and Bulk Edit as Text (Reflow) view', () => {
    const onChange = vi.fn();
    render(<LyricsEditor sections={initialSections} onChange={onChange} />);

    // Initially in card mode
    expect(screen.getByText(/Section Cards/)).toBeDefined();
    expect(screen.getByDisplayValue(/Line one/)).toBeDefined();

    // Switch to Bulk Edit / Reflow
    const reflowTab = screen.getByRole('button', { name: /Bulk Edit as Text/i });
    fireEvent.click(reflowTab);

    // Monospace reflow textarea is displayed with serialized format
    const reflowArea = screen.getByLabelText('Bulk lyrics reflow text') as HTMLTextAreaElement;
    expect(reflowArea).toBeDefined();
    expect(reflowArea.value).toContain('[Verse 1]\nLine one\nLine two');
    expect(reflowArea.value).toContain('[Chorus]\nPraise the Lord');
    expect(screen.getByText(/2 sections parsed/)).toBeDefined();

    // Strip chords button works in reflow
    fireEvent.change(reflowArea, {
      target: { value: '[Verse 1]\n[G]Line one [C]with chords\nLine two\n\n[Chorus]\nPraise the Lord' },
    });
    const stripBtn = screen.getByRole('button', { name: /Strip chords/i });
    fireEvent.click(stripBtn);
    expect(reflowArea.value).not.toContain('[G]');
    expect(reflowArea.value).toContain('Line one with chords');

    // Switch back to cards
    const doneBtn = screen.getByRole('button', { name: /Done \(Back to Cards\)/i });
    fireEvent.click(doneBtn);

    // onChange was called with updated sections
    expect(onChange).toHaveBeenCalled();
  });
});

describe('AudienceView side-by-side dual translations', () => {
  it('renders dual translations in side-by-side grid columns with translation labels', async () => {
    const pres = await api.createPresentation('Bible Dual Test', 'Scripture');
    const slide = await api.createSlide(pres.id, {
      title: 'John 3:16 (Tamil / English)',
      body: 'தேவன் தம்முடைய ஒரேபேறான குமாரனை தந்தருளி...\n\nFor God so loved the world that He gave His only begotten Son...',
    });

    await api.setLiveSlide(pres.id, slide.id);

    render(<AudienceView />);

    await waitFor(() => {
      expect(screen.getByTestId('dual-translation-layout')).toBeDefined();
    });

    expect(screen.getByText('Tamil')).toBeDefined();
    expect(screen.getByText('English')).toBeDefined();
    expect(screen.getByText(/தேவன் தம்முடைய ஒரேபேறான/)).toBeDefined();
    expect(screen.getByText(/For God so loved the world/)).toBeDefined();
  });
});
