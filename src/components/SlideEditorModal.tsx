import React, { useState, useEffect } from 'react';
import { X, AlignLeft, AlignCenter, AlignRight } from 'lucide-react';
import { Slide, FontSize, TextAlignment } from '../types';
import { LayoutControls, LayoutValues, layoutValuesFrom } from './LayoutControls';
import { buildLayout, composeTextShadow, layoutPaddingPercent } from '../services/slideLayout';

interface SlideEditorModalProps {
  slide: Slide | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (id: string, updated: Partial<Slide>) => Promise<Slide | null>;
}

export const SlideEditorModal: React.FC<SlideEditorModalProps> = ({
  slide,
  isOpen,
  onClose,
  onSave,
}) => {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [backgroundColor, setBackgroundColor] = useState('#0a0f1d');
  const [foregroundColor, setForegroundColor] = useState('#ffffff');
  const [fontSize, setFontSize] = useState<FontSize>('large');
  const [textAlignment, setTextAlignment] = useState<TextAlignment>('center');
  const [layoutValues, setLayoutValues] = useState<LayoutValues>(layoutValuesFrom(null));

  useEffect(() => {
    if (slide) {
      setTitle(slide.title);
      setBody(slide.body);
      setBackgroundColor(slide.backgroundColor || '#0a0f1d');
      setForegroundColor(slide.foregroundColor || '#ffffff');
      setFontSize(slide.fontSize || 'large');
      setTextAlignment(slide.textAlignment || 'center');
      setLayoutValues(layoutValuesFrom(slide.layout));
    }
  }, [slide]);

  if (!isOpen || !slide) return null;

  const bgPresets = [
    { name: 'Navy', hex: '#0a0f1d' },
    { name: 'Pure Black', hex: '#000000' },
    { name: 'Charcoal', hex: '#1e293b' },
    { name: 'Burgundy', hex: '#2d0a15' },
    { name: 'Forest', hex: '#06281e' },
    { name: 'Scripture Gold', hex: '#1a1005' },
  ];

  const fgPresets = [
    { name: 'Pure White', hex: '#ffffff' },
    { name: 'Off-White', hex: '#f1f5f9' },
    { name: 'Gold', hex: '#fef08a' },
    { name: 'Amber', hex: '#fbbf24' },
    { name: 'Cyan', hex: '#38bdf8' },
  ];

  const handleSave = async () => {
    // Send the whole slide: the backend writes every style field, so leaving the ones this editor
    // does not show out would reset them (background image, overlay, line spacing, shadow, font).
    await onSave(slide.id, {
      ...slide,
      title,
      body,
      backgroundColor,
      foregroundColor,
      fontSize,
      textAlignment,
      // an empty layout clears a stored one
      layout: buildLayout(layoutValues.marginPct, layoutValues.outlineWidth, layoutValues.outlineColor),
    });
    onClose();
  };

  const previewLayout = buildLayout(layoutValues.marginPct, layoutValues.outlineWidth, layoutValues.outlineColor);

  const getFontSizeRem = (size: FontSize) => {
    switch (size) {
      case 'small':
        return '14px';
      case 'medium':
        return '18px';
      case 'large':
        return '24px';
      case 'xlarge':
        return '30px';
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.75)',
        backdropFilter: 'blur(3px)',
        zIndex: 50,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: '840px',
          backgroundColor: '#0f172a',
          borderRadius: '12px',
          border: '1px solid #334155',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          maxHeight: '90vh',
        }}
      >
        {/* Modal Header */}
        <div
          style={{
            padding: '14px 20px',
            backgroundColor: '#090d16',
            borderBottom: '1px solid #1e293b',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ fontWeight: 700, fontSize: '16px', color: '#f8fafc' }}>
            Edit Slide #{slide.sortOrder + 1}
          </div>
          <button onClick={onClose} style={{ color: '#94a3b8', padding: '4px' }}>
            <X size={18} />
          </button>
        </div>

        {/* Modal Body: Editor on Left, Live Preview on Right */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 340px',
            gap: '20px',
            padding: '20px',
            overflowY: 'auto',
          }}
        >
          {/* Left: Input Controls */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: '12px',
                  fontWeight: 600,
                  color: '#94a3b8',
                  marginBottom: '6px',
                }}
              >
                Slide Title / Section Name
              </label>
              <input
                type="text"
                placeholder="e.g. Verse 1, Chorus, Bridge, Scripture"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: '6px',
                  backgroundColor: '#1e293b',
                  border: '1px solid #334155',
                  color: '#ffffff',
                  fontSize: '13px',
                }}
              />
            </div>

            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: '12px',
                  fontWeight: 600,
                  color: '#94a3b8',
                  marginBottom: '6px',
                }}
              >
                Slide Content (Lyrics / Scripture / Tamil Unicode)
              </label>
              <textarea
                rows={6}
                placeholder="Type slide lyrics or verse text here..."
                value={body}
                onChange={(e) => setBody(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  borderRadius: '6px',
                  backgroundColor: '#1e293b',
                  border: '1px solid #334155',
                  color: '#ffffff',
                  fontSize: '14px',
                  fontFamily: 'inherit',
                  resize: 'vertical',
                }}
              />
            </div>

            {/* Typography Formatting Controls */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: '12px',
                    fontWeight: 600,
                    color: '#94a3b8',
                    marginBottom: '6px',
                  }}
                >
                  Text Alignment
                </label>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button
                    type="button"
                    onClick={() => setTextAlignment('left')}
                    style={{
                      flex: 1,
                      padding: '6px',
                      borderRadius: '6px',
                      backgroundColor: textAlignment === 'left' ? '#3b82f6' : '#1e293b',
                      border: '1px solid #334155',
                      color: textAlignment === 'left' ? '#ffffff' : '#cbd5e1',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <AlignLeft size={16} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setTextAlignment('center')}
                    style={{
                      flex: 1,
                      padding: '6px',
                      borderRadius: '6px',
                      backgroundColor: textAlignment === 'center' ? '#3b82f6' : '#1e293b',
                      border: '1px solid #334155',
                      color: textAlignment === 'center' ? '#ffffff' : '#cbd5e1',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <AlignCenter size={16} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setTextAlignment('right')}
                    style={{
                      flex: 1,
                      padding: '6px',
                      borderRadius: '6px',
                      backgroundColor: textAlignment === 'right' ? '#3b82f6' : '#1e293b',
                      border: '1px solid #334155',
                      color: textAlignment === 'right' ? '#ffffff' : '#cbd5e1',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <AlignRight size={16} />
                  </button>
                </div>
              </div>

              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: '12px',
                    fontWeight: 600,
                    color: '#94a3b8',
                    marginBottom: '6px',
                  }}
                >
                  Font Size
                </label>
                <div style={{ display: 'flex', gap: '4px' }}>
                  {(['small', 'medium', 'large', 'xlarge'] as FontSize[]).map((size) => (
                    <button
                      key={size}
                      type="button"
                      onClick={() => setFontSize(size)}
                      style={{
                        flex: 1,
                        padding: '6px 2px',
                        borderRadius: '6px',
                        backgroundColor: fontSize === size ? '#3b82f6' : '#1e293b',
                        border: '1px solid #334155',
                        color: fontSize === size ? '#ffffff' : '#cbd5e1',
                        fontSize: '11px',
                        fontWeight: 600,
                        textTransform: 'capitalize',
                      }}
                    >
                      {size.charAt(0).toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Color Controls */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: '12px',
                    fontWeight: 600,
                    color: '#94a3b8',
                    marginBottom: '6px',
                  }}
                >
                  Background Color
                </label>
                <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginBottom: '6px' }}>
                  {bgPresets.map((preset) => (
                    <button
                      key={preset.hex}
                      type="button"
                      onClick={() => setBackgroundColor(preset.hex)}
                      title={preset.name}
                      style={{
                        width: '24px',
                        height: '24px',
                        borderRadius: '4px',
                        backgroundColor: preset.hex,
                        border: backgroundColor === preset.hex ? '2px solid #3b82f6' : '1px solid #475569',
                      }}
                    />
                  ))}
                  <input
                    type="color"
                    value={backgroundColor}
                    onChange={(e) => setBackgroundColor(e.target.value)}
                    style={{
                      width: '24px',
                      height: '24px',
                      padding: 0,
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer',
                    }}
                  />
                </div>
              </div>

              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: '12px',
                    fontWeight: 600,
                    color: '#94a3b8',
                    marginBottom: '6px',
                  }}
                >
                  Text Foreground Color
                </label>
                <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginBottom: '6px' }}>
                  {fgPresets.map((preset) => (
                    <button
                      key={preset.hex}
                      type="button"
                      onClick={() => setForegroundColor(preset.hex)}
                      title={preset.name}
                      style={{
                        width: '24px',
                        height: '24px',
                        borderRadius: '4px',
                        backgroundColor: preset.hex,
                        border: foregroundColor === preset.hex ? '2px solid #3b82f6' : '1px solid #475569',
                      }}
                    />
                  ))}
                  <input
                    type="color"
                    value={foregroundColor}
                    onChange={(e) => setForegroundColor(e.target.value)}
                    style={{
                      width: '24px',
                      height: '24px',
                      padding: 0,
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer',
                    }}
                  />
                </div>
              </div>
            </div>
          </div>


          <div>
            <label
              style={{
                display: 'block',
                fontSize: '12px',
                fontWeight: 600,
                color: '#94a3b8',
                marginBottom: '6px',
              }}
            >
              Audience Preview (16:9)
            </label>
            <div
              style={{
                width: '100%',
                aspectRatio: '16 / 9',
                backgroundColor: backgroundColor,
                color: foregroundColor,
                borderRadius: '8px',
                border: '1px solid #334155',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                alignItems:
                  textAlignment === 'center'
                    ? 'center'
                    : textAlignment === 'right'
                    ? 'flex-end'
                    : 'flex-start',
                padding: layoutPaddingPercent(previewLayout) ?? '16px',
                textAlign: textAlignment,
                overflow: 'hidden',
                boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.3)',
              }}
            >
              <div
                className="multilingual-text"
                style={{
                  fontSize: getFontSizeRem(fontSize),
                  fontWeight: 600,
                  maxHeight: '100%',
                  textShadow: composeTextShadow(previewLayout, null),
                }}
              >
                {body || (
                  <span style={{ color: '#64748b', fontStyle: 'italic', fontSize: '13px' }}>
                    Type lyrics in editor to preview
                  </span>
                )}
              </div>
            </div>
            <div
              style={{
                fontSize: '11px',
                color: '#64748b',
                marginTop: '8px',
                textAlign: 'center',
              }}
            >
              Includes Tamil Unicode support and auto word wrapping
            </div>
            <div style={{ marginTop: '14px', paddingTop: '12px', borderTop: '1px solid #1e293b' }}>
              <LayoutControls values={layoutValues} onChange={setLayoutValues} />
            </div>
          </div>
        </div>

        {/* Modal Actions */}
        <div
          style={{
            padding: '14px 20px',
            backgroundColor: '#090d16',
            borderTop: '1px solid #1e293b',
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '10px',
          }}
        >
          <button
            onClick={onClose}
            style={{
              padding: '8px 16px',
              borderRadius: '6px',
              backgroundColor: '#1e293b',
              color: '#cbd5e1',
              fontSize: '13px',
              fontWeight: 500,
              border: '1px solid #334155',
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            style={{
              padding: '8px 20px',
              borderRadius: '6px',
              backgroundColor: '#2563eb',
              color: '#ffffff',
              fontSize: '13px',
              fontWeight: 600,
            }}
          >
            Save Slide
          </button>
        </div>
      </div>
    </div>
  );
};
