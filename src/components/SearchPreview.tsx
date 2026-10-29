import React from 'react';
import { SearchPreview as Preview } from '../types';

/** A line of text with the found words marked. Always plain text, so a lyric can never inject markup. */
export const SearchPreview: React.FC<{ preview: Preview; label?: string }> = ({ preview, label }) => (
  <div
    data-testid="search-preview"
    style={{ marginTop: '6px', fontSize: '11px', color: '#94a3b8', lineHeight: 1.4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
  >
    {label && <span style={{ color: '#64748b', fontWeight: 700, marginRight: '6px' }}>{label}</span>}
    <span>{preview.before}</span>
    <mark style={{ backgroundColor: 'rgba(250, 204, 21, 0.3)', color: '#fde68a', borderRadius: '2px', padding: '0 1px' }}>{preview.matched}</mark>
    <span>{preview.after}</span>
  </div>
);
