import React, { useEffect, useState } from 'react';
import { api } from '../../services/api';
import { LivestreamOverlayConfig, OverlayWindowStatus, TextAlignment } from '../../types';

interface LivestreamOverlayModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const LivestreamOverlayModal: React.FC<LivestreamOverlayModalProps> = ({
  isOpen,
  onClose,
}) => {
  const [config, setConfig] = useState<LivestreamOverlayConfig | null>(null);
  const [windowStatus, setWindowStatus] = useState<OverlayWindowStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [serverPort, setServerPort] = useState(8088);
  const [localIp, setLocalIp] = useState('127.0.0.1');

  useEffect(() => {
    if (isOpen) {
      loadData();
    }
  }, [isOpen]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [cfg, status, srvStatus] = await Promise.all([
        api.getOverlayConfig(),
        api.getOverlayStatus(),
        api.getRemoteServerStatus(),
      ]);
      setConfig(cfg);
      setWindowStatus(status);
      setServerPort(srvStatus.port || 8088);
      if (srvStatus.lanIps && srvStatus.lanIps.length > 0) {
        setLocalIp(srvStatus.lanIps[0]);
      }
    } catch (e) {
      console.error('Failed to load overlay config:', e);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen || !config) return null;

  const obsUrl = `http://${localIp}:${serverPort}/overlay?token=${config.authToken}`;

  const handleCopyUrl = () => {
    navigator.clipboard.writeText(obsUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSave = async (updated: LivestreamOverlayConfig) => {
    setLoading(true);
    try {
      const saved = await api.updateOverlayConfig(updated);
      setConfig(saved);
    } catch (e: any) {
      alert(`Save error: ${e.message || String(e)}`);
    } finally {
      setLoading(false);
    }
  };

  const handleRegenerateToken = async () => {
    if (!confirm('Regenerating the authentication token will require updating the URL in OBS Studio. Continue?')) {
      return;
    }
    try {
      const newToken = await api.regenerateOverlayToken();
      setConfig({ ...config, authToken: newToken });
    } catch (e: any) {
      alert(`Regenerate error: ${e.message || String(e)}`);
    }
  };

  const handleToggleClear = async () => {
    try {
      const cleared = await api.toggleOverlayClear();
      setConfig({ ...config, isCleared: cleared });
    } catch (e: any) {
      alert(`Toggle error: ${e.message || String(e)}`);
    }
  };

  const handleToggleWindow = async () => {
    try {
      if (windowStatus?.isOpen) {
        const s = await api.closeOverlayWindow();
        setWindowStatus(s);
      } else {
        const s = await api.openOverlayWindow(undefined, false);
        setWindowStatus(s);
      }
    } catch (e: any) {
      alert(`Window error: ${e.message || String(e)}`);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-2xl w-full max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 bg-slate-800/80 border-b border-slate-700/80 flex justify-between items-center">
          <div>
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <span>📡</span> Livestream Transparent Overlay & OBS
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Configure lower-thirds and full-screen lyrics for OBS Studio or secondary transparent monitors.
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-700 transition"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto space-y-6">
          {/* Quick Actions Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-slate-950/60 border border-slate-800 rounded-xl">
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400 font-medium">Overlay Status:</span>
              <span
                className={`text-xs px-2 py-0.5 rounded-full font-bold uppercase ${
                  config.isCleared
                    ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                    : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                }`}
              >
                {config.isCleared ? 'Cleared (Hidden)' : 'Active (Streaming)'}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleToggleClear}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                  config.isCleared
                    ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                    : 'bg-amber-600 hover:bg-amber-500 text-white'
                }`}
              >
                {config.isCleared ? 'Restore Overlay' : 'Clear Overlay (Blank)'}
              </button>
              <button
                onClick={handleToggleWindow}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition ${
                  windowStatus?.isOpen
                    ? 'bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700'
                    : 'bg-blue-600 border-blue-500 text-white hover:bg-blue-500'
                }`}
              >
                {windowStatus?.isOpen ? 'Hide Transparent Window' : 'Open Transparent Window'}
              </button>
            </div>
          </div>

          {/* OBS Studio Integration Link */}
          <div className="bg-slate-800/40 border border-slate-800 p-4 rounded-xl space-y-3">
            <div className="flex justify-between items-center">
              <strong className="text-sm text-slate-200 flex items-center gap-1.5">
                <span>🎥</span> OBS Studio Browser Source URL
              </strong>
              <button
                onClick={handleRegenerateToken}
                className="text-[11px] text-slate-400 hover:text-rose-400 transition"
              >
                Regenerate Token
              </button>
            </div>
            <p className="text-xs text-slate-400">
              In OBS Studio, add a <strong>Browser Source</strong>, paste this URL, and set width 1920 × height 1080.
              The background is genuinely transparent.
            </p>
            <div className="flex gap-2">
              <input
                type="text"
                readOnly
                value={obsUrl}
                className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs font-mono text-slate-300 focus:outline-none"
              />
              <button
                onClick={handleCopyUrl}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-lg transition"
              >
                {copied ? 'Copied!' : 'Copy URL'}
              </button>
            </div>
          </div>

          {/* Layout Mode */}
          <div className="space-y-2">
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider">
              Layout Style
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => handleSave({ ...config, layoutMode: 'lower_third' })}
                className={`p-3 rounded-lg border text-left transition ${
                  config.layoutMode === 'lower_third'
                    ? 'bg-blue-600/20 border-blue-500 text-white'
                    : 'bg-slate-800/40 border-slate-800 hover:border-slate-700 text-slate-400'
                }`}
              >
                <div className="font-semibold text-sm">Lower Third (Subtitle Pill)</div>
                <div className="text-xs text-slate-400 mt-1">
                  Placed at bottom safe margin with dark frosted backdrop. Best for cameras & preaching.
                </div>
              </button>

              <button
                type="button"
                onClick={() => handleSave({ ...config, layoutMode: 'full_screen' })}
                className={`p-3 rounded-lg border text-left transition ${
                  config.layoutMode === 'full_screen'
                    ? 'bg-blue-600/20 border-blue-500 text-white'
                    : 'bg-slate-800/40 border-slate-800 hover:border-slate-700 text-slate-400'
                }`}
              >
                <div className="font-semibold text-sm">Full Screen Centered</div>
                <div className="text-xs text-slate-400 mt-1">
                  Centered text with heavy shadow over live video feed. Best for worship lyrics.
                </div>
              </button>
            </div>
          </div>

          {/* Typography Settings */}
          <div className="space-y-4 bg-slate-800/20 p-4 rounded-xl border border-slate-800">
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider">
              Typography & Appearance
            </label>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-slate-400 mb-1">Font Size ({config.fontSizePx}px)</label>
                <input
                  type="range"
                  min="24"
                  max="72"
                  step="2"
                  value={config.fontSizePx}
                  onChange={(e) =>
                    handleSave({ ...config, fontSizePx: parseInt(e.target.value) })
                  }
                  className="w-full"
                />
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1">Text Alignment</label>
                <select
                  value={config.textAlignment}
                  onChange={(e) =>
                    handleSave({
                      ...config,
                      textAlignment: e.target.value as TextAlignment,
                    })
                  }
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white"
                >
                  <option value="left">Left Aligned</option>
                  <option value="center">Centered</option>
                  <option value="right">Right Aligned</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-slate-400 mb-1">Horizontal Margin ({config.safeMarginHorizontalPct}vw)</label>
                <input
                  type="range"
                  min="0"
                  max="15"
                  step="0.5"
                  value={config.safeMarginHorizontalPct}
                  onChange={(e) =>
                    handleSave({
                      ...config,
                      safeMarginHorizontalPct: parseFloat(e.target.value),
                    })
                  }
                  className="w-full"
                />
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1">Vertical Margin ({config.safeMarginVerticalPct}vh)</label>
                <input
                  type="range"
                  min="0"
                  max="20"
                  step="0.5"
                  value={config.safeMarginVerticalPct}
                  onChange={(e) =>
                    handleSave({
                      ...config,
                      safeMarginVerticalPct: parseFloat(e.target.value),
                    })
                  }
                  className="w-full"
                />
              </div>
            </div>

            <div className="flex gap-6 pt-2">
              <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.showSpeakerLabel}
                  onChange={(e) =>
                    handleSave({ ...config, showSpeakerLabel: e.target.checked })
                  }
                  className="rounded bg-slate-800 border-slate-700 text-blue-600"
                />
                Show Section/Title Label (e.g. "Verse 1")
              </label>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 bg-slate-800/80 border-t border-slate-700/80 flex justify-end">
          <button
            onClick={onClose}
            disabled={loading}
            className="px-5 py-2 bg-slate-700 hover:bg-slate-600 text-white text-xs font-medium rounded-lg transition"
          >
            {loading ? 'Updating...' : 'Close'}
          </button>
        </div>
      </div>
    </div>
  );
};
