import React, { useLayoutEffect, useRef, useState } from 'react';
import { SlideElement } from '../types';
import { mediaService } from '../services/mediaService';
import { isSafeMediaPath, SnapGuide } from '../services/slideElements';

const HEX = /^#[0-9a-fA-F]{6}$/;
const safeColor = (c: string | null | undefined, fallback: string) => (c && HEX.test(c) ? c : fallback);

export type ResizeHandleType = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'rot';

/** Height of an element in pixels, kept up to date as it resizes. 0 until it is on screen. */
export function useElementHeight(ref: React.RefObject<HTMLElement>): number {
  const [height, setHeight] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setHeight(el.getBoundingClientRect().height);
    measure();
    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(measure);
      observer.observe(el);
      return () => observer.disconnect();
    }
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [ref]);
  return height;
}

interface SlideElementsProps {
  elements: SlideElement[] | null | undefined;
  /** Override the measured slide height (px); used by tests and fixed-size renderers. */
  heightPx?: number;
  /** Highlights and reports clicks on one element; the slide editor uses this. */
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  /** Called on pointer down on an element; the slide editor starts a drag from here. */
  onElementPointerDown?: (id: string, e: React.PointerEvent) => void;
  /** Called on pointer down on a resize or rotate handle. */
  onHandlePointerDown?: (id: string, handle: ResizeHandleType, e: React.PointerEvent) => void;
  /** Active snapping alignment guides to display over the slide. */
  guides?: SnapGuide[];
  interactive?: boolean;
}

/**
 * Draws a slide's extra text boxes, images and shapes. Everything is positioned in percent of the
 * slide, and text size is a percentage of the slide height, so the slide looks the same at any size.
 * Text is plain text and colours must be hex; anything else falls back to a safe default.
 */
export const SlideElements: React.FC<SlideElementsProps> = ({
  elements,
  heightPx,
  selectedId,
  onSelect,
  onElementPointerDown,
  onHandlePointerDown,
  guides,
  interactive = false,
}) => {
  const ref = useRef<HTMLDivElement>(null);
  const measured = useElementHeight(ref);
  const height = heightPx ?? measured;

  if (!elements || elements.length === 0) return null;

  const renderHandles = (el: SlideElement) => {
    if (!interactive || selectedId !== el.id) return null;

    const handleStyle: React.CSSProperties = {
      position: 'absolute',
      width: '8px',
      height: '8px',
      backgroundColor: '#ffffff',
      border: '1px solid #0284c7',
      borderRadius: '2px',
      zIndex: 10,
      pointerEvents: 'auto',
    };

    const handleDefs: { type: ResizeHandleType; style: React.CSSProperties; cursor: string }[] = [
      { type: 'nw', style: { left: '-4px', top: '-4px' }, cursor: 'nwse-resize' },
      { type: 'n', style: { left: 'calc(50% - 4px)', top: '-4px' }, cursor: 'ns-resize' },
      { type: 'ne', style: { right: '-4px', top: '-4px' }, cursor: 'nesw-resize' },
      { type: 'e', style: { right: '-4px', top: 'calc(50% - 4px)' }, cursor: 'ew-resize' },
      { type: 'se', style: { right: '-4px', bottom: '-4px' }, cursor: 'nwse-resize' },
      { type: 's', style: { left: 'calc(50% - 4px)', bottom: '-4px' }, cursor: 'ns-resize' },
      { type: 'sw', style: { left: '-4px', bottom: '-4px' }, cursor: 'nesw-resize' },
      { type: 'w', style: { left: '-4px', top: 'calc(50% - 4px)' }, cursor: 'ew-resize' },
    ];

    return (
      <>
        {/* Rotate handle stem */}
        <div
          style={{
            position: 'absolute',
            left: '50%',
            top: '-20px',
            width: '1px',
            height: '20px',
            backgroundColor: '#0284c7',
            pointerEvents: 'none',
          }}
        />
        {/* Rotate circular handle */}
        <div
          data-testid="element-handle-rot"
          title="Drag to rotate (Hold Shift to snap)"
          style={{
            position: 'absolute',
            left: 'calc(50% - 5px)',
            top: '-26px',
            width: '10px',
            height: '10px',
            backgroundColor: '#38bdf8',
            border: '2px solid #ffffff',
            borderRadius: '50%',
            zIndex: 11,
            cursor: 'grab',
            pointerEvents: 'auto',
          }}
          onPointerDown={(e) => {
            e.stopPropagation();
            onHandlePointerDown?.(el.id, 'rot', e);
          }}
        />

        {/* 8 Resize handles */}
        {handleDefs.map((h) => (
          <div
            key={h.type}
            data-testid={`element-handle-${h.type}`}
            style={{ ...handleStyle, ...h.style, cursor: h.cursor }}
            onPointerDown={(e) => {
              e.stopPropagation();
              onHandlePointerDown?.(el.id, h.type, e);
            }}
          />
        ))}
      </>
    );
  };

  return (
    <div
      ref={ref}
      data-testid="slide-elements"
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 3,
        overflow: 'hidden',
        // only the elements themselves take pointer events (when editing), never the empty space
        pointerEvents: 'none',
      }}
    >
      {/* Visual Alignment Guides */}
      {interactive &&
        guides &&
        guides.map((g, i) =>
          g.type === 'x' ? (
            <div
              key={`guide-x-${i}`}
              data-testid="snap-guide-x"
              style={{
                position: 'absolute',
                left: `${g.position}%`,
                top: 0,
                bottom: 0,
                width: '1px',
                borderLeft: '1px dashed #38bdf8',
                zIndex: 20,
                pointerEvents: 'none',
              }}
            />
          ) : (
            <div
              key={`guide-y-${i}`}
              data-testid="snap-guide-y"
              style={{
                position: 'absolute',
                top: `${g.position}%`,
                left: 0,
                right: 0,
                height: '1px',
                borderTop: '1px dashed #38bdf8',
                zIndex: 20,
                pointerEvents: 'none',
              }}
            />
          )
        )}

      {elements.map((el) => {
        const selected = interactive && selectedId === el.id;
        const box: React.CSSProperties = {
          position: 'absolute',
          left: `${el.x}%`,
          top: `${el.y}%`,
          width: `${el.w}%`,
          height: `${el.h}%`,
          opacity: el.opacity ?? 1,
          boxSizing: 'border-box',
          outline: selected ? '2px solid #38bdf8' : undefined,
          transform: el.rotation ? `rotate(${el.rotation}deg)` : undefined,
          transformOrigin: 'center center',
          pointerEvents: interactive ? 'auto' : undefined,
          cursor: interactive ? 'move' : undefined,
          touchAction: interactive ? 'none' : undefined,
        };
        const handlers = interactive
          ? {
              onClick: () => onSelect?.(el.id),
              onPointerDown: (e: React.PointerEvent) => {
                onSelect?.(el.id);
                onElementPointerDown?.(el.id, e);
              },
            }
          : {};

        if (el.kind === 'image') {
          if (!isSafeMediaPath(el.imagePath)) return null;
          return (
            <div key={el.id} data-testid="slide-element" data-kind="image" style={box} {...handlers}>
              <img
                src={mediaService.resolveMediaUrl(el.imagePath)}
                alt=""
                draggable={false}
                style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block', pointerEvents: 'none' }}
              />
              {renderHandles(el)}
            </div>
          );
        }

        if (el.kind === 'shape') {
          return (
            <div
              key={el.id}
              data-testid="slide-element"
              data-kind="shape"
              style={{
                ...box,
                backgroundColor: safeColor(el.fill, '#3b82f6'),
                borderRadius: el.shape === 'ellipse' ? '50%' : undefined,
              }}
              {...handlers}
            >
              {renderHandles(el)}
            </div>
          );
        }

        const fontPct = Math.min(Math.max(el.fontSizePct ?? 8, 1), 30);
        const justify = el.align === 'left' ? 'flex-start' : el.align === 'right' ? 'flex-end' : 'center';
        return (
          <div
            key={el.id}
            data-testid="slide-element"
            data-kind="text"
            className="multilingual-text"
            style={{
              ...box,
              display: 'flex',
              alignItems: 'center',
              justifyContent: justify,
              textAlign: el.align ?? 'center',
              color: safeColor(el.color, '#ffffff'),
              // fall back to screen height only if the slide could not be measured
              fontSize: height > 0 ? `${(fontPct / 100) * height}px` : `${fontPct}vh`,
              fontWeight: el.weight === 'normal' ? 500 : 700,
              lineHeight: 1.2,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              overflow: 'hidden',
              backgroundColor: el.fill && HEX.test(el.fill) ? el.fill : undefined,
            }}
            {...handlers}
          >
            {el.text}
            {renderHandles(el)}
          </div>
        );
      })}
    </div>
  );
};
