import React, { useState } from 'react';
import {
  ChevronUp,
  ChevronDown,
  Trash2,
  Copy,
  Plus,
  Music,
  AlignLeft,
  FileText,
  GripVertical,
} from 'lucide-react';
import { SongSection, SectionType } from '../../types';
import { sectionColor } from './sectionColors';

interface LyricsEditorProps {
  sections: SongSection[];
  onChange: (sections: SongSection[]) => void;
  disabled?: boolean;
}

const SECTION_TYPE_CONFIG: Record<
  SectionType,
  { label: string; color: string; bgColor: string; borderColor: string }
> = {
  verse: {
    label: 'Verse',
    color: '#60a5fa',
    bgColor: 'rgba(59, 130, 246, 0.12)',
    borderColor: '#3b82f6',
  },
  chorus: {
    label: 'Chorus',
    color: '#f59e0b',
    bgColor: 'rgba(245, 158, 11, 0.15)',
    borderColor: '#f59e0b',
  },
  bridge: {
    label: 'Bridge',
    color: '#a855f7',
    bgColor: 'rgba(168, 85, 247, 0.12)',
    borderColor: '#a855f7',
  },
  pre_chorus: {
    label: 'Pre-Chorus',
    color: '#38bdf8',
    bgColor: 'rgba(56, 189, 248, 0.12)',
    borderColor: '#38bdf8',
  },
  intro: {
    label: 'Intro',
    color: '#34d399',
    bgColor: 'rgba(52, 211, 153, 0.12)',
    borderColor: '#34d399',
  },
  outro: {
    label: 'Outro',
    color: '#fb7185',
    bgColor: 'rgba(251, 113, 133, 0.12)',
    borderColor: '#fb7185',
  },
  refrain: {
    label: 'Refrain',
    color: '#facc15',
    bgColor: 'rgba(250, 204, 21, 0.12)',
    borderColor: '#facc15',
  },
  custom: {
    label: 'Custom',
    color: '#94a3b8',
    bgColor: 'rgba(148, 163, 184, 0.12)',
    borderColor: '#64748b',
  },
};

export const LyricsEditor: React.FC<LyricsEditorProps> = ({
  sections,
  onChange,
  disabled = false,
}) => {
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

  const handleUpdateSection = (
    index: number,
    field: keyof SongSection,
    value: string | null
  ) => {
    const updated = [...sections];
    updated[index] = {
      ...updated[index],
      [field]: value,
    };
    onChange(updated);
  };

  const handleMoveUp = (index: number) => {
    if (index <= 0) return;
    const updated = [...sections];
    const temp = updated[index];
    updated[index] = updated[index - 1];
    updated[index - 1] = temp;
    // Re-assign sortOrder
    const reordered = updated.map((sec, i) => ({ ...sec, sortOrder: i }));
    onChange(reordered);
  };

  const handleMoveDown = (index: number) => {
    if (index >= sections.length - 1) return;
    const updated = [...sections];
    const temp = updated[index];
    updated[index] = updated[index + 1];
    updated[index + 1] = temp;
    // Re-assign sortOrder
    const reordered = updated.map((sec, i) => ({ ...sec, sortOrder: i }));
    onChange(reordered);
  };

  const handleDeleteSection = (index: number) => {
    const updated = sections
      .filter((_, i) => i !== index)
      .map((sec, i) => ({ ...sec, sortOrder: i }));
    onChange(updated);
  };

  const handleDuplicateSection = (index: number) => {
    const target = sections[index];
    const newSection: SongSection = {
      id: `sec-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      songId: target.songId,
      sectionType: target.sectionType,
      label: `${target.label} (Copy)`,
      lyrics: target.lyrics,
      sortOrder: index + 1,
      notes: target.notes,
      color: target.color,
    };
    const updated = [
      ...sections.slice(0, index + 1),
      newSection,
      ...sections.slice(index + 1),
    ].map((sec, i) => ({ ...sec, sortOrder: i }));
    onChange(updated);
  };

  const handleAddSection = (type: SectionType) => {
    const countOfType = sections.filter((s) => s.sectionType === type).length;
    const defaultLabels: Record<SectionType, string> = {
      verse: `Verse ${countOfType + 1}`,
      chorus: countOfType === 0 ? 'Chorus' : `Chorus ${countOfType + 1}`,
      bridge: countOfType === 0 ? 'Bridge' : `Bridge ${countOfType + 1}`,
      pre_chorus: countOfType === 0 ? 'Pre-Chorus' : `Pre-Chorus ${countOfType + 1}`,
      intro: 'Intro',
      outro: 'Outro',
      refrain: 'Refrain',
      custom: `Section ${sections.length + 1}`,
    };

    const newSection: SongSection = {
      id: `sec-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      songId: sections[0]?.songId || '',
      sectionType: type,
      label: defaultLabels[type],
      lyrics: '',
      sortOrder: sections.length,
      notes: '',
    };

    onChange([...sections, newSection]);
  };

  // Drag and Drop handlers
  const handleDragStart = (index: number) => {
    setDraggedIndex(index);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === index) return;
    const updated = [...sections];
    const draggedItem = updated[draggedIndex];
    updated.splice(draggedIndex, 1);
    updated.splice(index, 0, draggedItem);
    const reordered = updated.map((sec, i) => ({ ...sec, sortOrder: i }));
    setDraggedIndex(index);
    onChange(reordered);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Quick Add Section Bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '8px',
          padding: '12px 14px',
          backgroundColor: '#0f172a',
          borderRadius: '8px',
          border: '1px solid #1e293b',
        }}
      >
        <span
          style={{
            fontSize: '12px',
            color: '#94a3b8',
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            marginRight: '4px',
          }}
        >
          <Plus size={14} /> Add Section:
        </span>

        {(
          [
            'verse',
            'chorus',
            'bridge',
            'pre_chorus',
            'intro',
            'outro',
            'refrain',
            'custom',
          ] as SectionType[]
        ).map((type) => {
          const cfg = SECTION_TYPE_CONFIG[type];
          return (
            <button
              key={type}
              type="button"
              disabled={disabled}
              onClick={() => handleAddSection(type)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                padding: '4px 10px',
                borderRadius: '6px',
                backgroundColor: cfg.bgColor,
                border: `1px solid ${cfg.borderColor}`,
                color: cfg.color,
                fontSize: '12px',
                fontWeight: 600,
                cursor: disabled ? 'not-allowed' : 'pointer',
                transition: 'all 0.15s ease',
              }}
              title={`Add new ${cfg.label}`}
            >
              + {cfg.label}
            </button>
          );
        })}
      </div>

      {/* Sections List */}
      {sections.length === 0 ? (
        <div
          style={{
            padding: '36px 20px',
            textAlign: 'center',
            backgroundColor: '#0f172a',
            borderRadius: '8px',
            border: '1px dashed #334155',
            color: '#64748b',
          }}
        >
          <Music size={32} style={{ margin: '0 auto 12px', opacity: 0.5 }} />
          <div style={{ fontSize: '14px', fontWeight: 600, color: '#94a3b8' }}>
            No song sections yet
          </div>
          <div style={{ fontSize: '12px', marginTop: '4px' }}>
            Click one of the buttons above to add a Verse, Chorus, or Bridge.
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {sections.map((section, index) => {
            const cfg =
              SECTION_TYPE_CONFIG[section.sectionType] ||
              SECTION_TYPE_CONFIG.custom;
            const groupColor = sectionColor(section);

            return (
              <div
                key={section.id || index}
                draggable={!disabled}
                onDragStart={() => handleDragStart(index)}
                onDragOver={(e) => handleDragOver(e, index)}
                onDragEnd={handleDragEnd}
                style={{
                  backgroundColor: '#0f172a',
                  border: `1px solid ${groupColor}40`,
                  borderLeft: `4px solid ${groupColor}`,
                  borderRadius: '8px',
                  padding: '14px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '10px',
                  opacity: draggedIndex === index ? 0.5 : 1,
                  boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
                  transition: 'background-color 0.15s ease',
                }}
              >
                {/* Section Header Controls */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: '8px',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      flex: 1,
                      minWidth: '240px',
                    }}
                  >
                    <span
                      title="Drag to reorder"
                      style={{
                        cursor: disabled ? 'default' : 'grab',
                        color: '#64748b',
                        display: 'flex',
                        alignItems: 'center',
                      }}
                    >
                      <GripVertical size={16} />
                    </span>

                    {/* Section Type Selector */}
                    <select
                      value={section.sectionType}
                      disabled={disabled}
                      onChange={(e) =>
                        handleUpdateSection(
                          index,
                          'sectionType',
                          e.target.value as SectionType
                        )
                      }
                      style={{
                        backgroundColor: '#1e293b',
                        border: '1px solid #334155',
                        borderRadius: '6px',
                        color: cfg.color,
                        padding: '4px 8px',
                        fontSize: '12px',
                        fontWeight: 700,
                        cursor: 'pointer',
                      }}
                    >
                      {(
                        [
                          'verse',
                          'chorus',
                          'bridge',
                          'pre_chorus',
                          'intro',
                          'outro',
                          'refrain',
                          'custom',
                        ] as SectionType[]
                      ).map((t) => (
                        <option key={t} value={t}>
                          {SECTION_TYPE_CONFIG[t].label}
                        </option>
                      ))}
                    </select>

                    {/* Group colour (overrides the section type's default) */}
                    <input
                      type="color"
                      data-testid="section-color-input"
                      aria-label="Group colour"
                      title={section.color ? 'Custom group colour (double-click to reset)' : 'Group colour'}
                      value={groupColor}
                      disabled={disabled}
                      onChange={(e) => handleUpdateSection(index, 'color', e.target.value)}
                      onDoubleClick={() => handleUpdateSection(index, 'color', null)}
                      style={{ width: '24px', height: '24px', padding: 0, border: 'none', background: 'none', cursor: 'pointer' }}
                    />

                    {/* Label Input (e.g. "Verse 1") */}
                    <input
                      type="text"
                      disabled={disabled}
                      value={section.label}
                      onChange={(e) =>
                        handleUpdateSection(index, 'label', e.target.value)
                      }
                      placeholder="Section Label"
                      style={{
                        backgroundColor: '#1e293b',
                        border: '1px solid #334155',
                        borderRadius: '6px',
                        color: '#f8fafc',
                        padding: '4px 10px',
                        fontSize: '13px',
                        fontWeight: 600,
                        width: '160px',
                      }}
                    />

                    {/* Line count helper */}
                    <span
                      style={{
                        fontSize: '11px',
                        color: '#64748b',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                      }}
                    >
                      <AlignLeft size={12} />
                      {section.lyrics ? section.lyrics.split('\n').filter((l) => l.trim().length > 0).length : 0} lines
                    </span>
                  </div>

                  {/* Actions: Reorder, Duplicate, Delete */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                    }}
                  >
                    <button
                      type="button"
                      disabled={disabled || index === 0}
                      onClick={() => handleMoveUp(index)}
                      title="Move Section Up (Alt+Up)"
                      style={{
                        padding: '4px 6px',
                        borderRadius: '4px',
                        backgroundColor: '#1e293b',
                        color: index === 0 ? '#475569' : '#cbd5e1',
                        cursor: index === 0 ? 'not-allowed' : 'pointer',
                        border: '1px solid #334155',
                      }}
                    >
                      <ChevronUp size={15} />
                    </button>
                    <button
                      type="button"
                      disabled={disabled || index === sections.length - 1}
                      onClick={() => handleMoveDown(index)}
                      title="Move Section Down (Alt+Down)"
                      style={{
                        padding: '4px 6px',
                        borderRadius: '4px',
                        backgroundColor: '#1e293b',
                        color:
                          index === sections.length - 1 ? '#475569' : '#cbd5e1',
                        cursor:
                          index === sections.length - 1
                            ? 'not-allowed'
                            : 'pointer',
                        border: '1px solid #334155',
                      }}
                    >
                      <ChevronDown size={15} />
                    </button>
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => handleDuplicateSection(index)}
                      title="Duplicate Section"
                      style={{
                        padding: '4px 6px',
                        borderRadius: '4px',
                        backgroundColor: '#1e293b',
                        color: '#cbd5e1',
                        cursor: disabled ? 'not-allowed' : 'pointer',
                        border: '1px solid #334155',
                      }}
                    >
                      <Copy size={15} />
                    </button>
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => handleDeleteSection(index)}
                      title="Delete Section"
                      style={{
                        padding: '4px 6px',
                        borderRadius: '4px',
                        backgroundColor: '#1e293b',
                        color: '#f87171',
                        cursor: disabled ? 'not-allowed' : 'pointer',
                        border: '1px solid #ef444430',
                      }}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>

                {/* Lyric Text Area */}
                <div>
                  <textarea
                    rows={4}
                    disabled={disabled}
                    value={section.lyrics}
                    onChange={(e) =>
                      handleUpdateSection(index, 'lyrics', e.target.value)
                    }
                    placeholder="Enter Tamil or English lyrics here... (Unicode, line breaks, and punctuation are fully preserved)"
                    className="multilingual-text"
                    style={{
                      width: '100%',
                      backgroundColor: '#090d16',
                      border: '1px solid #1e293b',
                      borderRadius: '6px',
                      color: '#f8fafc',
                      padding: '10px 12px',
                      fontSize: '14px',
                      lineHeight: '1.5',
                      fontFamily: 'inherit',
                      resize: 'vertical',
                      minHeight: '88px',
                    }}
                  />
                </div>

                {/* Operator Notes Field */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                  }}
                >
                  <FileText size={13} color="#64748b" />
                  <input
                    type="text"
                    disabled={disabled}
                    value={section.notes || ''}
                    onChange={(e) =>
                      handleUpdateSection(index, 'notes', e.target.value)
                    }
                    placeholder="Operator / band notes (e.g. 'Sing twice', 'Lead vocal solo', 'Acoustic guitar only')"
                    style={{
                      flex: 1,
                      backgroundColor: '#090d16',
                      border: '1px solid #1e293b',
                      borderRadius: '4px',
                      color: '#94a3b8',
                      padding: '4px 8px',
                      fontSize: '11px',
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
