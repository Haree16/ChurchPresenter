import React from 'react';
import { Prop } from '../types';
import { mediaService } from '../services/mediaService';
import { propPlacement } from '../services/propLayout';

const HEX = /^#[0-9a-fA-F]{6}$/;
const safeColor = (c: string | null | undefined, fallback: string) => (c && HEX.test(c) ? c : fallback);

interface PropsLayerProps {
  props: Prop[] | undefined;
}

const PROP_ANIMATION_STYLES = `
@keyframes propScrollLeft {
  0% { transform: translateX(100vw); }
  100% { transform: translateX(-100%); }
}
@keyframes propScrollRight {
  0% { transform: translateX(-100%); }
  100% { transform: translateX(100vw); }
}
@keyframes propScrollUp {
  0% { transform: translateY(100%); }
  100% { transform: translateY(-100%); }
}
`;

/** Draws the active props over the audience output. Text is plain text, colours must be hex. */
export const PropsLayer: React.FC<PropsLayerProps> = ({ props }) => {
  if (!props || props.length === 0) return null;
  return (
    <div
      data-testid="props-layer"
      style={{ position: 'fixed', inset: 0, zIndex: 900, pointerEvents: 'none', overflow: 'hidden' }}
    >
      <style>{PROP_ANIMATION_STYLES}</style>
      {props.map((prop) => {
        const bg = prop.backgroundColor && HEX.test(prop.backgroundColor) ? prop.backgroundColor : null;
        if (prop.kind === 'image') {
          const src = mediaService.resolveMediaUrl(prop.imagePath);
          if (!src) return null;
          return (
            <div key={prop.id} data-testid="prop-item" style={{ position: 'absolute', ...propPlacement(prop.position) }}>
              <img
                src={src}
                alt={prop.name}
                style={{
                  display: 'block',
                  width: `${Math.min(Math.max(prop.sizePct, 1), 100)}vw`,
                  maxHeight: '100vh',
                  objectFit: 'contain',
                  backgroundColor: bg ?? 'transparent',
                }}
              />
            </div>
          );
        }

        const isScrolling = prop.scrollMode && prop.scrollMode !== 'none';
        const speed = Math.min(Math.max(prop.scrollSpeed ?? 3, 1), 10);
        const durationSec = Math.max(4, 32 - speed * 2.7);

        const containerPlacement = propPlacement(prop.position);
        // If scrolling horizontally, ensure ticker spans full width if on bar or lower-third
        const scrollPlacementOverride: React.CSSProperties =
          isScrolling && (prop.scrollMode === 'left' || prop.scrollMode === 'right')
            ? { left: 0, right: 0, width: '100vw', maxWidth: '100vw' }
            : {};

        const animationName =
          prop.scrollMode === 'left'
            ? 'propScrollLeft'
            : prop.scrollMode === 'right'
            ? 'propScrollRight'
            : prop.scrollMode === 'up'
            ? 'propScrollUp'
            : undefined;

        return (
          <div
            key={prop.id}
            data-testid="prop-item"
            data-scroll-mode={prop.scrollMode || 'none'}
            data-scroll-speed={speed}
            className="multilingual-text"
            style={{
              position: 'absolute',
              ...containerPlacement,
              ...scrollPlacementOverride,
              padding: bg ? '1vh 2vw' : 0,
              backgroundColor: bg ?? 'transparent',
              color: safeColor(prop.textColor, '#ffffff'),
              fontSize: `${Math.min(Math.max(prop.sizePct, 1), 100)}vh`,
              fontWeight: 700,
              lineHeight: 1.2,
              textShadow: bg ? 'none' : '0 0.2vh 0.8vh rgba(0,0,0,0.8)',
              wordBreak: isScrolling ? 'normal' : 'break-word',
              whiteSpace: isScrolling && prop.scrollMode !== 'up' ? 'nowrap' : 'normal',
              overflow: 'hidden',
            }}
          >
            {isScrolling && animationName ? (
              <div
                data-testid="prop-scroll-track"
                style={{
                  display: 'inline-block',
                  willChange: 'transform',
                  animation: `${animationName} ${durationSec.toFixed(1)}s linear infinite`,
                }}
              >
                {prop.text}
              </div>
            ) : (
              prop.text
            )}
          </div>
        );
      })}
    </div>
  );
};
