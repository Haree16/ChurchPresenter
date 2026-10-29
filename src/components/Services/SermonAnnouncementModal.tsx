import React, { useState, useEffect } from 'react';
import {
  X,
  Plus,
  Trash2,
  Copy,
  ChevronUp,
  ChevronDown,
  AlertTriangle,
  FileText,
  Megaphone,
  Type,
  Image as ImageIcon,
  Check,
  SplitSquareVertical,
  Palette,
} from 'lucide-react';
import { PlaylistItem, Slide, Theme, PlaylistItemType } from '../../types';
import { backgroundImageCss } from '../../services/backgroundMedia';

interface SermonAnnouncementModalProps {
  isOpen: boolean;
  onClose: () => void;
  itemType: PlaylistItemType;
  serviceId: string;
  themes: Theme[];
  existingItem?: PlaylistItem | null;
  existingSlides?: Slide[];
  onSave: (item: Partial<PlaylistItem>, slides: Slide[]) => Promise<void>;
}

interface EditableSlide {
  id: string;
  title: string;
  body: string;
  backgroundImage?: string | null;
}

export const SermonAnnouncementModal: React.FC<SermonAnnouncementModalProps> = ({
  isOpen,
  onClose,
  itemType,
  serviceId,
  themes,
  existingItem,
  existingSlides,
  onSave,
}) => {
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [selectedThemeId, setSelectedThemeId] = useState<string>('theme-builtin-dark');
  const [slides, setSlides] = useState<EditableSlide[]>([
    {
      id: `slide-${Date.now()}-1`,
      title: '',
      body: '',
      backgroundImage: null,
    },
  ]);
  const [activeSlideIndex, setActiveSlideIndex] = useState<number>(0);
  const [batchText, setBatchText] = useState<string>('');
  const [showBatchSplit, setShowBatchSplit] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Initialize or reset when modal opens or item changes
  useEffect(() => {
    if (!isOpen) return;

    if (existingItem) {
      setTitle(existingItem.title);
      setNotes(existingItem.notes || '');
      setSelectedThemeId(existingItem.themeId || themes[0]?.id || 'theme-builtin-dark');
      if (existingSlides && existingSlides.length > 0) {
        setSlides(
          existingSlides.map((s) => ({
            id: s.id,
            title: s.title || '',
            body: s.body || '',
            backgroundImage: s.backgroundImage || null,
          }))
        );
      } else {
        setSlides([
          {
            id: `slide-${Date.now()}-1`,
            title: existingItem.title,
            body: '',
            backgroundImage: null,
          },
        ]);
      }
    } else {
      // Default titles according to type
      const defaultTitle =
        itemType === 'sermon'
          ? 'Sermon: '
          : itemType === 'announcement'
          ? 'Announcements'
          : itemType === 'image'
          ? 'Image Slide'
          : 'Presentation Slides';

      setTitle(defaultTitle);
      setNotes('');
      setSelectedThemeId(themes[0]?.id || 'theme-builtin-dark');
      setSlides([
        {
          id: `slide-${Date.now()}-1`,
          title: itemType === 'sermon' ? 'Introduction' : 'Welcome',
          body: '',
          backgroundImage: null,
        },
      ]);
    }
    setActiveSlideIndex(0);
    setError(null);
    setShowBatchSplit(false);
    setBatchText('');
  }, [isOpen, existingItem, existingSlides, itemType, themes]);

  if (!isOpen) return null;

  const currentTheme =
    themes.find((t) => t.id === selectedThemeId) ||
    themes[0] || {
      backgroundColor: '#0f172a',
      textColor: '#ffffff',
      fontSize: 'medium',
      textAlignment: 'center',
    };

  const handleAddSlide = () => {
    const newSlide: EditableSlide = {
      id: `slide-${Date.now()}-${slides.length + 1}`,
      title: `Slide ${slides.length + 1}`,
      body: '',
      backgroundImage: null,
    };
    const nextSlides = [...slides, newSlide];
    setSlides(nextSlides);
    setActiveSlideIndex(nextSlides.length - 1);
  };

  const handleDuplicateSlide = (index: number) => {
    const target = slides[index];
    const duplicated: EditableSlide = {
      ...target,
      id: `slide-${Date.now()}-${slides.length + 1}`,
      title: `${target.title} (Copy)`,
    };
    const nextSlides = [...slides];
    nextSlides.splice(index + 1, 0, duplicated);
    setSlides(nextSlides);
    setActiveSlideIndex(index + 1);
  };

  const handleDeleteSlide = (index: number) => {
    if (slides.length <= 1) {
      setError('A presentation must have at least one slide.');
      return;
    }
    const nextSlides = slides.filter((_, i) => i !== index);
    setSlides(nextSlides);
    setActiveSlideIndex(Math.max(0, index - 1));
  };

  const handleMoveSlide = (index: number, direction: 'up' | 'down') => {
    if (
      (direction === 'up' && index === 0) ||
      (direction === 'down' && index === slides.length - 1)
    ) {
      return;
    }
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    const nextSlides = [...slides];
    const temp = nextSlides[index];
    nextSlides[index] = nextSlides[targetIndex];
    nextSlides[targetIndex] = temp;
    setSlides(nextSlides);
    setActiveSlideIndex(targetIndex);
  };

  const handleUpdateActiveSlide = (field: keyof EditableSlide, value: string | null) => {
    const nextSlides = [...slides];
    nextSlides[activeSlideIndex] = {
      ...nextSlides[activeSlideIndex],
      [field]: value,
    };
    setSlides(nextSlides);
  };

  const handleApplyBatchSplit = () => {
    if (!batchText.trim()) {
      setShowBatchSplit(false);
      return;
    }

    // Split by either '---' or double line breaks
    let parts: string[] = [];
    if (batchText.includes('---')) {
      parts = batchText.split(/\n?---+\n?/).map((p) => p.trim()).filter(Boolean);
    } else {
      parts = batchText.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
    }

    if (parts.length === 0) {
      setError('No slides could be extracted from the text.');
      return;
    }

    const generatedSlides: EditableSlide[] = parts.map((part, idx) => {
      const lines = part.split('\n').map((l) => l.trim()).filter(Boolean);
      let slideTitle = `Slide ${idx + 1}`;
      let body = part;

      // If the first line is short and looks like a heading, use it as title
      if (lines.length > 1 && lines[0].length <= 50 && !lines[0].includes('.')) {
        slideTitle = lines[0];
        body = lines.slice(1).join('\n');
      }

      return {
        id: `slide-${Date.now()}-${idx + 1}`,
        title: slideTitle,
        body,
        backgroundImage: null,
      };
    });

    setSlides(generatedSlides);
    setActiveSlideIndex(0);
    setShowBatchSplit(false);
    setBatchText('');
  };

  const handleSave = async () => {
    if (!title.trim()) {
      setError('Please provide a title for this service item.');
      return;
    }

    if (slides.length === 0) {
      setError('Please create at least one slide.');
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      const itemId = existingItem ? existingItem.id : `item-${Date.now()}`;
      const now = new Date().toISOString();

      const itemData: Partial<PlaylistItem> = {
        id: itemId,
        serviceId,
        itemType,
        title: title.trim(),
        notes: notes.trim() || null,
        themeId: selectedThemeId,
        sortOrder: existingItem ? existingItem.sortOrder : 0,
      };

      const finalSlides: Slide[] = slides.map((s, index) => ({
        id: s.id.startsWith('slide-') ? s.id : `slide-${Date.now()}-${index}`,
        presentationId: itemId,
        sortOrder: index,
        title: s.title.trim(),
        body: s.body.trim(),
        backgroundColor: currentTheme.backgroundColor || '#0f172a',
        foregroundColor: currentTheme.textColor || '#ffffff',
        fontSize: currentTheme.fontSize || 'medium',
        textAlignment: currentTheme.textAlignment || 'center',
        themeOverride: selectedThemeId,
        backgroundImage: s.backgroundImage || currentTheme.backgroundImagePath || null,
        overlayColor: currentTheme.overlayColor || null,
        lineSpacing: currentTheme.lineSpacing || 1.2,
        fontFamily: currentTheme.fontFamily || null,
        fontWeight: currentTheme.fontWeight || 'normal',
        createdAt: now,
        updatedAt: now,
      }));

      await onSave(itemData, finalSlides);
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Failed to save playlist item.');
    } finally {
      setIsSaving(false);
    }
  };

  const activeSlide = slides[activeSlideIndex] || slides[0];
  const charCount = activeSlide?.body?.length || 0;
  const lineCount = activeSlide?.body ? activeSlide.body.split('\n').length : 0;
  const isOverflowRisk = charCount > 300;
  const isLineRisk = lineCount > 8;

  // Icon depending on itemType
  const TypeIcon =
    itemType === 'sermon'
      ? FileText
      : itemType === 'announcement'
      ? Megaphone
      : itemType === 'image'
      ? ImageIcon
      : Type;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.75)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: '20px',
      }}
    >
      <div
        style={{
          backgroundColor: '#0f172a',
          border: '1px solid #334155',
          borderRadius: '12px',
          width: '100%',
          maxWidth: '1000px',
          maxHeight: '92vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
          overflow: 'hidden',
        }}
      >
        {/* Modal Header */}
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid #1e293b',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            backgroundColor: '#1e293b',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                backgroundColor:
                  itemType === 'sermon'
                    ? '#8b5cf6'
                    : itemType === 'announcement'
                    ? '#f59e0b'
                    : itemType === 'image'
                    ? '#ec4899'
                    : '#3b82f6',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#ffffff',
              }}
            >
              <TypeIcon size={18} />
            </div>
            <div>
              <h2 style={{ fontSize: '16px', fontWeight: 600, color: '#f8fafc', margin: 0 }}>
                {existingItem
                  ? `Edit ${itemType.toUpperCase()}: ${existingItem.title}`
                  : `Add ${itemType.toUpperCase()} Item`}
              </h2>
              <p style={{ fontSize: '12px', color: '#94a3b8', margin: 0 }}>
                Configure title, multi-slide notes, and presentation theme with safe layout overflow warnings
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#94a3b8',
              cursor: 'pointer',
              padding: '6px',
              borderRadius: '6px',
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Modal Content */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '320px 1fr',
            flex: 1,
            overflow: 'hidden',
            backgroundColor: '#090d16',
          }}
        >
          {/* Left Panel: Item Configuration & Slide Thumbnails */}
          <div
            style={{
              borderRight: '1px solid #1e293b',
              padding: '16px',
              display: 'flex',
              flexDirection: 'column',
              gap: '14px',
              overflowY: 'auto',
              maxHeight: 'calc(92vh - 130px)',
            }}
          >
            {/* Title */}
            <div>
              <label
                style={{
                  fontSize: '11px',
                  fontWeight: 600,
                  color: '#94a3b8',
                  textTransform: 'uppercase',
                  display: 'block',
                  marginBottom: '4px',
                }}
              >
                Item Title *
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Sermon Outline or Announcements"
                style={{
                  width: '100%',
                  padding: '8px 10px',
                  backgroundColor: '#1e293b',
                  border: '1px solid #334155',
                  borderRadius: '6px',
                  color: '#f8fafc',
                  fontSize: '13px',
                }}
              />
            </div>

            {/* Theme Selector */}
            <div>
              <label
                style={{
                  fontSize: '11px',
                  fontWeight: 600,
                  color: '#94a3b8',
                  textTransform: 'uppercase',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  marginBottom: '4px',
                }}
              >
                <Palette size={12} /> Theme
              </label>
              <select
                value={selectedThemeId}
                onChange={(e) => setSelectedThemeId(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 10px',
                  backgroundColor: '#1e293b',
                  border: '1px solid #334155',
                  borderRadius: '6px',
                  color: '#f8fafc',
                  fontSize: '13px',
                }}
              >
                {themes.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Operator Notes */}
            <div>
              <label
                style={{
                  fontSize: '11px',
                  fontWeight: 600,
                  color: '#94a3b8',
                  textTransform: 'uppercase',
                  display: 'block',
                  marginBottom: '4px',
                }}
              >
                Operator Notes (Private)
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                placeholder="Notes for production crew..."
                style={{
                  width: '100%',
                  padding: '8px 10px',
                  backgroundColor: '#1e293b',
                  border: '1px solid #334155',
                  borderRadius: '6px',
                  color: '#f8fafc',
                  fontSize: '12px',
                  resize: 'none',
                }}
              />
            </div>

            {/* Slide List Header */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingTop: '8px',
                borderTop: '1px solid #1e293b',
              }}
            >
              <span style={{ fontSize: '12px', fontWeight: 600, color: '#cbd5e1' }}>
                Slides ({slides.length})
              </span>
              <div style={{ display: 'flex', gap: '6px' }}>
                <button
                  type="button"
                  onClick={() => setShowBatchSplit(!showBatchSplit)}
                  title="Paste multi-slide text"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: '4px 8px',
                    backgroundColor: showBatchSplit ? '#334155' : '#1e293b',
                    border: '1px solid #334155',
                    borderRadius: '5px',
                    color: '#e2e8f0',
                    fontSize: '11px',
                    cursor: 'pointer',
                  }}
                >
                  <SplitSquareVertical size={12} /> Split
                </button>
                <button
                  type="button"
                  onClick={handleAddSlide}
                  title="Add new slide"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: '4px 8px',
                    backgroundColor: '#2563eb',
                    border: 'none',
                    borderRadius: '5px',
                    color: '#ffffff',
                    fontSize: '11px',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  <Plus size={12} /> Add
                </button>
              </div>
            </div>

            {/* Slide Navigation List */}
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '6px',
                flex: 1,
              }}
            >
              {slides.map((s, idx) => {
                const isActive = idx === activeSlideIndex;
                const hasOverflow = s.body.length > 300;
                return (
                  <div
                    key={s.id}
                    onClick={() => setActiveSlideIndex(idx)}
                    style={{
                      padding: '8px 10px',
                      borderRadius: '6px',
                      backgroundColor: isActive ? '#1e293b' : '#0f172a',
                      border: `1px solid ${isActive ? '#3b82f6' : '#1e293b'}`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                      <span
                        style={{
                          fontSize: '10px',
                          fontWeight: 700,
                          color: isActive ? '#60a5fa' : '#64748b',
                          minWidth: '16px',
                        }}
                      >
                        {idx + 1}
                      </span>
                      <div style={{ minWidth: 0 }}>
                        <div
                          style={{
                            fontSize: '12px',
                            fontWeight: 500,
                            color: isActive ? '#ffffff' : '#94a3b8',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                        >
                          {s.title || `Slide ${idx + 1}`}
                        </div>
                        <div
                          style={{
                            fontSize: '10px',
                            color: '#64748b',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                        >
                          {s.body ? s.body.substring(0, 30) : '(empty slide)'}
                        </div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      {hasOverflow && (
                        <span title="Length warning (>300 chars)">
                          <AlertTriangle size={13} color="#f59e0b" />
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleMoveSlide(idx, 'up');
                        }}
                        disabled={idx === 0}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: idx === 0 ? '#334155' : '#94a3b8',
                          cursor: idx === 0 ? 'default' : 'pointer',
                          padding: '2px',
                        }}
                      >
                        <ChevronUp size={13} />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleMoveSlide(idx, 'down');
                        }}
                        disabled={idx === slides.length - 1}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: idx === slides.length - 1 ? '#334155' : '#94a3b8',
                          cursor: idx === slides.length - 1 ? 'default' : 'pointer',
                          padding: '2px',
                        }}
                      >
                        <ChevronDown size={13} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right Panel: Active Slide Editor & Live Preview */}
          <div
            style={{
              padding: '20px',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
              overflowY: 'auto',
            }}
          >
            {/* Batch text paste box if open */}
            {showBatchSplit && (
              <div
                style={{
                  backgroundColor: '#1e293b',
                  border: '1px solid #3b82f6',
                  borderRadius: '8px',
                  padding: '14px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '12px', fontWeight: 600, color: '#93c5fd' }}>
                    Quick Multi-Slide Import
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowBatchSplit(false)}
                    style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer' }}
                  >
                    <X size={14} />
                  </button>
                </div>
                <p style={{ fontSize: '11px', color: '#94a3b8', margin: 0 }}>
                  Paste sermon outline or announcements separated by blank lines or "---".
                </p>
                <textarea
                  value={batchText}
                  onChange={(e) => setBatchText(e.target.value)}
                  placeholder="Slide 1 Content&#10;&#10;---&#10;&#10;Slide 2 Content&#10;&#10;---&#10;&#10;Slide 3 Content"
                  rows={4}
                  style={{
                    backgroundColor: '#0f172a',
                    border: '1px solid #334155',
                    borderRadius: '6px',
                    padding: '8px 10px',
                    color: '#f8fafc',
                    fontSize: '12px',
                    fontFamily: 'monospace',
                  }}
                />
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                  <button
                    type="button"
                    onClick={() => setShowBatchSplit(false)}
                    style={{
                      padding: '5px 10px',
                      backgroundColor: 'transparent',
                      border: '1px solid #475569',
                      borderRadius: '5px',
                      color: '#cbd5e1',
                      fontSize: '11px',
                      cursor: 'pointer',
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleApplyBatchSplit}
                    style={{
                      padding: '5px 12px',
                      backgroundColor: '#2563eb',
                      border: 'none',
                      borderRadius: '5px',
                      color: '#ffffff',
                      fontSize: '11px',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    Split Into Slides
                  </button>
                </div>
              </div>
            )}

            {/* Slide Editor Header Controls */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '14px', fontWeight: 600, color: '#f8fafc' }}>
                  Slide {activeSlideIndex + 1} of {slides.length}
                </span>
                {isOverflowRisk && (
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                      padding: '2px 8px',
                      borderRadius: '12px',
                      backgroundColor: 'rgba(245, 158, 11, 0.15)',
                      border: '1px solid rgba(245, 158, 11, 0.4)',
                      color: '#f59e0b',
                      fontSize: '11px',
                      fontWeight: 500,
                    }}
                  >
                    <AlertTriangle size={12} /> Text Warning: {charCount} chars
                  </span>
                )}
                {isLineRisk && (
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                      padding: '2px 8px',
                      borderRadius: '12px',
                      backgroundColor: 'rgba(239, 68, 68, 0.15)',
                      border: '1px solid rgba(239, 68, 68, 0.4)',
                      color: '#ef4444',
                      fontSize: '11px',
                      fontWeight: 500,
                    }}
                  >
                    <AlertTriangle size={12} /> {lineCount} lines (split recommended)
                  </span>
                )}
              </div>

              <div style={{ display: 'flex', gap: '6px' }}>
                <button
                  type="button"
                  onClick={() => handleDuplicateSlide(activeSlideIndex)}
                  title="Duplicate this slide"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: '4px 8px',
                    backgroundColor: '#1e293b',
                    border: '1px solid #334155',
                    borderRadius: '5px',
                    color: '#cbd5e1',
                    fontSize: '11px',
                    cursor: 'pointer',
                  }}
                >
                  <Copy size={12} /> Duplicate
                </button>
                <button
                  type="button"
                  onClick={() => handleDeleteSlide(activeSlideIndex)}
                  disabled={slides.length <= 1}
                  title="Delete slide"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: '4px 8px',
                    backgroundColor: slides.length <= 1 ? '#1e293b' : 'rgba(239, 68, 68, 0.1)',
                    border: `1px solid ${slides.length <= 1 ? '#334155' : 'rgba(239, 68, 68, 0.3)'}`,
                    borderRadius: '5px',
                    color: slides.length <= 1 ? '#475569' : '#f87171',
                    fontSize: '11px',
                    cursor: slides.length <= 1 ? 'not-allowed' : 'pointer',
                  }}
                >
                  <Trash2 size={12} /> Delete
                </button>
              </div>
            </div>

            {/* Slide Title / Header input */}
            <div>
              <label
                style={{
                  fontSize: '11px',
                  fontWeight: 600,
                  color: '#94a3b8',
                  textTransform: 'uppercase',
                  display: 'block',
                  marginBottom: '4px',
                }}
              >
                Slide Header / Subtitle (Optional)
              </label>
              <input
                type="text"
                value={activeSlide.title}
                onChange={(e) => handleUpdateActiveSlide('title', e.target.value)}
                placeholder="e.g. Point 1: Living by Faith or Sunday Morning 10:00 AM"
                style={{
                  width: '100%',
                  padding: '8px 10px',
                  backgroundColor: '#1e293b',
                  border: '1px solid #334155',
                  borderRadius: '6px',
                  color: '#f8fafc',
                  fontSize: '13px',
                }}
              />
            </div>

            {/* Slide Body Content */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <label
                  style={{
                    fontSize: '11px',
                    fontWeight: 600,
                    color: '#94a3b8',
                    textTransform: 'uppercase',
                  }}
                >
                  Slide Content *
                </label>
                <span
                  style={{
                    fontSize: '11px',
                    color: isOverflowRisk ? '#f59e0b' : '#64748b',
                  }}
                >
                  {charCount} / 300 safe chars · {lineCount} lines
                </span>
              </div>
              <textarea
                value={activeSlide.body}
                onChange={(e) => handleUpdateActiveSlide('body', e.target.value)}
                rows={5}
                placeholder="Type slide text here. Tamil and English Unicode characters are fully supported..."
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  backgroundColor: '#1e293b',
                  border: `1px solid ${isOverflowRisk ? '#f59e0b' : '#334155'}`,
                  borderRadius: '6px',
                  color: '#f8fafc',
                  fontSize: '13px',
                  lineHeight: '1.5',
                  fontFamily: 'inherit',
                  resize: 'vertical',
                }}
              />
              {isOverflowRisk && (
                <div
                  style={{
                    fontSize: '11px',
                    color: '#f59e0b',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    marginTop: '2px',
                  }}
                >
                  <AlertTriangle size={12} />
                  Safe text recommendation: Keep under 300 characters to prevent overflow on lower resolution projector displays.
                </div>
              )}
            </div>

            {/* Background Image override if image slide */}
            {itemType === 'image' && (
              <div>
                <label
                  style={{
                    fontSize: '11px',
                    fontWeight: 600,
                    color: '#94a3b8',
                    textTransform: 'uppercase',
                    display: 'block',
                    marginBottom: '4px',
                  }}
                >
                  Local Image Path or URL
                </label>
                <input
                  type="text"
                  value={activeSlide.backgroundImage || ''}
                  onChange={(e) => handleUpdateActiveSlide('backgroundImage', e.target.value || null)}
                  placeholder="/path/to/slide-background.jpg or https://..."
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    backgroundColor: '#1e293b',
                    border: '1px solid #334155',
                    borderRadius: '6px',
                    color: '#f8fafc',
                    fontSize: '12px',
                  }}
                />
              </div>
            )}

            {/* Live 16:9 Slide Preview */}
            <div style={{ marginTop: '4px' }}>
              <label
                style={{
                  fontSize: '11px',
                  fontWeight: 600,
                  color: '#94a3b8',
                  textTransform: 'uppercase',
                  display: 'block',
                  marginBottom: '6px',
                }}
              >
                Projector Preview (16:9 Output Aspect Ratio)
              </label>
              <div
                style={{
                  aspectRatio: '16 / 9',
                  width: '100%',
                  maxHeight: '260px',
                  backgroundColor: currentTheme.backgroundColor || '#0f172a',
                  color: currentTheme.textColor || '#ffffff',
                  backgroundImage: activeSlide.backgroundImage
                    ? backgroundImageCss(activeSlide.backgroundImage)
                    : currentTheme.backgroundImagePath
                    ? backgroundImageCss(currentTheme.backgroundImagePath)
                    : undefined,
                  backgroundSize: 'cover',
                  backgroundPosition: 'center',
                  borderRadius: '8px',
                  border: '1px solid #334155',
                  padding: '24px 32px',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'center',
                  alignItems:
                    currentTheme.textAlignment === 'left'
                      ? 'flex-start'
                      : currentTheme.textAlignment === 'right'
                      ? 'flex-end'
                      : 'center',
                  textAlign: (currentTheme.textAlignment as any) || 'center',
                  position: 'relative',
                  overflow: 'hidden',
                  boxShadow: 'inset 0 0 40px rgba(0,0,0,0.6)',
                }}
              >
                {/* Dim overlay if defined */}
                {currentTheme.overlayColor && (
                  <div
                    style={{
                      position: 'absolute',
                      inset: 0,
                      backgroundColor: currentTheme.overlayColor,
                      zIndex: 1,
                    }}
                  />
                )}
                <div style={{ position: 'relative', zIndex: 2, width: '100%' }}>
                  {activeSlide.title && (
                    <div
                      style={{
                        fontSize: '14px',
                        fontWeight: 700,
                        letterSpacing: '0.05em',
                        textTransform: 'uppercase',
                        opacity: 0.8,
                        marginBottom: '8px',
                      }}
                    >
                      {activeSlide.title}
                    </div>
                  )}
                  <div
                    style={{
                      fontSize:
                        currentTheme.fontSize === 'xlarge'
                          ? '22px'
                          : currentTheme.fontSize === 'large'
                          ? '18px'
                          : currentTheme.fontSize === 'medium'
                          ? '16px'
                          : '14px',
                      fontWeight: 600,
                      lineHeight: currentTheme.lineSpacing || 1.3,
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                      textShadow: currentTheme.textShadow || '0 2px 4px rgba(0,0,0,0.8)',
                    }}
                  >
                    {activeSlide.body || '(Empty slide text)'}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div
          style={{
            padding: '14px 20px',
            borderTop: '1px solid #1e293b',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            backgroundColor: '#1e293b',
          }}
        >
          {error ? (
            <div
              style={{
                fontSize: '12px',
                color: '#ef4444',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <AlertTriangle size={14} /> {error}
            </div>
          ) : (
            <div style={{ fontSize: '11px', color: '#64748b' }}>
              Changes snapshot locally for this service without modifying other presentations.
            </div>
          )}

          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              style={{
                padding: '7px 14px',
                backgroundColor: 'transparent',
                border: '1px solid #475569',
                borderRadius: '6px',
                color: '#cbd5e1',
                fontSize: '12px',
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving}
              style={{
                padding: '7px 18px',
                backgroundColor: '#2563eb',
                border: 'none',
                borderRadius: '6px',
                color: '#ffffff',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <Check size={14} /> {isSaving ? 'Saving...' : 'Save to Service'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
