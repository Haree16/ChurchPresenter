import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const dialog = vi.hoisted(() => ({ open: vi.fn(), save: vi.fn() }));
vi.mock('@tauri-apps/plugin-dialog', () => dialog);

const fonts = vi.hoisted(() => ({ available: vi.fn((_font: string) => true) }));
vi.mock('../src/services/themeFonts', async () => ({
  ...(await vi.importActual<typeof import('../src/services/themeFonts')>('../src/services/themeFonts')),
  isFontAvailable: (f: string) => fonts.available(f),
}));

import { api } from '../src/services/api';
import { namedFonts, missingFonts } from '../src/services/themeFonts';
import { ThemeTransferBar } from '../src/components/Themes/ThemeTransferBar';
import { ThemeBackgroundControl } from '../src/components/Themes/ThemeBackgroundControl';
import { ThemeManagerModal } from '../src/components/Themes/ThemeManagerModal';
import { Theme } from '../src/types';

const theme = (over: Partial<Theme> = {}): Theme => ({
  id: 't1', name: 'Sunrise', isBuiltIn: false, backgroundColor: '#000000', backgroundMode: 'cover',
  fontFamily: 'Arial', fontSize: 'large', fontWeight: 'bold', textColor: '#ffffff', textAlignment: 'center',
  verticalAlignment: 'center', lineSpacing: 1.4, textMargin: 6, createdAt: '', updatedAt: '', ...over,
});

beforeEach(() => {
  dialog.open.mockReset();
  dialog.save.mockReset();
  fonts.available.mockReset();
  fonts.available.mockReturnValue(true);
});

describe('font helpers', () => {
  // the module is mocked for the component tests below; this is the real function
  const realIsFontAvailable = async (name: string, measure: ((f: string) => number | null) | null) =>
    (await vi.importActual<typeof import('../src/services/themeFonts')>('../src/services/themeFonts')).isFontAvailable(name, measure);

  it('lists named fonts and skips generic families and quotes', () => {
    expect(namedFonts('"Noto Sans Tamil", \'Latha\', system-ui, -apple-system, sans-serif')).toEqual(['Noto Sans Tamil', 'Latha']);
    expect(namedFonts('serif, monospace')).toEqual([]);
    expect(namedFonts('')).toEqual([]);
  });

  it('detects an installed font by width and says yes when it cannot tell', async () => {
    // a font that exists changes the measured width against both fallbacks
    const measure = (font: string) => (font.includes('"Real"') ? 500 : font.includes('serif') ? 300 : 200);
    expect(await realIsFontAvailable('Real', measure)).toBe(true);
    expect(await realIsFontAvailable('Missing', (f) => (f.includes('serif') ? 300 : 200))).toBe(false);
    expect(await realIsFontAvailable('Anything', null)).toBe(true); // no canvas (e.g. tests): no false warnings
    expect(await realIsFontAvailable('Anything', () => null)).toBe(true);
  });

  it('missingFonts returns only the unavailable ones', () => {
    expect(missingFonts(['A', 'B', 'C'], (f) => f === 'B')).toEqual(['A', 'C']);
    expect(missingFonts([], () => false)).toEqual([]);
  });
});

describe('ThemeTransferBar', () => {
  const renderBar = (over: Partial<React.ComponentProps<typeof ThemeTransferBar>> = {}) => {
    const onImported = vi.fn();
    const utils = render(
      <ThemeTransferBar selectedTheme={theme()} customThemes={[theme(), theme({ id: 't2', name: 'Night' })]} onImported={onImported} {...over} />
    );
    return { onImported, ...utils };
  };

  it('exports the selected theme to the chosen file and reports it', async () => {
    dialog.save.mockResolvedValue('/home/me/Sunrise.cptheme');
    const spy = vi.spyOn(api, 'exportThemesToFile').mockResolvedValue({ count: 1, warnings: ['"Sunrise": background image file was not found and was left out.'] });
    renderBar();
    fireEvent.click(screen.getByTestId('theme-export'));

    await waitFor(() => expect(spy).toHaveBeenCalledWith(['t1'], '/home/me/Sunrise.cptheme'));
    expect(dialog.save.mock.calls[0][0].defaultPath).toBe('Sunrise.cptheme');
    expect(screen.getByTestId('theme-transfer-message').textContent).toBe('Exported 1 theme.');
    expect(screen.getByTestId('theme-transfer-note').textContent).toMatch(/left out/);
    spy.mockRestore();
  });

  it('keeps file-name-unfriendly characters out of the suggested name', async () => {
    dialog.save.mockResolvedValue(null);
    renderBar({ selectedTheme: theme({ name: 'Easter: 2026 / "Special"' }) });
    fireEvent.click(screen.getByTestId('theme-export'));
    await waitFor(() => expect(dialog.save).toHaveBeenCalled());
    expect(dialog.save.mock.calls[0][0].defaultPath).toBe('Easter_ 2026 _ _Special_.cptheme');
  });

  it('exports every custom theme into one file', async () => {
    dialog.save.mockResolvedValue('/x/all.cptheme');
    const spy = vi.spyOn(api, 'exportThemesToFile').mockResolvedValue({ count: 2, warnings: [] });
    renderBar();
    fireEvent.click(screen.getByTestId('theme-export-all'));
    await waitFor(() => expect(spy).toHaveBeenCalledWith(['t1', 't2'], '/x/all.cptheme'));
    expect(screen.getByTestId('theme-transfer-message').textContent).toBe('Exported 2 themes.');
    spy.mockRestore();
  });

  it('does nothing when the save or open dialog is cancelled', async () => {
    dialog.save.mockResolvedValue(null);
    dialog.open.mockResolvedValue(null);
    const exp = vi.spyOn(api, 'exportThemesToFile');
    const imp = vi.spyOn(api, 'importThemesFromFile');
    const { onImported } = renderBar();
    fireEvent.click(screen.getByTestId('theme-export'));
    fireEvent.click(screen.getByTestId('theme-import'));
    await waitFor(() => expect(dialog.open).toHaveBeenCalled());
    expect(exp).not.toHaveBeenCalled();
    expect(imp).not.toHaveBeenCalled();
    expect(onImported).not.toHaveBeenCalled();
    exp.mockRestore();
    imp.mockRestore();
  });

  it('disables export when nothing is selected or there are no custom themes', () => {
    renderBar({ selectedTheme: null, customThemes: [] });
    expect((screen.getByTestId('theme-export') as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByTestId('theme-export-all') as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByTestId('theme-import') as HTMLButtonElement).disabled).toBe(false);
  });

  it('imports a file, reports renames, warns about fonts that are not installed, and tells the parent', async () => {
    dialog.open.mockResolvedValue('/x/theme.cptheme');
    fonts.available.mockImplementation((f: string) => f !== 'Noto Sans Tamil');
    const imported = [theme({ id: 'n1', name: 'Sunrise (2)' })];
    const spy = vi.spyOn(api, 'importThemesFromFile').mockResolvedValue({
      imported,
      warnings: ["'Sunrise' already exists, so it was imported as 'Sunrise (2)'."],
      fonts: ['Noto Sans Tamil', 'Latha'],
    });
    const { onImported } = renderBar();
    fireEvent.click(screen.getByTestId('theme-import'));

    await waitFor(() => expect(spy).toHaveBeenCalledWith('/x/theme.cptheme'));
    expect(screen.getByTestId('theme-transfer-message').textContent).toBe('Imported 1 theme.');
    const notes = screen.getAllByTestId('theme-transfer-note').map((n) => n.textContent);
    expect(notes[0]).toMatch(/imported as 'Sunrise \(2\)'/);
    expect(notes.some((n) => n!.includes('"Noto Sans Tamil" is not installed'))).toBe(true);
    expect(notes.some((n) => n!.includes('Latha'))).toBe(false); // installed, so no warning
    expect(onImported).toHaveBeenCalledWith(imported);
    spy.mockRestore();
  });

  it('shows the reason when an import or export fails', async () => {
    dialog.open.mockResolvedValue('/x/bad.cptheme');
    const spy = vi.spyOn(api, 'importThemesFromFile').mockRejectedValue('Theme \'X\': invalid text colour.');
    const { onImported } = renderBar();
    fireEvent.click(screen.getByTestId('theme-import'));
    await waitFor(() => expect(screen.getByTestId('theme-transfer-error').textContent).toMatch(/invalid text colour/));
    expect(onImported).not.toHaveBeenCalled();
    spy.mockRestore();

    // in a plain browser the desktop-only API explains itself
    dialog.save.mockResolvedValue('/x/out.cptheme');
    fireEvent.click(screen.getByTestId('theme-export'));
    await waitFor(() => expect(screen.getByTestId('theme-transfer-error').textContent).toMatch(/requires the desktop app/));
  });
});

describe('ThemeBackgroundControl', () => {
  it('offers images and videos from the media library, sets id and path, and clears with None', async () => {
    await api.importMediaAsset('/media/church.png');
    await api.importMediaAsset('/media/intro.mp4');
    const onChange = vi.fn();
    render(<ThemeBackgroundControl theme={theme()} onChange={onChange} />);

    const select = screen.getByTestId('theme-bg-image') as HTMLSelectElement;
    await waitFor(() => expect(Array.from(select.options).some((o) => o.text.includes('church.png'))).toBe(true));
    expect(Array.from(select.options).some((o) => o.text.includes('intro.mp4'))).toBe(true);

    const option = Array.from(select.options).find((o) => o.text.includes('church.png'))!;
    fireEvent.change(select, { target: { value: option.value } });
    const patch = onChange.mock.calls[0][0];
    expect(patch.backgroundImageId).toBe(option.value);
    expect(patch.backgroundImagePath).toMatch(/church/);

    const video = Array.from(select.options).find((o) => o.text.includes('intro.mp4'))!;
    fireEvent.change(select, { target: { value: video.value } });
    expect(onChange.mock.calls[1][0].backgroundImagePath).toMatch(/intro/);

    fireEvent.change(select, { target: { value: '' } });
    expect(onChange).toHaveBeenLastCalledWith({ backgroundImageId: null, backgroundImagePath: null });
  });

  it('shows an imported image that is not in the library, and disables the fit control without an image', async () => {
    const { rerender } = render(<ThemeBackgroundControl theme={theme({ backgroundImagePath: 'media/themes/abc.png' })} onChange={vi.fn()} />);
    const select = screen.getByTestId('theme-bg-image') as HTMLSelectElement;
    await waitFor(() => expect(select.value).toBe('__current__'));
    expect(select.options[select.selectedIndex].text).toBe('Imported image');
    expect((screen.getByTestId('theme-bg-mode') as HTMLSelectElement).disabled).toBe(false);

    rerender(<ThemeBackgroundControl theme={theme({ backgroundImagePath: null })} onChange={vi.fn()} />);
    expect((screen.getByTestId('theme-bg-mode') as HTMLSelectElement).disabled).toBe(true);
  });

  it('is read-only for built-in themes and reports the chosen fit', () => {
    const onChange = vi.fn();
    const { rerender } = render(<ThemeBackgroundControl theme={theme({ isBuiltIn: true, backgroundImagePath: 'media/x.png' })} onChange={onChange} />);
    expect((screen.getByTestId('theme-bg-image') as HTMLSelectElement).disabled).toBe(true);
    expect((screen.getByTestId('theme-bg-mode') as HTMLSelectElement).disabled).toBe(true);

    rerender(<ThemeBackgroundControl theme={theme({ backgroundImagePath: 'media/x.png' })} onChange={onChange} />);
    fireEvent.change(screen.getByTestId('theme-bg-mode'), { target: { value: 'contain' } });
    expect(onChange).toHaveBeenCalledWith({ backgroundMode: 'contain' });
  });
});

describe('ThemeManagerModal import/export and background', () => {
  it('shows the transfer controls and saves a chosen background image with the theme', async () => {
    const asset = await api.importMediaAsset('/media/hall.jpg');
    const created = await api.createTheme({ name: 'With background' });
    const spy = vi.spyOn(api, 'updateTheme');
    render(<ThemeManagerModal isOpen onClose={vi.fn()} />);

    expect(await screen.findByTestId('theme-transfer')).toBeTruthy();
    fireEvent.click(await screen.findByText('With background'));
    const select = (await screen.findByTestId('theme-bg-image')) as HTMLSelectElement;
    await waitFor(() => expect(Array.from(select.options).some((o) => o.value === asset.id)).toBe(true));
    fireEvent.change(select, { target: { value: asset.id } });
    fireEvent.click(screen.getByRole('button', { name: /save theme/i }));

    await waitFor(() => expect(spy).toHaveBeenCalled());
    expect(spy.mock.calls[0][0]).toMatchObject({ id: created.id, backgroundImageId: asset.id, backgroundImagePath: asset.relativePath });
    spy.mockRestore();
  });
});
