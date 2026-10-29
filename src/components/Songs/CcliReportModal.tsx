import React, { useCallback, useEffect, useState } from 'react';
import { FileText, X, Download } from 'lucide-react';
import { api } from '../../services/api';
import { CcliReport } from '../../types';
import { RANGE_PRESETS, RangePreset, presetRange, reportFileName, reportToCsv, validateReportRange } from '../../services/ccliReport';

interface CcliReportModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const inputStyle: React.CSSProperties = {
  padding: '6px 8px',
  borderRadius: '6px',
  border: '1px solid #334155',
  backgroundColor: '#0f172a',
  color: '#f8fafc',
  fontSize: '12px',
};

const thStyle: React.CSSProperties = { textAlign: 'left', padding: '8px 10px', fontSize: '11px', color: '#94a3b8', borderBottom: '1px solid #1e293b' };
const tdStyle: React.CSSProperties = { padding: '8px 10px', fontSize: '12px', color: '#e2e8f0', borderBottom: '1px solid #111c33', verticalAlign: 'top' };

/** Which songs were used between two dates, for the church's CCLI report. */
export const CcliReportModal: React.FC<CcliReportModalProps> = ({ isOpen, onClose }) => {
  const [range, setRange] = useState(() => presetRange('thisMonth'));
  const [report, setReport] = useState<CcliReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (from: string, to: string) => {
    const problem = validateReportRange(from, to);
    if (problem) {
      setReport(null);
      setError(problem);
      return;
    }
    try {
      setReport(await api.getCcliReport(from, to));
      setError(null);
    } catch (err: any) {
      setReport(null);
      setError(typeof err === 'string' ? err : err?.message || 'Could not make the report.');
    }
  }, []);

  useEffect(() => {
    if (isOpen) void load(range.from, range.to);
  }, [isOpen, range, load]);

  if (!isOpen) return null;

  const totalUses = report?.rows.reduce((n, r) => n + r.timesUsed, 0) ?? 0;

  const download = () => {
    if (!report) return;
    // a leading byte-order mark makes spreadsheets read non-English titles (Tamil, for example) correctly
    const blob = new Blob(['﻿' + reportToCsv(report)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = reportFileName(report);
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0, 0, 0, 0.75)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}>
      <div
        data-testid="ccli-report-modal"
        style={{ width: '820px', maxWidth: '95vw', maxHeight: '90vh', backgroundColor: '#090d16', borderRadius: '12px', border: '1px solid #1e293b', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
      >
        <div style={{ padding: '14px 20px', backgroundColor: '#0f172a', borderBottom: '1px solid #1e293b', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <FileText size={20} color="#38bdf8" />
            <span style={{ fontSize: '16px', fontWeight: 700, color: '#f8fafc' }}>CCLI report</span>
          </div>
          <button type="button" aria-label="Close" onClick={onClose} style={{ color: '#94a3b8', background: 'transparent', border: 'none', cursor: 'pointer' }}>
            <X size={18} />
          </button>
        </div>

        <div style={{ padding: '14px 20px', display: 'flex', flexDirection: 'column', gap: '12px', overflowY: 'auto' }}>
          <div style={{ fontSize: '12px', color: '#94a3b8' }}>
            A song is counted once for each service and day, the first time it goes live from a service.
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
            {RANGE_PRESETS.map((p) => (
              <button key={p.id} type="button" data-testid={`ccli-preset-${p.id}`} onClick={() => setRange(presetRange(p.id as RangePreset))} style={{ ...inputStyle, cursor: 'pointer', fontWeight: 600 }}>
                {p.label}
              </button>
            ))}
            <label style={{ fontSize: '12px', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '4px' }}>
              From
              <input type="date" data-testid="ccli-from" value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} style={inputStyle} />
            </label>
            <label style={{ fontSize: '12px', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '4px' }}>
              To
              <input type="date" data-testid="ccli-to" value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} style={inputStyle} />
            </label>
          </div>

          {error && (
            <div role="alert" data-testid="ccli-error" style={{ fontSize: '12px', color: '#fca5a5' }}>
              {error}
            </div>
          )}

          {report && (
            <>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'center', justifyContent: 'space-between' }}>
                <div data-testid="ccli-summary" style={{ fontSize: '13px', color: '#f8fafc', fontWeight: 600 }}>
                  {report.rows.length} {report.rows.length === 1 ? 'song' : 'songs'}, {totalUses} {totalUses === 1 ? 'use' : 'uses'}
                  <span style={{ fontWeight: 400, color: '#94a3b8' }}>
                    {' '}
                    · Licence {report.licenceNumber ? report.licenceNumber : 'not set'}
                  </span>
                </div>
                <button
                  type="button"
                  data-testid="ccli-download"
                  disabled={report.rows.length === 0}
                  onClick={download}
                  style={{ ...inputStyle, display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600, cursor: report.rows.length === 0 ? 'default' : 'pointer', opacity: report.rows.length === 0 ? 0.5 : 1 }}
                >
                  <Download size={14} /> Download CSV
                </button>
              </div>

              {!report.licenceNumber && (
                <div data-testid="ccli-no-licence" style={{ fontSize: '12px', color: '#fbbf24' }}>
                  No CCLI licence number is saved. Add it in Settings, General, so it is included in the download.
                </div>
              )}
              {report.songsWithoutNumber > 0 && (
                <div data-testid="ccli-missing-numbers" style={{ fontSize: '12px', color: '#fbbf24' }}>
                  {report.songsWithoutNumber} {report.songsWithoutNumber === 1 ? 'song has' : 'songs have'} no CCLI song number. Add it in the song's info so it can be reported.
                </div>
              )}

              {report.rows.length === 0 ? (
                <div data-testid="ccli-empty" style={{ fontSize: '12px', color: '#64748b' }}>
                  No songs were used in this range.
                </div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th style={thStyle}>Song</th>
                      <th style={thStyle}>CCLI no.</th>
                      <th style={thStyle}>Used</th>
                      <th style={thStyle}>Dates</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.rows.map((r) => (
                      <tr key={r.songId} data-testid="ccli-row">
                        <td style={tdStyle}>
                          <div style={{ fontWeight: 600 }}>{r.songTitle}</div>
                          {(r.author || r.copyright) && <div style={{ fontSize: '11px', color: '#64748b' }}>{[r.author, r.copyright].filter(Boolean).join(' · ')}</div>}
                        </td>
                        <td style={{ ...tdStyle, color: r.ccliNumber ? '#e2e8f0' : '#fbbf24' }}>{r.ccliNumber || 'missing'}</td>
                        <td style={tdStyle}>{r.timesUsed}</td>
                        <td style={{ ...tdStyle, color: '#94a3b8' }}>{r.dates.join(', ')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
