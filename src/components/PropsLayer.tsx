import React from 'react';
import { Prop } from '../types';
import { mediaService } from '../services/mediaService';
import { propPlacement } from '../services/propLayout';

const HEX = /^#[0-9a-fA-F]{6}$/;
const safeColor = (c: string | null | undefined, fallback: string) => (c && HEX.test(c) ? c : fallback);

interface PropsLayerProps {
  props: Prop[] | undefined;
}

/** Draws the active props over the audience output. Text is plain text, colours must be hex. */
export const PropsLayer: React.FC<PropsLayerProps> = ({ props }) => {
  if (!props || props.length === 0) return null;
  return (
    <div
      data-testid="props-layer"
      style={{ position: 'fixed', inset: 0, zIndex: 900, pointerEvents: 'none', overflow: 'hidden' }}
    >
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
        return (
          <div
            key={prop.id}
            data-testid="prop-item"
            className="multilingual-text"
            style={{
              position: 'absolute',
              ...propPlacement(prop.position),
              padding: bg ? '1vh 2vw' : 0,
              backgroundColor: bg ?? 'transparent',
              color: safeColor(prop.textColor, '#ffffff'),
              fontSize: `${Math.min(Math.max(prop.sizePct, 1), 100)}vh`,
              fontWeight: 700,
              lineHeight: 1.2,
              textShadow: bg ? 'none' : '0 0.2vh 0.8vh rgba(0,0,0,0.8)',
              wordBreak: 'break-word',
            }}
          >
            {prop.text}
          </div>
        );
      })}
    </div>
  );
};
