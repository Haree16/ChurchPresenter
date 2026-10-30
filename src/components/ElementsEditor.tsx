import React, { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, Image as ImageIcon, RotateCw, Square, Trash2, Type } from 'lucide-react';
import { api } from '../services/api';
import { MediaAsset, SlideElement } from '../types';
import {
  MAX_ELEMENTS,
  MAX_ELEMENT_FONT_PCT,
  MAX_ELEMENT_TEXT_CHARS,
  clampElement,
  createElement,
} from '../services/slideElements';

interface ElementsEditorProps {
  elements: SlideElement[];
  onChange: (next: SlideElement[]) => void;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}

const field: React.CSSProperties = {
  padding: '4px 6px',
  backgroundColor: '#1e293b',
  border: '1px solid #334155',
  borderRadius: '6px',
  color: '#f8fafc',
  fontSize: '12px',
  minWidth: 0,
  width: '100%',
  boxSizing: 'border-box',
};
const label: React.CSSProperties = { fontSize: '11px', fontWeight: 600, color: '#94a3b8', display: 'flex', flexDirection: 'column', gap: '3px' };
const smallButton: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '4px',
  padding: '3px 8px',
  borderRadius: '6px',
  border: '1px solid #334155',
  backgroundColor: '#1e293b',
  color: '#cbd5e1',
  fontSize: '11px',
  fontWeight: 600,
  cursor: 'pointer',
};

const KIND_LABEL: Record<SlideElement['kind'], string> = { text: 'Text', image: 'Image', shape: 'Shape' };

function summary(el: SlideElement): string {
  if (el.kind === 'text') return (el.text || '').split('\n')[0].slice(0, 24) || 'Text';
  if (el.kind === 'image') return (el.imagePath || 'No image').split('/').pop() || 'Image';
  return el.shape === 'ellipse' ? 'Ellipse' : 'Rectangle';
}

/** Add, arrange and edit the extra text boxes, images and shapes on a slide. */
export const ElementsEditor: React.FC<ElementsEditorProps> = ({ elements, onChange, selectedId, onSelect }) => {
  const [images, setImages] = useState<MediaAsset[]>([]);
  const selected = elements.find((e) => e.id === selectedId) || null;
  const index = selected ? elements.indexOf(selected) : -1;

  useEffect(() => {
    let cancelled = false;
    api
      .listMediaAssets()
      .then((assets) => {
        if (!cancelled) setImages(assets.filter((a) => a.mediaType === 'image'));
      })
      .catch(() => {
        if (!cancelled) setImages([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const add = (kind: SlideElement['kind']) => {
    if (elements.length >= MAX_ELEMENTS) return;
    const el = createElement(kind, kind === 'image' ? images[0]?.relativePath : undefined);
    onChange([...elements, el]);
    onSelect(el.id);
  };

  const update = (patch: Partial<SlideElement>) => {
    if (!selected) return;
    onChange(elements.map((e) => (e.id === selected.id ? clampElement({ ...e, ...patch }) : e)));
  };

  const move = (dir: -1 | 1) => {
    const to = index + dir;
    if (index < 0 || to < 0 || to >= elements.length) return;
    const next = [...elements];
    [next[index], next[to]] = [next[to], next[index]];
    onChange(next);
  };

  const remove = () => {
    if (!selected) return;
    onChange(elements.filter((e) => e.id !== selected.id));
    onSelect(null);
  };

  const num = (key: 'x' | 'y' | 'w' | 'h', testId: string, text: string) => (
    <label style={label}>
      {text}
      <input
        data-testid={testId}
        type="number"
        min={0}
        max={100}
        step={1}
        value={selected ? Math.round((selected[key] as number) * 10) / 10 : 0}
        onChange={(e) => update({ [key]: Number(e.target.value) } as Partial<SlideElement>)}
        style={field}
      />
    </label>
  );

  return (
    <div data-testid="elements-editor" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
        <span style={{ fontSize: '12px', fontWeight: 700, color: '#94a3b8', marginRight: 'auto' }}>
          EXTRA ELEMENTS ({elements.length}/{MAX_ELEMENTS})
        </span>
        <button type="button" data-testid="add-text-element" style={smallButton} onClick={() => add('text')} disabled={elements.length >= MAX_ELEMENTS}>
          <Type size={11} /> Text
        </button>
        <button type="button" data-testid="add-image-element" style={smallButton} onClick={() => add('image')} disabled={elements.length >= MAX_ELEMENTS}>
          <ImageIcon size={11} /> Image
        </button>
        <button type="button" data-testid="add-shape-element" style={smallButton} onClick={() => add('shape')} disabled={elements.length >= MAX_ELEMENTS}>
          <Square size={11} /> Shape
        </button>
      </div>

      {elements.length === 0 ? (
        <div style={{ fontSize: '11px', color: '#64748b' }}>
          None. Add a text box, an image such as a logo, or a shape. Drag them in the preview.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
          {elements.map((el, i) => (
            <button
              key={el.id}
              type="button"
              data-testid="element-row"
              aria-pressed={el.id === selectedId}
              onClick={() => onSelect(el.id)}
              style={{
                ...smallButton,
                justifyContent: 'flex-start',
                backgroundColor: el.id === selectedId ? '#1e3a5f' : '#1e293b',
                borderColor: el.id === selectedId ? '#38bdf8' : '#334155',
              }}
            >
              <span style={{ color: '#64748b', width: '16px' }}>{i + 1}</span>
              <strong>{KIND_LABEL[el.kind]}</strong>
              <span style={{ color: '#94a3b8', overflow: 'hidden', textOverflow: 'ellipsis' }}>{summary(el)}</span>
            </button>
          ))}
        </div>
      )}

      {selected && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '10px', backgroundColor: '#0b1220', border: '1px solid #1e293b', borderRadius: '8px' }}>
          <div style={{ display: 'flex', gap: '6px' }}>
            <button type="button" data-testid="element-back" style={smallButton} onClick={() => move(-1)} disabled={index <= 0} aria-label="Send back one step">
              <ArrowDown size={11} /> Back
            </button>
            <button type="button" data-testid="element-forward" style={smallButton} onClick={() => move(1)} disabled={index >= elements.length - 1} aria-label="Bring forward one step">
              <ArrowUp size={11} /> Forward
            </button>
            <button type="button" data-testid="element-delete" style={{ ...smallButton, color: '#fca5a5', marginLeft: 'auto' }} onClick={remove}>
              <Trash2 size={11} /> Delete
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px' }}>
            {num('x', 'element-x', 'X %')}
            {num('y', 'element-y', 'Y %')}
            {num('w', 'element-w', 'Width %')}
            {num('h', 'element-h', 'Height %')}
          </div>

          <label style={label}>
            Opacity ({Math.round((selected.opacity ?? 1) * 100)}%)
            <input
              data-testid="element-opacity"
              type="range"
              min={0}
              max={100}
              value={Math.round((selected.opacity ?? 1) * 100)}
              onChange={(e) => update({ opacity: Number(e.target.value) / 100 })}
            />
          </label>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <label style={{ ...label, flex: 1 }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <RotateCw size={11} /> Rotation ({Math.round(selected.rotation || 0)}°)
              </span>
              <input
                data-testid="element-rotation"
                type="number"
                min={-180}
                max={180}
                step={1}
                value={Math.round(selected.rotation || 0)}
                onChange={(e) => update({ rotation: Number(e.target.value) })}
                style={field}
              />
            </label>
            <div style={{ display: 'flex', gap: '4px', alignSelf: 'flex-end' }}>
              <button
                type="button"
                data-testid="element-rotate-0"
                style={{ ...smallButton, padding: '4px 6px' }}
                title="Reset rotation to 0°"
                onClick={() => update({ rotation: 0 })}
              >
                0°
              </button>
              <button
                type="button"
                data-testid="element-rotate-90"
                style={{ ...smallButton, padding: '4px 6px' }}
                title="Rotate +90°"
                onClick={() => update({ rotation: ((selected.rotation || 0) + 90) % 360 })}
              >
                +90°
              </button>
            </div>
          </div>

          {selected.kind === 'text' && (
            <>
              <label style={label}>
                Text
                <textarea
                  data-testid="element-text"
                  rows={2}
                  maxLength={MAX_ELEMENT_TEXT_CHARS}
                  value={selected.text || ''}
                  onChange={(e) => update({ text: e.target.value })}
                  style={{ ...field, fontFamily: 'inherit', resize: 'vertical' }}
                />
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '6px', alignItems: 'end' }}>
                <label style={label}>
                  Size %
                  <input
                    data-testid="element-font-size"
                    type="number"
                    min={1}
                    max={MAX_ELEMENT_FONT_PCT}
                    value={selected.fontSizePct ?? 8}
                    onChange={(e) => update({ fontSizePct: Number(e.target.value) })}
                    style={field}
                  />
                </label>
                <label style={label}>
                  Align
                  <select data-testid="element-align" value={selected.align ?? 'center'} onChange={(e) => update({ align: e.target.value as SlideElement['align'] })} style={field}>
                    <option value="left">Left</option>
                    <option value="center">Center</option>
                    <option value="right">Right</option>
                  </select>
                </label>
                <label style={label}>
                  Weight
                  <select data-testid="element-weight" value={selected.weight ?? 'bold'} onChange={(e) => update({ weight: e.target.value as SlideElement['weight'] })} style={field}>
                    <option value="normal">Normal</option>
                    <option value="bold">Bold</option>
                  </select>
                </label>
                <label style={label}>
                  Colour
                  <input data-testid="element-color" type="color" value={selected.color ?? '#ffffff'} onChange={(e) => update({ color: e.target.value })} style={{ ...field, padding: 0, height: '26px' }} />
                </label>
              </div>
              <label style={{ ...label, flexDirection: 'row', alignItems: 'center', gap: '6px' }}>
                <input
                  data-testid="element-backing"
                  type="checkbox"
                  checked={!!selected.fill}
                  onChange={(e) => update({ fill: e.target.checked ? '#000000' : null })}
                />
                Backing box
                {selected.fill && (
                  <input data-testid="element-fill" type="color" value={selected.fill} onChange={(e) => update({ fill: e.target.value })} />
                )}
              </label>
            </>
          )}

          {selected.kind === 'image' && (
            <label style={label}>
              Image (from the media library)
              <select
                data-testid="element-image"
                value={selected.imagePath ?? ''}
                onChange={(e) => update({ imagePath: e.target.value })}
                style={field}
              >
                <option value="">Choose an image…</option>
                {selected.imagePath && !images.some((a) => a.relativePath === selected.imagePath) && (
                  <option value={selected.imagePath}>{summary(selected)}</option>
                )}
                {images.map((a) => (
                  <option key={a.id} value={a.relativePath}>
                    {a.originalFilename}
                  </option>
                ))}
              </select>
            </label>
          )}

          {selected.kind === 'shape' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
              <label style={label}>
                Shape
                <select data-testid="element-shape" value={selected.shape ?? 'rect'} onChange={(e) => update({ shape: e.target.value as SlideElement['shape'] })} style={field}>
                  <option value="rect">Rectangle</option>
                  <option value="ellipse">Ellipse</option>
                </select>
              </label>
              <label style={label}>
                Fill
                <input data-testid="element-fill" type="color" value={selected.fill ?? '#3b82f6'} onChange={(e) => update({ fill: e.target.value })} style={{ ...field, padding: 0, height: '26px' }} />
              </label>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
