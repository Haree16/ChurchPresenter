import React, { useState, useCallback } from 'react';
import {
  Music,
  BookOpen,
  FileText,
  Megaphone,
  Type,
  Image as ImageIcon,
  Minus,
  Timer,
  Play,
  Edit2,
  Trash2,
  Copy,
  ChevronUp,
  ChevronDown,
  Plus,
  Radio,
  FileQuestion,
} from 'lucide-react';
import { PlaylistItem, PlaylistItemType, Service } from '../../types';

interface PlaylistPanelProps {
  service: Service | null;
  items: PlaylistItem[];
  selectedItemId: string | null;
  liveItemId: string | null;
  nextItemId: string | null;
  onSelectItem: (item: PlaylistItem) => void;
  onTakeItemLive: (item: PlaylistItem) => void;
  onReorderItems: (itemIds: string[]) => Promise<void>;
  onDeleteItem: (itemId: string) => Promise<void>;
  onDuplicateItem: (itemId: string) => Promise<void>;
  onEditItem: (item: PlaylistItem) => void;
  onOpenAddSong: () => void;
  onOpenAddPassage: () => void;
  onOpenAddSermon: () => void;
  onOpenAddAnnouncement: () => void;
  onOpenAddDivider: () => void;
  onOpenAddTimer: () => void;
  onOpenAddText: () => void;
}

export const getItemTypeMeta = (type: PlaylistItemType) => {
  switch (type) {
    case 'song':
      return {
        label: 'Worship Song',
        icon: Music,
        color: '#10b981',
        bgColor: 'rgba(16, 185, 129, 0.15)',
        badgeColor: '#059669',
      };
    case 'bible':
      return {
        label: 'Scripture',
        icon: BookOpen,
        color: '#3b82f6',
        bgColor: 'rgba(59, 130, 246, 0.15)',
        badgeColor: '#2563eb',
      };
    case 'sermon':
      return {
        label: 'Sermon',
        icon: FileText,
        color: '#8b5cf6',
        bgColor: 'rgba(139, 92, 246, 0.15)',
        badgeColor: '#7c3aed',
      };
    case 'announcement':
      return {
        label: 'Announcement',
        icon: Megaphone,
        color: '#f59e0b',
        bgColor: 'rgba(245, 158, 11, 0.15)',
        badgeColor: '#d97706',
      };
    case 'image':
      return {
        label: 'Image Slide',
        icon: ImageIcon,
        color: '#ec4899',
        bgColor: 'rgba(236, 72, 153, 0.15)',
        badgeColor: '#db2777',
      };
    case 'divider':
      return {
        label: 'Section Divider',
        icon: Minus,
        color: '#94a3b8',
        bgColor: 'rgba(148, 163, 184, 0.15)',
        badgeColor: '#64748b',
      };
    case 'timer':
      return {
        label: 'Timer Placeholder',
        icon: Timer,
        color: '#06b6d4',
        bgColor: 'rgba(6, 182, 212, 0.15)',
        badgeColor: '#0891b2',
      };
    case 'text':
    default:
      return {
        label: 'Text Slides',
        icon: Type,
        color: '#38bdf8',
        bgColor: 'rgba(56, 189, 248, 0.15)',
        badgeColor: '#0284c7',
      };
  }
};

interface PlaylistItemRowProps {
  item: PlaylistItem;
  index: number;
  totalItems: number;
  isSelected: boolean;
  isLive: boolean;
  isNext: boolean;
  onSelectItem: (item: PlaylistItem) => void;
  onTakeItemLive: (item: PlaylistItem) => void;
  onMove: (index: number, direction: 'up' | 'down') => void;
  onEditItem: (item: PlaylistItem) => void;
  onDuplicateItem: (itemId: string) => void;
  onDeleteItem: (itemId: string) => void;
  onDragStart: (e: React.DragEvent, index: number) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent, index: number) => void;
}

export const PlaylistItemRow = React.memo<PlaylistItemRowProps>(({
  item,
  index,
  totalItems,
  isSelected,
  isLive,
  isNext,
  onSelectItem,
  onTakeItemLive,
  onMove,
  onEditItem,
  onDuplicateItem,
  onDeleteItem,
  onDragStart,
  onDragOver,
  onDrop,
}) => {
  const isDivider = item.itemType === 'divider';
  const meta = getItemTypeMeta(item.itemType);
  const Icon = meta.icon;

  if (isDivider) {
    return (
      <div
        onClick={() => onSelectItem(item)}
        style={{
          padding: '8px 10px',
          margin: '6px 0',
          backgroundColor: isSelected ? '#1e293b' : 'rgba(30, 41, 59, 0.4)',
          border: `1px dashed ${isSelected ? '#60a5fa' : '#334155'}`,
          borderRadius: '6px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          cursor: 'pointer',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Minus size={14} color="#94a3b8" />
          <span
            style={{
              fontSize: '11px',
              fontWeight: 700,
              letterSpacing: '0.05em',
              textTransform: 'uppercase',
              color: '#cbd5e1',
            }}
          >
            {item.title}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onMove(index, 'up');
            }}
            disabled={index === 0}
            style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer' }}
          >
            <ChevronUp size={12} />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onMove(index, 'down');
            }}
            disabled={index === totalItems - 1}
            style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer' }}
          >
            <ChevronDown size={12} />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onDeleteItem(item.id);
            }}
            style={{ background: 'none', border: 'none', color: '#f87171', cursor: 'pointer' }}
          >
            <Trash2 size={12} />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, index)}
      onDragOver={onDragOver}
      onDrop={(e) => onDrop(e, index)}
      onClick={() => onSelectItem(item)}
      onDoubleClick={() => onTakeItemLive(item)}
      style={{
        padding: '8px 10px',
        borderRadius: '8px',
        backgroundColor: isLive
          ? 'rgba(239, 68, 68, 0.12)'
          : isSelected
          ? '#1e293b'
          : '#090d16',
        border: isLive
          ? '1px solid #ef4444'
          : isSelected
          ? '1px solid #3b82f6'
          : isNext
          ? '1px dashed #f59e0b'
          : '1px solid #1e293b',
        display: 'flex',
        flexDirection: 'column',
        gap: '6px',
        cursor: 'pointer',
        position: 'relative',
        transition: 'background-color 0.15s, border-color 0.15s',
      }}
    >
      {/* Item Top Row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
          {/* Index Number */}
          <span
            style={{
              fontSize: '11px',
              fontWeight: 700,
              color: isLive ? '#f87171' : isSelected ? '#60a5fa' : '#64748b',
              minWidth: '18px',
            }}
          >
            {index + 1}.
          </span>

          {/* Type Icon Badge */}
          <div
            style={{
              width: '24px',
              height: '24px',
              borderRadius: '6px',
              backgroundColor: meta.bgColor,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: meta.color,
              flexShrink: 0,
            }}
          >
            <Icon size={14} />
          </div>

          {/* Title & Metadata */}
          <div style={{ minWidth: 0, flex: 1 }}>
            <div
              style={{
                fontSize: '13px',
                fontWeight: 600,
                color: '#f8fafc',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {item.title}
            </div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '10px',
                color: '#94a3b8',
                marginTop: '2px',
              }}
            >
              <span style={{ color: meta.color, fontWeight: 500 }}>
                {meta.label}
              </span>
              {item.slideCount !== undefined && (
                <>
                  <span>•</span>
                  <span>{item.slideCount} slides</span>
                </>
              )}
              {item.durationSeconds ? (
                <>
                  <span>•</span>
                  <span>{Math.round(item.durationSeconds / 60)} min</span>
                </>
              ) : null}
            </div>
          </div>
        </div>

        {/* Badges: LIVE or NEXT */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          {isLive && (
            <span
              style={{
                padding: '2px 6px',
                borderRadius: '4px',
                backgroundColor: '#ef4444',
                color: '#ffffff',
                fontSize: '9px',
                fontWeight: 800,
                letterSpacing: '0.05em',
                display: 'flex',
                alignItems: 'center',
                gap: '3px',
                animation: 'pulse 2s infinite',
              }}
            >
              <Radio size={10} /> LIVE
            </span>
          )}
          {isNext && (
            <span
              style={{
                padding: '2px 6px',
                borderRadius: '4px',
                backgroundColor: 'rgba(245, 158, 11, 0.2)',
                border: '1px solid #f59e0b',
                color: '#fbbf24',
                fontSize: '9px',
                fontWeight: 700,
              }}
            >
              NEXT
            </span>
          )}
        </div>
      </div>

      {/* Operator Note Snippet if present */}
      {item.notes && (
        <div
          style={{
            fontSize: '10px',
            color: '#cbd5e1',
            fontStyle: 'italic',
            backgroundColor: 'rgba(30, 41, 59, 0.5)',
            padding: '3px 6px',
            borderRadius: '4px',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          Note: {item.notes}
        </div>
      )}

      {/* Bottom Row Controls */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingTop: '4px',
          borderTop: '1px solid rgba(255, 255, 255, 0.05)',
        }}
      >
        {/* Take Live Button */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onTakeItemLive(item);
          }}
          style={{
            padding: '3px 8px',
            backgroundColor: isLive ? 'rgba(239, 68, 68, 0.2)' : '#1e293b',
            border: `1px solid ${isLive ? '#ef4444' : '#334155'}`,
            borderRadius: '4px',
            color: isLive ? '#fca5a5' : '#e2e8f0',
            fontSize: '10px',
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            cursor: 'pointer',
          }}
        >
          <Play size={10} fill={isLive ? '#ef4444' : 'currentColor'} />
          {isLive ? 'Currently Live' : 'Take Live'}
        </button>

        {/* Actions: Reorder, Edit, Duplicate, Delete */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
          <button
            type="button"
            title="Move Up"
            onClick={(e) => {
              e.stopPropagation();
              onMove(index, 'up');
            }}
            disabled={index === 0}
            style={{
              background: 'none',
              border: 'none',
              color: index === 0 ? '#334155' : '#94a3b8',
              cursor: index === 0 ? 'default' : 'pointer',
              padding: '2px',
            }}
          >
            <ChevronUp size={13} />
          </button>
          <button
            type="button"
            title="Move Down"
            onClick={(e) => {
              e.stopPropagation();
              onMove(index, 'down');
            }}
            disabled={index === totalItems - 1}
            style={{
              background: 'none',
              border: 'none',
              color: index === totalItems - 1 ? '#334155' : '#94a3b8',
              cursor: index === totalItems - 1 ? 'default' : 'pointer',
              padding: '2px',
            }}
          >
            <ChevronDown size={13} />
          </button>

          {item.itemType !== 'divider' && item.itemType !== 'timer' && (
            <button
              type="button"
              title="Edit Item Slides"
              onClick={(e) => {
                e.stopPropagation();
                onEditItem(item);
              }}
              style={{
                background: 'none',
                border: 'none',
                color: '#94a3b8',
                cursor: 'pointer',
                padding: '2px',
              }}
            >
              <Edit2 size={12} />
            </button>
          )}

          <button
            type="button"
            title="Duplicate Item"
            onClick={(e) => {
              e.stopPropagation();
              onDuplicateItem(item.id);
            }}
            style={{
              background: 'none',
              border: 'none',
              color: '#94a3b8',
              cursor: 'pointer',
              padding: '2px',
            }}
          >
            <Copy size={12} />
          </button>

          <button
            type="button"
            title="Delete Item"
            onClick={(e) => {
              e.stopPropagation();
              onDeleteItem(item.id);
            }}
            style={{
              background: 'none',
              border: 'none',
              color: '#f87171',
              cursor: 'pointer',
              padding: '2px',
            }}
          >
            <Trash2 size={12} />
          </button>
        </div>
      </div>
    </div>
  );
});

PlaylistItemRow.displayName = 'PlaylistItemRow';

export const PlaylistPanel: React.FC<PlaylistPanelProps> = ({
  service,
  items,
  selectedItemId,
  liveItemId,
  nextItemId,
  onSelectItem,
  onTakeItemLive,
  onReorderItems,
  onDeleteItem,
  onDuplicateItem,
  onEditItem,
  onOpenAddSong,
  onOpenAddPassage,
  onOpenAddSermon,
  onOpenAddAnnouncement,
  onOpenAddDivider,
  onOpenAddTimer,
  onOpenAddText,
}) => {
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

  const handleMove = useCallback(
    async (index: number, direction: 'up' | 'down') => {
      if (
        (direction === 'up' && index === 0) ||
        (direction === 'down' && index === items.length - 1)
      ) {
        return;
      }
      const targetIndex = direction === 'up' ? index - 1 : index + 1;
      const newItems = [...items];
      const temp = newItems[index];
      newItems[index] = newItems[targetIndex];
      newItems[targetIndex] = temp;
      await onReorderItems(newItems.map((it) => it.id));
    },
    [items, onReorderItems]
  );

  const handleDragStart = useCallback((e: React.DragEvent, index: number) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = 'move';
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }, []);

  const handleDrop = useCallback(
    async (e: React.DragEvent, targetIndex: number) => {
      e.preventDefault();
      if (draggedIndex === null || draggedIndex === targetIndex) {
        setDraggedIndex(null);
        return;
      }
      const newItems = [...items];
      const [moved] = newItems.splice(draggedIndex, 1);
      newItems.splice(targetIndex, 0, moved);
      setDraggedIndex(null);
      await onReorderItems(newItems.map((it) => it.id));
    },
    [draggedIndex, items, onReorderItems]
  );

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        backgroundColor: '#0f172a',
        borderRight: '1px solid #1e293b',
      }}
    >
      {/* Playlist Top Toolbar */}
      <div
        style={{
          padding: '12px 16px',
          borderBottom: '1px solid #1e293b',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          backgroundColor: '#1e293b',
        }}
      >
        <div>
          <div style={{ fontSize: '13px', fontWeight: 600, color: '#f8fafc' }}>
            {service ? service.title : 'Service Order of Worship'}
          </div>
          <div style={{ fontSize: '11px', color: '#94a3b8' }}>
            {items.length} {items.length === 1 ? 'item' : 'items'} in playlist
          </div>
        </div>

        {/* Quick Add Menu Button */}
        <div style={{ position: 'relative' }}>
          <button
            type="button"
            onClick={() => setShowAddMenu(!showAddMenu)}
            style={{
              padding: '6px 10px',
              backgroundColor: '#2563eb',
              border: 'none',
              borderRadius: '6px',
              color: '#ffffff',
              fontSize: '11px',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              cursor: 'pointer',
            }}
          >
            <Plus size={14} /> Add Item
          </button>

          {showAddMenu && (
            <>
              <div
                onClick={() => setShowAddMenu(false)}
                style={{ position: 'fixed', inset: 0, zIndex: 100 }}
              />
              <div
                style={{
                  position: 'absolute',
                  right: 0,
                  top: '100%',
                  marginTop: '4px',
                  backgroundColor: '#1e293b',
                  border: '1px solid #334155',
                  borderRadius: '8px',
                  boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.4)',
                  padding: '6px',
                  width: '210px',
                  zIndex: 101,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '2px',
                }}
              >
                <button
                  type="button"
                  onClick={() => {
                    setShowAddMenu(false);
                    onOpenAddSong();
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '8px 10px',
                    background: 'transparent',
                    border: 'none',
                    borderRadius: '5px',
                    color: '#f8fafc',
                    fontSize: '12px',
                    textAlign: 'left',
                    cursor: 'pointer',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#334155')}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                >
                  <Music size={14} color="#10b981" />
                  <span>Worship Song</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setShowAddMenu(false);
                    onOpenAddPassage();
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '8px 10px',
                    background: 'transparent',
                    border: 'none',
                    borderRadius: '5px',
                    color: '#f8fafc',
                    fontSize: '12px',
                    textAlign: 'left',
                    cursor: 'pointer',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#334155')}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                >
                  <BookOpen size={14} color="#3b82f6" />
                  <span>Scripture Passage</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setShowAddMenu(false);
                    onOpenAddSermon();
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '8px 10px',
                    background: 'transparent',
                    border: 'none',
                    borderRadius: '5px',
                    color: '#f8fafc',
                    fontSize: '12px',
                    textAlign: 'left',
                    cursor: 'pointer',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#334155')}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                >
                  <FileText size={14} color="#8b5cf6" />
                  <span>Sermon Slides</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setShowAddMenu(false);
                    onOpenAddAnnouncement();
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '8px 10px',
                    background: 'transparent',
                    border: 'none',
                    borderRadius: '5px',
                    color: '#f8fafc',
                    fontSize: '12px',
                    textAlign: 'left',
                    cursor: 'pointer',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#334155')}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                >
                  <Megaphone size={14} color="#f59e0b" />
                  <span>Announcements</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setShowAddMenu(false);
                    onOpenAddText();
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '8px 10px',
                    background: 'transparent',
                    border: 'none',
                    borderRadius: '5px',
                    color: '#f8fafc',
                    fontSize: '12px',
                    textAlign: 'left',
                    cursor: 'pointer',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#334155')}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                >
                  <Type size={14} color="#38bdf8" />
                  <span>General Text Slides</span>
                </button>

                <div style={{ height: '1px', backgroundColor: '#334155', margin: '4px 0' }} />

                <button
                  type="button"
                  onClick={() => {
                    setShowAddMenu(false);
                    onOpenAddDivider();
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '8px 10px',
                    background: 'transparent',
                    border: 'none',
                    borderRadius: '5px',
                    color: '#cbd5e1',
                    fontSize: '12px',
                    textAlign: 'left',
                    cursor: 'pointer',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#334155')}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                >
                  <Minus size={14} color="#94a3b8" />
                  <span>Section Divider</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setShowAddMenu(false);
                    onOpenAddTimer();
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '8px 10px',
                    background: 'transparent',
                    border: 'none',
                    borderRadius: '5px',
                    color: '#cbd5e1',
                    fontSize: '12px',
                    textAlign: 'left',
                    cursor: 'pointer',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#334155')}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                >
                  <Timer size={14} color="#06b6d4" />
                  <span>Countdown Placeholder</span>
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Playlist Items List */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '10px',
          display: 'flex',
          flexDirection: 'column',
          gap: '6px',
        }}
      >
        {items.length === 0 ? (
          <div
            style={{
              padding: '30px 16px',
              textAlign: 'center',
              color: '#64748b',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '10px',
            }}
          >
            <FileQuestion size={36} strokeWidth={1.5} color="#475569" />
            <div style={{ fontSize: '13px', fontWeight: 500, color: '#94a3b8' }}>
              No items in this service playlist yet
            </div>
            <p style={{ fontSize: '11px', margin: 0, maxWidth: '240px', lineHeight: '1.4' }}>
              Add worship songs, Bible scriptures, sermon outlines, and announcements using the "+ Add Item" menu above.
            </p>
          </div>
        ) : (
          items.map((item, index) => (
            <PlaylistItemRow
              key={item.id}
              item={item}
              index={index}
              totalItems={items.length}
              isSelected={item.id === selectedItemId}
              isLive={item.id === liveItemId}
              isNext={item.id === nextItemId && item.id !== liveItemId}
              onSelectItem={onSelectItem}
              onTakeItemLive={onTakeItemLive}
              onMove={handleMove}
              onEditItem={onEditItem}
              onDuplicateItem={onDuplicateItem}
              onDeleteItem={onDeleteItem}
              onDragStart={handleDragStart}
              onDragOver={handleDragOver}
              onDrop={handleDrop}
            />
          ))
        )}
      </div>
    </div>
  );
};
