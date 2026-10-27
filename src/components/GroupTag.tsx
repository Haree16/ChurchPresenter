import React from 'react';
import { Slide } from '../types';
import { readableTextColor } from '../services/sectionColors';

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

interface GroupTagProps {
  slide: Pick<Slide, 'groupLabel' | 'groupColor'> | null | undefined;
  /** `lg` is for the stage display, which is read from a distance. */
  size?: 'sm' | 'lg';
}

/** Small coloured chip naming the song group (Verse 1, Chorus, ...) a slide came from. */
export const GroupTag: React.FC<GroupTagProps> = ({ slide, size = 'sm' }) => {
  if (!slide?.groupLabel || !slide.groupColor) return null;
  // imported files can carry arbitrary text; only accept real hex colours
  const color = HEX_COLOR.test(slide.groupColor) ? slide.groupColor : '#64748b';
  return (
    <span
      data-testid="group-tag"
      style={{
        display: 'inline-block',
        padding: size === 'lg' ? '3px 14px' : '1px 8px',
        borderRadius: '999px',
        backgroundColor: color,
        color: readableTextColor(color),
        fontSize: size === 'lg' ? '1rem' : '10px',
        fontWeight: 800,
        letterSpacing: '0.04em',
        textTransform: 'uppercase',
        whiteSpace: 'nowrap',
      }}
    >
      {slide.groupLabel}
    </span>
  );
};
