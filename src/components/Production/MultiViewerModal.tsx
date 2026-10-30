import React, { useEffect, useState } from 'react';
import { LayoutGrid, X, Radio } from 'lucide-react';
import { api } from '../../services/api';
import { OutputConfig, PresentationState, StageConfig } from '../../types';
import { StageCanvas } from '../Stage/StageCanvas';

interface MultiViewerModalProps {
  isOpen: boolean;
  onClose: () => void;
  presentationState: PresentationState;
}

export const MultiViewerModal: React.FC<MultiViewerModalProps> = ({
  isOpen,
  onClose,
  presentationState,
}) => {
  const [outputs, setOutputs] = useState<OutputConfig[]>([]);
  const [stageConfigs, setStageConfigs] = useState<Record<string, StageConfig>>({});
  const [currentTime, setCurrentTime] = useState<string>('');
  const [primaryOutputId, setPrimaryOutputId] = useState<string>('output-audience');

  useEffect(() => {
    if (!isOpen) return;
    const fetchOutputs = async () => {
      try {
        const outList = await api.listOutputs();
        setOutputs(outList);
        if (outList.length > 0 && !outList.some((o) => o.id === primaryOutputId)) {
          setPrimaryOutputId(outList[0].id);
        }

        // Fetch stage configs for stage outputs
        const configs: Record<string, StageConfig> = {};
        for (const out of outList.filter((o) => o.outputType === 'stage')) {
          const cfg = await api.getStageConfig(out.id).catch(() => null);
          if (cfg) configs[out.id] = cfg;
        }
        const defaultCfg = await api.getStageConfig('default-stage').catch(() => null);
        if (defaultCfg) configs['default-stage'] = defaultCfg;
        setStageConfigs(configs);
      } catch (err) {
        console.error('Failed to load multiviewer outputs:', err);
      }
    };
    void fetchOutputs();
  }, [isOpen, primaryOutputId]);

  useEffect(() => {
    if (!isOpen) return;
    const timer = setInterval(() => {
      const now = new Date();
      setCurrentTime(now.toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    }, 500);
    return () => clearInterval(timer);
  }, [isOpen]);

  if (!isOpen) return null;

  const { isLive, isBlackout, currentSlide, announcements } = presentationState;

  const renderScreenPreview = (out: OutputConfig) => {
    const screenLayer = presentationState.screenLayers?.[out.id];
    const isLogo = screenLayer ? screenLayer.isLogo : !!presentationState.isLogo;
    const isOutBlackout = screenLayer ? screenLayer.isBlackout : isBlackout;

    // Foyer / announcements layer target
    const isAnnTarget =
      !!announcements?.isLive &&
      !!announcements.currentSlide &&
      (announcements.targetOutputIds?.length === 0 || announcements.targetOutputIds?.includes(out.id));

    if (out.outputType === 'stage') {
      const stageCfg = stageConfigs[out.id] || stageConfigs['default-stage'] || {
        id: 'default-stage',
        panels: [],
        highContrast: true,
      };
      return (
        <div style={{ width: '100%', height: '100%', overflow: 'hidden' }}>
          <StageCanvas
            panels={stageCfg.panels || []}
            state={presentationState}
            clock={currentTime || '10:00:00'}
            timer={{ display: '00:00', isWarning: false, isExpired: false }}
            highContrast={stageCfg.highContrast ?? true}
          />
        </div>
      );
    }

    if (isOutBlackout) {
      return (
        <div
          data-testid={`multiviewer-blackout-${out.id}`}
          style={{ width: '100%', height: '100%', backgroundColor: '#000000', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          <span style={{ fontSize: '11px', fontWeight: 700, color: '#ef4444' }}>[ BLACKOUT ]</span>
        </div>
      );
    }

    if (isLogo) {
      return (
        <div
          data-testid={`multiviewer-logo-${out.id}`}
          style={{ width: '100%', height: '100%', backgroundColor: '#000000', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          <span style={{ fontSize: '11px', fontWeight: 700, color: '#60a5fa' }}>[ LOGO SCREEN ]</span>
        </div>
      );
    }

    const slideToRender = isAnnTarget ? announcements?.currentSlide : currentSlide;

    if (!slideToRender || (!isLive && !isAnnTarget)) {
      return (
        <div
          data-testid={`multiviewer-standby-${out.id}`}
          style={{ width: '100%', height: '100%', backgroundColor: '#090d16', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          <span style={{ fontSize: '11px', color: '#64748b' }}>[ STANDBY ]</span>
        </div>
      );
    }

    return (
      <div
        data-testid={`multiviewer-slide-${out.id}`}
        style={{
          width: '100%',
          height: '100%',
          backgroundColor: slideToRender.backgroundColor || '#0a0f1d',
          color: slideToRender.foregroundColor || '#ffffff',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          textAlign: 'center',
          padding: '8px',
          boxSizing: 'border-box',
          fontSize: '11px',
          fontWeight: 600,
          overflow: 'hidden',
          position: 'relative',
        }}
      >
        <div style={{ maxHeight: '100%', overflow: 'hidden' }}>{slideToRender.body}</div>
        {isAnnTarget && (
          <span
            style={{
              position: 'absolute',
              bottom: '4px',
              right: '4px',
              fontSize: '9px',
              backgroundColor: '#0284c7',
              color: '#ffffff',
              padding: '1px 4px',
              borderRadius: '3px',
              fontWeight: 700,
            }}
          >
            ANNOUNCEMENTS LOOP
          </span>
        )}
      </div>
    );
  };

  return (
    <div
      role="dialog"
      aria-label="Multi-Viewer Production Display"
      data-testid="multiviewer-modal"
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(2, 6, 23, 0.85)',
        zIndex: 1300,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '1200px',
          maxHeight: '92vh',
          backgroundColor: '#090d16',
          border: '1px solid #334155',
          borderRadius: '12px',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          color: '#f8fafc',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7)',
        }}
      >
        {/* Top Header Bar */}
        <div
          style={{
            padding: '12px 16px',
            backgroundColor: '#0f172a',
            borderBottom: '1px solid #1e293b',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <LayoutGrid size={18} color="#38bdf8" />
              <strong style={{ fontSize: '15px', letterSpacing: '0.5px' }}>MULTI-VIEWER PRODUCTION MONITOR</strong>
            </div>
            <span
              style={{
                fontSize: '11px',
                fontWeight: 700,
                color: isLive ? '#22c55e' : '#eab308',
                backgroundColor: '#1e293b',
                padding: '2px 8px',
                borderRadius: '4px',
                border: '1px solid #334155',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
              }}
            >
              <Radio size={11} />
              {isLive ? 'BROADCAST LIVE' : 'STANDBY'}
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <span style={{ fontSize: '13px', fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: '#38bdf8' }}>
              {currentTime}
            </span>
            <button
              type="button"
              data-testid="multiviewer-close-btn"
              onClick={onClose}
              style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: '4px' }}
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Multi-Viewer Grid */}
        <div
          data-testid="multiviewer-grid"
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '16px',
            display: 'grid',
            gridTemplateColumns: outputs.length > 2 ? 'repeat(2, 1fr)' : '1fr',
            gap: '16px',
          }}
        >
          {outputs.map((out) => {
            const isPrimary = out.id === primaryOutputId;
            return (
              <div
                key={out.id}
                data-testid={`multiviewer-tile-${out.id}`}
                style={{
                  backgroundColor: '#0f172a',
                  border: `2px solid ${isPrimary ? '#38bdf8' : '#1e293b'}`,
                  borderRadius: '8px',
                  display: 'flex',
                  flexDirection: 'column',
                  overflow: 'hidden',
                }}
              >
                {/* Tile Header */}
                <div
                  style={{
                    padding: '6px 10px',
                    backgroundColor: '#1e293b',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    fontSize: '11px',
                    fontWeight: 600,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ color: isPrimary ? '#38bdf8' : '#f8fafc' }}>{out.name}</span>
                    <span
                      style={{
                        fontSize: '9px',
                        textTransform: 'uppercase',
                        padding: '1px 5px',
                        borderRadius: '3px',
                        backgroundColor: '#334155',
                        color: '#94a3b8',
                      }}
                    >
                      {out.outputType}
                    </span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '10px', color: '#64748b' }}>
                    <span>{out.aspectRatio}</span>
                    <button
                      type="button"
                      data-testid={`multiviewer-set-primary-${out.id}`}
                      onClick={() => setPrimaryOutputId(out.id)}
                      title="Follow this output as primary"
                      style={{
                        padding: '2px 6px',
                        fontSize: '10px',
                        borderRadius: '3px',
                        border: '1px solid #334155',
                        backgroundColor: isPrimary ? '#0369a1' : 'transparent',
                        color: isPrimary ? '#ffffff' : '#94a3b8',
                        cursor: 'pointer',
                      }}
                    >
                      {isPrimary ? 'Primary' : 'Make Primary'}
                    </button>
                  </div>
                </div>

                {/* Live Output Canvas Aspect Ratio 16:9 */}
                <div style={{ width: '100%', aspectRatio: '16 / 9', position: 'relative' }}>
                  {renderScreenPreview(out)}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
