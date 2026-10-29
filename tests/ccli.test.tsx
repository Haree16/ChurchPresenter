import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { api } from '../src/services/api';
import {
  csvCell, parseIsoDate, presetRange, reportFileName, reportToCsv, toIsoDate, validateLicenceNumber, validateReportRange,
} from '../src/services/ccliReport';
import { CcliReportModal } from '../src/components/Songs/CcliReportModal';
import { CcliSettingsCard } from '../src/components/Settings/CcliSettingsCard';
import { CcliReport, PlaylistItem } from '../src/types';

const today = toIsoDate(new Date());
const yearRange = () => ({ from: `${new Date().getFullYear()}-01-01`, to: `${new Date().getFullYear()}-12-31` });

afterEach(async () => {
  for (const u of await api.listSongUsage(yearRange().from, yearRange().to)) await api.deleteSongUsage(u.id);
  await api.setCcliLicenceNumber('');
  await api.clearAll();
});

describe('licence number', () => {
  it('is digits only, 4 to 10 of them, and empty means none', () => {
    expect(validateLicenceNumber('1234567')).toBeNull();
    expect(validateLicenceNumber(' 123 456 ')).toBeNull();
    expect(validateLicenceNumber('')).toBeNull();
    for (const bad of ['12-34', 'abcd', '123', '12345678901']) expect(validateLicenceNumber(bad), bad).not.toBeNull();
  });

  it('is saved and cleared through the API, and a bad value is refused', async () => {
    expect(await api.setCcliLicenceNumber(' 998 877 ')).toBe('998877');
    expect(await api.getCcliLicenceNumber()).toBe('998877');
    await expect(api.setCcliLicenceNumber('nope')).rejects.toThrow(/digits/);
    expect(await api.getCcliLicenceNumber()).toBe('998877');
    expect(await api.setCcliLicenceNumber('')).toBeNull();
    expect(await api.getCcliLicenceNumber()).toBeNull();
  });
});

describe('dates and ranges', () => {
  it('accepts real calendar dates only', () => {
    expect(parseIsoDate('2026-02-28')).not.toBeNull();
    for (const bad of ['2026-02-31', '2026-13-01', '26-01-01', 'today', '']) expect(parseIsoDate(bad), bad).toBeNull();
  });

  it('checks a range', () => {
    expect(validateReportRange('2026-01-01', '2026-01-01')).toBeNull();
    expect(validateReportRange('2026-02-01', '2026-01-01')).toMatch(/after/);
    expect(validateReportRange('2026-01-01', '')).toMatch(/YYYY-MM-DD/);
    expect(validateReportRange('2000-01-01', '2026-01-01')).toMatch(/five years/);
  });

  it('works out the quick ranges from a given day', () => {
    const d = new Date(2026, 2, 15); // 15 March 2026
    expect(presetRange('thisMonth', d)).toEqual({ from: '2026-03-01', to: '2026-03-31' });
    expect(presetRange('lastMonth', d)).toEqual({ from: '2026-02-01', to: '2026-02-28' });
    expect(presetRange('last90', d)).toEqual({ from: '2025-12-16', to: '2026-03-15' });
    expect(presetRange('thisYear', d)).toEqual({ from: '2026-01-01', to: '2026-12-31' });
    expect(presetRange('lastYear', d)).toEqual({ from: '2025-01-01', to: '2025-12-31' });
    expect(presetRange('lastMonth', new Date(2026, 0, 10))).toEqual({ from: '2025-12-01', to: '2025-12-31' }); // across New Year
    expect(toIsoDate(new Date(2026, 0, 5))).toBe('2026-01-05');
  });
});

describe('CSV', () => {
  it('quotes cells that need it and defuses spreadsheet formulas', () => {
    expect(csvCell('plain')).toBe('plain');
    expect(csvCell('a, b')).toBe('"a, b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell('two\nlines')).toBe('"two\nlines"');
    expect(csvCell(3)).toBe('3');
    expect(csvCell(null)).toBe('');
    for (const evil of ['=1+1', '+1', '-1', '@SUM(A1)', '=HYPERLINK("http://x","y")']) {
      expect(csvCell(evil).replace(/^"/, '').startsWith("'"), evil).toBe(true);
    }
    expect(csvCell('யோவான்')).toBe('யோவான்');
  });

  const report: CcliReport = {
    from: '2026-03-01', to: '2026-03-31', licenceNumber: '998877', songsWithoutNumber: 1,
    rows: [
      { songId: 'a', songTitle: 'Amazing Grace', ccliNumber: '22025', author: 'John Newton', copyright: null, timesUsed: 2, dates: ['2026-03-01', '2026-03-08'] },
      { songId: 'b', songTitle: '=Bad, "title"', ccliNumber: null, author: null, copyright: null, timesUsed: 1, dates: ['2026-03-08'] },
    ],
  };

  it('writes the licence, the range and one line per song', () => {
    const lines = reportToCsv(report).split('\r\n');
    expect(lines[0]).toBe('CCLI licence number,998877');
    expect(lines[1]).toBe('From,2026-03-01');
    expect(lines[2]).toBe('To,2026-03-31');
    expect(lines[4]).toBe('Song title,CCLI song number,Author,Copyright,Times used,Dates used');
    expect(lines[5]).toBe('Amazing Grace,22025,John Newton,,2,2026-03-01; 2026-03-08');
    expect(lines[6]).toBe('"\'=Bad, ""title""",,,,1,2026-03-08');
    expect(reportToCsv(report).endsWith('\r\n')).toBe(true);
    expect(reportFileName(report)).toBe('ccli-report-2026-03-01-to-2026-03-31.csv');
  });
});

/** A service with two real songs from the store, and the slides of each. */
async function serviceWithSongs() {
  const songs = (await api.listSongs()).filter((s) => (s.sectionsCount ?? 0) > 0).slice(0, 2);
  expect(songs.length).toBe(2);
  const svc = await api.createService({ title: 'Test Sunday' });
  const items: PlaylistItem[] = [];
  for (const s of songs) items.push(await api.addSongToService(svc.id, s.id));
  const slides = await Promise.all(items.map((i) => api.getServiceItemSlides(i.id)));
  return { svc, songs, items, slides };
}

describe('usage log (browser store)', () => {
  it('counts a song when its item goes live, once, and not for every slide', async () => {
    const { svc, items, slides } = await serviceWithSongs();
    expect(await api.listSongUsage(yearRange().from, yearRange().to)).toHaveLength(0);

    await api.setLiveServiceItemSlide(svc.id, items[0].id, slides[0][0].id);
    await api.setLiveServiceItemSlide(svc.id, items[0].id, slides[0][slides[0].length - 1].id);
    await api.setLiveServiceItemSlide(svc.id, items[0].id, slides[0][0].id);
    expect(await api.listSongUsage(yearRange().from, yearRange().to)).toHaveLength(1);

    await api.setLiveServiceItemSlide(svc.id, items[1].id, slides[1][0].id);
    const report = await api.getCcliReport(yearRange().from, yearRange().to);
    expect(report.rows).toHaveLength(2);
    expect(report.rows.every((r) => r.timesUsed === 1 && r.dates[0] === today)).toBe(true);
    await api.deleteService(svc.id);
  });

  it('keeps the title it had at the time, and a range excludes other days', async () => {
    const { svc, songs, items, slides } = await serviceWithSongs();
    await api.setLiveServiceItemSlide(svc.id, items[0].id, slides[0][0].id);
    await api.updateSong({ ...songs[0], title: 'Renamed Later' });
    const report = await api.getCcliReport(today, today);
    expect(report.rows[0].songTitle).toBe(songs[0].title);
    expect((await api.getCcliReport('2000-01-01', '2000-01-31')).rows).toHaveLength(0);
    await api.updateSong(songs[0]);
    await api.deleteService(svc.id);
  });

  it('flags songs with no CCLI number, and a removed use is gone', async () => {
    const { svc, songs, items, slides } = await serviceWithSongs();
    await api.updateSong({ ...songs[0], ccliNumber: '' });
    await api.setLiveServiceItemSlide(svc.id, items[0].id, slides[0][0].id);
    const report = await api.getCcliReport(today, today);
    expect(report.songsWithoutNumber).toBe(1);
    const use = (await api.listSongUsage(today, today))[0];
    await api.deleteSongUsage(use.id);
    expect((await api.getCcliReport(today, today)).rows).toHaveLength(0);
    await api.updateSong(songs[0]);
    await api.deleteService(svc.id);
  });

  it('refuses a bad range', async () => {
    await expect(api.getCcliReport('2026-02-01', '2026-01-01')).rejects.toThrow(/after/);
    await expect(api.listSongUsage('nope', '2026-01-01')).rejects.toThrow(/YYYY-MM-DD/);
  });
});

describe('CcliReportModal', () => {
  it('shows what was used this month with the licence, and warns about gaps', async () => {
    const { svc, songs, items, slides } = await serviceWithSongs();
    await api.updateSong({ ...songs[1], ccliNumber: '' });
    await api.setLiveServiceItemSlide(svc.id, items[0].id, slides[0][0].id);
    await api.setLiveServiceItemSlide(svc.id, items[1].id, slides[1][0].id);

    render(<CcliReportModal isOpen onClose={vi.fn()} />);
    expect((await screen.findByTestId('ccli-summary')).textContent).toMatch(/2 songs, 2 uses/);
    expect(screen.getAllByTestId('ccli-row')).toHaveLength(2);
    expect(screen.getByTestId('ccli-no-licence')).toBeTruthy();
    expect(screen.getByTestId('ccli-missing-numbers').textContent).toMatch(/1 song has no CCLI song number/);

    await api.setCcliLicenceNumber('998877');
    fireEvent.click(screen.getByTestId('ccli-preset-thisYear')); // loads again
    await waitFor(() => expect(screen.getByTestId('ccli-summary').textContent).toMatch(/Licence 998877/));
    expect(screen.queryByTestId('ccli-no-licence')).toBeNull();
    await api.updateSong(songs[1]);
    await api.deleteService(svc.id);
  });

  it('says so when nothing was used, and explains a bad range', async () => {
    render(<CcliReportModal isOpen onClose={vi.fn()} />);
    fireEvent.change(await screen.findByTestId('ccli-from'), { target: { value: '2000-01-01' } });
    fireEvent.change(screen.getByTestId('ccli-to'), { target: { value: '2000-01-31' } });
    expect(await screen.findByTestId('ccli-empty')).toBeTruthy();
    expect((screen.getByTestId('ccli-download') as HTMLButtonElement).disabled).toBe(true);

    fireEvent.change(screen.getByTestId('ccli-to'), { target: { value: '1999-01-01' } });
    expect((await screen.findByTestId('ccli-error')).textContent).toMatch(/after/);
  });

  it('downloads the report as a CSV file', async () => {
    const { svc, items, slides } = await serviceWithSongs();
    await api.setLiveServiceItemSlide(svc.id, items[0].id, slides[0][0].id);
    const created: Blob[] = [];
    // jsdom has no object URLs, so put stand-ins in place for this test
    const realCreate = (URL as any).createObjectURL;
    const realRevoke = (URL as any).revokeObjectURL;
    (URL as any).createObjectURL = (b: Blob) => (created.push(b), 'blob:x');
    (URL as any).revokeObjectURL = () => {};
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    render(<CcliReportModal isOpen onClose={vi.fn()} />);
    await screen.findAllByTestId('ccli-row');
    fireEvent.click(screen.getByTestId('ccli-download'));
    expect(click).toHaveBeenCalled();
    expect(created).toHaveLength(1);
    const bytes = await new Promise<Uint8Array>((res) => {
      const r = new FileReader();
      r.onload = () => res(new Uint8Array(r.result as ArrayBuffer));
      r.readAsArrayBuffer(created[0]);
    });
    // starts with the UTF-8 byte-order mark so spreadsheets read non-English titles correctly
    expect(Array.from(bytes.slice(0, 3))).toEqual([0xef, 0xbb, 0xbf]);
    const text = new TextDecoder().decode(bytes.slice(3));
    expect(text.startsWith('CCLI licence number,')).toBe(true);
    expect(text).toContain('Song title,CCLI song number');
    (URL as any).createObjectURL = realCreate;
    (URL as any).revokeObjectURL = realRevoke;
    click.mockRestore();
    await api.deleteService(svc.id);
  });
});

describe('CcliSettingsCard', () => {
  it('saves a valid number and refuses a bad one', async () => {
    render(<CcliSettingsCard />);
    const input = screen.getByTestId('ccli-licence-input') as HTMLInputElement;
    const save = screen.getByTestId('ccli-licence-save') as HTMLButtonElement;
    expect(save.disabled).toBe(true); // nothing changed yet

    fireEvent.change(input, { target: { value: '12ab' } });
    expect(save.disabled).toBe(true);
    expect(screen.getByTestId('ccli-licence-error').textContent).toMatch(/digits only/);

    fireEvent.change(input, { target: { value: '998877' } });
    expect(save.disabled).toBe(false);
    fireEvent.click(save);
    await waitFor(() => expect(screen.getByTestId('ccli-licence-message').textContent).toMatch(/saved/));
    expect(await api.getCcliLicenceNumber()).toBe('998877');
    expect(save.disabled).toBe(true);

    fireEvent.change(input, { target: { value: '' } });
    fireEvent.click(save);
    await waitFor(() => expect(screen.getByTestId('ccli-licence-message').textContent).toMatch(/removed/));
    expect(await api.getCcliLicenceNumber()).toBeNull();
  });

  it('shows the number that is already saved', async () => {
    await api.setCcliLicenceNumber('445566');
    render(<CcliSettingsCard />);
    await waitFor(() => expect((screen.getByTestId('ccli-licence-input') as HTMLInputElement).value).toBe('445566'));
  });
});
