import React from 'react';

export interface EdgeBlendOverlayProps {
  enabled?: boolean;
  edge?: 'none' | 'left' | 'right' | 'top' | 'bottom' | 'both_horizontal' | string;
  overlapPixels?: number;
  gamma?: number;
  blackLevelLift?: number;
  showTestPattern?: boolean;
}

/**
 * Calculates a multi-stop CSS gradient string modeling the gamma power function:
 * L(t) = t^gamma
 */
export function buildGammaGradientStops(
  gamma: number,
  direction: 'to_black' | 'from_black',
  stopsCount: number = 10
): string {
  const g = Math.max(1.0, Math.min(3.5, gamma || 2.2));
  const stops: string[] = [];

  for (let i = 0; i <= stopsCount; i++) {
    const pct = (i / stopsCount) * 100;
    const t = i / stopsCount; // 0.0 to 1.0

    // For edge blend mask: 0 opacity = full brightness (unattenuated), 1 opacity = full blackout
    // In direction 'to_black': t=0 is 0 opacity (clear), t=1 is 1 opacity (black)
    let opacity: number;
    if (direction === 'to_black') {
      // Luminance should fall from 1.0 down to 0.0 as (1 - t)^g
      // Therefore blackout mask opacity is 1 - (1 - t)^g
      opacity = 1 - Math.pow(1 - t, g);
    } else {
      // Luminance rises from 0.0 to 1.0 as t^g
      // Therefore blackout mask opacity is 1 - Math.pow(t, g)
      opacity = 1 - Math.pow(t, g);
    }

    const clampedOpacity = Math.max(0, Math.min(1, opacity));
    stops.push(`rgba(0, 0, 0, ${clampedOpacity.toFixed(4)}) ${pct.toFixed(1)}%`);
  }

  return stops.join(', ');
}

export const EdgeBlendOverlay: React.FC<EdgeBlendOverlayProps> = ({
  enabled = false,
  edge = 'none',
  overlapPixels = 0,
  gamma = 2.2,
  blackLevelLift = 0.0,
  showTestPattern = false,
}) => {
  if (!enabled && !showTestPattern) {
    return null;
  }

  const overlap = Math.max(0, overlapPixels);
  const activeEdge = edge || 'none';

  return (
    <div
      data-testid="edge-blend-overlay"
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        zIndex: 50,
        overflow: 'hidden',
      }}
    >
      {/* 1. Edge Blending Falloff Gradient Masks */}
      {enabled && activeEdge !== 'none' && overlap > 0 && (
        <>
          {/* Right Edge Falloff */}
          {(activeEdge === 'right' || activeEdge === 'both_horizontal') && (
            <div
              data-testid="blend-zone-right"
              style={{
                position: 'absolute',
                top: 0,
                bottom: 0,
                right: 0,
                width: `${overlap}px`,
                background: `linear-gradient(to right, ${buildGammaGradientStops(gamma, 'to_black')})`,
              }}
            />
          )}

          {/* Left Edge Falloff */}
          {(activeEdge === 'left' || activeEdge === 'both_horizontal') && (
            <div
              data-testid="blend-zone-left"
              style={{
                position: 'absolute',
                top: 0,
                bottom: 0,
                left: 0,
                width: `${overlap}px`,
                background: `linear-gradient(to right, ${buildGammaGradientStops(gamma, 'from_black')})`,
              }}
            />
          )}

          {/* Bottom Edge Falloff */}
          {activeEdge === 'bottom' && (
            <div
              data-testid="blend-zone-bottom"
              style={{
                position: 'absolute',
                left: 0,
                right: 0,
                bottom: 0,
                height: `${overlap}px`,
                background: `linear-gradient(to bottom, ${buildGammaGradientStops(gamma, 'to_black')})`,
              }}
            />
          )}

          {/* Top Edge Falloff */}
          {activeEdge === 'top' && (
            <div
              data-testid="blend-zone-top"
              style={{
                position: 'absolute',
                left: 0,
                right: 0,
                top: 0,
                height: `${overlap}px`,
                background: `linear-gradient(to bottom, ${buildGammaGradientStops(gamma, 'from_black')})`,
              }}
            />
          )}

          {/* Black level lift compensation tint for non-overlap regions */}
          {blackLevelLift > 0 && (
            <div
              data-testid="blend-black-lift"
              style={{
                position: 'absolute',
                inset: 0,
                backgroundColor: `rgba(255, 255, 255, ${Math.min(0.15, blackLevelLift).toFixed(3)})`,
                mixBlendMode: 'screen',
              }}
            />
          )}
        </>
      )}

      {/* 2. Alignment & Calibration Test Pattern */}
      {showTestPattern && (
        <div
          data-testid="edge-blend-test-pattern"
          style={{
            position: 'absolute',
            inset: 0,
            backgroundColor: 'rgba(5, 10, 20, 0.92)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            fontFamily: 'monospace',
            color: '#38bdf8',
          }}
        >
          {/* Crosshatch Grid SVG */}
          <svg
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
            xmlns="http://www.w3.org/2000/svg"
          >
            <defs>
              <pattern id="grid50" width="50" height="50" patternUnits="userSpaceOnUse">
                <path d="M 50 0 L 0 0 0 50" fill="none" stroke="rgba(56, 189, 248, 0.2)" strokeWidth="1" />
              </pattern>
              <pattern id="grid200" width="200" height="200" patternUnits="userSpaceOnUse">
                <rect width="200" height="200" fill="url(#grid50)" />
                <path d="M 200 0 L 0 0 0 200" fill="none" stroke="rgba(56, 189, 248, 0.6)" strokeWidth="1.5" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#grid200)" />

            {/* Diagonal Alignment Crosshairs */}
            <line x1="0" y1="0" x2="100%" y2="100%" stroke="rgba(244, 63, 94, 0.4)" strokeWidth="1.5" />
            <line x1="100%" y1="0" x2="0" y2="100%" stroke="rgba(244, 63, 94, 0.4)" strokeWidth="1.5" />

            {/* Overlap Boundary Markers */}
            {overlap > 0 && (activeEdge === 'right' || activeEdge === 'both_horizontal') && (
              <g data-testid="marker-right-overlap">
                <line
                  x1={`calc(100% - ${overlap}px)`}
                  y1="0"
                  x2={`calc(100% - ${overlap}px)`}
                  y2="100%"
                  stroke="#f59e0b"
                  strokeWidth="2"
                  strokeDasharray="6 4"
                />
                <rect
                  x={`calc(100% - ${overlap}px)`}
                  y="0"
                  width={`${overlap}px`}
                  height="100%"
                  fill="rgba(245, 158, 11, 0.12)"
                />
              </g>
            )}

            {overlap > 0 && (activeEdge === 'left' || activeEdge === 'both_horizontal') && (
              <g data-testid="marker-left-overlap">
                <line
                  x1={`${overlap}px`}
                  y1="0"
                  x2={`${overlap}px`}
                  y2="100%"
                  stroke="#f59e0b"
                  strokeWidth="2"
                  strokeDasharray="6 4"
                />
                <rect
                  x="0"
                  y="0"
                  width={`${overlap}px`}
                  height="100%"
                  fill="rgba(245, 158, 11, 0.12)"
                />
              </g>
            )}
          </svg>

          {/* Top Banner */}
          <div
            style={{
              padding: '12px 20px',
              backgroundColor: 'rgba(15, 23, 42, 0.85)',
              borderBottom: '1px solid #38bdf8',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              zIndex: 10,
            }}
          >
            <div style={{ fontWeight: 700, fontSize: '14px', letterSpacing: '0.05em' }}>
              ✦ EDGE BLEND ALIGNMENT TEST PATTERN
            </div>
            <div style={{ fontSize: '12px', color: '#94a3b8' }}>
              Edge: <strong style={{ color: '#f8fafc' }}>{activeEdge.toUpperCase()}</strong> • Overlap:{' '}
              <strong style={{ color: '#f59e0b' }}>{overlap}px</strong> • Gamma:{' '}
              <strong style={{ color: '#38bdf8' }}>{gamma.toFixed(2)}</strong>
            </div>
          </div>

          {/* Center 16-Step Grayscale Step Wedge (Calibration Ramp) */}
          <div
            data-testid="calibration-grayscale-ramp"
            style={{
              margin: 'auto',
              width: '80%',
              maxWidth: '800px',
              backgroundColor: '#000',
              border: '2px solid #38bdf8',
              borderRadius: '6px',
              overflow: 'hidden',
              zIndex: 10,
              boxShadow: '0 10px 30px rgba(0,0,0,0.8)',
            }}
          >
            <div style={{ display: 'flex', height: '48px' }}>
              {Array.from({ length: 16 }).map((_, i) => {
                const val = Math.round((i / 15) * 255);
                return (
                  <div
                    key={i}
                    style={{
                      flex: 1,
                      backgroundColor: `rgb(${val}, ${val}, ${val})`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '9px',
                      color: val > 128 ? '#000' : '#fff',
                      fontWeight: 600,
                    }}
                  >
                    {Math.round((i / 15) * 100)}%
                  </div>
                );
              })}
            </div>
            <div
              style={{
                padding: '6px 12px',
                backgroundColor: '#090d16',
                fontSize: '11px',
                textAlign: 'center',
                color: '#94a3b8',
                borderTop: '1px solid #1e293b',
              }}
            >
              16-Step Optical Luminance Verification Ramp • Verify smooth transition across overlap seam
            </div>
          </div>

          {/* Bottom Banner */}
          <div
            style={{
              padding: '10px 20px',
              backgroundColor: 'rgba(15, 23, 42, 0.85)',
              borderTop: '1px solid #38bdf8',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              fontSize: '11px',
              color: '#94a3b8',
              zIndex: 10,
            }}
          >
            <span>Dashed Yellow Line: Overlap Boundary Edge</span>
            <span>Church Presenter Multi-Projector Engine</span>
          </div>
        </div>
      )}
    </div>
  );
};
