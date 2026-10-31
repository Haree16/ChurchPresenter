import React, { useState, useEffect, useCallback } from 'react';
import {
  Plus,
  Search,
  Copy,
  BookmarkPlus,
  Trash2,
  Edit,
  CheckCircle2,
  AlertCircle,
  Radio,
  Tv,
  Music,
  Layers,
  ChevronLeft,
  ChevronRight,
  EyeOff,
  Clock,
  Loader2,
  Play,
  RotateCcw,
  Link2,
  Film,
  X,
} from 'lucide-react';
import {
  Service,
  PlaylistItem,
  Slide,
  Theme,
  Song,
  PresentationState,
  AudienceWindowStatus,
  BiblePassageQuery,
  PlaylistItemType,
} from '../../types';
import { backgroundImageCss, isVideoBackground } from '../../services/backgroundMedia';
import { mediaService } from '../../services/mediaService';
import { MediaLibraryModal } from '../Media/MediaLibraryModal';
import { api } from '../../services/api';
import { PlaylistPanel } from './PlaylistPanel';
import { BiblePassageModal } from './BiblePassageModal';
import { SermonAnnouncementModal } from './SermonAnnouncementModal';
import { ServiceMetadataModal } from './ServiceMetadataModal';
import { ServiceTemplatesModal, SaveServiceTemplateDialog } from './ServiceTemplatesModal';
import { PlanningCenterModal } from '../PlanningCenterModal';

interface ServicePlannerViewProps {
  presentationState: PresentationState;
  audienceStatus: AudienceWindowStatus;
  onRefreshPresentationState: () => Promise<void | any>;
  onToggleBlackout: () => void;
  onToggleAudienceWindow: () => void;
}

export const ServicePlannerView: React.FC<ServicePlannerViewProps> = ({
  presentationState,
  audienceStatus,
  onRefreshPresentationState,
  onToggleBlackout,
  onToggleAudienceWindow,
}) => {
  // Services list & selected service
  const [services, setServices] = useState<Service[]>([]);
  const [selectedServiceId, setSelectedServiceId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');

  // Playlist items & selected item
  const [items, setItems] = useState<PlaylistItem[]>([]);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);

  // Selected item slides
  const [slides, setSlides] = useState<Slide[]>([]);
  const [selectedSlideId, setSelectedSlideId] = useState<string | null>(null);

  // Themes and songs for adding to playlist
  const [themes, setThemes] = useState<Theme[]>([]);
  const [songs, setSongs] = useState<Song[]>([]);

  // UI / Modal States
  const [isNewServiceOpen, setIsNewServiceOpen] = useState(false);
  const [isTemplatesOpen, setIsTemplatesOpen] = useState(false);
  const [isPcoOpen, setIsPcoOpen] = useState(false);
  const [templateSource, setTemplateSource] = useState<Service | null>(null);
  const [isEditServiceOpen, setIsEditServiceOpen] = useState(false);
  const [isBibleModalOpen, setIsBibleModalOpen] = useState(false);
  const [isSermonModalOpen, setIsSermonModalOpen] = useState(false);
  const [sermonModalType, setSermonModalType] = useState<PlaylistItemType>('sermon');
  const [editingItem, setEditingItem] = useState<PlaylistItem | null>(null);
  const [editingItemSlides, setEditingItemSlides] = useState<Slide[]>([]);

  // Song Picker Modal State
  const [isSongPickerOpen, setIsSongPickerOpen] = useState(false);
  const [songSearchQuery, setSongSearchQuery] = useState('');
  const [selectedSongToAdd, setSelectedSongToAdd] = useState<Song | null>(null);
  const [songThemeId, setSongThemeId] = useState<string>('theme-builtin-dark');

  // Divider Modal State
  const [isDividerModalOpen, setIsDividerModalOpen] = useState(false);
  const [dividerTitle, setDividerTitle] = useState('');

  // Timer Modal State
  const [isTimerModalOpen, setIsTimerModalOpen] = useState(false);
  const [timerTitle, setTimerTitle] = useState('Pre-Service Countdown');
  const [timerMinutes, setTimerMinutes] = useState(5);

  // Autosave status
  const [autosaveStatus, setAutosaveStatus] = useState<'saved' | 'saving' | 'unsaved'>('saved');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  // Load services and themes initially
  const loadServices = useCallback(async () => {
    try {
      const list = await api.listServices();
      setServices(list);
      if (list.length > 0 && !selectedServiceId) {
        // Restore from presentationState or first service
        const initialId = presentationState.selectedServiceId || list[0].id;
        setSelectedServiceId(initialId);
      }
    } catch (err) {
      console.error('Failed to load services:', err);
    }
  }, [presentationState.selectedServiceId, selectedServiceId]);

  const loadThemesAndSongs = useCallback(async () => {
    try {
      const [tList, sList] = await Promise.all([api.listThemes(), api.listSongs()]);
      setThemes(tList);
      setSongs(sList);
    } catch (err) {
      console.error('Failed to load themes/songs:', err);
    }
  }, []);

  useEffect(() => {
    loadServices();
    loadThemesAndSongs();
  }, [loadServices, loadThemesAndSongs]);

  // Load items when selected service changes
  const loadItems = useCallback(async (serviceId: string) => {
    try {
      const serviceItems = await api.getServiceItems(serviceId);
      setItems(serviceItems);
      if (serviceItems.length > 0) {
        const activeItem = serviceItems[0];
        setSelectedItemId(activeItem.id);
      } else {
        setSelectedItemId(null);
        setSlides([]);
      }
    } catch (err) {
      console.error('Failed to load service items:', err);
    }
  }, []);

  useEffect(() => {
    if (selectedServiceId) {
      loadItems(selectedServiceId);
    } else {
      setItems([]);
      setSelectedItemId(null);
      setSlides([]);
    }
  }, [selectedServiceId, loadItems]);

  // Load slides when selected item changes
  useEffect(() => {
    const loadItemSlides = async () => {
      if (!selectedItemId) {
        setSlides([]);
        setSelectedSlideId(null);
        return;
      }
      try {
        const itemSlides = await api.getServiceItemSlides(selectedItemId);
        setSlides(itemSlides);
        if (itemSlides.length > 0) {
          setSelectedSlideId(itemSlides[0].id);
        } else {
          setSelectedSlideId(null);
        }
      } catch (err) {
        console.error('Failed to load slides for item:', err);
      }
    };

    loadItemSlides();
  }, [selectedItemId]);

  const currentService = services.find((s) => s.id === selectedServiceId) || null;
  const currentItem = items.find((it) => it.id === selectedItemId) || null;

  // Slides a media-library pick will be applied to (one slide, or every slide of the item).
  const [backgroundTargetIds, setBackgroundTargetIds] = useState<string[] | null>(null);

  const applySlideBackground = async (relativePath: string | null) => {
    if (!selectedItemId || !backgroundTargetIds) return;
    const targets = new Set(backgroundTargetIds);
    const updated = slides.map((sl) => (targets.has(sl.id) ? { ...sl, backgroundImage: relativePath } : sl));
    try {
      const saved = await api.saveServiceItemSlides(selectedItemId, updated);
      setSlides(saved);
    } catch (err) {
      console.error('Failed to set slide background:', err);
    }
  };

  const clearSlideBackground = async (slideId: string) => {
    if (!selectedItemId) return;
    try {
      const saved = await api.saveServiceItemSlides(
        selectedItemId,
        slides.map((sl) => (sl.id === slideId ? { ...sl, backgroundImage: null } : sl))
      );
      setSlides(saved);
    } catch (err) {
      console.error('Failed to clear slide background:', err);
    }
  };

  // Filtered services
  const filteredServices = services.filter((s) => {
    const matchesSearch =
      s.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (s.category && s.category.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesCategory =
      categoryFilter === 'all' || s.category.toLowerCase() === categoryFilter.toLowerCase();
    return matchesSearch && matchesCategory;
  });

  // Calculate Next Item in playlist order
  const currentLiveIndex = items.findIndex((it) => it.id === presentationState.currentItemId);
  const nextItem =
    currentLiveIndex >= 0 && currentLiveIndex < items.length - 1
      ? items[currentLiveIndex + 1]
      : null;

  // Service CRUD handlers
  const handleCreateService = async (serviceData: Partial<Service>) => {
    setAutosaveStatus('saving');
    try {
      const newService = await api.createService(serviceData);
      await loadServices();
      setSelectedServiceId(newService.id);
      setAutosaveStatus('saved');
      setStatusMessage('Service created successfully.');
      setTimeout(() => setStatusMessage(null), 3000);
    } catch (err: any) {
      setAutosaveStatus('unsaved');
      setStatusMessage(`Error creating service: ${err.message}`);
    }
  };

  const handleUpdateService = async (serviceData: Partial<Service>) => {
    if (!selectedServiceId || !currentService) return;
    setAutosaveStatus('saving');
    try {
      await api.updateService({
        ...currentService,
        ...serviceData,
      });
      await loadServices();
      setAutosaveStatus('saved');
      setStatusMessage('Service details updated.');
      setTimeout(() => setStatusMessage(null), 3000);
    } catch (err: any) {
      setAutosaveStatus('unsaved');
      setStatusMessage(`Error updating service: ${err.message}`);
    }
  };

  const handleDeleteService = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this service? This cannot be undone.')) {
      return;
    }
    try {
      await api.deleteService(id);
      const remaining = services.filter((s) => s.id !== id);
      setServices(remaining);
      setSelectedServiceId(remaining[0]?.id || null);
      setStatusMessage('Service deleted.');
      setTimeout(() => setStatusMessage(null), 3000);
    } catch (err: any) {
      setStatusMessage(`Error deleting service: ${err.message}`);
    }
  };

  const handleServiceFromTemplate = async (service: Service) => {
    await loadServices();
    setSelectedServiceId(service.id);
    setStatusMessage(`Service "${service.title}" created from a template.`);
    setTimeout(() => setStatusMessage(null), 3000);
  };

  const handleDuplicateService = async (id: string) => {
    try {
      const duplicated = await api.duplicateService(id);
      await loadServices();
      setSelectedServiceId(duplicated.id);
      setStatusMessage('Service duplicated.');
      setTimeout(() => setStatusMessage(null), 3000);
    } catch (err: any) {
      setStatusMessage(`Error duplicating service: ${err.message}`);
    }
  };

  // Playlist items operations
  const handleReorderItems = async (itemIds: string[]) => {
    if (!selectedServiceId) return;
    setAutosaveStatus('saving');
    try {
      await api.reorderServiceItems(selectedServiceId, itemIds);
      await loadItems(selectedServiceId);
      setAutosaveStatus('saved');
    } catch (err: any) {
      setAutosaveStatus('unsaved');
      setStatusMessage(`Error reordering items: ${err.message}`);
    }
  };

  const handleDeleteItem = async (itemId: string) => {
    if (!selectedServiceId) return;
    setAutosaveStatus('saving');
    try {
      await api.deleteServiceItem(itemId);
      await loadItems(selectedServiceId);
      setAutosaveStatus('saved');
    } catch (err: any) {
      setAutosaveStatus('unsaved');
      setStatusMessage(`Error deleting item: ${err.message}`);
    }
  };

  const handleDuplicateItem = async (itemId: string) => {
    if (!selectedServiceId) return;
    setAutosaveStatus('saving');
    try {
      await api.duplicateServiceItem(itemId);
      await loadItems(selectedServiceId);
      setAutosaveStatus('saved');
    } catch (err: any) {
      setAutosaveStatus('unsaved');
      setStatusMessage(`Error duplicating item: ${err.message}`);
    }
  };

  const handleEditItem = async (item: PlaylistItem) => {
    try {
      const itemWithSlides = await api.getServiceItemWithSlides(item.id);
      if (itemWithSlides) {
        setEditingItem(itemWithSlides.item);
        setEditingItemSlides(itemWithSlides.slides);
        setSermonModalType(item.itemType);
        setIsSermonModalOpen(true);
      }
    } catch (err: any) {
      setStatusMessage(`Error opening item editor: ${err.message}`);
    }
  };

  // Adding items
  const handleAddSongConfirm = async () => {
    if (!selectedServiceId || !selectedSongToAdd) return;
    setAutosaveStatus('saving');
    try {
      await api.addSongToService(
        selectedServiceId,
        selectedSongToAdd.id,
        songThemeId || undefined
      );
      await loadItems(selectedServiceId);
      setIsSongPickerOpen(false);
      setSelectedSongToAdd(null);
      setAutosaveStatus('saved');
      setStatusMessage(`Added "${selectedSongToAdd.title}" to service.`);
      setTimeout(() => setStatusMessage(null), 3000);
    } catch (err: any) {
      setAutosaveStatus('unsaved');
      setStatusMessage(`Error adding song: ${err.message}`);
    }
  };

  const handleAddBiblePassage = async (
    query: BiblePassageQuery,
    themeId?: string,
    versesPerSlide?: number
  ) => {
    if (!selectedServiceId) return;
    setAutosaveStatus('saving');
    try {
      await api.addBiblePassageToService(selectedServiceId, query, themeId, versesPerSlide);
      await loadItems(selectedServiceId);
      setAutosaveStatus('saved');
      setStatusMessage(`Added scripture passage to service.`);
      setTimeout(() => setStatusMessage(null), 3000);
    } catch (err: any) {
      setAutosaveStatus('unsaved');
      setStatusMessage(`Error adding scripture: ${err.message}`);
    }
  };

  const handleSaveSermonAnnouncement = async (
    itemData: Partial<PlaylistItem>,
    itemSlides: Slide[]
  ) => {
    if (!selectedServiceId) return;
    setAutosaveStatus('saving');
    try {
      if (editingItem) {
        await api.updateServiceItem({
          ...editingItem,
          ...itemData,
        } as PlaylistItem);
        await api.saveServiceItemSlides(editingItem.id, itemSlides);
      } else {
        await api.addServiceItem(itemData, itemSlides);
      }
      await loadItems(selectedServiceId);
      setEditingItem(null);
      setEditingItemSlides([]);
      setAutosaveStatus('saved');
    } catch (err: any) {
      setAutosaveStatus('unsaved');
      setStatusMessage(`Error saving item: ${err.message}`);
    }
  };

  const handleAddDivider = async () => {
    if (!selectedServiceId || !dividerTitle.trim()) return;
    setAutosaveStatus('saving');
    try {
      await api.addServiceItem({
        serviceId: selectedServiceId,
        itemType: 'divider',
        title: dividerTitle.trim(),
      });
      await loadItems(selectedServiceId);
      setIsDividerModalOpen(false);
      setDividerTitle('');
      setAutosaveStatus('saved');
    } catch (err: any) {
      setAutosaveStatus('unsaved');
      setStatusMessage(`Error adding divider: ${err.message}`);
    }
  };

  const handleAddTimer = async () => {
    if (!selectedServiceId || !timerTitle.trim()) return;
    setAutosaveStatus('saving');
    try {
      await api.addServiceItem({
        serviceId: selectedServiceId,
        itemType: 'timer',
        title: timerTitle.trim(),
        durationSeconds: timerMinutes * 60,
      });
      await loadItems(selectedServiceId);
      setIsTimerModalOpen(false);
      setAutosaveStatus('saved');
    } catch (err: any) {
      setAutosaveStatus('unsaved');
      setStatusMessage(`Error adding timer: ${err.message}`);
    }
  };

  // Live Presentation Controls
  const handleSelectItem = (item: PlaylistItem) => {
    setSelectedItemId(item.id);
    api.setSelectedServiceItem(selectedServiceId, item.id);
  };

  const handleTakeItemLive = async (item: PlaylistItem) => {
    if (!selectedServiceId) return;
    const itemSlides = await api.getServiceItemSlides(item.id);
    if (itemSlides.length > 0) {
      await api.setLiveServiceItemSlide(selectedServiceId, item.id, itemSlides[0].id);
      await onRefreshPresentationState();
    }
  };

  const handleTakeSlideLive = async (slide: Slide) => {
    if (!selectedServiceId || !selectedItemId) return;
    await api.setLiveServiceItemSlide(selectedServiceId, selectedItemId, slide.id);
    await onRefreshPresentationState();
  };

  const handleNextSlide = async () => {
    await api.nextSlide();
    await onRefreshPresentationState();
  };

  const handlePrevSlide = async () => {
    await api.previousSlide();
    await onRefreshPresentationState();
  };

  const handleClearLive = async () => {
    await api.clearLive();
    await onRefreshPresentationState();
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: 'calc(100vh - 56px)',
        backgroundColor: '#090d16',
        color: '#f8fafc',
        overflow: 'hidden',
      }}
    >
      {/* Top Banner / Status Strip */}
      <div
        style={{
          height: '42px',
          backgroundColor: '#0f172a',
          borderBottom: '1px solid #1e293b',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 16px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ fontSize: '13px', fontWeight: 600, color: '#f8fafc' }}>
            {currentService ? currentService.title : 'No Service Selected'}
          </span>
          {currentService?.category && (
            <span
              style={{
                fontSize: '11px',
                padding: '2px 8px',
                borderRadius: '12px',
                backgroundColor: 'rgba(59, 130, 246, 0.15)',
                color: '#60a5fa',
                fontWeight: 500,
              }}
            >
              {currentService.category}
            </span>
          )}
          {currentService?.serviceDate && (
            <span style={{ fontSize: '11px', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Clock size={12} /> {currentService.serviceDate.slice(0, 10)}
            </span>
          )}
        </div>

        {/* Autosave Status Indicator */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          {statusMessage && (
            <span style={{ fontSize: '11px', color: '#94a3b8' }}>{statusMessage}</span>
          )}

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '11px',
              fontWeight: 500,
            }}
          >
            {autosaveStatus === 'saving' && (
              <>
                <Loader2 size={13} className="spin" color="#3b82f6" />
                <span style={{ color: '#60a5fa' }}>Saving...</span>
              </>
            )}
            {autosaveStatus === 'saved' && (
              <>
                <CheckCircle2 size={13} color="#10b981" />
                <span style={{ color: '#34d399' }}>All changes saved</span>
              </>
            )}
            {autosaveStatus === 'unsaved' && (
              <>
                <AlertCircle size={13} color="#f59e0b" />
                <span style={{ color: '#fbbf24' }}>Unsaved changes</span>
              </>
            )}
          </div>

          {currentService && (
            <button
              type="button"
              onClick={() => setIsEditServiceOpen(true)}
              style={{
                padding: '4px 10px',
                backgroundColor: '#1e293b',
                border: '1px solid #334155',
                borderRadius: '5px',
                color: '#cbd5e1',
                fontSize: '11px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
              }}
            >
              <Edit size={12} /> Edit Details
            </button>
          )}
        </div>
      </div>

      {/* Main 4-column layout: Services List -> Playlist Items -> Snapshot Slides -> Live Preview */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(230px, 250px) minmax(280px, 320px) minmax(0, 1fr) minmax(240px, 280px)',
          flex: 1,
          overflow: 'hidden',
        }}
      >
        {/* Column 1: Services List Sidebar */}
        <div
          style={{
            backgroundColor: '#090d16',
            borderRight: '1px solid #1e293b',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          {/* Header & New Service Button */}
          <div
            style={{
              padding: '12px 14px',
              borderBottom: '1px solid #1e293b',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              rowGap: '8px',
            }}
          >
            <span style={{ fontSize: '13px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' }}>
              Services
            </span>
            <button
              type="button"
              onClick={() => setIsNewServiceOpen(true)}
              style={{
                padding: '5px 10px',
                backgroundColor: '#2563eb',
                border: 'none',
                borderRadius: '5px',
                color: '#ffffff',
                fontSize: '12px',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: '3px',
                cursor: 'pointer',
              }}
            >
              <Plus size={12} /> New
            </button>
            <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexBasis: '100%' }}>
              <button
                type="button"
                data-testid="planning-center-btn"
                onClick={() => setIsPcoOpen(true)}
                title="Import from Planning Center Services"
                style={{
                  padding: '4px 8px',
                  backgroundColor: '#1e293b',
                  border: '1px solid #334155',
                  borderRadius: '5px',
                  color: '#38bdf8',
                  fontSize: '11px',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '3px',
                  cursor: 'pointer',
                }}
              >
                <Link2 size={12} /> PCO
              </button>
              <button
                type="button"
                data-testid="from-template-btn"
                onClick={() => setIsTemplatesOpen(true)}
                title="Start a new service from a template"
                style={{
                  padding: '4px 8px',
                  backgroundColor: '#1e293b',
                  border: '1px solid #334155',
                  borderRadius: '5px',
                  color: '#cbd5e1',
                  fontSize: '11px',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '3px',
                  cursor: 'pointer',
                }}
              >
                <Layers size={12} /> Templates
              </button>
            </div>
          </div>

          {/* Search bar */}
          <div style={{ padding: '8px 12px', borderBottom: '1px solid #1e293b' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                backgroundColor: '#1e293b',
                padding: '5px 8px',
                borderRadius: '6px',
                border: '1px solid #334155',
              }}
            >
              <Search size={13} color="#94a3b8" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search services..."
                style={{
                  background: 'transparent',
                  border: 'none',
                  outline: 'none',
                  color: '#f8fafc',
                  fontSize: '12px',
                  width: '100%',
                }}
              />
            </div>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              style={{
                marginTop: '6px',
                width: '100%',
                padding: '4px 6px',
                backgroundColor: '#1e293b',
                border: '1px solid #334155',
                borderRadius: '5px',
                color: '#94a3b8',
                fontSize: '12px',
              }}
            >
              <option value="all">All Categories</option>
              <option value="Sunday Worship">Sunday Worship</option>
              <option value="Prayer Meeting">Prayer Meeting</option>
              <option value="Youth Meeting">Youth Meeting</option>
              <option value="Special Event">Special Event</option>
            </select>
          </div>

          {/* Services List */}
          <div
            style={{
              flex: 1,
              overflowY: 'auto',
              padding: '8px',
              display: 'flex',
              flexDirection: 'column',
              gap: '4px',
            }}
          >
            {filteredServices.length === 0 ? (
              <div style={{ padding: '20px 10px', textAlign: 'center', fontSize: '11px', color: '#64748b' }}>
                No services found. Click "+ New" to create one.
              </div>
            ) : (
              filteredServices.map((s) => {
                const isSelected = s.id === selectedServiceId;
                return (
                  <div
                    key={s.id}
                    onClick={() => setSelectedServiceId(s.id)}
                    style={{
                      padding: '8px 10px',
                      borderRadius: '6px',
                      backgroundColor: isSelected ? '#1e293b' : 'transparent',
                      border: `1px solid ${isSelected ? '#3b82f6' : 'transparent'}`,
                      cursor: 'pointer',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '4px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span
                        style={{
                          fontSize: '12px',
                          fontWeight: 600,
                          color: isSelected ? '#ffffff' : '#cbd5e1',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        {s.title}
                      </span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '10px', color: '#64748b' }}>
                      <span>{s.category}</span>
                      <div style={{ display: 'flex', gap: '4px' }}>
                        <button
                          type="button"
                          data-testid="save-as-template-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            setTemplateSource(s);
                          }}
                          title="Save as template"
                          style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', padding: 0 }}
                        >
                          <BookmarkPlus size={11} />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDuplicateService(s.id);
                          }}
                          title="Duplicate service"
                          style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', padding: 0 }}
                        >
                          <Copy size={11} />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteService(s.id);
                          }}
                          title="Delete service"
                          style={{ background: 'none', border: 'none', color: '#f87171', cursor: 'pointer', padding: 0 }}
                        >
                          <Trash2 size={11} />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Column 2: Service Playlist Panel */}
        <div style={{ height: '100%', overflow: 'hidden' }}>
          <PlaylistPanel
            service={currentService}
            items={items}
            selectedItemId={selectedItemId}
            liveItemId={presentationState.currentItemId || null}
            nextItemId={nextItem ? nextItem.id : null}
            onSelectItem={handleSelectItem}
            onTakeItemLive={handleTakeItemLive}
            onReorderItems={handleReorderItems}
            onDeleteItem={handleDeleteItem}
            onDuplicateItem={handleDuplicateItem}
            onEditItem={handleEditItem}
            onOpenAddSong={() => setIsSongPickerOpen(true)}
            onOpenAddPassage={() => setIsBibleModalOpen(true)}
            onOpenAddSermon={() => {
              setEditingItem(null);
              setEditingItemSlides([]);
              setSermonModalType('sermon');
              setIsSermonModalOpen(true);
            }}
            onOpenAddAnnouncement={() => {
              setEditingItem(null);
              setEditingItemSlides([]);
              setSermonModalType('announcement');
              setIsSermonModalOpen(true);
            }}
            onOpenAddDivider={() => setIsDividerModalOpen(true)}
            onOpenAddTimer={() => setIsTimerModalOpen(true)}
            onOpenAddText={() => {
              setEditingItem(null);
              setEditingItemSlides([]);
              setSermonModalType('text');
              setIsSermonModalOpen(true);
            }}
          />
        </div>

        {/* Column 3: Slide Strip & Snapshot Slides Preview */}
        <div
          style={{
            backgroundColor: '#0a0f1d',
            borderRight: '1px solid #1e293b',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          {/* Header for Item Slides */}
          <div
            style={{
              padding: '12px 18px',
              borderBottom: '1px solid #1e293b',
              backgroundColor: '#0f172a',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div>
              <div style={{ fontSize: '13px', fontWeight: 600, color: '#f8fafc' }}>
                {currentItem ? currentItem.title : 'Select an Item to View Slides'}
              </div>
              <div style={{ fontSize: '11px', color: '#94a3b8' }}>
                {slides.length} slide snapshot{slides.length === 1 ? '' : 's'} (click to preview, double-click to take live)
              </div>
            </div>

            {currentItem && slides.length > 0 && (
              <button
                type="button"
                data-testid="slides-set-background-all"
                onClick={() => setBackgroundTargetIds(slides.map((sl) => sl.id))}
                style={{
                  padding: '5px 12px',
                  backgroundColor: '#1e293b',
                  border: '1px solid #334155',
                  borderRadius: '6px',
                  color: '#e2e8f0',
                  fontSize: '11px',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '5px',
                  cursor: 'pointer',
                  marginLeft: 'auto',
                  marginRight: '8px',
                }}
              >
                <Film size={12} /> Background for all slides
              </button>
            )}

            {currentItem && (
              <button
                type="button"
                onClick={() => handleTakeItemLive(currentItem)}
                style={{
                  padding: '5px 12px',
                  backgroundColor: '#ef4444',
                  border: 'none',
                  borderRadius: '6px',
                  color: '#ffffff',
                  fontSize: '11px',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '5px',
                  cursor: 'pointer',
                }}
              >
                <Radio size={12} /> Take Item Live
              </button>
            )}
          </div>

          {/* Slides Grid */}
          <div
            style={{
              flex: 1,
              overflowY: 'auto',
              padding: '16px',
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
              gap: '14px',
              alignContent: 'flex-start',
            }}
          >
            {slides.length === 0 ? (
              <div
                style={{
                  gridColumn: '1 / -1',
                  padding: '60px 20px',
                  textAlign: 'center',
                  color: '#64748b',
                }}
              >
                <Layers size={36} strokeWidth={1.5} style={{ margin: '0 auto 12px' }} />
                <div style={{ fontSize: '13px', fontWeight: 500, color: '#94a3b8' }}>
                  No slides available for this item
                </div>
                <p style={{ fontSize: '11px', maxWidth: '300px', margin: '6px auto 0' }}>
                  This item does not contain snapshot slides, or is an outline divider.
                </p>
              </div>
            ) : (
              slides.map((s, index) => {
                const isSlideLive =
                  presentationState.isLive &&
                  presentationState.currentSlide?.id === s.id;
                const isSlideSelected = s.id === selectedSlideId;

                return (
                  <div
                    key={s.id}
                    onClick={() => setSelectedSlideId(s.id)}
                    onDoubleClick={() => handleTakeSlideLive(s)}
                    style={{
                      borderRadius: '8px',
                      border: isSlideLive
                        ? '2px solid #ef4444'
                        : isSlideSelected
                        ? '2px solid #3b82f6'
                        : '1px solid #1e293b',
                      backgroundColor: '#0f172a',
                      overflow: 'hidden',
                      display: 'flex',
                      flexDirection: 'column',
                      cursor: 'pointer',
                      transition: 'transform 0.1s ease, border-color 0.15s ease',
                      boxShadow: isSlideLive
                        ? '0 0 12px rgba(239, 68, 68, 0.4)'
                        : '0 4px 6px -1px rgba(0, 0, 0, 0.2)',
                    }}
                  >
                    {/* Slide Aspect Ratio Preview Card (16:9) */}
                    <div
                      style={{
                        aspectRatio: '16 / 9',
                        width: '100%',
                        backgroundColor: s.backgroundColor || '#000000',
                        color: s.foregroundColor || '#ffffff',
                        backgroundImage: s.backgroundImage ? backgroundImageCss(s.backgroundImage) : undefined,
                        backgroundSize: 'cover',
                        backgroundPosition: 'center',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'center',
                        alignItems:
                          s.textAlignment === 'left'
                            ? 'flex-start'
                            : s.textAlignment === 'right'
                            ? 'flex-end'
                            : 'center',
                        textAlign: (s.textAlignment as any) || 'center',
                        padding: '10px 14px',
                        position: 'relative',
                        overflow: 'hidden',
                      }}
                    >
                      {isVideoBackground(s.backgroundImage) && (
                        <video
                          data-testid="slide-card-bg-video"
                          src={mediaService.resolveMediaUrl(s.backgroundImage)}
                          muted
                          loop
                          playsInline
                          preload="metadata"
                          onMouseEnter={(e) => { e.currentTarget.play().catch(() => {}); }}
                          onMouseLeave={(e) => { e.currentTarget.pause(); }}
                          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', zIndex: 0 }}
                        />
                      )}

                      {/* Dim Overlay */}
                      {s.overlayColor && (
                        <div
                          style={{
                            position: 'absolute',
                            inset: 0,
                            backgroundColor: s.overlayColor,
                            zIndex: 1,
                          }}
                        />
                      )}

                      {/* Live Badge */}
                      {isSlideLive && (
                        <div
                          style={{
                            position: 'absolute',
                            top: '6px',
                            right: '6px',
                            backgroundColor: '#ef4444',
                            color: '#ffffff',
                            fontSize: '9px',
                            fontWeight: 800,
                            padding: '2px 5px',
                            borderRadius: '3px',
                            zIndex: 3,
                            display: 'flex',
                            alignItems: 'center',
                            gap: '3px',
                          }}
                        >
                          <Radio size={9} /> LIVE
                        </div>
                      )}

                      <div style={{ position: 'relative', zIndex: 2, width: '100%' }}>
                        {s.title && (
                          <div
                            style={{
                              fontSize: '9px',
                              fontWeight: 700,
                              textTransform: 'uppercase',
                              opacity: 0.75,
                              marginBottom: '2px',
                            }}
                          >
                            {s.title}
                          </div>
                        )}
                        <div
                          style={{
                            fontSize: '11px',
                            fontWeight: 500,
                            lineHeight: 1.25,
                            maxHeight: '64px',
                            overflow: 'hidden',
                            wordBreak: 'break-word',
                          }}
                        >
                          {s.body}
                        </div>
                      </div>
                    </div>

                    {/* Bottom Metadata & Controls */}
                    <div
                      style={{
                        padding: '6px 10px',
                        backgroundColor: '#1e293b',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                      }}
                    >
                      <span style={{ fontSize: '10px', fontWeight: 600, color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        Slide {index + 1}
                        <button
                          type="button"
                          data-testid={`slide-set-background-${s.id}`}
                          title={s.backgroundImage ? 'Change background video/image' : 'Set background video/image'}
                          onClick={(e) => {
                            e.stopPropagation();
                            setBackgroundTargetIds([s.id]);
                          }}
                          style={{ background: 'none', border: 'none', padding: '2px', cursor: 'pointer', color: s.backgroundImage ? '#38bdf8' : '#94a3b8', display: 'flex' }}
                        >
                          <Film size={12} />
                        </button>
                        {s.backgroundImage && (
                          <button
                            type="button"
                            data-testid={`slide-clear-background-${s.id}`}
                            title="Remove background"
                            onClick={(e) => {
                              e.stopPropagation();
                              clearSlideBackground(s.id);
                            }}
                            style={{ background: 'none', border: 'none', padding: '2px', cursor: 'pointer', color: '#94a3b8', display: 'flex' }}
                          >
                            <X size={12} />
                          </button>
                        )}
                      </span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleTakeSlideLive(s);
                        }}
                        style={{
                          padding: '2px 6px',
                          backgroundColor: isSlideLive ? 'rgba(239, 68, 68, 0.2)' : '#0f172a',
                          border: `1px solid ${isSlideLive ? '#ef4444' : '#334155'}`,
                          borderRadius: '4px',
                          color: isSlideLive ? '#f87171' : '#e2e8f0',
                          fontSize: '10px',
                          fontWeight: 600,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '3px',
                        }}
                      >
                        <Play size={9} fill={isSlideLive ? '#ef4444' : 'currentColor'} />
                        {isSlideLive ? 'Live' : 'Take Live'}
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Column 4: Live & Next Monitors Panel */}
        <div
          style={{
            backgroundColor: '#090d16',
            display: 'flex',
            flexDirection: 'column',
            overflowY: 'auto',
            padding: '14px',
            gap: '16px',
          }}
        >
          {/* Live Output Section */}
          <div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '6px',
              }}
            >
              <span
                style={{
                  fontSize: '11px',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  color: presentationState.isLive ? '#ef4444' : '#64748b',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                }}
              >
                <Radio size={12} /> Live Audience Output
              </span>
              {presentationState.isBlackout && (
                <span style={{ fontSize: '10px', color: '#f59e0b', fontWeight: 600 }}>
                  BLACKOUT ACTIVE
                </span>
              )}
            </div>

            {/* Live 16:9 Screen */}
            <div
              style={{
                aspectRatio: '16 / 9',
                width: '100%',
                backgroundColor: presentationState.isBlackout
                  ? '#000000'
                  : presentationState.currentSlide?.backgroundColor || '#000000',
                color: presentationState.currentSlide?.foregroundColor || '#ffffff',
                backgroundImage:
                  !presentationState.isBlackout && presentationState.currentSlide?.backgroundImage
                    ? backgroundImageCss(presentationState.currentSlide.backgroundImage)
                    : undefined,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
                borderRadius: '6px',
                border: presentationState.isLive ? '2px solid #ef4444' : '1px solid #334155',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                textAlign: 'center',
                padding: '12px',
                position: 'relative',
                boxShadow: presentationState.isLive ? '0 0 15px rgba(239, 68, 68, 0.3)' : 'none',
              }}
            >
              {presentationState.isBlackout ? (
                <span style={{ fontSize: '11px', color: '#64748b' }}>Display Blacked Out</span>
              ) : presentationState.currentSlide ? (
                <div style={{ width: '100%' }}>
                  <div style={{ fontSize: '11px', fontWeight: 600, wordBreak: 'break-word' }}>
                    {presentationState.currentSlide.body}
                  </div>
                </div>
              ) : (
                <span style={{ fontSize: '11px', color: '#64748b' }}>No Live Slide</span>
              )}
            </div>
          </div>

          {/* Next Slide Preview Section */}
          <div>
            <div style={{ marginBottom: '6px' }}>
              <span style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: '#94a3b8' }}>
                Next Slide
              </span>
            </div>

            <div
              style={{
                aspectRatio: '16 / 9',
                width: '100%',
                backgroundColor: presentationState.nextSlide?.backgroundColor || '#0f172a',
                color: presentationState.nextSlide?.foregroundColor || '#ffffff',
                backgroundImage: presentationState.nextSlide?.backgroundImage
                  ? backgroundImageCss(presentationState.nextSlide.backgroundImage)
                  : undefined,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
                borderRadius: '6px',
                border: '1px solid #334155',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                textAlign: 'center',
                padding: '12px',
              }}
            >
              {presentationState.nextSlide ? (
                <div style={{ width: '100%' }}>
                  <div style={{ fontSize: '11px', fontWeight: 500, wordBreak: 'break-word' }}>
                    {presentationState.nextSlide.body}
                  </div>
                </div>
              ) : (
                <span style={{ fontSize: '11px', color: '#64748b' }}>End of Service Order</span>
              )}
            </div>
          </div>

          {/* Presentation Boundary Navigation Controls */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
              paddingTop: '8px',
              borderTop: '1px solid #1e293b',
            }}
          >
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              <button
                type="button"
                onClick={handlePrevSlide}
                style={{
                  padding: '8px 10px',
                  backgroundColor: '#1e293b',
                  border: '1px solid #334155',
                  borderRadius: '6px',
                  color: '#f8fafc',
                  fontSize: '11px',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '4px',
                  cursor: 'pointer',
                }}
              >
                <ChevronLeft size={14} /> Previous
              </button>

              <button
                type="button"
                onClick={handleNextSlide}
                style={{
                  padding: '8px 10px',
                  backgroundColor: '#2563eb',
                  border: 'none',
                  borderRadius: '6px',
                  color: '#ffffff',
                  fontSize: '11px',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '4px',
                  cursor: 'pointer',
                }}
              >
                Next <ChevronRight size={14} />
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              <button
                type="button"
                onClick={onToggleBlackout}
                style={{
                  padding: '6px 8px',
                  backgroundColor: presentationState.isBlackout ? '#f59e0b' : '#1e293b',
                  border: '1px solid #334155',
                  borderRadius: '6px',
                  color: presentationState.isBlackout ? '#000000' : '#cbd5e1',
                  fontSize: '11px',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '4px',
                  cursor: 'pointer',
                }}
              >
                <EyeOff size={12} /> {presentationState.isBlackout ? 'Restore Output' : 'Blackout'}
              </button>

              <button
                type="button"
                onClick={handleClearLive}
                style={{
                  padding: '6px 8px',
                  backgroundColor: '#1e293b',
                  border: '1px solid #334155',
                  borderRadius: '6px',
                  color: '#cbd5e1',
                  fontSize: '11px',
                  fontWeight: 500,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '4px',
                  cursor: 'pointer',
                }}
              >
                <RotateCcw size={12} /> Clear Live
              </button>
            </div>

            <button
              type="button"
              onClick={onToggleAudienceWindow}
              style={{
                padding: '6px 10px',
                backgroundColor: audienceStatus.isOpen ? 'rgba(16, 185, 129, 0.15)' : '#1e293b',
                border: `1px solid ${audienceStatus.isOpen ? '#10b981' : '#334155'}`,
                borderRadius: '6px',
                color: audienceStatus.isOpen ? '#34d399' : '#94a3b8',
                fontSize: '11px',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '5px',
                cursor: 'pointer',
                marginTop: '4px',
              }}
            >
              <Tv size={13} /> {audienceStatus.isOpen ? 'Audience Window Open' : 'Open Audience Window'}
            </button>
          </div>
        </div>
      </div>

      {/* Modals */}
      {/* 1. New / Edit Service Metadata Modal */}
      <ServiceMetadataModal
        isOpen={isNewServiceOpen || isEditServiceOpen}
        onClose={() => {
          setIsNewServiceOpen(false);
          setIsEditServiceOpen(false);
        }}
        service={isEditServiceOpen ? currentService : null}
        onSave={isEditServiceOpen ? handleUpdateService : handleCreateService}
      />

      <ServiceTemplatesModal isOpen={isTemplatesOpen} onClose={() => setIsTemplatesOpen(false)} onCreated={handleServiceFromTemplate} />
      <PlanningCenterModal
        isOpen={isPcoOpen}
        onClose={() => setIsPcoOpen(false)}
        onServiceImported={async (serviceId) => {
          await loadServices();
          setSelectedServiceId(serviceId);
        }}
      />
      <SaveServiceTemplateDialog
        service={templateSource}
        onClose={() => setTemplateSource(null)}
        onSaved={(t) => {
          setStatusMessage(`Saved template "${t.name}".`);
          setTimeout(() => setStatusMessage(null), 3000);
        }}
      />

      <MediaLibraryModal
        isOpen={backgroundTargetIds !== null}
        onClose={() => setBackgroundTargetIds(null)}
        onSelectMedia={(asset) => applySlideBackground(asset.relativePath)}
      />

      {/* 2. Scripture Lookup Modal */}
      <BiblePassageModal
        isOpen={isBibleModalOpen}
        onClose={() => setIsBibleModalOpen(false)}
        onAddPassage={handleAddBiblePassage}
        themes={themes}
      />

      {/* 3. Sermon / Announcement / Text / Image Modal */}
      <SermonAnnouncementModal
        isOpen={isSermonModalOpen}
        onClose={() => {
          setIsSermonModalOpen(false);
          setEditingItem(null);
          setEditingItemSlides([]);
        }}
        itemType={sermonModalType}
        serviceId={selectedServiceId || ''}
        themes={themes}
        existingItem={editingItem}
        existingSlides={editingItemSlides}
        onSave={handleSaveSermonAnnouncement}
      />

      {/* 4. Worship Song Picker Modal */}
      {isSongPickerOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.75)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '20px',
          }}
        >
          <div
            style={{
              backgroundColor: '#0f172a',
              border: '1px solid #334155',
              borderRadius: '12px',
              width: '100%',
              maxWidth: '560px',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
              overflow: 'hidden',
            }}
          >
            {/* Modal Header */}
            <div
              style={{
                padding: '14px 18px',
                borderBottom: '1px solid #1e293b',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                backgroundColor: '#1e293b',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Music size={16} color="#10b981" />
                <span style={{ fontSize: '14px', fontWeight: 600, color: '#f8fafc' }}>
                  Add Song from Worship Library
                </span>
              </div>
              <button
                type="button"
                onClick={() => setIsSongPickerOpen(false)}
                style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>

            {/* Song search */}
            <div style={{ padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <input
                type="text"
                value={songSearchQuery}
                onChange={(e) => setSongSearchQuery(e.target.value)}
                placeholder="Search by song title, author, or lyrics in Tamil & English..."
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  backgroundColor: '#1e293b',
                  border: '1px solid #334155',
                  borderRadius: '6px',
                  color: '#f8fafc',
                  fontSize: '12px',
                }}
              />

              {/* Theme selector for this song item */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '11px', color: '#94a3b8' }}>Apply Theme:</span>
                <select
                  value={songThemeId}
                  onChange={(e) => setSongThemeId(e.target.value)}
                  style={{
                    flex: 1,
                    padding: '6px 10px',
                    backgroundColor: '#1e293b',
                    border: '1px solid #334155',
                    borderRadius: '6px',
                    color: '#f8fafc',
                    fontSize: '12px',
                  }}
                >
                  {themes.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Songs list */}
              <div
                style={{
                  maxHeight: '260px',
                  overflowY: 'auto',
                  border: '1px solid #1e293b',
                  borderRadius: '6px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '2px',
                  padding: '4px',
                }}
              >
                {songs
                  .filter(
                    (s) =>
                      s.title.toLowerCase().includes(songSearchQuery.toLowerCase()) ||
                      (s.alternateTitle &&
                        s.alternateTitle.toLowerCase().includes(songSearchQuery.toLowerCase()))
                  )
                  .map((s) => {
                    const isPicked = selectedSongToAdd?.id === s.id;
                    return (
                      <div
                        key={s.id}
                        onClick={() => setSelectedSongToAdd(s)}
                        style={{
                          padding: '8px 10px',
                          borderRadius: '5px',
                          backgroundColor: isPicked ? '#1e293b' : 'transparent',
                          border: `1px solid ${isPicked ? '#10b981' : 'transparent'}`,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                        }}
                      >
                        <div>
                          <div style={{ fontSize: '12px', fontWeight: 600, color: '#f8fafc' }}>
                            {s.title}
                          </div>
                          {s.alternateTitle && (
                            <div style={{ fontSize: '10px', color: '#94a3b8' }}>
                              {s.alternateTitle}
                            </div>
                          )}
                        </div>
                        <span
                          style={{
                            fontSize: '10px',
                            padding: '2px 6px',
                            borderRadius: '4px',
                            backgroundColor: 'rgba(16, 185, 129, 0.1)',
                            color: '#34d399',
                          }}
                        >
                          {s.language}
                        </span>
                      </div>
                    );
                  })}
              </div>
            </div>

            {/* Modal Footer */}
            <div
              style={{
                padding: '12px 18px',
                borderTop: '1px solid #1e293b',
                display: 'flex',
                justifyContent: 'flex-end',
                gap: '8px',
                backgroundColor: '#1e293b',
              }}
            >
              <button
                type="button"
                onClick={() => setIsSongPickerOpen(false)}
                style={{
                  padding: '6px 12px',
                  backgroundColor: 'transparent',
                  border: '1px solid #475569',
                  borderRadius: '5px',
                  color: '#cbd5e1',
                  fontSize: '12px',
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleAddSongConfirm}
                disabled={!selectedSongToAdd}
                style={{
                  padding: '6px 16px',
                  backgroundColor: selectedSongToAdd ? '#10b981' : '#334155',
                  border: 'none',
                  borderRadius: '5px',
                  color: '#ffffff',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: selectedSongToAdd ? 'pointer' : 'not-allowed',
                }}
              >
                Add to Playlist
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 5. Section Divider Modal */}
      {isDividerModalOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.75)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '20px',
          }}
        >
          <div
            style={{
              backgroundColor: '#0f172a',
              border: '1px solid #334155',
              borderRadius: '10px',
              width: '100%',
              maxWidth: '400px',
              padding: '18px',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
            }}
          >
            <span style={{ fontSize: '14px', fontWeight: 600, color: '#f8fafc' }}>
              Add Section Divider
            </span>
            <input
              type="text"
              value={dividerTitle}
              onChange={(e) => setDividerTitle(e.target.value)}
              placeholder="e.g. Praise & Worship, Sermon, Offering..."
              autoFocus
              style={{
                padding: '8px 10px',
                backgroundColor: '#1e293b',
                border: '1px solid #334155',
                borderRadius: '6px',
                color: '#f8fafc',
                fontSize: '12px',
              }}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button
                type="button"
                onClick={() => setIsDividerModalOpen(false)}
                style={{
                  padding: '6px 12px',
                  backgroundColor: 'transparent',
                  border: '1px solid #475569',
                  borderRadius: '5px',
                  color: '#cbd5e1',
                  fontSize: '12px',
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleAddDivider}
                disabled={!dividerTitle.trim()}
                style={{
                  padding: '6px 14px',
                  backgroundColor: '#2563eb',
                  border: 'none',
                  borderRadius: '5px',
                  color: '#ffffff',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Add Divider
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 6. Timer Modal */}
      {isTimerModalOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.75)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '20px',
          }}
        >
          <div
            style={{
              backgroundColor: '#0f172a',
              border: '1px solid #334155',
              borderRadius: '10px',
              width: '100%',
              maxWidth: '400px',
              padding: '18px',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
            }}
          >
            <span style={{ fontSize: '14px', fontWeight: 600, color: '#f8fafc' }}>
              Add Countdown Timer Placeholder
            </span>
            <div>
              <label style={{ fontSize: '11px', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>
                Timer Label
              </label>
              <input
                type="text"
                value={timerTitle}
                onChange={(e) => setTimerTitle(e.target.value)}
                placeholder="Pre-Service Countdown"
                style={{
                  width: '100%',
                  padding: '8px 10px',
                  backgroundColor: '#1e293b',
                  border: '1px solid #334155',
                  borderRadius: '6px',
                  color: '#f8fafc',
                  fontSize: '12px',
                }}
              />
            </div>
            <div>
              <label style={{ fontSize: '11px', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>
                Duration (Minutes)
              </label>
              <input
                type="number"
                min="1"
                max="60"
                value={timerMinutes}
                onChange={(e) => setTimerMinutes(Math.max(1, parseInt(e.target.value) || 1))}
                style={{
                  width: '100%',
                  padding: '8px 10px',
                  backgroundColor: '#1e293b',
                  border: '1px solid #334155',
                  borderRadius: '6px',
                  color: '#f8fafc',
                  fontSize: '12px',
                }}
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button
                type="button"
                onClick={() => setIsTimerModalOpen(false)}
                style={{
                  padding: '6px 12px',
                  backgroundColor: 'transparent',
                  border: '1px solid #475569',
                  borderRadius: '5px',
                  color: '#cbd5e1',
                  fontSize: '12px',
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleAddTimer}
                style={{
                  padding: '6px 14px',
                  backgroundColor: '#06b6d4',
                  border: 'none',
                  borderRadius: '5px',
                  color: '#ffffff',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Add Timer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
