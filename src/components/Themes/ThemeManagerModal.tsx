import React, { useState, useEffect } from 'react';
import {
  X,
  Palette,
  Plus,
  Trash2,
  Copy,
  Check,
  Shield,
} from 'lucide-react';
import { Theme, FontSize, TextAlignment } from '../../types';
import { api } from '../../services/api';
import { mediaService } from '../../services/mediaService';
import { ThemeTransferBar } from './ThemeTransferBar';
import { ThemeBackgroundControl } from './ThemeBackgroundControl';
import { LayoutControls, layoutValuesFrom } from '../LayoutControls';
import { buildLayout, composeTextShadow, layoutPaddingPercent } from '../../services/slideLayout';

interface ThemeManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onThemeUpdated?: () => void;
}

export const ThemeManagerModal: React.FC<ThemeManagerModalProps> = ({
  isOpen,
  onClose,
  onThemeUpdated,
}) => {
  const [themes, setThemes] = useState<Theme[]>([]);
  const [selectedThemeId, setSelectedThemeId] = useState<string | null>(null);
  const [activeTheme, setActiveTheme] = useState<Theme | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [previewSample, setPreviewSample] = useState<'bilingual' | 'tamil' | 'english'>('bilingual');
  const [notification, setNotification] = useState<string | null>(null);

  const refreshThemes = async () => {
    try {
      const list = await api.listThemes();
      setThemes(list);
      if (list.length > 0 && !selectedThemeId) {
        setSelectedThemeId(list[0].id);
        setActiveTheme(list[0]);
      } else if (selectedThemeId) {
        const found = list.find((t) => t.id === selectedThemeId);
        if (found) setActiveTheme(found);
      }
    } catch (err) {
      console.error('Failed to load themes:', err);
    }
  };

  useEffect(() => {
    if (isOpen) {
      refreshThemes();
    }
  }, [isOpen]);

  const handleSelectTheme = (theme: Theme) => {
    setSelectedThemeId(theme.id);
    setActiveTheme({ ...theme });
  };

  const handleCreateTheme = async () => {
    try {
      const newTheme = await api.createTheme({
        name: `Custom Theme ${themes.length + 1}`,
        backgroundColor: '#0a0f1d',
        fontFamily:
          'system-ui, -apple-system, "Noto Sans Tamil", "Latha", sans-serif',
        fontSize: 'large',
        fontWeight: 'bold',
        textColor: '#ffffff',
        textAlignment: 'center',
        verticalAlignment: 'center',
        lineSpacing: 1.4,
        textMargin: 40,
        textShadow: '0 2px 8px rgba(0,0,0,0.8)',
        overlayColor: 'rgba(0,0,0,0.25)',
      });
      await refreshThemes();
      handleSelectTheme(newTheme);
      showNotification('New theme created');
    } catch (err) {
      console.error('Failed to create theme:', err);
    }
  };

  const handleDuplicateTheme = async (id: string) => {
    try {
      const duplicated = await api.duplicateTheme(id);
      await refreshThemes();
      handleSelectTheme(duplicated);
      showNotification('Theme duplicated');
    } catch (err) {
      console.error('Failed to duplicate theme:', err);
    }
  };

  const handleDeleteTheme = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this custom theme?')) return;
    try {
      await api.deleteTheme(id);
      await refreshThemes();
      showNotification('Theme deleted');
    } catch (err: any) {
      alert(err?.message || 'Cannot delete theme');
    }
  };

  const handleSaveTheme = async () => {
    if (!activeTheme) return;
    setIsSaving(true);
    try {
      await api.updateTheme(activeTheme);
      await refreshThemes();
      showNotification('Theme saved successfully');
      if (onThemeUpdated) onThemeUpdated();
    } catch (err: any) {
      alert(err?.message || 'Failed to update theme');
    } finally {
      setIsSaving(false);
    }
  };

  const showNotification = (msg: string) => {
    setNotification(msg);
    setTimeout(() => setNotification(null), 3000);
  };

  if (!isOpen) return null;

  const sampleTexts = {
    bilingual: 'எந்தன் கண்மலையானவரே\nஎன் கோட்டையும் என் இரட்சகரும்\nYou are my rock and my fortress\nMy deliverer in whom I take refuge',
    tamil: 'கர்த்தரே என் மேய்ப்பராய் இருக்கிறார்\nநான் தாழ்ச்சியடையேன்\nபுல்லுள்ள இடங்களில் என்னை மேய்த்து\nஅமர்ந்த தண்ணீர்கள் அண்டையில் நடத்துகிறார்',
    english: 'The Lord is my shepherd; I shall not want.\nHe makes me lie down in green pastures.\nHe leads me beside still waters.\nHe restores my soul.',
  };

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
          width: '1000px',
          maxWidth: '96vw',
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
        {/* Header */}
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
                backgroundColor: 'rgba(234, 179, 8, 0.15)',
                color: '#eab308',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Palette size={18} />
            </div>
            <div>
              <div style={{ fontSize: '16px', fontWeight: 700, color: '#f8fafc' }}>
                Presentation Themes & Typography
              </div>
              <div style={{ fontSize: '12px', color: '#94a3b8' }}>
                Configure high-contrast projection themes with Tamil Unicode font fallbacks
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

        {/* Content Layout - 2 Columns */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '260px 1fr',
            flex: 1,
            overflowY: 'auto',
          }}
        >
          {/* Left: Themes List */}
          <div
            style={{
              padding: '16px',
              borderRight: '1px solid #1e293b',
              backgroundColor: '#060a12',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
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
              <span style={{ fontSize: '12px', fontWeight: 700, color: '#94a3b8' }}>
                THEMES ({themes.length})
              </span>
              <button
                type="button"
                onClick={handleCreateTheme}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '4px 8px',
                  borderRadius: '4px',
                  backgroundColor: '#1e293b',
                  color: '#38bdf8',
                  fontSize: '11px',
                  fontWeight: 600,
                  border: '1px solid #334155',
                }}
              >
                <Plus size={12} /> New
              </button>
            </div>

            <ThemeTransferBar
              selectedTheme={activeTheme}
              customThemes={themes.filter((t) => !t.isBuiltIn)}
              onImported={async (imported) => {
                await refreshThemes();
                if (imported[0]) handleSelectTheme(imported[0]);
                if (onThemeUpdated) onThemeUpdated();
              }}
            />

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {themes.map((t) => {
                const isSelected = selectedThemeId === t.id;
                return (
                  <div
                    key={t.id}
                    onClick={() => handleSelectTheme(t)}
                    style={{
                      padding: '10px 12px',
                      borderRadius: '8px',
                      backgroundColor: isSelected ? '#1e293b' : '#0f172a',
                      border: `1px solid ${isSelected ? '#3b82f6' : '#1e293b'}`,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <div>
                      <div
                        style={{
                          fontSize: '13px',
                          fontWeight: 600,
                          color: isSelected ? '#60a5fa' : '#f8fafc',
                        }}
                      >
                        {t.name}
                      </div>
                      <div
                        style={{
                          fontSize: '10px',
                          color: '#64748b',
                          marginTop: '2px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                        }}
                      >
                        {t.isBuiltIn ? (
                          <span
                            style={{
                              color: '#34d399',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '2px',
                            }}
                          >
                            <Shield size={10} /> Built-in
                          </span>
                        ) : (
                          <span>Custom</span>
                        )}
                        <span>•</span>
                        <span>{t.fontSize}</span>
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDuplicateTheme(t.id);
                        }}
                        title="Duplicate Theme"
                        style={{
                          padding: '4px',
                          color: '#94a3b8',
                          borderRadius: '4px',
                        }}
                      >
                        <Copy size={13} />
                      </button>
                      {!t.isBuiltIn && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteTheme(t.id);
                          }}
                          title="Delete Custom Theme"
                          style={{
                            padding: '4px',
                            color: '#f87171',
                            borderRadius: '4px',
                          }}
                        >
                          <Trash2 size={13} />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right: Theme Editor & Live 16:9 Preview */}
          {activeTheme ? (
            <div
              style={{
                display: 'grid',
                gridTemplateRows: 'auto 1fr',
                overflowY: 'auto',
              }}
            >
              {/* Top: 16:9 Live Preview Box */}
              <div
                style={{
                  padding: '20px',
                  backgroundColor: '#090d16',
                  borderBottom: '1px solid #1e293b',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <span style={{ fontSize: '12px', fontWeight: 700, color: '#94a3b8' }}>
                    LIVE 16:9 PROJECTION PREVIEW
                  </span>

                  {/* Sample Switcher */}
                  <div style={{ display: 'flex', gap: '6px' }}>
                    {(['bilingual', 'tamil', 'english'] as const).map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setPreviewSample(s)}
                        style={{
                          padding: '2px 8px',
                          borderRadius: '4px',
                          fontSize: '11px',
                          fontWeight: 600,
                          backgroundColor:
                            previewSample === s ? '#3b82f6' : '#1e293b',
                          color: previewSample === s ? '#ffffff' : '#94a3b8',
                        }}
                      >
                        {s.charAt(0).toUpperCase() + s.slice(1)}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 16:9 Preview Canvas */}
                <div
                  style={{
                    width: '100%',
                    maxHeight: '260px',
                    aspectRatio: '16 / 9',
                    backgroundColor: activeTheme.backgroundColor,
                    backgroundImage: activeTheme.backgroundImagePath
                      ? `url("${mediaService.resolveMediaUrl(activeTheme.backgroundImagePath)}")`
                      : undefined,
                    backgroundSize:
                      activeTheme.backgroundMode === 'stretch' ? '100% 100%' : activeTheme.backgroundMode || 'cover',
                    backgroundPosition: 'center',
                    position: 'relative',
                    borderRadius: '8px',
                    border: '1px solid #334155',
                    overflow: 'hidden',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent:
                      activeTheme.verticalAlignment === 'top'
                        ? 'flex-start'
                        : activeTheme.verticalAlignment === 'bottom'
                        ? 'flex-end'
                        : 'center',
                    alignItems:
                      activeTheme.textAlignment === 'left'
                        ? 'flex-start'
                        : activeTheme.textAlignment === 'right'
                        ? 'flex-end'
                        : 'center',
                    padding: layoutPaddingPercent(activeTheme.layout) ?? `${activeTheme.textMargin || 24}px`,
                    boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
                  }}
                >
                  {/* Overlay */}
                  {activeTheme.overlayColor && (
                    <div
                      style={{
                        position: 'absolute',
                        inset: 0,
                        backgroundColor: activeTheme.overlayColor,
                        pointerEvents: 'none',
                      }}
                    />
                  )}

                  <div
                    className="multilingual-text"
                    style={{
                      position: 'relative',
                      zIndex: 1,
                      color: activeTheme.textColor,
                      fontSize:
                        activeTheme.fontSize === 'xlarge'
                          ? '22px'
                          : activeTheme.fontSize === 'large'
                          ? '18px'
                          : activeTheme.fontSize === 'medium'
                          ? '15px'
                          : '13px',
                      fontWeight: activeTheme.fontWeight === 'bold' ? 700 : 500,
                      textAlign: activeTheme.textAlignment,
                      lineHeight: activeTheme.lineSpacing || 1.4,
                      textShadow: composeTextShadow(
                        activeTheme.layout,
                        activeTheme.textShadow || '0 2px 8px rgba(0,0,0,0.7)'
                      ),
                      width: '100%',
                    }}
                  >
                    {sampleTexts[previewSample]}
                  </div>
                </div>
              </div>

              {/* Bottom: Theme Property Controls Form */}
              <div
                style={{
                  padding: '20px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '16px',
                  overflowY: 'auto',
                }}
              >
                {/* Safe margin and text outline (copied onto slides made with this theme) */}
                <div
                  style={{
                    padding: '12px',
                    backgroundColor: '#0f172a',
                    border: '1px solid #1e293b',
                    borderRadius: '8px',
                    opacity: activeTheme.isBuiltIn ? 0.6 : 1,
                    pointerEvents: activeTheme.isBuiltIn ? 'none' : 'auto',
                  }}
                >
                  <div style={{ fontSize: '12px', fontWeight: 700, color: '#94a3b8', marginBottom: '8px' }}>
                    SAFE MARGIN &amp; OUTLINE
                  </div>
                  <LayoutControls
                    values={layoutValuesFrom(activeTheme.layout)}
                    onChange={(v) =>
                      setActiveTheme({
                        ...activeTheme,
                        // keep any elements the theme already carries (e.g. from an imported file)
                        layout: buildLayout(v.marginPct, v.outlineWidth, v.outlineColor, activeTheme.layout?.elements),
                      })
                    }
                  />
                </div>

                {/* Background image from the media library (travels with the theme when exported) */}
                <ThemeBackgroundControl
                  theme={activeTheme}
                  onChange={(patch) => setActiveTheme({ ...activeTheme, ...patch })}
                />

                {/* Theme Name */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#94a3b8', marginBottom: '6px' }}>
                      Theme Name
                    </label>
                    <input
                      type="text"
                      disabled={activeTheme.isBuiltIn}
                      value={activeTheme.name}
                      onChange={(e) =>
                        setActiveTheme({ ...activeTheme, name: e.target.value })
                      }
                      style={{
                        width: '100%',
                        backgroundColor: '#0f172a',
                        border: '1px solid #1e293b',
                        borderRadius: '6px',
                        color: '#f8fafc',
                        padding: '6px 10px',
                        fontSize: '13px',
                      }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#94a3b8', marginBottom: '6px' }}>
                      Background Solid Color
                    </label>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                      <input
                        type="color"
                        disabled={activeTheme.isBuiltIn}
                        value={activeTheme.backgroundColor}
                        onChange={(e) =>
                          setActiveTheme({
                            ...activeTheme,
                            backgroundColor: e.target.value,
                          })
                        }
                        style={{
                          width: '36px',
                          height: '32px',
                          borderRadius: '4px',
                          border: 'none',
                          cursor: 'pointer',
                        }}
                      />
                      <input
                        type="text"
                        disabled={activeTheme.isBuiltIn}
                        value={activeTheme.backgroundColor}
                        onChange={(e) =>
                          setActiveTheme({
                            ...activeTheme,
                            backgroundColor: e.target.value,
                          })
                        }
                        style={{
                          flex: 1,
                          backgroundColor: '#0f172a',
                          border: '1px solid #1e293b',
                          borderRadius: '6px',
                          color: '#f8fafc',
                          padding: '6px 10px',
                          fontSize: '13px',
                        }}
                      />
                    </div>
                  </div>
                </div>

                {/* Style & Layout Presets */}
                {!activeTheme.isBuiltIn && (
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#94a3b8', marginBottom: '6px' }}>
                      Layout & Style Presets
                    </label>
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        onClick={() => {
                          setActiveTheme({
                            ...activeTheme,
                            verticalAlignment: 'center',
                            textAlignment: 'center',
                            textMargin: 40,
                            textShadow: '0 2px 8px rgba(0,0,0,0.8)',
                          });
                        }}
                        style={{
                          padding: '5px 10px',
                          borderRadius: '6px',
                          backgroundColor: '#1e293b',
                          border: '1px solid #334155',
                          color: '#cbd5e1',
                          fontSize: '11px',
                          fontWeight: 600,
                          cursor: 'pointer',
                        }}
                      >
                        Full Screen Center
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setActiveTheme({
                            ...activeTheme,
                            verticalAlignment: 'bottom',
                            textAlignment: 'center',
                            textMargin: 24,
                            textShadow:
                              '0 2px 4px #000, 0 0 2px #000, -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000',
                            overlayColor: 'rgba(0,0,0,0.6)',
                          });
                        }}
                        style={{
                          padding: '5px 10px',
                          borderRadius: '6px',
                          backgroundColor: '#1e293b',
                          border: '1px solid #334155',
                          color: '#38bdf8',
                          fontSize: '11px',
                          fontWeight: 600,
                          cursor: 'pointer',
                        }}
                      >
                        Lower-Third Preset
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setActiveTheme({
                            ...activeTheme,
                            textShadow:
                              '-2px -2px 0 #000, 2px -2px 0 #000, -2px 2px 0 #000, 2px 2px 0 #000, 0 3px 6px rgba(0,0,0,0.9)',
                          });
                        }}
                        style={{
                          padding: '5px 10px',
                          borderRadius: '6px',
                          backgroundColor: '#1e293b',
                          border: '1px solid #334155',
                          color: '#fbbf24',
                          fontSize: '11px',
                          fontWeight: 600,
                          cursor: 'pointer',
                        }}
                      >
                        Sharp Outline Preset
                      </button>
                    </div>
                  </div>
                )}

                {/* Typography Controls */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px' }}>
                  {/* Font Size */}
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#94a3b8', marginBottom: '6px' }}>
                      Font Size
                    </label>
                    <select
                      disabled={activeTheme.isBuiltIn}
                      value={activeTheme.fontSize}
                      onChange={(e) =>
                        setActiveTheme({
                          ...activeTheme,
                          fontSize: e.target.value as FontSize,
                        })
                      }
                      style={{
                        width: '100%',
                        backgroundColor: '#0f172a',
                        border: '1px solid #1e293b',
                        borderRadius: '6px',
                        color: '#f8fafc',
                        padding: '6px 8px',
                        fontSize: '12px',
                      }}
                    >
                      <option value="small">Small</option>
                      <option value="medium">Medium</option>
                      <option value="large">Large (Standard)</option>
                      <option value="xlarge">Extra Large (High Visibility)</option>
                    </select>
                  </div>

                  {/* Horizontal Alignment */}
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#94a3b8', marginBottom: '6px' }}>
                      Horizontal Alignment
                    </label>
                    <select
                      disabled={activeTheme.isBuiltIn}
                      value={activeTheme.textAlignment}
                      onChange={(e) =>
                        setActiveTheme({
                          ...activeTheme,
                          textAlignment: e.target.value as TextAlignment,
                        })
                      }
                      style={{
                        width: '100%',
                        backgroundColor: '#0f172a',
                        border: '1px solid #1e293b',
                        borderRadius: '6px',
                        color: '#f8fafc',
                        padding: '6px 8px',
                        fontSize: '12px',
                      }}
                    >
                      <option value="center">Center</option>
                      <option value="left">Left Aligned</option>
                      <option value="right">Right Aligned</option>
                    </select>
                  </div>

                  {/* Vertical Alignment */}
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#94a3b8', marginBottom: '6px' }}>
                      Vertical Alignment
                    </label>
                    <select
                      disabled={activeTheme.isBuiltIn}
                      value={activeTheme.verticalAlignment}
                      onChange={(e) =>
                        setActiveTheme({
                          ...activeTheme,
                          verticalAlignment: e.target.value as 'top' | 'center' | 'bottom',
                        })
                      }
                      style={{
                        width: '100%',
                        backgroundColor: '#0f172a',
                        border: '1px solid #1e293b',
                        borderRadius: '6px',
                        color: '#f8fafc',
                        padding: '6px 8px',
                        fontSize: '12px',
                      }}
                    >
                      <option value="center">Center (Middle)</option>
                      <option value="top">Top</option>
                      <option value="bottom">Bottom (Lower Third)</option>
                    </select>
                  </div>
                </div>

                {/* Text Color & Line Spacing */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#94a3b8', marginBottom: '6px' }}>
                      Text Foreground Color
                    </label>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                      <input
                        type="color"
                        disabled={activeTheme.isBuiltIn}
                        value={activeTheme.textColor}
                        onChange={(e) =>
                          setActiveTheme({
                            ...activeTheme,
                            textColor: e.target.value,
                          })
                        }
                        style={{
                          width: '36px',
                          height: '32px',
                          borderRadius: '4px',
                          border: 'none',
                          cursor: 'pointer',
                        }}
                      />
                      <input
                        type="text"
                        disabled={activeTheme.isBuiltIn}
                        value={activeTheme.textColor}
                        onChange={(e) =>
                          setActiveTheme({
                            ...activeTheme,
                            textColor: e.target.value,
                          })
                        }
                        style={{
                          flex: 1,
                          backgroundColor: '#0f172a',
                          border: '1px solid #1e293b',
                          borderRadius: '6px',
                          color: '#f8fafc',
                          padding: '6px 10px',
                          fontSize: '13px',
                        }}
                      />
                    </div>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#94a3b8', marginBottom: '6px' }}>
                      Line Spacing ({activeTheme.lineSpacing})
                    </label>
                    <input
                      type="range"
                      min={1.1}
                      max={2.0}
                      step={0.05}
                      disabled={activeTheme.isBuiltIn}
                      value={activeTheme.lineSpacing}
                      onChange={(e) =>
                        setActiveTheme({
                          ...activeTheme,
                          lineSpacing: parseFloat(e.target.value),
                        })
                      }
                      style={{ width: '100%', accentColor: '#3b82f6' }}
                    />
                  </div>
                </div>

                {/* Dark Overlay & Text Shadow */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#94a3b8', marginBottom: '6px' }}>
                      Background Dark Overlay Scrim
                    </label>
                    <input
                      type="text"
                      disabled={activeTheme.isBuiltIn}
                      value={activeTheme.overlayColor || ''}
                      placeholder="e.g. rgba(0, 0, 0, 0.4)"
                      onChange={(e) =>
                        setActiveTheme({
                          ...activeTheme,
                          overlayColor: e.target.value,
                        })
                      }
                      style={{
                        width: '100%',
                        backgroundColor: '#0f172a',
                        border: '1px solid #1e293b',
                        borderRadius: '6px',
                        color: '#f8fafc',
                        padding: '6px 10px',
                        fontSize: '13px',
                      }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#94a3b8', marginBottom: '6px' }}>
                      Text Shadow (Projector Contrast)
                    </label>
                    <input
                      type="text"
                      disabled={activeTheme.isBuiltIn}
                      value={activeTheme.textShadow || ''}
                      placeholder="e.g. 0 2px 8px rgba(0, 0, 0, 0.8)"
                      onChange={(e) =>
                        setActiveTheme({
                          ...activeTheme,
                          textShadow: e.target.value,
                        })
                      }
                      style={{
                        width: '100%',
                        backgroundColor: '#0f172a',
                        border: '1px solid #1e293b',
                        borderRadius: '6px',
                        color: '#f8fafc',
                        padding: '6px 10px',
                        fontSize: '13px',
                      }}
                    />
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#64748b',
                fontSize: '14px',
              }}
            >
              Select a theme from the left to edit or preview.
            </div>
          )}
        </div>

        {/* Footer */}
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
          <div>
            {notification && (
              <span style={{ fontSize: '12px', color: '#34d399', fontWeight: 600 }}>
                {notification}
              </span>
            )}
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
              Close
            </button>
            {activeTheme && !activeTheme.isBuiltIn && (
              <button
                type="button"
                disabled={isSaving}
                onClick={handleSaveTheme}
                style={{
                  padding: '8px 20px',
                  borderRadius: '6px',
                  backgroundColor: '#2563eb',
                  color: '#ffffff',
                  fontSize: '13px',
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <Check size={15} />
                {isSaving ? 'Saving...' : 'Save Theme'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
