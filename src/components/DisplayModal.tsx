import React, { useState, useEffect } from 'react';
import {
  X,
  Tv,
  Monitor,
  CheckCircle,
  AlertTriangle,
  Maximize2,
  Minimize2,
  RefreshCw,
} from 'lucide-react';
import { DisplayMonitor, AudienceWindowStatus } from '../types';
import { api } from '../services/api';

interface DisplayModalProps {
  isOpen: boolean;
  onClose: () => void;
  audienceStatus: AudienceWindowStatus;
  onRefreshAudienceStatus: () => void;
}

export const DisplayModal: React.FC<DisplayModalProps> = ({
  isOpen,
  onClose,
  audienceStatus,
  onRefreshAudienceStatus,
}) => {
  const [monitors, setMonitors] = useState<DisplayMonitor[]>([]);
  const [selectedMonitorId, setSelectedMonitorId] = useState<string>('');
  const [isFullscreen, setIsFullscreen] = useState<boolean>(true);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const fetchMonitors = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const list = await api.getAvailableMonitors();
      setMonitors(list);

      // Select external monitor by default if available, otherwise primary
      const savedMonitorId = await api.getSetting('selectedMonitorId');
      if (savedMonitorId && list.some((m) => m.id === savedMonitorId)) {
        setSelectedMonitorId(savedMonitorId);
      } else {
        const external = list.find((m) => !m.isPrimary);
        if (external) {
          setSelectedMonitorId(external.id);
        } else if (list.length > 0) {
          setSelectedMonitorId(list[0].id);
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to query monitors';
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchMonitors();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const selectedMonitor = monitors.find((m) => m.id === selectedMonitorId) || null;
  const isSingleDisplay = monitors.length === 1;
  const isTargetingPrimary = selectedMonitor?.isPrimary ?? false;

  const handleOpenAudience = async () => {
    try {
      setError(null);
      await api.setSetting('selectedMonitorId', selectedMonitorId);
      await api.openAudienceWindow(selectedMonitorId, isFullscreen);
      onRefreshAudienceStatus();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to open audience window';
      setError(msg);
    }
  };

  const handleCloseAudience = async () => {
    try {
      setError(null);
      await api.closeAudienceWindow();
      onRefreshAudienceStatus();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to close audience window';
      setError(msg);
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
          maxWidth: '620px',
          backgroundColor: '#0f172a',
          borderRadius: '12px',
          border: '1px solid #334155',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Header */}
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
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Tv size={18} color="#3b82f6" />
            <span style={{ fontWeight: 700, fontSize: '15px', color: '#f8fafc' }}>
              Display & Audience Output Settings
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <button
              onClick={fetchMonitors}
              title="Refresh connected displays"
              style={{ padding: '4px', color: '#94a3b8' }}
            >
              <RefreshCw size={15} className={isLoading ? 'animate-spin' : ''} />
            </button>
            <button onClick={onClose} style={{ color: '#94a3b8', padding: '4px' }}>
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Content */}
        <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {error && (
            <div
              style={{
                padding: '10px 12px',
                borderRadius: '6px',
                backgroundColor: 'rgba(239, 68, 68, 0.15)',
                border: '1px solid #ef4444',
                color: '#fca5a5',
                fontSize: '12px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <AlertTriangle size={16} />
              <span>{error}</span>
            </div>
          )}

          {/* Connected Displays Section */}
          <div>
            <div
              style={{
                fontSize: '12px',
                fontWeight: 600,
                color: '#94a3b8',
                marginBottom: '8px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <span>Detected Displays ({monitors.length})</span>
              <span style={{ fontSize: '11px', color: '#64748b' }}>
                Reported by Operating System
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {monitors.map((m) => {
                const isSelected = m.id === selectedMonitorId;
                return (
                  <div
                    key={m.id}
                    onClick={() => setSelectedMonitorId(m.id)}
                    style={{
                      padding: '12px 14px',
                      borderRadius: '8px',
                      backgroundColor: isSelected ? 'rgba(59, 130, 246, 0.12)' : '#1e293b',
                      border: isSelected ? '1px solid #3b82f6' : '1px solid #334155',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <Monitor size={22} color={isSelected ? '#3b82f6' : '#94a3b8'} />
                      <div>
                        <div style={{ fontWeight: 600, fontSize: '13px', color: '#f8fafc' }}>
                          {m.name}
                        </div>
                        <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>
                          {m.width} × {m.height} px • Scale: {m.scaleFactor}x{' '}
                          {m.isPrimary && '• (Primary Laptop/Desktop Display)'}
                        </div>
                      </div>
                    </div>
                    {isSelected && <CheckCircle size={18} color="#3b82f6" />}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Single Display Warning Safeguard */}
          {isTargetingPrimary && (
            <div
              style={{
                padding: '12px',
                borderRadius: '8px',
                backgroundColor: 'rgba(245, 158, 11, 0.12)',
                border: '1px solid #f59e0b',
                display: 'flex',
                alignItems: 'flex-start',
                gap: '10px',
              }}
            >
              <AlertTriangle size={18} color="#fbbf24" style={{ flexShrink: 0, marginTop: '2px' }} />
              <div style={{ fontSize: '12px', color: '#fef08a', lineHeight: 1.4 }}>
                <strong>Notice: Primary Screen Selected</strong>
                <div>
                  {isSingleDisplay
                    ? 'No secondary projector or monitor was detected. If you use Fullscreen on your primary display, it will cover your operator controls. We recommend testing with a safe windowed preview instead.'
                    : 'Audience output will be assigned to your primary monitor instead of an external projector.'}
                </div>
              </div>
            </div>
          )}

          {/* Window Mode Toggle */}
          <div
            style={{
              padding: '12px 14px',
              backgroundColor: '#1e293b',
              borderRadius: '8px',
              border: '1px solid #334155',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div>
              <div style={{ fontWeight: 600, fontSize: '13px', color: '#f8fafc' }}>
                Window Presentation Mode
              </div>
              <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>
                {isFullscreen
                  ? 'Borderless fullscreen on selected display (Recommended for Projectors)'
                  : 'Floating resizable window (Safe Mode / Single Display Preview)'}
              </div>
            </div>

            <button
              onClick={() => setIsFullscreen(!isFullscreen)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 12px',
                backgroundColor: isFullscreen ? '#2563eb' : '#334155',
                borderRadius: '6px',
                color: '#ffffff',
                fontSize: '12px',
                fontWeight: 600,
              }}
            >
              {isFullscreen ? <Maximize2 size={14} /> : <Minimize2 size={14} />}
              <span>{isFullscreen ? 'Fullscreen' : 'Windowed'}</span>
            </button>
          </div>
        </div>

        {/* Footer Actions */}
        <div
          style={{
            padding: '14px 20px',
            backgroundColor: '#090d16',
            borderTop: '1px solid #1e293b',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ fontSize: '12px', color: '#94a3b8' }}>
            Current Status:{' '}
            <strong style={{ color: audienceStatus.isOpen ? '#34d399' : '#f87171' }}>
              {audienceStatus.isOpen ? 'Window Open' : 'Window Closed'}
            </strong>
          </div>

          <div style={{ display: 'flex', gap: '10px' }}>
            {audienceStatus.isOpen && (
              <button
                onClick={handleCloseAudience}
                style={{
                  padding: '8px 16px',
                  borderRadius: '6px',
                  backgroundColor: '#7f1d1d',
                  border: '1px solid #dc2626',
                  color: '#fecaca',
                  fontSize: '12px',
                  fontWeight: 600,
                }}
              >
                Close Output
              </button>
            )}

            <button
              onClick={handleOpenAudience}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 18px',
                borderRadius: '6px',
                backgroundColor: '#2563eb',
                color: '#ffffff',
                fontSize: '13px',
                fontWeight: 600,
              }}
            >
              <Tv size={15} />
              <span>{audienceStatus.isOpen ? 'Apply & Re-Position' : 'Launch Audience Display'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
