import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Film,
  Music,
  Upload,
  Trash2,
  Check,
  Search,
  Play,
  AlertTriangle,
  FolderOpen,
} from 'lucide-react';
import { MediaAsset } from '../../types';
import { api, isTauri } from '../../services/api';
import {
  formatFileSize,
  formatMediaDuration,
  mediaService,
  ALL_SUPPORTED_EXTENSIONS,
} from '../../services/mediaService';
import { open as openFileDialog } from '@tauri-apps/plugin-dialog';

interface MediaLibraryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectMedia?: (asset: MediaAsset) => void;
}

export const MediaLibraryModal: React.FC<MediaLibraryModalProps> = ({
  isOpen,
  onClose,
  onSelectMedia,
}) => {
  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<'all' | 'image' | 'video' | 'audio'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  const [importPath, setImportPath] = useState('');
  const [notification, setNotification] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [warningModal, setWarningModal] = useState<{
    assetId: string;
    usageCount: number;
    filename: string;
  } | null>(null);

  const refreshAssets = async () => {
    try {
      const list = await api.listMediaAssets();
      setAssets(list);
    } catch (err) {
      console.error('Failed to load media assets:', err);
    }
  };

  useEffect(() => {
    if (isOpen) {
      refreshAssets();
    }
  }, [isOpen]);

  const handleBrowseFiles = async () => {
    try {
      if (typeof window !== 'undefined' && isTauri()) {
        const selected = await openFileDialog({
          multiple: false,
          filters: [
            {
              name: 'Media Files',
              extensions: ALL_SUPPORTED_EXTENSIONS,
            },
            {
              name: 'Images',
              extensions: ['jpg', 'jpeg', 'png', 'webp'],
            },
            {
              name: 'Videos',
              extensions: ['mp4', 'webm'],
            },
            {
              name: 'Audio',
              extensions: ['mp3', 'wav', 'ogg'],
            },
          ],
        });
        if (selected && typeof selected === 'string') {
          setIsImporting(true);
          try {
            const newAsset = await api.importMediaAsset(selected);
            await refreshAssets();
            setSelectedAssetId(newAsset.id);
            showNotification(`Imported ${newAsset.originalFilename}`);
          } catch (err: any) {
            alert(err?.message || 'Failed to import media file');
          } finally {
            setIsImporting(false);
          }
        }
      } else {
        fileInputRef.current?.click();
      }
    } catch (err: any) {
      console.error('File dialog error:', err);
    }
  };

  const handleFallbackFileInput = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const path = (file as any).path || file.name;
    setIsImporting(true);
    try {
      const newAsset = await api.importMediaAsset(path);
      await refreshAssets();
      setSelectedAssetId(newAsset.id);
      showNotification(`Imported ${newAsset.originalFilename}`);
    } catch (err: any) {
      alert(err?.message || 'Failed to import media file');
    } finally {
      setIsImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = e.dataTransfer.files;
    if (!files || files.length === 0) return;
    const file = files[0];
    const path = (file as any).path || file.name;
    setIsImporting(true);
    try {
      const newAsset = await api.importMediaAsset(path);
      await refreshAssets();
      setSelectedAssetId(newAsset.id);
      showNotification(`Imported ${newAsset.originalFilename}`);
    } catch (err: any) {
      alert(err?.message || 'Failed to import media file');
    } finally {
      setIsImporting(false);
    }
  };

  const handleImportAsset = async () => {
    if (!importPath.trim()) return;
    setIsImporting(true);
    try {
      const newAsset = await api.importMediaAsset(importPath.trim());
      await refreshAssets();
      setSelectedAssetId(newAsset.id);
      setImportPath('');
      showNotification(`Imported ${newAsset.originalFilename}`);
    } catch (err: any) {
      alert(err?.message || 'Failed to import media file');
    } finally {
      setIsImporting(false);
    }
  };

  const handleTriggerDelete = async (asset: MediaAsset) => {
    try {
      const usageCount = await api.checkMediaAssetUsage(asset.id);
      if (usageCount > 0) {
        setWarningModal({
          assetId: asset.id,
          usageCount,
          filename: asset.originalFilename,
        });
      } else {
        if (window.confirm(`Delete "${asset.originalFilename}" from the media library?`)) {
          await executeDelete(asset.id);
        }
      }
    } catch {
      if (window.confirm(`Delete "${asset.originalFilename}" from the media library?`)) {
        await executeDelete(asset.id);
      }
    }
  };

  const executeDelete = async (id: string) => {
    try {
      await api.deleteMediaAsset(id);
      await refreshAssets();
      if (selectedAssetId === id) setSelectedAssetId(null);
      setWarningModal(null);
      showNotification('Media asset deleted');
    } catch (err: any) {
      alert(err?.message || 'Failed to delete media asset');
    }
  };

  const handlePresentLive = async (asset: MediaAsset) => {
    try {
      await api.setMediaPlayback({
        mediaId: asset.id,
        mediaUrl: mediaService.resolveMediaUrl(asset.relativePath),
        mediaType: asset.mediaType,
        isPlaying: true,
        isMuted: false,
        volume: 1.0,
        isLooping: true,
        currentTime: 0,
        duration: asset.durationSeconds || 0,
        fitMode: 'cover',
        error: null,
      });
      showNotification(`Sent "${asset.originalFilename}" to Live Output`);
    } catch (err) {
      console.error('Failed to present media live:', err);
    }
  };

  const showNotification = (msg: string) => {
    setNotification(msg);
    setTimeout(() => setNotification(null), 3000);
  };

  const filteredAssets = assets.filter((asset) => {
    if (filterType !== 'all' && asset.mediaType !== filterType) {
      return false;
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        asset.originalFilename.toLowerCase().includes(q) ||
        asset.filename.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const selectedAsset = assets.find((a) => a.id === selectedAssetId);

  if (!isOpen) return null;

  return (
    <div
      data-testid="media-library-modal"
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.75)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: '20px',
      }}
    >
      <div
        style={{
          width: '980px',
          maxWidth: '96vw',
          maxHeight: '92vh',
          backgroundColor: '#090d16',
          borderRadius: '12px',
          border: '1px solid #1e293b',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7)',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '16px 20px',
            backgroundColor: '#0f172a',
            borderBottom: '1px solid #1e293b',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Film size={20} style={{ color: '#38bdf8' }} />
            <h2 style={{ margin: 0, fontSize: '1.2rem', color: '#f8fafc', fontWeight: 600 }}>
              Media Library & Motion Engine
            </h2>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: '#94a3b8',
              cursor: 'pointer',
              padding: '4px',
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Notification Toast */}
        {notification && (
          <div
            style={{
              backgroundColor: '#10b981',
              color: '#ffffff',
              padding: '8px 16px',
              fontSize: '0.85rem',
              fontWeight: 600,
              textAlign: 'center',
            }}
          >
            {notification}
          </div>
        )}

        {/* Toolbar: Search, Filter Tabs, and Import Input */}
        <div
          style={{
            padding: '12px 20px',
            backgroundColor: '#0d1322',
            borderBottom: '1px solid #1e293b',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '16px',
            flexWrap: 'wrap',
          }}
        >
          {/* Search Input */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              backgroundColor: '#1e293b',
              borderRadius: '6px',
              padding: '6px 12px',
              gap: '8px',
              flex: 1,
              minWidth: '200px',
            }}
          >
            <Search size={16} style={{ color: '#94a3b8' }} />
            <input
              data-testid="media-search-input"
              type="text"
              placeholder="Search images, videos, audio..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#fff',
                fontSize: '0.875rem',
                outline: 'none',
                width: '100%',
              }}
            />
          </div>

          {/* Filter Type Pills */}
          <div style={{ display: 'flex', gap: '6px' }}>
            {(['all', 'image', 'video', 'audio'] as const).map((type) => (
              <button
                key={type}
                onClick={() => setFilterType(type)}
                style={{
                  padding: '6px 12px',
                  borderRadius: '6px',
                  border: 'none',
                  backgroundColor: filterType === type ? '#2563eb' : '#1e293b',
                  color: filterType === type ? '#ffffff' : '#94a3b8',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  textTransform: 'capitalize',
                  cursor: 'pointer',
                }}
              >
                {type === 'all' ? 'All Media' : `${type}s`}
              </button>
            ))}
          </div>

          {/* Import Controls */}
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFallbackFileInput}
              style={{ display: 'none' }}
              accept="image/*,video/*,audio/*"
            />
            <button
              data-testid="browse-media-btn"
              onClick={handleBrowseFiles}
              disabled={isImporting}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 14px',
                backgroundColor: '#2563eb',
                color: '#fff',
                border: 'none',
                borderRadius: '6px',
                fontSize: '0.85rem',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              <FolderOpen size={14} />
              Browse...
            </button>
            <input
              data-testid="import-media-input"
              type="text"
              placeholder="Or enter path..."
              value={importPath}
              onChange={(e) => setImportPath(e.target.value)}
              style={{
                backgroundColor: '#1e293b',
                border: '1px solid #334155',
                color: '#fff',
                padding: '6px 10px',
                borderRadius: '6px',
                fontSize: '0.85rem',
                width: '180px',
              }}
            />
            <button
              data-testid="import-media-btn"
              onClick={handleImportAsset}
              disabled={isImporting || !importPath.trim()}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 14px',
                backgroundColor: '#3b82f6',
                color: '#fff',
                border: 'none',
                borderRadius: '6px',
                fontSize: '0.85rem',
                fontWeight: 600,
                cursor: importPath.trim() ? 'pointer' : 'not-allowed',
                opacity: importPath.trim() ? 1 : 0.6,
              }}
            >
              <Upload size={14} />
              Import
            </button>
          </div>
        </div>

        {/* Content Area: Grid on Left, Preview Pane on Right */}
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={(e) => {
            e.preventDefault();
            setIsDragging(false);
          }}
          onDrop={handleDrop}
          style={{
            display: 'flex',
            flex: 1,
            overflow: 'hidden',
            position: 'relative',
            border: isDragging ? '2px dashed #3b82f6' : 'none',
            backgroundColor: isDragging ? 'rgba(59, 130, 246, 0.05)' : 'transparent',
          }}
        >
          {isDragging && (
            <div
              style={{
                position: 'absolute',
                inset: 0,
                backgroundColor: 'rgba(15, 23, 42, 0.85)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 50,
                flexDirection: 'column',
                gap: '12px',
                pointerEvents: 'none',
              }}
            >
              <Upload size={48} style={{ color: '#3b82f6' }} />
              <div style={{ fontSize: '1.2rem', fontWeight: 700, color: '#f8fafc' }}>
                Drop image, video, or audio file to import
              </div>
            </div>
          )}
          {/* Media Grid */}
          <div
            style={{
              flex: 1,
              padding: '20px',
              overflowY: 'auto',
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
              gap: '16px',
              alignContent: 'flex-start',
            }}
          >
            {filteredAssets.length === 0 ? (
              <div
                style={{
                  gridColumn: '1 / -1',
                  textAlign: 'center',
                  padding: '60px 20px',
                  color: '#64748b',
                }}
              >
                <Film size={48} style={{ opacity: 0.4, marginBottom: '12px' }} />
                <p style={{ margin: 0, fontSize: '0.95rem' }}>No media assets match your filter</p>
                <p style={{ margin: '6px 0 0', fontSize: '0.8rem', color: '#475569' }}>
                  Supported: {ALL_SUPPORTED_EXTENSIONS.join(', ').toUpperCase()}
                </p>
              </div>
            ) : (
              filteredAssets.map((asset) => {
                const isSelected = selectedAssetId === asset.id;
                const isVideo = asset.mediaType === 'video';
                const resolvedUrl = mediaService.resolveMediaUrl(asset.relativePath);

                return (
                  <div
                    key={asset.id}
                    data-testid={`media-asset-card-${asset.id}`}
                    onClick={() => setSelectedAssetId(asset.id)}
                    style={{
                      backgroundColor: isSelected ? '#1e293b' : '#0f172a',
                      borderRadius: '8px',
                      border: isSelected ? '2px solid #38bdf8' : '1px solid #1e293b',
                      overflow: 'hidden',
                      cursor: 'pointer',
                      display: 'flex',
                      flexDirection: 'column',
                      transition: 'border-color 0.15s',
                    }}
                  >
                    {/* Thumbnail / Visual Area */}
                    <div
                      style={{
                        height: '110px',
                        backgroundColor: '#020617',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        overflow: 'hidden',
                        position: 'relative',
                      }}
                    >
                      {asset.mediaType === 'image' ? (
                        <img
                          src={resolvedUrl}
                          alt={asset.originalFilename}
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                          onError={(e) => {
                            (e.currentTarget as HTMLElement).style.display = 'none';
                          }}
                        />
                      ) : isVideo ? (
                        <div
                          style={{
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            gap: '4px',
                            color: '#38bdf8',
                          }}
                        >
                          <Film size={28} />
                          <span style={{ fontSize: '0.7rem', color: '#94a3b8' }}>
                            {asset.durationSeconds ? formatMediaDuration(asset.durationSeconds) : 'Video'}
                          </span>
                        </div>
                      ) : (
                        <div
                          style={{
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            gap: '4px',
                            color: '#a855f7',
                          }}
                        >
                          <Music size={28} />
                          <span style={{ fontSize: '0.7rem', color: '#94a3b8' }}>Audio</span>
                        </div>
                      )}

                      {/* Media Type Badge */}
                      <span
                        style={{
                          position: 'absolute',
                          top: '6px',
                          left: '6px',
                          padding: '2px 6px',
                          borderRadius: '4px',
                          fontSize: '0.65rem',
                          fontWeight: 700,
                          textTransform: 'uppercase',
                          backgroundColor:
                            asset.mediaType === 'video'
                              ? 'rgba(56, 189, 248, 0.85)'
                              : asset.mediaType === 'audio'
                              ? 'rgba(168, 85, 247, 0.85)'
                              : 'rgba(34, 197, 94, 0.85)',
                          color: '#000',
                        }}
                      >
                        {asset.mediaType}
                      </span>
                    </div>

                    {/* Metadata summary */}
                    <div style={{ padding: '8px 10px', flex: 1, display: 'flex', flexDirection: 'column' }}>
                      <div
                        style={{
                          fontWeight: 600,
                          fontSize: '0.82rem',
                          color: '#f8fafc',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                        title={asset.originalFilename}
                      >
                        {asset.originalFilename}
                      </div>
                      <div
                        style={{
                          fontSize: '0.72rem',
                          color: '#64748b',
                          marginTop: '4px',
                          display: 'flex',
                          justifyContent: 'space-between',
                        }}
                      >
                        <span>{formatFileSize(asset.fileSize)}</span>
                        <span>{asset.mimeType.split('/').pop()?.toUpperCase()}</span>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Right Preview & Action Details Pane */}
          {selectedAsset && (
            <div
              data-testid="media-preview-pane"
              style={{
                width: '320px',
                borderLeft: '1px solid #1e293b',
                backgroundColor: '#0a0f1d',
                padding: '20px',
                display: 'flex',
                flexDirection: 'column',
                gap: '16px',
                overflowY: 'auto',
              }}
            >
              <h3 style={{ margin: 0, fontSize: '1rem', color: '#f8fafc' }}>
                Asset Preview & Details
              </h3>

              {/* Interactive Preview Container */}
              <div
                style={{
                  width: '100%',
                  height: '180px',
                  backgroundColor: '#020617',
                  borderRadius: '8px',
                  border: '1px solid #1e293b',
                  overflow: 'hidden',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {selectedAsset.mediaType === 'image' ? (
                  <img
                    src={mediaService.resolveMediaUrl(selectedAsset.relativePath)}
                    alt={selectedAsset.originalFilename}
                    style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
                  />
                ) : selectedAsset.mediaType === 'video' ? (
                  <video
                    src={mediaService.resolveMediaUrl(selectedAsset.relativePath)}
                    controls
                    style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                  />
                ) : (
                  <div style={{ width: '90%', textAlign: 'center' }}>
                    <Music size={40} style={{ color: '#a855f7', marginBottom: '8px' }} />
                    <audio
                      src={mediaService.resolveMediaUrl(selectedAsset.relativePath)}
                      controls
                      style={{ width: '100%' }}
                    />
                  </div>
                )}
              </div>

              {/* Asset Information Table */}
              <div
                style={{
                  backgroundColor: '#0f172a',
                  borderRadius: '6px',
                  padding: '12px',
                  fontSize: '0.8rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#94a3b8' }}>Type:</span>
                  <span style={{ color: '#f1f5f9', fontWeight: 600, textTransform: 'capitalize' }}>
                    {selectedAsset.mediaType}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#94a3b8' }}>File Size:</span>
                  <span style={{ color: '#f1f5f9' }}>{formatFileSize(selectedAsset.fileSize)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#94a3b8' }}>Format:</span>
                  <span style={{ color: '#f1f5f9' }}>{selectedAsset.mimeType}</span>
                </div>
                {selectedAsset.durationSeconds && (
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#94a3b8' }}>Duration:</span>
                    <span style={{ color: '#f1f5f9' }}>
                      {formatMediaDuration(selectedAsset.durationSeconds)}
                    </span>
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: 'auto' }}>
                <button
                  data-testid="media-present-live-btn"
                  onClick={() => handlePresentLive(selectedAsset)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    padding: '10px 14px',
                    backgroundColor: '#0284c7',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '6px',
                    fontSize: '0.85rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  <Play size={16} />
                  Present Live Now
                </button>

                {onSelectMedia && (
                  <button
                    data-testid="media-apply-bg-btn"
                    onClick={() => {
                      onSelectMedia(selectedAsset);
                      onClose();
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px',
                      padding: '10px 14px',
                      backgroundColor: '#22c55e',
                      color: '#000',
                      border: 'none',
                      borderRadius: '6px',
                      fontSize: '0.85rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    <Check size={16} />
                    Apply as Background
                  </button>
                )}

                <button
                  data-testid="media-delete-btn"
                  onClick={() => handleTriggerDelete(selectedAsset)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                    padding: '8px 12px',
                    backgroundColor: '#7f1d1d',
                    color: '#fca5a5',
                    border: 'none',
                    borderRadius: '6px',
                    fontSize: '0.8rem',
                    cursor: 'pointer',
                  }}
                >
                  <Trash2 size={14} />
                  Delete Asset
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Deletion Protection Warning Modal */}
      {warningModal && (
        <div
          data-testid="media-delete-warning-modal"
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.85)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1100,
            padding: '20px',
          }}
        >
          <div
            style={{
              width: '440px',
              backgroundColor: '#0f172a',
              borderRadius: '10px',
              border: '2px solid #eab308',
              padding: '24px',
              color: '#f8fafc',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
              <AlertTriangle size={28} style={{ color: '#eab308' }} />
              <h3 style={{ margin: 0, fontSize: '1.1rem', color: '#fef08a' }}>
                Asset Currently In Use
              </h3>
            </div>
            <p style={{ fontSize: '0.9rem', lineHeight: 1.5, color: '#cbd5e1' }}>
              <strong>{warningModal.filename}</strong> is currently assigned to{' '}
              <span style={{ color: '#38bdf8', fontWeight: 700 }}>
                {warningModal.usageCount}
              </span>{' '}
              slide(s) or theme(s).
            </p>
            <p style={{ fontSize: '0.82rem', color: '#94a3b8' }}>
              Deleting it will cause those presentations to fall back to their solid background color.
              Are you sure you want to proceed?
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '20px' }}>
              <button
                onClick={() => setWarningModal(null)}
                style={{
                  padding: '8px 14px',
                  borderRadius: '6px',
                  backgroundColor: '#334155',
                  color: '#fff',
                  border: 'none',
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                data-testid="confirm-force-delete-btn"
                onClick={() => executeDelete(warningModal.assetId)}
                style={{
                  padding: '8px 14px',
                  borderRadius: '6px',
                  backgroundColor: '#dc2626',
                  color: '#fff',
                  border: 'none',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Delete Anyway
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
export default MediaLibraryModal;
