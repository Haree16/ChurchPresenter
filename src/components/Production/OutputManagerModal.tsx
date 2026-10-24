import React, { useEffect, useState } from 'react';
import { api } from '../../services/api';
import { ContentSource, DisplayMonitor, OutputConfig, OutputType } from '../../types';

interface OutputManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const OutputManagerModal: React.FC<OutputManagerModalProps> = ({
  isOpen,
  onClose,
}) => {
  const [outputs, setOutputs] = useState<OutputConfig[]>([]);
  const [monitors, setMonitors] = useState<DisplayMonitor[]>([]);
  const [selectedOutput, setSelectedOutput] = useState<OutputConfig | null>(null);
  const [editingOutput, setEditingOutput] = useState<OutputConfig | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      loadData();
    }
  }, [isOpen]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [outList, monList] = await Promise.all([
        api.listOutputs(),
        api.getAvailableMonitors(),
      ]);
      setOutputs(outList);
      setMonitors(monList);
      if (outList.length > 0 && !selectedOutput) {
        setSelectedOutput(outList[0]);
      }
    } catch (e) {
      console.error('Failed to load output configurations:', e);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  const handleCreateNew = () => {
    const newOutput: OutputConfig = {
      id: `output-${Date.now()}`,
      name: 'New Presentation Output',
      outputType: 'presentation',
      targetMonitorId: monitors.length > 1 ? monitors[1].id : null,
      resolutionWidth: 1920,
      resolutionHeight: 1080,
      aspectRatio: '16:9',
      safeMarginPercent: 5.0,
      contentSource: 'live_slide',
      themeId: null,
      isEnabled: true,
      isActive: false,
      error: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    setEditingOutput(newOutput);
    setIsCreating(true);
  };

  const handleSave = async (outputToSave: OutputConfig) => {
    setLoading(true);
    setMessage(null);
    try {
      if (isCreating) {
        await api.createOutput(outputToSave);
      } else {
        await api.updateOutput(outputToSave);
      }
      setIsCreating(false);
      setEditingOutput(null);
      await loadData();
      setMessage('Output configuration saved successfully.');
    } catch (e: any) {
      setMessage(`Error: ${e.message || String(e)}`);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (id === 'output-audience' || id === 'output-stage' || id === 'output-overlay') {
      alert('Core production outputs cannot be deleted. You can disable them instead.');
      return;
    }
    if (!confirm('Are you sure you want to delete this output?')) return;
    try {
      await api.deleteOutput(id);
      setSelectedOutput(null);
      await loadData();
    } catch (e: any) {
      alert(`Delete error: ${e.message || String(e)}`);
    }
  };

  const toggleOutputWindow = async (output: OutputConfig) => {
    try {
      if (output.outputType === 'audience') {
        const status = await api.getAudienceStatus();
        if (status.isOpen) {
          await api.closeAudienceWindow();
        } else {
          await api.openAudienceWindow(output.targetMonitorId || undefined, true);
        }
      } else if (output.outputType === 'stage') {
        const status = await api.getStageStatus();
        if (status.isOpen) {
          await api.closeStageWindow();
        } else {
          await api.openStageWindow(output.targetMonitorId || undefined, true);
        }
      } else if (output.outputType === 'overlay') {
        const status = await api.getOverlayStatus();
        if (status.isOpen) {
          await api.closeOverlayWindow();
        } else {
          await api.openOverlayWindow(output.targetMonitorId || undefined, false);
        }
      } else {
        // Additional generic output uses audience renderer
        await api.openAudienceWindow(output.targetMonitorId || undefined, false);
      }
      await loadData();
    } catch (e: any) {
      alert(`Output control error: ${e.message || String(e)}`);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-4xl w-full max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 bg-slate-800/80 border-b border-slate-700/80 flex justify-between items-center">
          <div>
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <span>🖥️</span> Independent Presentation Outputs
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Route distinct content to Audience screens, Confidence stage monitors, and Livestream Overlays.
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-700 transition"
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 flex overflow-hidden">
          {/* Output list sidebar */}
          <div className="w-80 border-r border-slate-800 p-4 flex flex-col justify-between bg-slate-950/40">
            <div className="space-y-2 overflow-y-auto pr-1">
              <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                Configured Outputs ({outputs.length})
              </div>
              {outputs.map((out) => (
                <div
                  key={out.id}
                  onClick={() => {
                    setSelectedOutput(out);
                    setEditingOutput(null);
                    setIsCreating(false);
                  }}
                  className={`p-3 rounded-lg border text-left cursor-pointer transition ${
                    selectedOutput?.id === out.id && !editingOutput
                      ? 'bg-blue-600/20 border-blue-500 text-white'
                      : 'bg-slate-800/40 border-slate-800 hover:border-slate-700 text-slate-300'
                  }`}
                >
                  <div className="flex justify-between items-start">
                    <span className="font-semibold text-sm truncate">{out.name}</span>
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded font-mono uppercase ${
                        out.isEnabled
                          ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                          : 'bg-slate-700 text-slate-400'
                      }`}
                    >
                      {out.isEnabled ? 'Enabled' : 'Disabled'}
                    </span>
                  </div>
                  <div className="text-xs text-slate-400 mt-1 flex gap-2">
                    <span className="capitalize">{out.outputType}</span>
                    <span>•</span>
                    <span>{out.aspectRatio}</span>
                  </div>
                </div>
              ))}
            </div>

            <button
              onClick={handleCreateNew}
              className="mt-4 w-full py-2 px-3 bg-blue-600 hover:bg-blue-500 text-white font-medium text-xs rounded-lg transition flex items-center justify-center gap-1.5"
            >
              <span>+</span> Add Custom Output
            </button>
          </div>

          {/* Output Detail / Edit Pane */}
          <div className="flex-1 p-6 overflow-y-auto">
            {message && (
              <div className="mb-4 p-3 bg-blue-900/40 border border-blue-700/60 rounded-lg text-xs text-blue-200">
                {message}
              </div>
            )}

            {editingOutput ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSave(editingOutput);
                }}
                className="space-y-4"
              >
                <div className="flex justify-between items-center border-b border-slate-800 pb-3">
                  <h3 className="font-bold text-white text-base">
                    {isCreating ? 'Create New Presentation Output' : `Edit ${editingOutput.name}`}
                  </h3>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingOutput(null);
                      setIsCreating(false);
                    }}
                    className="text-xs text-slate-400 hover:text-white"
                  >
                    Cancel
                  </button>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">
                    Output Name
                  </label>
                  <input
                    type="text"
                    required
                    value={editingOutput.name}
                    onChange={(e) =>
                      setEditingOutput({ ...editingOutput, name: e.target.value })
                    }
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">
                      Output Role
                    </label>
                    <select
                      value={editingOutput.outputType}
                      onChange={(e) =>
                        setEditingOutput({
                          ...editingOutput,
                          outputType: e.target.value as OutputType,
                        })
                      }
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
                    >
                      <option value="audience">Audience / Projector</option>
                      <option value="stage">Confidence / Stage Display</option>
                      <option value="overlay">Livestream Lower-Third Overlay</option>
                      <option value="presentation">Auxiliary Presentation Output</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">
                      Content Source
                    </label>
                    <select
                      value={editingOutput.contentSource}
                      onChange={(e) =>
                        setEditingOutput({
                          ...editingOutput,
                          contentSource: e.target.value as ContentSource,
                        })
                      }
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
                    >
                      <option value="live_slide">Live Presentation Slide</option>
                      <option value="next_slide">Next Slide Preview</option>
                      <option value="lyrics_only">Lyrics Only (Transparent)</option>
                      <option value="stage_layout">Stage Confidence Layout</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">
                      Target Physical Monitor
                    </label>
                    <select
                      value={editingOutput.targetMonitorId || ''}
                      onChange={(e) =>
                        setEditingOutput({
                          ...editingOutput,
                          targetMonitorId: e.target.value || null,
                        })
                      }
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
                    >
                      <option value="">Default / First Available</option>
                      {monitors.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name} ({m.width}x{m.height}) {m.isPrimary ? '(Primary)' : ''}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">
                      Aspect Ratio
                    </label>
                    <select
                      value={editingOutput.aspectRatio}
                      onChange={(e) =>
                        setEditingOutput({
                          ...editingOutput,
                          aspectRatio: e.target.value,
                        })
                      }
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
                    >
                      <option value="16:9">16:9 (Standard Widescreen)</option>
                      <option value="4:3">4:3 (Traditional Display)</option>
                      <option value="16:10">16:10 (Computer Display)</option>
                      <option value="custom">Custom Resolution</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">
                      Safe Area Margin ({editingOutput.safeMarginPercent}%)
                    </label>
                    <input
                      type="range"
                      min="0"
                      max="15"
                      step="0.5"
                      value={editingOutput.safeMarginPercent}
                      onChange={(e) =>
                        setEditingOutput({
                          ...editingOutput,
                          safeMarginPercent: parseFloat(e.target.value),
                        })
                      }
                      className="w-full"
                    />
                  </div>

                  <div className="flex items-center gap-3 pt-4">
                    <label className="flex items-center gap-2 cursor-pointer text-sm text-slate-300">
                      <input
                        type="checkbox"
                        checked={editingOutput.isEnabled}
                        onChange={(e) =>
                          setEditingOutput({
                            ...editingOutput,
                            isEnabled: e.target.checked,
                          })
                        }
                        className="rounded bg-slate-800 border-slate-700 text-blue-600 focus:ring-0"
                      />
                      Enable this output
                    </label>
                  </div>
                </div>

                <div className="pt-4 flex justify-end gap-2 border-t border-slate-800">
                  <button
                    type="button"
                    onClick={() => {
                      setEditingOutput(null);
                      setIsCreating(false);
                    }}
                    className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs rounded-lg transition"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    className="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white font-medium text-xs rounded-lg transition"
                  >
                    {loading ? 'Saving...' : 'Save Configuration'}
                  </button>
                </div>
              </form>
            ) : selectedOutput ? (
              <div className="space-y-6">
                <div className="flex justify-between items-start border-b border-slate-800 pb-4">
                  <div>
                    <h3 className="text-xl font-bold text-white">{selectedOutput.name}</h3>
                    <div className="text-xs text-slate-400 mt-1 flex gap-2">
                      <span className="font-mono">{selectedOutput.id}</span>
                      <span>•</span>
                      <span className="capitalize">{selectedOutput.outputType} Output</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setEditingOutput({ ...selectedOutput })}
                      className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs rounded-lg border border-slate-700 transition"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => toggleOutputWindow(selectedOutput)}
                      className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-lg transition flex items-center gap-1.5"
                    >
                      <span>📺</span> Toggle Window
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 bg-slate-800/30 p-4 rounded-xl border border-slate-800 text-xs">
                  <div>
                    <span className="text-slate-400 block mb-1">Target Monitor:</span>
                    <strong className="text-slate-200">
                      {monitors.find((m) => m.id === selectedOutput.targetMonitorId)?.name ||
                        'Default Display'}
                    </strong>
                  </div>
                  <div>
                    <span className="text-slate-400 block mb-1">Content Source:</span>
                    <strong className="text-slate-200 capitalize">
                      {selectedOutput.contentSource.replace('_', ' ')}
                    </strong>
                  </div>
                  <div>
                    <span className="text-slate-400 block mb-1">Aspect Ratio:</span>
                    <strong className="text-slate-200">{selectedOutput.aspectRatio}</strong>
                  </div>
                  <div>
                    <span className="text-slate-400 block mb-1">Safe Margins:</span>
                    <strong className="text-slate-200">
                      {selectedOutput.safeMarginPercent}%
                    </strong>
                  </div>
                </div>

                {/* Available Physical Monitors Info */}
                <div>
                  <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                    Detected System Monitors ({monitors.length})
                  </h4>
                  <div className="space-y-2">
                    {monitors.map((m) => (
                      <div
                        key={m.id}
                        className="p-3 bg-slate-950/60 border border-slate-800 rounded-lg flex justify-between items-center text-xs"
                      >
                        <div>
                          <strong className="text-slate-200 block">{m.name}</strong>
                          <span className="text-slate-400">
                            {m.width} × {m.height} ({m.scaleFactor}x scale)
                          </span>
                        </div>
                        {m.isPrimary && (
                          <span className="px-2 py-0.5 bg-blue-500/20 text-blue-400 rounded text-[11px] font-mono">
                            Primary (Workspace)
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {selectedOutput.id !== 'output-audience' &&
                  selectedOutput.id !== 'output-stage' &&
                  selectedOutput.id !== 'output-overlay' && (
                    <div className="pt-4 border-t border-slate-800 flex justify-end">
                      <button
                        onClick={() => handleDelete(selectedOutput.id)}
                        className="text-xs text-rose-400 hover:text-rose-300 transition"
                      >
                        Delete this output
                      </button>
                    </div>
                  )}
              </div>
            ) : (
              <div className="h-full flex items-center justify-center text-slate-500 text-sm">
                Select an output from the list or click Add to create one.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
