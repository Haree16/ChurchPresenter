import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  Layers,
  Palette,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  PlusCircle,
  FileCheck,
} from 'lucide-react';
import {
  Song,
  SongSection,
  SongArrangement,
  Theme,
  Presentation,
  SlideGenerationOptions,
} from '../../types';
import { api } from '../../services/api';

interface SlideGeneratorModalProps {
  isOpen: boolean;
  onClose: () => void;
  song: Song | null;
  sections: SongSection[];
  presentations: Presentation[];
  currentPresentationId: string | null;
  onSlidesGenerated: (presentationId: string) => void;
}

export const SlideGeneratorModal: React.FC<SlideGeneratorModalProps> = ({
  isOpen,
  onClose,
  song,
  sections,
  presentations,
  currentPresentationId,
  onSlidesGenerated,
}) => {
  const [themes, setThemes] = useState<Theme[]>([]);
  const [selectedThemeId, setSelectedThemeId] = useState<string>('theme-default-dark');
  const [selectedSectionIds, setSelectedSectionIds] = useState<string[]>([]);
  const [arrangements, setArrangements] = useState<SongArrangement[]>([]);
  const [arrangementId, setArrangementId] = useState<string>('');
  const [splitMode, setSplitMode] = useState<'stanzas' | 'lines' | 'delimiter'>('stanzas');
  const [linesPerSlide, setLinesPerSlide] = useState<number>(2);
  const [customDelimiter, setCustomDelimiter] = useState<string>('---');
  const [targetMode, setTargetMode] = useState<'current' | 'new'>(
    currentPresentationId ? 'current' : 'new'
  );
  const [targetPresentationId, setTargetPresentationId] = useState<string>(
    currentPresentationId || (presentations[0]?.id ?? '')
  );
  const [newPresentationTitle, setNewPresentationTitle] = useState<string>('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [previewSlideIndex, setPreviewSlideIndex] = useState(0);

  // Load themes on mount
  useEffect(() => {
    if (isOpen) {
      api.listThemes().then((thms) => {
        setThemes(thms);
        if (song?.defaultThemeId) {
          setSelectedThemeId(song.defaultThemeId);
        } else if (thms.length > 0 && !selectedThemeId) {
          setSelectedThemeId(thms[0].id);
        }
      });
      // Preselect the song's default arrangement, or every section in order
      if (sections.length > 0) {
        setSelectedSectionIds(sections.map((s) => s.id));
      }
      setArrangements([]);
      setArrangementId('');
      if (song) {
        api.getSongArrangements(song.id).then((list) => {
          setArrangements(list);
          const def = list.find((a) => a.isDefault);
          if (def) {
            setArrangementId(def.id);
            setSelectedSectionIds(def.sectionIds);
          }
        });
      }
      if (song) {
        setNewPresentationTitle(song.title);
      }
      if (currentPresentationId) {
        setTargetMode('current');
        setTargetPresentationId(currentPresentationId);
      } else {
        setTargetMode('new');
      }
      setPreviewSlideIndex(0);
    }
  }, [isOpen, song, sections, currentPresentationId]);

  // Selected Theme object
  const activeTheme = useMemo(() => {
    return themes.find((t) => t.id === selectedThemeId) || themes[0] || null;
  }, [themes, selectedThemeId]);

  // Client-side preview calculation of slides
  const previewSlides = useMemo(() => {
    if (!song || selectedSectionIds.length === 0) return [];
    // follow the selection order so arrangements (with repeated sections) preview correctly
    const orderedSections = selectedSectionIds
      .map((id) => sections.find((s) => s.id === id))
      .filter((s): s is SongSection => !!s);

    const generated: { title: string; body: string }[] = [];

    for (const section of orderedSections) {
      const text = section.lyrics.trim();
      if (!text) continue;

      let blocks: string[] = [];

      if (splitMode === 'delimiter' && customDelimiter) {
        blocks = text
          .split(customDelimiter)
          .map((b) => b.trim())
          .filter((b) => b.length > 0);
      } else if (splitMode === 'lines') {
        const lines = text
          .split('\n')
          .map((l) => l.trim())
          .filter((l) => l.length > 0);
        for (let i = 0; i < lines.length; i += linesPerSlide) {
          blocks.push(lines.slice(i, i + linesPerSlide).join('\n'));
        }
      } else {
        // Default: Stanzas by blank lines
        blocks = text
          .split(/\n\s*\n/)
          .map((b) => b.trim())
          .filter((b) => b.length > 0);
      }

      if (blocks.length === 0) {
        blocks = [text];
      }

      blocks.forEach((body, idx) => {
        generated.push({
          title:
            blocks.length > 1
              ? `${section.label} (${idx + 1}/${blocks.length})`
              : section.label,
          body,
        });
      });
    }

    return generated;
  }, [song, sections, selectedSectionIds, splitMode, linesPerSlide, customDelimiter]);

  const handleArrangementChange = (id: string) => {
    setArrangementId(id);
    const arr = arrangements.find((a) => a.id === id);
    setSelectedSectionIds(arr ? arr.sectionIds : sections.map((s) => s.id));
  };

  const handleToggleSection = (id: string) => {
    setArrangementId('');
    setSelectedSectionIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  const handleSelectAllSections = () => {
    setSelectedSectionIds(sections.map((s) => s.id));
  };

  const handleDeselectAllSections = () => {
    setSelectedSectionIds([]);
  };

  const handleGenerate = async () => {
    if (!song || selectedSectionIds.length === 0) return;
    setIsGenerating(true);

    try {
      const options: SlideGenerationOptions = {
        songId: song.id,
        sectionIds: selectedSectionIds,
        arrangementId: arrangementId || null,
        targetPresentationId:
          targetMode === 'current' ? targetPresentationId : null,
        themeId: selectedThemeId || null,
        linesPerSlide: splitMode === 'lines' ? linesPerSlide : null,
        customDelimiter: splitMode === 'delimiter' ? customDelimiter : null,
        createNewPresentation: targetMode === 'new',
        newPresentationTitle:
          targetMode === 'new' ? newPresentationTitle || song.title : null,
      };

      const result = await api.generateSlidesFromSong(options);
      onSlidesGenerated(result.presentationId);
      onClose();
    } catch (err) {
      console.error('Slide generation error:', err);
    } finally {
      setIsGenerating(false);
    }
  };

  if (!isOpen || !song) return null;

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
          width: '920px',
          maxWidth: '95vw',
          maxHeight: '92vh',
          backgroundColor: '#090d16',
          borderRadius: '12px',
          border: '1px solid #1e293b',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.6)',
          overflow: 'hidden',
        }}
      >
        {/* Modal Header */}
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
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                backgroundColor: 'rgba(59, 130, 246, 0.15)',
                color: '#60a5fa',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Sparkles size={18} />
            </div>
            <div>
              <div style={{ fontSize: '16px', fontWeight: 700, color: '#f8fafc' }}>
                Generate Presentation Slides
              </div>
              <div style={{ fontSize: '12px', color: '#94a3b8' }}>
                From: <span style={{ color: '#38bdf8', fontWeight: 600 }}>{song.title}</span>
                {song.alternateTitle && ` (${song.alternateTitle})`}
              </div>
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

        {/* Modal Body - 2 Columns */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '400px 1fr',
            flex: 1,
            overflowY: 'auto',
          }}
        >
          {/* Left Column: Generation Settings */}
          <div
            style={{
              padding: '20px',
              borderRight: '1px solid #1e293b',
              display: 'flex',
              flexDirection: 'column',
              gap: '20px',
              overflowY: 'auto',
            }}
          >
            {/* 1. Sections to Include */}
            <div>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: '8px',
                }}
              >
                <label style={{ fontSize: '13px', fontWeight: 700, color: '#e2e8f0' }}>
                  1. Sections to Include
                </label>
                <div style={{ display: 'flex', gap: '8px', fontSize: '11px' }}>
                  <button
                    type="button"
                    onClick={handleSelectAllSections}
                    style={{ color: '#38bdf8' }}
                  >
                    Select All
                  </button>
                  <span style={{ color: '#475569' }}>|</span>
                  <button
                    type="button"
                    onClick={handleDeselectAllSections}
                    style={{ color: '#94a3b8' }}
                  >
                    Clear
                  </button>
                </div>
              </div>

              {arrangements.length > 0 && (
                <select
                  data-testid="generator-arrangement-select"
                  value={arrangementId}
                  onChange={(e) => handleArrangementChange(e.target.value)}
                  style={{
                    width: '100%',
                    marginBottom: '6px',
                    padding: '6px 8px',
                    backgroundColor: '#1e293b',
                    border: '1px solid #334155',
                    borderRadius: '6px',
                    color: '#f8fafc',
                    fontSize: '12px',
                  }}
                >
                  <option value="">Custom selection (editor order)</option>
                  {arrangements.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}{a.isDefault ? ' (default)' : ''}
                    </option>
                  ))}
                </select>
              )}

              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px',
                  maxHeight: '140px',
                  overflowY: 'auto',
                  backgroundColor: '#0f172a',
                  padding: '8px',
                  borderRadius: '6px',
                  border: '1px solid #1e293b',
                }}
              >
                {sections.map((sec) => {
                  const isChecked = selectedSectionIds.includes(sec.id);
                  return (
                    <label
                      key={sec.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        padding: '6px 8px',
                        borderRadius: '4px',
                        backgroundColor: isChecked ? '#1e293b' : 'transparent',
                        cursor: 'pointer',
                        fontSize: '12px',
                        color: isChecked ? '#f8fafc' : '#94a3b8',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => handleToggleSection(sec.id)}
                        style={{ accentColor: '#3b82f6' }}
                      />
                      <span style={{ fontWeight: 600 }}>{sec.label}</span>
                      <span
                        style={{
                          fontSize: '10px',
                          color: '#64748b',
                          marginLeft: 'auto',
                        }}
                      >
                        {sec.lyrics.split('\n').filter((l) => l.trim()).length} lines
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>

            {/* 2. Slide Grouping & Splitting */}
            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: '13px',
                  fontWeight: 700,
                  color: '#e2e8f0',
                  marginBottom: '8px',
                }}
              >
                2. Splitting & Grouping Rules
              </label>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <label
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    fontSize: '12px',
                    color: '#cbd5e1',
                    cursor: 'pointer',
                  }}
                >
                  <input
                    type="radio"
                    name="splitMode"
                    checked={splitMode === 'stanzas'}
                    onChange={() => setSplitMode('stanzas')}
                    style={{ accentColor: '#3b82f6' }}
                  />
                  <span>By blank lines (Natural Stanzas - Recommended)</span>
                </label>

                <label
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    fontSize: '12px',
                    color: '#cbd5e1',
                    cursor: 'pointer',
                  }}
                >
                  <input
                    type="radio"
                    name="splitMode"
                    checked={splitMode === 'lines'}
                    onChange={() => setSplitMode('lines')}
                    style={{ accentColor: '#3b82f6' }}
                  />
                  <span>Fixed lines per slide:</span>
                  {splitMode === 'lines' && (
                    <select
                      value={linesPerSlide}
                      onChange={(e) => setLinesPerSlide(Number(e.target.value))}
                      style={{
                        backgroundColor: '#1e293b',
                        border: '1px solid #334155',
                        borderRadius: '4px',
                        color: '#f8fafc',
                        padding: '2px 8px',
                        fontSize: '11px',
                      }}
                    >
                      <option value={1}>1 line</option>
                      <option value={2}>2 lines</option>
                      <option value={3}>3 lines</option>
                      <option value={4}>4 lines</option>
                    </select>
                  )}
                </label>

                <label
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    fontSize: '12px',
                    color: '#cbd5e1',
                    cursor: 'pointer',
                  }}
                >
                  <input
                    type="radio"
                    name="splitMode"
                    checked={splitMode === 'delimiter'}
                    onChange={() => setSplitMode('delimiter')}
                    style={{ accentColor: '#3b82f6' }}
                  />
                  <span>Custom delimiter:</span>
                  {splitMode === 'delimiter' && (
                    <input
                      type="text"
                      value={customDelimiter}
                      onChange={(e) => setCustomDelimiter(e.target.value)}
                      placeholder="e.g. ---"
                      style={{
                        backgroundColor: '#1e293b',
                        border: '1px solid #334155',
                        borderRadius: '4px',
                        color: '#f8fafc',
                        padding: '2px 8px',
                        fontSize: '11px',
                        width: '70px',
                      }}
                    />
                  )}
                </label>
              </div>
            </div>

            {/* 3. Reusable Presentation Theme */}
            <div>
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  fontSize: '13px',
                  fontWeight: 700,
                  color: '#e2e8f0',
                  marginBottom: '8px',
                }}
              >
                <Palette size={14} color="#38bdf8" />
                3. Presentation Theme
              </label>

              <select
                value={selectedThemeId}
                onChange={(e) => setSelectedThemeId(e.target.value)}
                style={{
                  width: '100%',
                  backgroundColor: '#0f172a',
                  border: '1px solid #1e293b',
                  borderRadius: '6px',
                  color: '#f8fafc',
                  padding: '8px 10px',
                  fontSize: '13px',
                }}
              >
                {themes.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} {t.isBuiltIn ? '(Built-in)' : ''}
                  </option>
                ))}
              </select>
            </div>

            {/* 4. Target Presentation */}
            <div>
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  fontSize: '13px',
                  fontWeight: 700,
                  color: '#e2e8f0',
                  marginBottom: '8px',
                }}
              >
                <Layers size={14} color="#38bdf8" />
                4. Target Presentation
              </label>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <label
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    fontSize: '12px',
                    color: '#cbd5e1',
                    cursor: 'pointer',
                  }}
                >
                  <input
                    type="radio"
                    name="targetMode"
                    checked={targetMode === 'current'}
                    disabled={presentations.length === 0}
                    onChange={() => setTargetMode('current')}
                    style={{ accentColor: '#3b82f6' }}
                  />
                  <span>Append to existing service presentation:</span>
                </label>

                {targetMode === 'current' && presentations.length > 0 && (
                  <select
                    value={targetPresentationId}
                    onChange={(e) => setTargetPresentationId(e.target.value)}
                    style={{
                      backgroundColor: '#0f172a',
                      border: '1px solid #1e293b',
                      borderRadius: '6px',
                      color: '#f8fafc',
                      padding: '6px 8px',
                      fontSize: '12px',
                      marginLeft: '22px',
                    }}
                  >
                    {presentations.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.title} ({p.category})
                      </option>
                    ))}
                  </select>
                )}

                <label
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    fontSize: '12px',
                    color: '#cbd5e1',
                    cursor: 'pointer',
                  }}
                >
                  <input
                    type="radio"
                    name="targetMode"
                    checked={targetMode === 'new'}
                    onChange={() => setTargetMode('new')}
                    style={{ accentColor: '#3b82f6' }}
                  />
                  <span>Create new presentation:</span>
                </label>

                {targetMode === 'new' && (
                  <input
                    type="text"
                    value={newPresentationTitle}
                    onChange={(e) => setNewPresentationTitle(e.target.value)}
                    placeholder="New Presentation Title"
                    style={{
                      backgroundColor: '#0f172a',
                      border: '1px solid #1e293b',
                      borderRadius: '6px',
                      color: '#f8fafc',
                      padding: '6px 10px',
                      fontSize: '12px',
                      marginLeft: '22px',
                    }}
                  />
                )}
              </div>
            </div>
          </div>

          {/* Right Column: Live 16:9 Presentation Preview */}
          <div
            style={{
              padding: '20px',
              backgroundColor: '#060a12',
              display: 'flex',
              flexDirection: 'column',
              gap: '14px',
              overflowY: 'auto',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <div style={{ fontSize: '13px', fontWeight: 700, color: '#94a3b8' }}>
                LIVE 16:9 SLIDE PREVIEW ({previewSlides.length} Slides Generated)
              </div>

              {previewSlides.length > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <button
                    type="button"
                    disabled={previewSlideIndex <= 0}
                    onClick={() => setPreviewSlideIndex((p) => Math.max(0, p - 1))}
                    style={{
                      padding: '4px 6px',
                      borderRadius: '4px',
                      backgroundColor: '#1e293b',
                      color: previewSlideIndex <= 0 ? '#475569' : '#cbd5e1',
                    }}
                  >
                    <ChevronLeft size={14} />
                  </button>
                  <span style={{ fontSize: '12px', color: '#cbd5e1' }}>
                    {previewSlideIndex + 1} / {previewSlides.length}
                  </span>
                  <button
                    type="button"
                    disabled={previewSlideIndex >= previewSlides.length - 1}
                    onClick={() =>
                      setPreviewSlideIndex((p) =>
                        Math.min(previewSlides.length - 1, p + 1)
                      )
                    }
                    style={{
                      padding: '4px 6px',
                      borderRadius: '4px',
                      backgroundColor: '#1e293b',
                      color:
                        previewSlideIndex >= previewSlides.length - 1
                          ? '#475569'
                          : '#cbd5e1',
                    }}
                  >
                    <ChevronRight size={14} />
                  </button>
                </div>
              )}
            </div>

            {/* 16:9 Aspect Ratio Display Preview Box */}
            <div
              style={{
                width: '100%',
                aspectRatio: '16 / 9',
                backgroundColor: activeTheme?.backgroundColor || '#0a0f1d',
                backgroundImage: activeTheme?.backgroundImagePath
                  ? `url("${activeTheme.backgroundImagePath}")`
                  : undefined,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
                position: 'relative',
                borderRadius: '8px',
                border: '2px solid #334155',
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column',
                justifyContent:
                  activeTheme?.verticalAlignment === 'top'
                    ? 'flex-start'
                    : activeTheme?.verticalAlignment === 'bottom'
                    ? 'flex-end'
                    : 'center',
                alignItems:
                  activeTheme?.textAlignment === 'left'
                    ? 'flex-start'
                    : activeTheme?.textAlignment === 'right'
                    ? 'flex-end'
                    : 'center',
                padding: '24px',
                boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
              }}
            >
              {/* Optional Dark Overlay */}
              {activeTheme?.overlayColor && (
                <div
                  style={{
                    position: 'absolute',
                    inset: 0,
                    backgroundColor: activeTheme.overlayColor,
                    pointerEvents: 'none',
                  }}
                />
              )}

              {previewSlides.length > 0 ? (
                <div
                  className="multilingual-text"
                  style={{
                    position: 'relative',
                    zIndex: 1,
                    color: activeTheme?.textColor || '#ffffff',
                    fontSize:
                      activeTheme?.fontSize === 'xlarge'
                        ? '22px'
                        : activeTheme?.fontSize === 'large'
                        ? '19px'
                        : activeTheme?.fontSize === 'medium'
                        ? '16px'
                        : '14px',
                    fontWeight:
                      activeTheme?.fontWeight === 'bold' ? 700 : 500,
                    textAlign: activeTheme?.textAlignment || 'center',
                    lineHeight: activeTheme?.lineSpacing || 1.4,
                    textShadow:
                      activeTheme?.textShadow || '0 2px 8px rgba(0,0,0,0.7)',
                    width: '100%',
                  }}
                >
                  {previewSlides[previewSlideIndex]?.body}
                </div>
              ) : (
                <div
                  style={{
                    color: '#64748b',
                    fontSize: '13px',
                    textAlign: 'center',
                    zIndex: 1,
                  }}
                >
                  No sections selected. Select at least one section on the left.
                </div>
              )}

              {/* Slide Title Watermark */}
              {previewSlides[previewSlideIndex] && (
                <div
                  style={{
                    position: 'absolute',
                    bottom: '8px',
                    left: '12px',
                    fontSize: '10px',
                    fontWeight: 600,
                    color: 'rgba(255, 255, 255, 0.4)',
                    zIndex: 2,
                  }}
                >
                  {previewSlides[previewSlideIndex].title}
                </div>
              )}
            </div>

            {/* Snapshot safeguard notice */}
            <div
              style={{
                backgroundColor: 'rgba(59, 130, 246, 0.08)',
                border: '1px solid rgba(59, 130, 246, 0.2)',
                borderRadius: '6px',
                padding: '10px 12px',
                fontSize: '11px',
                color: '#94a3b8',
                lineHeight: 1.4,
                display: 'flex',
                gap: '8px',
              }}
            >
              <FileCheck size={16} color="#38bdf8" style={{ flexShrink: 0 }} />
              <div>
                <strong>Slide Snapshot Guarantee:</strong> Generated presentation slides
                take an isolated snapshot of lyrics, layout, and theme formatting. Modifying or
                deleting songs later will never alter or corrupt your prepared service presentation.
              </div>
            </div>
          </div>
        </div>

        {/* Modal Footer Actions */}
        <div
          style={{
            padding: '12px 20px',
            backgroundColor: '#0f172a',
            borderTop: '1px solid #1e293b',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ fontSize: '12px', color: '#64748b' }}>
            Will generate <strong>{previewSlides.length}</strong> presentation slides
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
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
              Cancel
            </button>
            <button
              type="button"
              disabled={isGenerating || previewSlides.length === 0}
              onClick={handleGenerate}
              style={{
                padding: '8px 20px',
                borderRadius: '6px',
                backgroundColor:
                  isGenerating || previewSlides.length === 0
                    ? '#3b82f650'
                    : '#2563eb',
                color: '#ffffff',
                fontSize: '13px',
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                cursor:
                  isGenerating || previewSlides.length === 0
                    ? 'not-allowed'
                    : 'pointer',
              }}
            >
              <PlusCircle size={15} />
              {isGenerating ? 'Generating...' : 'Add Slides to Presentation'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
