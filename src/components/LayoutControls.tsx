import React from 'react';
import { MAX_MARGIN_PCT, MAX_OUTLINE_WIDTH } from '../services/slideLayout';

export interface LayoutValues {
  marginPct: number;
  outlineWidth: number;
  outlineColor: string;
}

interface LayoutControlsProps {
  values: LayoutValues;
  onChange: (next: LayoutValues) => void;
}

const labelStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  fontSize: '12px',
  fontWeight: 600,
  color: '#94a3b8',
  marginBottom: '4px',
};

/** Safe margin and text outline controls shared by the slide editor and the theme manager. */
export const LayoutControls: React.FC<LayoutControlsProps> = ({ values, onChange }) => {
  const set = (patch: Partial<LayoutValues>) => onChange({ ...values, ...patch });
  const isDefault = values.marginPct === 0 && values.outlineWidth === 0;

  return (
    <div data-testid="layout-controls" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      <div>
        <label style={labelStyle} htmlFor="layout-margin">
          <span>Safe margin</span>
          <span data-testid="layout-margin-value">{values.marginPct === 0 ? 'Default' : `${values.marginPct}%`}</span>
        </label>
        <input
          id="layout-margin"
          data-testid="layout-margin"
          type="range"
          min={0}
          max={MAX_MARGIN_PCT}
          step={1}
          value={values.marginPct}
          onChange={(e) => set({ marginPct: Number(e.target.value) })}
          style={{ width: '100%' }}
        />
      </div>

      <div>
        <label style={labelStyle} htmlFor="layout-outline-width">
          <span>Text outline</span>
          <span data-testid="layout-outline-value">{values.outlineWidth === 0 ? 'None' : `${values.outlineWidth} pt`}</span>
        </label>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <input
            id="layout-outline-width"
            data-testid="layout-outline-width"
            type="range"
            min={0}
            max={MAX_OUTLINE_WIDTH}
            step={1}
            value={values.outlineWidth}
            onChange={(e) => set({ outlineWidth: Number(e.target.value) })}
            style={{ flex: 1 }}
          />
          <input
            data-testid="layout-outline-color"
            type="color"
            aria-label="Outline colour"
            value={values.outlineColor}
            disabled={values.outlineWidth === 0}
            onChange={(e) => set({ outlineColor: e.target.value })}
            style={{ width: '28px', height: '24px', padding: 0, border: 'none', background: 'none' }}
          />
        </div>
      </div>

      <button
        type="button"
        data-testid="layout-reset"
        disabled={isDefault}
        onClick={() => set({ marginPct: 0, outlineWidth: 0 })}
        style={{
          alignSelf: 'flex-start',
          padding: '3px 10px',
          borderRadius: '6px',
          border: '1px solid #334155',
          backgroundColor: '#1e293b',
          color: isDefault ? '#64748b' : '#cbd5e1',
          fontSize: '11px',
          fontWeight: 600,
          cursor: isDefault ? 'default' : 'pointer',
        }}
      >
        Reset to default
      </button>
    </div>
  );
};

export const layoutValuesFrom = (
  layout: { marginPct?: number | null; outlineWidth?: number | null; outlineColor?: string | null } | null | undefined
): LayoutValues => ({
  marginPct: layout?.marginPct ?? 0,
  outlineWidth: layout?.outlineWidth ?? 0,
  outlineColor: layout?.outlineColor ?? '#000000',
});
