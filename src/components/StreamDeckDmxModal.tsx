import React, { useEffect, useState } from 'react';
import {
  X,
  Sliders,
  Tv,
  Zap,
  Download,
  Copy,
  Check,
  Radio,
  Lightbulb,
  Clock,
  Layers,
  ArrowRight,
  ArrowLeft,
  SkipBack,
  SkipForward,
  Moon,
  Image as ImageIcon,
  Type,
  Play,
  MessageSquare,
  Eye,
  AlertTriangle,
} from 'lucide-react';
import { api } from '../services/api';
import { DmxConfig, StreamDeckButton, StreamDeckProfileExport } from '../types';

interface StreamDeckDmxModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const StreamDeckDmxModal: React.FC<StreamDeckDmxModalProps> = ({
  isOpen,
  onClose,
}) => {
  const [activeTab, setActiveTab] = useState<'streamdeck' | 'dmx' | 'timecode'>('streamdeck');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [copiedCompanion, setCopiedCompanion] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Stream Deck State
  const [profile, setProfile] = useState<StreamDeckProfileExport | null>(null);
  const [selectedButton, setSelectedButton] = useState<StreamDeckButton | null>(null);

  // DMX State
  const [dmxConfig, setDmxConfig] = useState<DmxConfig>({
    id: 'default-dmx',
    isEnabled: false,
    targetIp: '127.0.0.1',
    targetPort: 6454,
    universe: 0,
    triggerOnSlideChange: false,
    slideCueChannel: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  // Fixture Test State
  const [testChannel, setTestChannel] = useState<number>(1);
  const [testValue, setTestValue] = useState<number>(255);
  const [testingFlash, setTestingFlash] = useState(false);
  const [testFeedback, setTestFeedback] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      void loadData();
    }
  }, [isOpen]);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [prof, dmx] = await Promise.all([
        api.getStreamDeckProfile(),
        api.getDmxConfig(),
      ]);
      setProfile(prof);
      setDmxConfig(dmx);
      if (prof.buttons.length > 0) {
        setSelectedButton(prof.buttons[0]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const handleSaveDmx = async () => {
    setSaving(true);
    setError(null);
    setSaveSuccess(false);
    try {
      const updated = await api.updateDmxConfig(dmxConfig);
      setDmxConfig(updated);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const handleSendTestCue = async (channel: number, value: number) => {
    setTestingFlash(true);
    setTestFeedback(null);
    try {
      await api.sendDmxTestCue(channel, value);
      setTestFeedback(`Art-Net packet sent: Channel ${channel} = ${value} (Universe ${dmxConfig.universe})`);
      setTimeout(() => setTestFeedback(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setTestingFlash(false);
    }
  };

  const handleDownloadProfile = () => {
    if (!profile) return;
    const jsonStr = JSON.stringify(profile, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ChurchPresenter-StreamDeck-Profile-port${profile.defaultOscPort}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleCopyCompanionGuide = () => {
    if (!profile) return;
    navigator.clipboard.writeText(profile.companionOscSummary);
    setCopiedCompanion(true);
    setTimeout(() => setCopiedCompanion(false), 2500);
  };

  if (!isOpen) return null;

  const renderButtonIcon = (iconName: string) => {
    switch (iconName) {
      case 'arrow-left':
        return <ArrowLeft className="w-5 h-5" />;
      case 'arrow-right':
        return <ArrowRight className="w-5 h-5" />;
      case 'skip-back':
        return <SkipBack className="w-5 h-5" />;
      case 'skip-forward':
        return <SkipForward className="w-5 h-5" />;
      case 'radio':
        return <Radio className="w-5 h-5" />;
      case 'moon':
        return <Moon className="w-5 h-5" />;
      case 'image':
        return <ImageIcon className="w-5 h-5" />;
      case 'type':
        return <Type className="w-5 h-5" />;
      case 'layers':
        return <Layers className="w-5 h-5" />;
      case 'play':
        return <Play className="w-5 h-5" />;
      case 'tv':
        return <Tv className="w-5 h-5" />;
      case 'message-square':
        return <MessageSquare className="w-5 h-5" />;
      case 'eye':
        return <Eye className="w-5 h-5" />;
      case 'zap':
        return <Zap className="w-5 h-5" />;
      default:
        return <Sliders className="w-5 h-5" />;
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="hardware-modal-title"
    >
      <div className="bg-slate-900 border border-slate-800 rounded-xl w-full max-w-4xl shadow-2xl flex flex-col max-h-[92vh] overflow-hidden text-slate-100">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/50">
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-lg bg-teal-500/10 text-teal-400">
              <Zap className="w-6 h-6" />
            </div>
            <div>
              <h2 id="hardware-modal-title" className="text-xl font-bold text-white">
                Hardware, Stream Deck & DMX Lighting
              </h2>
              <p className="text-xs text-slate-400">
                15-key Stream Deck layout, Bitfocus Companion presets, DMX512 Art-Net and Timecode Follow
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-slate-800 bg-slate-950/30 px-6 pt-2">
          <button
            onClick={() => setActiveTab('streamdeck')}
            className={`flex items-center space-x-2 py-3 px-4 border-b-2 font-medium text-sm transition ${
              activeTab === 'streamdeck'
                ? 'border-teal-500 text-teal-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Tv className="w-4 h-4" />
            <span>Stream Deck (15-Key)</span>
          </button>
          <button
            onClick={() => setActiveTab('dmx')}
            className={`flex items-center space-x-2 py-3 px-4 border-b-2 font-medium text-sm transition ${
              activeTab === 'dmx'
                ? 'border-teal-500 text-teal-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Lightbulb className="w-4 h-4" />
            <span>DMX Lighting (Art-Net)</span>
            {dmxConfig.isEnabled && (
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse ml-1" />
            )}
          </button>
          <button
            onClick={() => setActiveTab('timecode')}
            className={`flex items-center space-x-2 py-3 px-4 border-b-2 font-medium text-sm transition ${
              activeTab === 'timecode'
                ? 'border-teal-500 text-teal-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Clock className="w-4 h-4" />
            <span>Timecode Follow & MTC</span>
          </button>
        </div>

        {/* Error / Feedback Banner */}
        {error && (
          <div className="mx-6 mt-4 p-3 rounded-lg bg-red-950/50 border border-red-800 text-red-200 text-sm flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0" />
              <span>{error}</span>
            </div>
            <button
              onClick={() => setError(null)}
              className="text-red-400 hover:text-red-200 text-xs ml-2"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-slate-400 text-sm">
              Loading hardware configuration...
            </div>
          ) : activeTab === 'streamdeck' ? (
            /* ================= TAB 1: STREAM DECK ================= */
            <div className="space-y-6">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-800/40 p-4 rounded-xl border border-slate-800">
                <div>
                  <h3 className="font-semibold text-white">Stream Deck 15-Key Interactive Profile</h3>
                  <p className="text-xs text-slate-400 mt-1">
                    Preconfigured 3×5 grid mapped to Church Presenter OSC endpoints on port{' '}
                    <span className="font-mono text-teal-300">{profile?.defaultOscPort ?? 8000}</span>.
                  </p>
                </div>
                <div className="flex items-center space-x-2">
                  <button
                    onClick={handleCopyCompanionGuide}
                    className="flex items-center space-x-1.5 px-3 py-2 text-xs font-medium rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition"
                  >
                    {copiedCompanion ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                        <span>Copied OSC Guide</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5 text-slate-400" />
                        <span>Copy Companion Guide</span>
                      </>
                    )}
                  </button>
                  <button
                    onClick={handleDownloadProfile}
                    className="flex items-center space-x-1.5 px-3 py-2 text-xs font-semibold rounded-lg bg-teal-600 hover:bg-teal-500 text-white transition shadow-sm"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download Profile (.json)</span>
                  </button>
                </div>
              </div>

              {/* 3x5 Stream Deck Visual Grid */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="md:col-span-2 bg-slate-950/70 p-4 rounded-xl border border-slate-800 flex flex-col items-center">
                  <div className="text-[11px] font-mono uppercase tracking-wider text-slate-400 mb-3">
                    Elgato Stream Deck / Companion 3×5 Surface
                  </div>
                  <div className="grid grid-cols-5 gap-3 w-full max-w-lg">
                    {profile?.buttons.map((btn, idx) => {
                      const isSelected =
                        selectedButton?.row === btn.row && selectedButton?.col === btn.col;
                      return (
                        <button
                          key={`${btn.row}-${btn.col}-${idx}`}
                          onClick={() => setSelectedButton(btn)}
                          style={{
                            borderColor: isSelected ? '#38bdf8' : '#334155',
                          }}
                          className={`aspect-square rounded-xl p-2 flex flex-col items-center justify-center text-center transition-all transform active:scale-95 shadow-md relative group border ${
                            isSelected
                              ? 'ring-2 ring-sky-400 ring-offset-2 ring-offset-slate-950 bg-slate-800'
                              : 'bg-slate-900/90 hover:bg-slate-800'
                          }`}
                        >
                          <div
                            className="p-1.5 rounded-lg mb-1"
                            style={{ backgroundColor: `${btn.color}33`, color: btn.color }}
                          >
                            {renderButtonIcon(btn.icon)}
                          </div>
                          <span className="text-[10px] font-bold tracking-tight text-white line-clamp-2 leading-tight">
                            {btn.title.replace('\n', ' ')}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Button Inspector Panel */}
                <div className="bg-slate-950/70 p-4 rounded-xl border border-slate-800 flex flex-col">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">
                    Button Inspector
                  </h4>
                  {selectedButton ? (
                    <div className="space-y-3 text-xs">
                      <div>
                        <div className="text-slate-400">Title</div>
                        <div className="text-sm font-semibold text-white mt-0.5">
                          {selectedButton.title.replace('\n', ' ')}
                        </div>
                      </div>
                      <div>
                        <div className="text-slate-400">Action</div>
                        <div className="font-mono text-teal-300 mt-0.5 bg-slate-900 px-2 py-1 rounded border border-slate-800">
                          {selectedButton.action}
                        </div>
                      </div>
                      <div>
                        <div className="text-slate-400">OSC Address Path</div>
                        <div className="font-mono text-amber-300 mt-0.5 bg-slate-900 px-2 py-1 rounded border border-slate-800">
                          {selectedButton.oscPath}
                        </div>
                      </div>
                      <div>
                        <div className="text-slate-400">Position (Row, Column)</div>
                        <div className="text-slate-200 mt-0.5">
                          Row {selectedButton.row + 1}, Col {selectedButton.col + 1}
                        </div>
                      </div>
                      <div>
                        <div className="text-slate-400">Description</div>
                        <p className="text-slate-300 mt-0.5 leading-relaxed">
                          {selectedButton.description}
                        </p>
                      </div>
                    </div>
                  ) : (
                    <p className="text-slate-400 text-xs">Select a key to view mapping details.</p>
                  )}
                </div>
              </div>

              {/* Bitfocus Companion Quick Guide */}
              <div className="bg-slate-950/50 p-4 rounded-xl border border-slate-800">
                <div className="flex items-center space-x-2 text-sm font-semibold text-white mb-2">
                  <Sliders className="w-4 h-4 text-teal-400" />
                  <span>Bitfocus Companion OSC Setup Instructions</span>
                </div>
                <pre className="text-xs font-mono text-slate-300 bg-slate-900 p-3 rounded-lg overflow-x-auto whitespace-pre-wrap border border-slate-800/80">
                  {profile?.companionOscSummary}
                </pre>
              </div>
            </div>
          ) : activeTab === 'dmx' ? (
            /* ================= TAB 2: DMX LIGHTING (ART-NET) ================= */
            <div className="space-y-6">
              {/* Master DMX Configuration */}
              <div className="bg-slate-950/70 p-5 rounded-xl border border-slate-800 space-y-5">
                <div className="flex items-center justify-between pb-4 border-b border-slate-800">
                  <div className="flex items-center space-x-3">
                    <div
                      className={`p-2 rounded-lg ${
                        dmxConfig.isEnabled ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-800 text-slate-400'
                      }`}
                    >
                      <Lightbulb className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="font-semibold text-white">Art-Net DMX512 Output</h4>
                      <p className="text-xs text-slate-400">
                        {dmxConfig.isEnabled
                          ? 'DMX output active. Transmitting UDP datagrams to stage fixtures/consoles.'
                          : 'DMX output is disabled by default. Enable to connect to your lighting network.'}
                      </p>
                    </div>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={dmxConfig.isEnabled}
                      onChange={(e) => setDmxConfig({ ...dmxConfig, isEnabled: e.target.checked })}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
                  </label>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">
                      Target IP Address
                    </label>
                    <input
                      type="text"
                      value={dmxConfig.targetIp}
                      onChange={(e) => setDmxConfig({ ...dmxConfig, targetIp: e.target.value })}
                      placeholder="127.0.0.1 or 255.255.255.255"
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-teal-500 font-mono"
                    />
                    <span className="text-[10px] text-slate-400">
                      Unicast or subnet broadcast IP
                    </span>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">
                      Target UDP Port
                    </label>
                    <input
                      type="number"
                      value={dmxConfig.targetPort}
                      onChange={(e) =>
                        setDmxConfig({ ...dmxConfig, targetPort: parseInt(e.target.value) || 6454 })
                      }
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-teal-500 font-mono"
                    />
                    <span className="text-[10px] text-slate-400">Standard Art-Net is 6454</span>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">
                      Art-Net Universe
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={32767}
                      value={dmxConfig.universe}
                      onChange={(e) =>
                        setDmxConfig({ ...dmxConfig, universe: parseInt(e.target.value) || 0 })
                      }
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-teal-500 font-mono"
                    />
                    <span className="text-[10px] text-slate-400">0-indexed (Sub-Net / Universe)</span>
                  </div>
                </div>

                {/* Slide Cue Follow Settings */}
                <div className="pt-4 border-t border-slate-800 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm font-medium text-slate-200">
                        Slide Change Cue Follow
                      </div>
                      <div className="text-xs text-slate-400">
                        Automatically output a lighting cue byte value whenever the presentation slide advances
                      </div>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={dmxConfig.triggerOnSlideChange}
                        onChange={(e) =>
                          setDmxConfig({ ...dmxConfig, triggerOnSlideChange: e.target.checked })
                        }
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-teal-500"></div>
                    </label>
                  </div>

                  {dmxConfig.triggerOnSlideChange && (
                    <div className="bg-slate-900/80 p-3 rounded-lg border border-slate-800 flex items-center justify-between max-w-sm">
                      <label className="text-xs font-medium text-slate-300">
                        Slide Cue DMX Channel (1-512)
                      </label>
                      <input
                        type="number"
                        min={1}
                        max={512}
                        value={dmxConfig.slideCueChannel}
                        onChange={(e) =>
                          setDmxConfig({
                            ...dmxConfig,
                            slideCueChannel: Math.min(512, Math.max(1, parseInt(e.target.value) || 1)),
                          })
                        }
                        className="w-24 bg-slate-950 border border-slate-700 rounded px-2 py-1 text-sm text-center text-teal-300 font-mono focus:outline-none focus:border-teal-500"
                      />
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-end pt-2">
                  <button
                    onClick={handleSaveDmx}
                    disabled={saving}
                    className="flex items-center space-x-1.5 px-4 py-2 rounded-lg bg-teal-600 hover:bg-teal-500 disabled:opacity-50 text-white font-medium text-sm transition"
                  >
                    {saveSuccess ? (
                      <>
                        <Check className="w-4 h-4 text-emerald-300" />
                        <span>Saved Successfully</span>
                      </>
                    ) : (
                      <span>{saving ? 'Saving...' : 'Save DMX Configuration'}</span>
                    )}
                  </button>
                </div>
              </div>

              {/* Interactive Fixture / Console Flash Test */}
              <div className="bg-slate-950/70 p-5 rounded-xl border border-slate-800 space-y-4">
                <div className="flex items-center space-x-2">
                  <Zap className="w-4 h-4 text-amber-400" />
                  <h4 className="font-semibold text-white">Live Fixture Test (Art-Net Cue Dispatch)</h4>
                </div>
                <p className="text-xs text-slate-400">
                  Sends an Art-Net packet immediately to test dimmer channels, moving heads, or stage relays without altering saved presentation cues.
                </p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-slate-900/60 p-4 rounded-lg border border-slate-800">
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">
                      Test Channel (1 - 512)
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={512}
                      value={testChannel}
                      onChange={(e) =>
                        setTestChannel(Math.min(512, Math.max(1, parseInt(e.target.value) || 1)))
                      }
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-teal-500"
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs font-medium text-slate-300">
                        Intensity Value: {testValue} ({Math.round((testValue / 255) * 100)}%)
                      </label>
                      <div className="space-x-1">
                        <button
                          onClick={() => setTestValue(0)}
                          className="px-2 py-0.5 text-[10px] bg-slate-800 hover:bg-slate-700 text-slate-300 rounded"
                        >
                          0%
                        </button>
                        <button
                          onClick={() => setTestValue(128)}
                          className="px-2 py-0.5 text-[10px] bg-slate-800 hover:bg-slate-700 text-slate-300 rounded"
                        >
                          50%
                        </button>
                        <button
                          onClick={() => setTestValue(255)}
                          className="px-2 py-0.5 text-[10px] bg-slate-800 hover:bg-slate-700 text-slate-300 rounded"
                        >
                          100%
                        </button>
                      </div>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={255}
                      value={testValue}
                      onChange={(e) => setTestValue(parseInt(e.target.value) || 0)}
                      className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-teal-500"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <div className="text-xs text-slate-400">
                    {testFeedback && (
                      <span className="text-emerald-400 font-mono">{testFeedback}</span>
                    )}
                  </div>
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => handleSendTestCue(testChannel, 0)}
                      disabled={testingFlash}
                      className="px-3 py-1.5 text-xs font-medium rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition"
                    >
                      Blackout (0)
                    </button>
                    <button
                      onClick={() => handleSendTestCue(testChannel, 255)}
                      disabled={testingFlash}
                      className="px-3 py-1.5 text-xs font-medium rounded-lg bg-amber-600 hover:bg-amber-500 text-white transition"
                    >
                      Full Flash (255)
                    </button>
                    <button
                      onClick={() => handleSendTestCue(testChannel, testValue)}
                      disabled={testingFlash}
                      className="px-4 py-1.5 text-xs font-semibold rounded-lg bg-teal-600 hover:bg-teal-500 text-white transition"
                    >
                      {testingFlash ? 'Transmitting...' : 'Send Cue'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            /* ================= TAB 3: TIMECODE FOLLOW & MTC ================= */
            <div className="space-y-6">
              <div className="bg-slate-950/70 p-5 rounded-xl border border-slate-800 space-y-4">
                <div className="flex items-center space-x-2 text-white font-semibold">
                  <Clock className="w-5 h-5 text-teal-400" />
                  <h4>Timecode Follow (MTC / OSC SMPTE)</h4>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Church Presenter can synchronize slides and cues to external DAW playback (Ableton Live, Logic Pro, Pro Tools, Reaper) via MIDI Time Code (MTC) or OSC Timecode packets.
                </p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                  <div className="bg-slate-900/80 p-4 rounded-lg border border-slate-800 space-y-2">
                    <h5 className="text-xs font-semibold text-teal-300 uppercase tracking-wider">
                      MIDI Time Code (MTC)
                    </h5>
                    <p className="text-xs text-slate-400 leading-relaxed">
                      Connect your audio interface MIDI DIN or USB MIDI controller. Church Presenter listens on the MIDI input port selected in MIDI Settings. Quarter-frame and full-frame MTC messages update the presentation timeline clock in real time.
                    </p>
                  </div>

                  <div className="bg-slate-900/80 p-4 rounded-lg border border-slate-800 space-y-2">
                    <h5 className="text-xs font-semibold text-amber-300 uppercase tracking-wider">
                      OSC SMPTE Timecode
                    </h5>
                    <p className="text-xs text-slate-400 leading-relaxed">
                      DAWs and stage control systems can send OSC timecode strings to <code className="text-slate-200">/timecode</code> (format: <code className="text-slate-200">HH:MM:SS:FF</code>) or discrete floats to <code className="text-slate-200">/timecode/seconds</code>.
                    </p>
                  </div>
                </div>

                <div className="bg-slate-900/40 p-3 rounded-lg border border-slate-800 text-xs text-slate-400">
                  <span className="font-semibold text-white">Recommended Production Workflow: </span>
                  Automate slide triggers in Ableton Live by adding an OSC Out or MIDI Note clip on the master arrangement timeline matching your song sections (Verse, Chorus, Bridge).
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-800 bg-slate-950/50 text-xs text-slate-400">
          <div>
            Art-Net UDP Port <span className="text-slate-200 font-mono">6454</span> | OSC UDP Port <span className="text-slate-200 font-mono">{profile?.defaultOscPort ?? 8000}</span>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white font-medium rounded-lg transition"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
