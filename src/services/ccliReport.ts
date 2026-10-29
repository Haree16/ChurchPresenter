import { CcliReport } from '../types';

export const MIN_LICENCE_DIGITS = 4;
export const MAX_LICENCE_DIGITS = 10;
export const MAX_REPORT_DAYS = 366 * 5;

/** Same rules as the desktop app: digits only, 4 to 10 of them; empty means none. Returns null when fine. */
export function validateLicenceNumber(raw: string): string | null {
  const n = raw.replace(/\s/g, '');
  if (!n) return null;
  if (!/^[0-9]+$/.test(n)) return 'A CCLI licence number contains digits only.';
  if (n.length < MIN_LICENCE_DIGITS || n.length > MAX_LICENCE_DIGITS) {
    return `A CCLI licence number has ${MIN_LICENCE_DIGITS} to ${MAX_LICENCE_DIGITS} digits.`;
  }
  return null;
}

const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;

/** `YYYY-MM-DD` as a real calendar date (no 2026-02-31), or null. */
export function parseIsoDate(s: string): Date | null {
  const m = ISO.exec(s.trim());
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d ? date : null;
}

export function validateReportRange(from: string, to: string): string | null {
  const f = parseIsoDate(from);
  const t = parseIsoDate(to);
  if (!f || !t) return 'Enter both dates as YYYY-MM-DD.';
  if (f > t) return 'The start date is after the end date.';
  if ((t.getTime() - f.getTime()) / 86_400_000 > MAX_REPORT_DAYS) return 'Choose a range of five years or less.';
  return null;
}

const pad = (n: number) => String(n).padStart(2, '0');
/** A local calendar date as `YYYY-MM-DD` (not UTC, so an evening service lands on the right day). */
export const toIsoDate = (d: Date): string => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export type RangePreset = 'thisMonth' | 'lastMonth' | 'last90' | 'thisYear' | 'lastYear';

export const RANGE_PRESETS: { id: RangePreset; label: string }[] = [
  { id: 'thisMonth', label: 'This month' },
  { id: 'lastMonth', label: 'Last month' },
  { id: 'last90', label: 'Last 90 days' },
  { id: 'thisYear', label: 'This year' },
  { id: 'lastYear', label: 'Last year' },
];

/** The dates for a preset, relative to `today`. */
export function presetRange(preset: RangePreset, today: Date = new Date()): { from: string; to: string } {
  const y = today.getFullYear();
  const m = today.getMonth();
  switch (preset) {
    case 'thisMonth':
      return { from: toIsoDate(new Date(y, m, 1)), to: toIsoDate(new Date(y, m + 1, 0)) };
    case 'lastMonth':
      return { from: toIsoDate(new Date(y, m - 1, 1)), to: toIsoDate(new Date(y, m, 0)) };
    case 'last90': {
      const start = new Date(y, m, today.getDate() - 89);
      return { from: toIsoDate(start), to: toIsoDate(today) };
    }
    case 'thisYear':
      return { from: `${y}-01-01`, to: `${y}-12-31` };
    case 'lastYear':
      return { from: `${y - 1}-01-01`, to: `${y - 1}-12-31` };
  }
}

/**
 * One CSV cell. Quotes anything with a comma, quote or line break, and defuses cells a spreadsheet would
 * read as a formula (a title such as `=HYPERLINK(...)` typed into a song).
 */
export function csvCell(value: string | number | null | undefined): string {
  let s = value == null ? '' : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export const CSV_HEADER = ['Song title', 'CCLI song number', 'Author', 'Copyright', 'Times used', 'Dates used'];

/** The report as CSV: one line per song, with the licence number and date range as the first rows. */
export function reportToCsv(report: CcliReport): string {
  const lines: string[] = [];
  lines.push(['CCLI licence number', report.licenceNumber ?? ''].map(csvCell).join(','));
  lines.push(['From', report.from].map(csvCell).join(','));
  lines.push(['To', report.to].map(csvCell).join(','));
  lines.push('');
  lines.push(CSV_HEADER.map(csvCell).join(','));
  for (const r of report.rows) {
    lines.push([r.songTitle, r.ccliNumber ?? '', r.author ?? '', r.copyright ?? '', r.timesUsed, r.dates.join('; ')].map(csvCell).join(','));
  }
  return lines.join('\r\n') + '\r\n';
}

export function reportFileName(report: Pick<CcliReport, 'from' | 'to'>): string {
  return `ccli-report-${report.from}-to-${report.to}.csv`;
}
