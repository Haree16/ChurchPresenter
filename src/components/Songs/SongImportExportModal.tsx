import React, { useState, useEffect } from 'react';
import {
  X,
  Download,
  Upload,
  FileJson,
  CheckCircle,
  AlertTriangle,
} from 'lucide-react';
import {
  Song,
  SongSection,
  SongExportData,
  SongImportOptions,
  SongImportResult,
} from '../../types';
import { api } from '../../services/api';

export function parseOpenSongOrOpenLyrics(xml: string): SongExportData | null {
  const trimmed = xml.trim();
  if (!trimmed.startsWith('<')) return null;

  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(trimmed, 'text/xml');

    // Check OpenLyrics
    if (doc.querySelector('song[xmlns*="openlyrics"]') || doc.querySelector('lyrics verse')) {
      const title = doc.querySelector('title')?.textContent?.trim() || 'Untitled Song';
      const author = doc.querySelector('author')?.textContent?.trim() || '';
      const ccli = doc.querySelector('ccliNo')?.textContent?.trim() || '';
      const key = doc.querySelector('key')?.textContent?.trim() || '';

      const sections: SongSection[] = [];
      const verses = doc.querySelectorAll('verse');
      verses.forEach((v, idx) => {
        const name = v.getAttribute('name') || `Verse ${idx + 1}`;
        const lines = Array.from(v.querySelectorAll('lines'))
          .map((l) => l.textContent || '')
          .join('\n');
        sections.push({
          id: `sec-${idx + 1}`,
          songId: '',
          sectionType: name.toLowerCase().startsWith('c')
            ? 'chorus'
            : name.toLowerCase().startsWith('b')
            ? 'bridge'
            : 'verse',
          label: name,
          sortOrder: idx,
          lyrics: lines.trim(),
        });
      });

      return {
        version: '1.0.0',
        exportedAt: new Date().toISOString(),
        app: 'OpenLyrics Import',
        themes: [],
        songs: [
          {
            song: {
              id: '',
              title,
              author,
              ccliNumber: ccli,
              songKey: key || null,
              tags: [],
              language: /[\u0B80-\u0BFF]/.test(title) ? 'Tamil' : 'English',
              category: 'Praise & Worship',
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            },
            sections,
          },
        ],
      };
    }

    // Check OpenSong
    const titleEl = doc.querySelector('title');
    const lyricsEl = doc.querySelector('lyrics');
    if (titleEl || lyricsEl) {
      const title = titleEl?.textContent?.trim() || 'Untitled Song';
      const author = doc.querySelector('author')?.textContent?.trim() || '';
      const key = doc.querySelector('key')?.textContent?.trim() || '';
      const ccli = doc.querySelector('ccli')?.textContent?.trim() || '';
      const rawLyrics = lyricsEl?.textContent || '';

      const sections: SongSection[] = [];
      const blocks = rawLyrics.split(/\n(?=\[[A-Za-z0-9]+\])/);
      blocks.forEach((block, idx) => {
        const lines = block.split('\n');
        let label = `Section ${idx + 1}`;
        const cleanLines: string[] = [];

        for (const line of lines) {
          const trimmedLine = line.trim();
          if (trimmedLine.startsWith('[') && trimmedLine.endsWith(']')) {
            label = trimmedLine.slice(1, -1);
          } else if (trimmedLine.startsWith('.')) {
            continue;
          } else if (trimmedLine.startsWith(';')) {
            continue;
          } else {
            cleanLines.push(line.replace(/^[ 1-9]/, ''));
          }
        }

        const lyricsText = cleanLines.join('\n').trim();
        if (lyricsText) {
          sections.push({
            id: `sec-${idx + 1}`,
            songId: '',
            sectionType: label.toLowerCase().startsWith('c')
              ? 'chorus'
              : label.toLowerCase().startsWith('b')
              ? 'bridge'
              : 'verse',
            label,
            sortOrder: idx,
            lyrics: lyricsText,
          });
        }
      });

      return {
        version: '1.0.0',
        exportedAt: new Date().toISOString(),
        app: 'OpenSong Import',
        themes: [],
        songs: [
          {
            song: {
              id: '',
              title,
              author,
              ccliNumber: ccli,
              songKey: key || null,
              tags: [],
              language: /[\u0B80-\u0BFF]/.test(title) ? 'Tamil' : 'English',
              category: 'Praise & Worship',
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            },
            sections,
          },
        ],
      };
    }
  } catch {
    return null;
  }
  return null;
}

function escapeXml(unsafe: string): string {
  return (unsafe || '').replace(/[<>&'"]/g, (c) => {
    switch (c) {
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '&': return '&amp;';
      case '\'': return '&apos;';
      case '"': return '&quot;';
      default: return c;
    }
  });
}

export function exportSongToOpenLyrics(song: Song, sections: SongSection[]): string {
  const titles = `<titles><title>${escapeXml(song.title)}</title></titles>`;
  const authors = song.author ? `<authors><author>${escapeXml(song.author)}</author></authors>` : '';
  const ccli = song.ccliNumber ? `<ccliNo>${escapeXml(song.ccliNumber)}</ccliNo>` : '';
  const key = song.songKey ? `<key>${escapeXml(song.songKey)}</key>` : '';

  const versesXml = sections
    .map((sec, idx) => {
      const prefix = sec.sectionType === 'chorus' ? 'c' : sec.sectionType === 'bridge' ? 'b' : 'v';
      const verseName = `${prefix}${idx + 1}`;
      const lines = sec.lyrics
        .split('\n')
        .map((line) => escapeXml(line))
        .join('<br/>');
      return `    <verse name="${verseName}">\n      <lines>${lines}</lines>\n    </verse>`;
    })
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<song xmlns="http://openlyrics.info/namespace/2009/song" version="0.9" createdIn="Church Presenter" modifiedDate="${new Date().toISOString()}">
  <properties>
    ${titles}
    ${authors}
    ${ccli}
    ${key}
  </properties>
  <lyrics>
${versesXml}
  </lyrics>
</song>`;
}

export function exportAllSongsToOpenLyrics(data: SongExportData): string {
  if (data.songs.length === 1) {
    return exportSongToOpenLyrics(data.songs[0].song, data.songs[0].sections);
  }
  const songDocs = data.songs
    .map((item) => exportSongToOpenLyrics(item.song, item.sections))
    .join('\n\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<songs xmlns="http://openlyrics.info/namespace/2009/song">\n${songDocs}\n</songs>`;
}

interface SongImportExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentSong: Song | null;
  onImportComplete: () => void;
}

export const SongImportExportModal: React.FC<SongImportExportModalProps> = ({
  isOpen,
  onClose,
  currentSong,
  onImportComplete,
}) => {
  const [activeTab, setActiveTab] = useState<'export' | 'import'>('export');
  const [exportScope, setExportScope] = useState<'current' | 'all'>('all');
  const [exportFormat, setExportFormat] = useState<'json' | 'openlyrics'>('json');
  const [exportJson, setExportJson] = useState<string>('');
  const [isExporting, setIsExporting] = useState(false);

  // Import states
  const [importJsonText, setImportJsonText] = useState<string>('');
  const [duplicateMode, setDuplicateMode] =
    useState<'skip' | 'copy' | 'update'>('skip');
  const [isImporting, setIsImporting] = useState(false);
  const [importResult, setImportResult] = useState<SongImportResult | null>(
    null
  );
  const [parseError, setParseError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setImportResult(null);
      setParseError(null);
      if (currentSong) {
        setExportScope('current');
      } else {
        setExportScope('all');
      }
    }
  }, [isOpen, currentSong]);

  // Handle Export
  const handleGenerateExport = async () => {
    setIsExporting(true);
    try {
      let data: SongExportData;
      if (exportScope === 'current' && currentSong) {
        data = await api.exportSong(currentSong.id);
      } else {
        data = await api.exportAllSongs();
      }

      if (exportFormat === 'openlyrics') {
        const xml = exportAllSongsToOpenLyrics(data);
        setExportJson(xml);
      } else {
        setExportJson(JSON.stringify(data, null, 2));
      }
    } catch (err: any) {
      alert(err?.message || 'Failed to export songs');
    } finally {
      setIsExporting(false);
    }
  };

  const handleDownloadExport = () => {
    if (!exportJson) return;
    const isXml = exportFormat === 'openlyrics';
    const mime = isXml ? 'application/xml' : 'application/json';
    const ext = isXml ? 'xml' : 'json';
    const blob = new Blob([exportJson], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const filename =
      exportScope === 'current' && currentSong
        ? `song-${currentSong.title.replace(/[^a-zA-Z0-9\u0B80-\u0BFF]/g, '_')}.${ext}`
        : `church-presenter-songs-library.${ext}`;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Handle Import
  const handleExecuteImport = async () => {
    setParseError(null);
    setImportResult(null);

    let parsed: SongExportData | null = null;
    const trimmed = importJsonText.trim();

    // Check if XML format (OpenLyrics or OpenSong)
    if (trimmed.startsWith('<')) {
      parsed = parseOpenSongOrOpenLyrics(trimmed);
      if (!parsed) {
        setParseError('Failed to parse OpenLyrics or OpenSong XML format.');
        return;
      }
    } else {
      try {
        parsed = JSON.parse(importJsonText);
      } catch (e: any) {
        setParseError(`JSON syntax error: ${e.message}`);
        return;
      }
    }

    if (!parsed || !Array.isArray(parsed.songs)) {
      setParseError(
        'Invalid song interchange format: missing required "songs" array.'
      );
      return;
    }

    setIsImporting(true);
    try {
      const options: SongImportOptions = {
        duplicateMode,
      };
      const result = await api.importSongs(parsed, options);
      setImportResult(result);
      onImportComplete();
    } catch (err: any) {
      setParseError(err?.message || 'Failed to import songs');
    } finally {
      setIsImporting(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      setImportJsonText(content);
      setParseError(null);
    };
    reader.readAsText(file);
  };

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.75)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: '20px',
      }}
    >
      <div
        style={{
          width: '760px',
          maxWidth: '95vw',
          maxHeight: '90vh',
          backgroundColor: '#090d16',
          borderRadius: '12px',
          border: '1px solid #1e293b',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.6)',
          overflow: 'hidden',
        }}
      >
        {/* Header with Tabs */}
        <div
          style={{
            padding: '16px 20px',
            backgroundColor: '#0f172a',
            borderBottom: '1px solid #1e293b',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <FileJson size={20} color="#38bdf8" />
              <span
                style={{ fontSize: '16px', fontWeight: 700, color: '#f8fafc' }}
              >
                Song Library Interchange
              </span>
            </div>

            <div
              style={{
                display: 'flex',
                backgroundColor: '#1e293b',
                borderRadius: '6px',
                padding: '2px',
              }}
            >
              <button
                type="button"
                onClick={() => setActiveTab('export')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '5px 12px',
                  borderRadius: '4px',
                  fontSize: '12px',
                  fontWeight: 600,
                  backgroundColor:
                    activeTab === 'export' ? '#3b82f6' : 'transparent',
                  color: activeTab === 'export' ? '#ffffff' : '#94a3b8',
                }}
              >
                <Download size={13} /> Export JSON
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('import')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '5px 12px',
                  borderRadius: '4px',
                  fontSize: '12px',
                  fontWeight: 600,
                  backgroundColor:
                    activeTab === 'import' ? '#3b82f6' : 'transparent',
                  color: activeTab === 'import' ? '#ffffff' : '#94a3b8',
                }}
              >
                <Upload size={13} /> Import JSON
              </button>
            </div>
          </div>

          <button
            onClick={onClose}
            style={{
              padding: '6px',
              borderRadius: '6px',
              color: '#94a3b8',
              backgroundColor: '#1e293b',
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Content Body */}
        <div style={{ padding: '20px', flex: 1, overflowY: 'auto' }}>
          {activeTab === 'export' ? (
            <div
              style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}
            >
              {/* Scope options */}
              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: '12px',
                    fontWeight: 600,
                    color: '#94a3b8',
                    marginBottom: '8px',
                  }}
                >
                  Export Scope
                </label>
                <div style={{ display: 'flex', gap: '16px' }}>
                  {currentSong && (
                    <label
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        fontSize: '13px',
                        color: '#cbd5e1',
                        cursor: 'pointer',
                      }}
                    >
                      <input
                        type="radio"
                        name="exportScope"
                        checked={exportScope === 'current'}
                        onChange={() => {
                          setExportScope('current');
                          setExportJson('');
                        }}
                        style={{ accentColor: '#3b82f6' }}
                      />
                      <span>
                        Current Song: <strong>{currentSong.title}</strong>
                      </span>
                    </label>
                  )}

                  <label
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      fontSize: '13px',
                      color: '#cbd5e1',
                      cursor: 'pointer',
                    }}
                  >
                    <input
                      type="radio"
                      name="exportScope"
                      checked={exportScope === 'all'}
                      onChange={() => {
                        setExportScope('all');
                        setExportJson('');
                      }}
                      style={{ accentColor: '#3b82f6' }}
                    />
                    <span>All Songs & Presentation Themes in Library</span>
                  </label>
                </div>
              </div>

              {/* Format selection */}
              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: '12px',
                    fontWeight: 600,
                    color: '#94a3b8',
                    textTransform: 'uppercase',
                    marginBottom: '8px',
                  }}
                >
                  Export Format
                </label>
                <div style={{ display: 'flex', gap: '16px' }}>
                  <label
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      fontSize: '13px',
                      color: '#cbd5e1',
                      cursor: 'pointer',
                    }}
                  >
                    <input
                      type="radio"
                      name="exportFormat"
                      value="json"
                      checked={exportFormat === 'json'}
                      onChange={() => {
                        setExportFormat('json');
                        setExportJson('');
                      }}
                      style={{ accentColor: '#3b82f6' }}
                    />
                    <span>JSON (Church Presenter full library archive)</span>
                  </label>

                  <label
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      fontSize: '13px',
                      color: '#cbd5e1',
                      cursor: 'pointer',
                    }}
                  >
                    <input
                      type="radio"
                      name="exportFormat"
                      value="openlyrics"
                      checked={exportFormat === 'openlyrics'}
                      onChange={() => {
                        setExportFormat('openlyrics');
                        setExportJson('');
                      }}
                      style={{ accentColor: '#3b82f6' }}
                    />
                    <span>OpenLyrics XML (Universal interchange standard)</span>
                  </label>
                </div>
              </div>

              {/* Action */}
              {!exportJson ? (
                <button
                  type="button"
                  disabled={isExporting}
                  onClick={handleGenerateExport}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    padding: '10px 16px',
                    borderRadius: '6px',
                    backgroundColor: '#2563eb',
                    color: '#ffffff',
                    fontSize: '13px',
                    fontWeight: 600,
                  }}
                >
                  <Download size={15} />
                  {isExporting
                    ? 'Generating...'
                    : exportFormat === 'openlyrics'
                    ? 'Generate OpenLyrics XML'
                    : 'Generate Export JSON'}
                </button>
              ) : (
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '10px',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}
                  >
                    <span
                      style={{
                        fontSize: '12px',
                        fontWeight: 600,
                        color: '#34d399',
                      }}
                    >
                      Export ready for download:
                    </span>
                    <button
                      type="button"
                      onClick={handleDownloadExport}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '6px 14px',
                        borderRadius: '6px',
                        backgroundColor: '#10b981',
                        color: '#ffffff',
                        fontSize: '12px',
                        fontWeight: 700,
                      }}
                    >
                      <Download size={14} /> Download File (.{exportFormat === 'openlyrics' ? 'xml' : 'json'})
                    </button>
                  </div>

                  <textarea
                    readOnly
                    value={exportJson}
                    rows={12}
                    style={{
                      width: '100%',
                      backgroundColor: '#0f172a',
                      border: '1px solid #1e293b',
                      borderRadius: '6px',
                      color: '#94a3b8',
                      fontFamily: 'monospace',
                      fontSize: '11px',
                      padding: '10px',
                      resize: 'none',
                    }}
                  />
                </div>
              )}
            </div>
          ) : (
            /* Import Tab */
            <div
              style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}
            >
              {/* Duplicate Resolution Strategy */}
              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: '12px',
                    fontWeight: 600,
                    color: '#94a3b8',
                    marginBottom: '8px',
                  }}
                >
                  Duplicate Conflict Strategy (if a song already exists in
                  library):
                </label>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(3, 1fr)',
                    gap: '10px',
                  }}
                >
                  <label
                    style={{
                      padding: '10px',
                      borderRadius: '6px',
                      backgroundColor:
                        duplicateMode === 'skip' ? '#1e293b' : '#0f172a',
                      border: `1px solid ${
                        duplicateMode === 'skip' ? '#3b82f6' : '#1e293b'
                      }`,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: '8px',
                    }}
                  >
                    <input
                      type="radio"
                      name="duplicateMode"
                      checked={duplicateMode === 'skip'}
                      onChange={() => setDuplicateMode('skip')}
                      style={{ accentColor: '#3b82f6', marginTop: '2px' }}
                    />
                    <div>
                      <div
                        style={{
                          fontSize: '12px',
                          fontWeight: 700,
                          color: '#f8fafc',
                        }}
                      >
                        Skip Existing
                      </div>
                      <div
                        style={{
                          fontSize: '10px',
                          color: '#64748b',
                          marginTop: '2px',
                        }}
                      >
                        Preserve local song unchanged
                      </div>
                    </div>
                  </label>

                  <label
                    style={{
                      padding: '10px',
                      borderRadius: '6px',
                      backgroundColor:
                        duplicateMode === 'copy' ? '#1e293b' : '#0f172a',
                      border: `1px solid ${
                        duplicateMode === 'copy' ? '#3b82f6' : '#1e293b'
                      }`,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: '8px',
                    }}
                  >
                    <input
                      type="radio"
                      name="duplicateMode"
                      checked={duplicateMode === 'copy'}
                      onChange={() => setDuplicateMode('copy')}
                      style={{ accentColor: '#3b82f6', marginTop: '2px' }}
                    />
                    <div>
                      <div
                        style={{
                          fontSize: '12px',
                          fontWeight: 700,
                          color: '#f8fafc',
                        }}
                      >
                        Create Copy
                      </div>
                      <div
                        style={{
                          fontSize: '10px',
                          color: '#64748b',
                          marginTop: '2px',
                        }}
                      >
                        Import with "(Copy)" suffix
                      </div>
                    </div>
                  </label>

                  <label
                    style={{
                      padding: '10px',
                      borderRadius: '6px',
                      backgroundColor:
                        duplicateMode === 'update' ? '#1e293b' : '#0f172a',
                      border: `1px solid ${
                        duplicateMode === 'update' ? '#3b82f6' : '#1e293b'
                      }`,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: '8px',
                    }}
                  >
                    <input
                      type="radio"
                      name="duplicateMode"
                      checked={duplicateMode === 'update'}
                      onChange={() => setDuplicateMode('update')}
                      style={{ accentColor: '#3b82f6', marginTop: '2px' }}
                    />
                    <div>
                      <div
                        style={{
                          fontSize: '12px',
                          fontWeight: 700,
                          color: '#f8fafc',
                        }}
                      >
                        Update / Overwrite
                      </div>
                      <div
                        style={{
                          fontSize: '10px',
                          color: '#64748b',
                          marginTop: '2px',
                        }}
                      >
                        Update existing song & lyrics
                      </div>
                    </div>
                  </label>
                </div>
              </div>

              {/* File Upload / Paste JSON */}
              <div>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: '8px',
                  }}
                >
                  <label
                    style={{
                      fontSize: '12px',
                      fontWeight: 600,
                      color: '#94a3b8',
                    }}
                  >
                    Paste Song JSON or Upload File
                  </label>
                  <label
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      padding: '3px 8px',
                      borderRadius: '4px',
                      backgroundColor: '#1e293b',
                      color: '#38bdf8',
                      fontSize: '11px',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    <Upload size={12} /> Choose JSON File
                    <input
                      type="file"
                      accept=".json"
                      onChange={handleFileUpload}
                      style={{ display: 'none' }}
                    />
                  </label>
                </div>

                <textarea
                  rows={8}
                  value={importJsonText}
                  onChange={(e) => setImportJsonText(e.target.value)}
                  placeholder='Paste JSON here, e.g. { "version": "1.0.0", "songs": [ ... ] }'
                  style={{
                    width: '100%',
                    backgroundColor: '#0f172a',
                    border: '1px solid #1e293b',
                    borderRadius: '6px',
                    color: '#f8fafc',
                    fontFamily: 'monospace',
                    fontSize: '11px',
                    padding: '10px',
                    resize: 'vertical',
                  }}
                />
              </div>

              {/* Error Banner */}
              {parseError && (
                <div
                  style={{
                    padding: '10px 12px',
                    backgroundColor: 'rgba(239, 68, 68, 0.15)',
                    border: '1px solid #ef4444',
                    borderRadius: '6px',
                    color: '#f87171',
                    fontSize: '12px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                  }}
                >
                  <AlertTriangle size={16} />
                  <span>{parseError}</span>
                </div>
              )}

              {/* Result Banner */}
              {importResult && (
                <div
                  style={{
                    padding: '12px 14px',
                    backgroundColor: 'rgba(16, 185, 129, 0.15)',
                    border: '1px solid #10b981',
                    borderRadius: '6px',
                    color: '#34d399',
                    fontSize: '12px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '4px',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      fontWeight: 700,
                    }}
                  >
                    <CheckCircle size={16} /> Import Completed Successfully
                  </div>
                  <div style={{ color: '#cbd5e1', fontSize: '11px' }}>
                    New Songs Imported: {importResult.importedCount} | Updated:{' '}
                    {importResult.updatedCount} | Skipped:{' '}
                    {importResult.skippedCount}
                  </div>
                  {importResult.errors.length > 0 && (
                    <div style={{ color: '#f87171', fontSize: '11px' }}>
                      Errors: {importResult.errors.join(', ')}
                    </div>
                  )}
                </div>
              )}

              {/* Execute Import Action Button */}
              <button
                type="button"
                disabled={isImporting || !importJsonText.trim()}
                onClick={handleExecuteImport}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  padding: '10px 16px',
                  borderRadius: '6px',
                  backgroundColor:
                    isImporting || !importJsonText.trim()
                      ? '#3b82f650'
                      : '#2563eb',
                  color: '#ffffff',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor:
                    isImporting || !importJsonText.trim()
                      ? 'not-allowed'
                      : 'pointer',
                }}
              >
                <Upload size={15} />
                {isImporting ? 'Processing Import...' : 'Import Songs into Library'}
              </button>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div
          style={{
            padding: '12px 20px',
            backgroundColor: '#0f172a',
            borderTop: '1px solid #1e293b',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
          }}
        >
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '8px 16px',
              borderRadius: '6px',
              backgroundColor: '#1e293b',
              color: '#cbd5e1',
              fontSize: '13px',
              fontWeight: 600,
            }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
