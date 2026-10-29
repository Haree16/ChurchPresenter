import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { api } from '../src/services/api';
import { LibraryPanel } from '../src/components/LibraryPanel';
import { Presentation } from '../src/types';

afterEach(() => {
  vi.restoreAllMocks();
});

const open = (onSelect = vi.fn()) => {
  render(
    <LibraryPanel
      presentations={[] as Presentation[]}
      selectedPresentationId={null}
      onSelectPresentation={onSelect}
      onCreatePresentation={vi.fn()}
      onUpdatePresentation={vi.fn()}
      onDuplicatePresentation={vi.fn()}
      onDeletePresentation={vi.fn()}
    />
  );
  return onSelect;
};
const clickImport = () => fireEvent.click(screen.getByText('Import').closest('button')!);
const answerPrompt = (path: string | null) => vi.spyOn(window, 'prompt').mockReturnValue(path);

describe('PowerPoint import (browser store)', () => {
  it('makes a presentation of slides from a .pptx path and refuses other files', async () => {
    const r = await api.importPptxNative('/home/me/Sunday Notices.pptx');
    expect(r.presentation.title).toBe('Sunday Notices');
    expect(r.slideCount).toBe(2);
    expect(await api.getSlides(r.presentation.id)).toHaveLength(2);
    expect((await api.importPptxNative('/x/deck.PPTX', '  Named  ')).presentation.title).toBe('Named');
    await expect(api.importPptxNative('/x/deck.pdf')).rejects.toThrow(/Only \.pptx/);
    await expect(api.importPptxNative('/x/deck.ppt')).rejects.toThrow(/Only \.pptx/);
  });
});

describe('Import button', () => {
  it('imports a .pptx as editable slides and says so', async () => {
    answerPrompt('/files/Easter Notices.pptx');
    const onSelect = open();
    clickImport();
    const notice = await screen.findByTestId('import-notice');
    expect(notice.textContent).toContain('Imported "Easter Notices": 2 slides, all editable.');
    expect(screen.queryByTestId('import-warnings')).toBeNull();
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(await api.getSlides(onSelect.mock.calls[0][0])).toHaveLength(2);
  });

  it('lists what could not be imported', async () => {
    answerPrompt('/files/deck.pptx');
    vi.spyOn(api, 'importPptxNative').mockResolvedValue({
      presentation: { id: 'p1', title: 'deck', category: 'Other', createdAt: '', updatedAt: '' },
      slideCount: 1,
      warnings: ['Charts were left out (slide 2).', 'Speaker notes were not imported (slides 1, 3).'],
    });
    open();
    clickImport();
    const warnings = await screen.findByTestId('import-warnings');
    expect(Array.from(warnings.querySelectorAll('li')).map((li) => li.textContent)).toEqual([
      'Charts were left out (slide 2).',
      'Speaker notes were not imported (slides 1, 3).',
    ]);
    expect(screen.getByTestId('import-notice').textContent).toContain('1 slide, all editable');
  });

  it('shows why a file could not be imported and offers to import it as pictures', async () => {
    answerPrompt('/files/broken.pptx');
    vi.spyOn(api, 'importPptxNative').mockRejectedValue('This is not a PowerPoint (.pptx) file, or it is damaged.');
    const asPictures = vi.spyOn(api, 'importPresentationDocument').mockResolvedValue({ id: 'pics', title: 'broken', category: 'Other', createdAt: '', updatedAt: '' });
    const onSelect = open();
    clickImport();
    expect((await screen.findByTestId('import-error')).textContent).toMatch(/not a PowerPoint/);
    expect(onSelect).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId('import-as-pictures'));
    await waitFor(() => expect(asPictures).toHaveBeenCalledWith('/files/broken.pptx'));
    await waitFor(() => expect(onSelect).toHaveBeenCalledWith('pics'));
    expect(screen.queryByTestId('import-notice')).toBeNull(); // the notice goes once the pictures import worked
  });

  it('keeps the notice, with the reason, when the pictures route fails too', async () => {
    answerPrompt('/files/broken.pptx');
    vi.spyOn(api, 'importPptxNative').mockRejectedValue(new Error('damaged'));
    vi.spyOn(api, 'importPresentationDocument').mockRejectedValue(new Error('LibreOffice is required to convert PPTX presentations directly.'));
    open();
    clickImport();
    await screen.findByTestId('import-error');
    fireEvent.click(screen.getByTestId('import-as-pictures'));
    await waitFor(() => expect(screen.getByTestId('import-error').textContent).toMatch(/LibreOffice is required/));
  });

  it('can be offered as pictures after a good import, and the notice can be dismissed', async () => {
    answerPrompt('/files/deck.pptx');
    open();
    clickImport();
    await screen.findByTestId('import-notice');
    expect(screen.getByTestId('import-as-pictures')).toBeTruthy();
    fireEvent.click(screen.getByTestId('import-dismiss'));
    expect(screen.queryByTestId('import-notice')).toBeNull();
  });

  it('leaves PDF and old .ppt files on the picture route, with no notice', async () => {
    const native = vi.spyOn(api, 'importPptxNative');
    const pictures = vi.spyOn(api, 'importPresentationDocument').mockResolvedValue({ id: 'pdf1', title: 'doc', category: 'Other', createdAt: '', updatedAt: '' });
    for (const path of ['/files/doc.pdf', '/files/old.ppt']) {
      cleanup();
      answerPrompt(path);
      const onSelect = open();
      clickImport();
      await waitFor(() => expect(onSelect).toHaveBeenCalledWith('pdf1'));
      expect(screen.queryByTestId('import-notice')).toBeNull();
    }
    expect(native).not.toHaveBeenCalled();
    expect(pictures).toHaveBeenCalledTimes(2);
  });

  it('does nothing when the file choice is cancelled', async () => {
    answerPrompt(null);
    const native = vi.spyOn(api, 'importPptxNative');
    const onSelect = open();
    clickImport();
    await new Promise((r) => setTimeout(r, 20));
    expect(native).not.toHaveBeenCalled();
    expect(onSelect).not.toHaveBeenCalled();
    expect(screen.queryByTestId('import-notice')).toBeNull();
  });
});
