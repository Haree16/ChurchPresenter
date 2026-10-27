import React, { useState, useMemo } from 'react';
import {
  Search,
  Plus,
  Music,
  BookOpen,
  FileText,
  Megaphone,
  Layers,
  Copy,
  Trash2,
  Edit2,
  Check,
  X,
  Upload,
} from 'lucide-react';
import { Presentation } from '../types';
import { api, isTauri } from '../services/api';
import { open as openFileDialog } from '@tauri-apps/plugin-dialog';

interface LibraryPanelProps {
  presentations: Presentation[];
  selectedPresentationId: string | null;
  onSelectPresentation: (id: string) => void;
  onCreatePresentation: (
    title: string,
    category: Presentation['category']
  ) => Promise<Presentation | null>;
  onUpdatePresentation: (
    id: string,
    title: string,
    category: Presentation['category']
  ) => Promise<Presentation | null>;
  onDuplicatePresentation: (id: string) => void;
  onDeletePresentation: (id: string) => void;
}

export const LibraryPanel: React.FC<LibraryPanelProps> = ({
  presentations,
  selectedPresentationId,
  onSelectPresentation,
  onCreatePresentation,
  onUpdatePresentation,
  onDuplicatePresentation,
  onDeletePresentation,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [isCreating, setIsCreating] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newCategory, setNewCategory] = useState<Presentation['category']>('Worship');

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editCategory, setEditCategory] = useState<Presentation['category']>('Worship');

  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const categories: Array<Presentation['category'] | 'All'> = [
    'All',
    'Worship',
    'Hymn',
    'Scripture',
    'Sermon',
    'Announcements',
  ];

  const filteredPresentations = useMemo(() => {
    return presentations.filter((p) => {
      const matchesSearch = p.title.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesCategory = selectedCategory === 'All' || p.category === selectedCategory;
      return matchesSearch && matchesCategory;
    });
  }, [presentations, searchQuery, selectedCategory]);

  const handleStartCreate = () => {
    setNewTitle('');
    setNewCategory('Worship');
    setIsCreating(true);
  };

  const [isImportingPres, setIsImportingPres] = useState(false);
  const handleImportPresentation = async () => {
    try {
      if (typeof window !== 'undefined' && isTauri()) {
        const selected = await openFileDialog({
          multiple: false,
          filters: [
            {
              name: 'Presentations',
              extensions: ['pdf', 'pptx', 'ppt'],
            },
          ],
        });
        if (selected && typeof selected === 'string') {
          setIsImportingPres(true);
          const pres = await api.importPresentationDocument(selected);
          onSelectPresentation(pres.id);
        }
      } else {
        const path = prompt('Enter presentation file path (.pdf or .pptx):', '/path/to/slides.pdf');
        if (path) {
          setIsImportingPres(true);
          const pres = await api.importPresentationDocument(path);
          onSelectPresentation(pres.id);
        }
      }
    } catch (err: any) {
      alert(err?.message || 'Failed to import presentation');
    } finally {
      setIsImportingPres(false);
    }
  };

  const handleSaveCreate = async () => {
    if (!newTitle.trim()) return;
    await onCreatePresentation(newTitle.trim(), newCategory);
    setIsCreating(false);
    setNewTitle('');
  };

  const handleStartEdit = (p: Presentation, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingId(p.id);
    setEditTitle(p.title);
    setEditCategory(p.category);
  };

  const handleSaveEdit = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!editingId || !editTitle.trim()) return;
    await onUpdatePresentation(editingId, editTitle.trim(), editCategory);
    setEditingId(null);
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'Worship':
      case 'Hymn':
        return <Music size={13} />;
      case 'Scripture':
        return <BookOpen size={13} />;
      case 'Sermon':
        return <FileText size={13} />;
      case 'Announcements':
        return <Megaphone size={13} />;
      default:
        return <Layers size={13} />;
    }
  };

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
      {/* Top Header & New Button */}
      <div
        style={{
          padding: '12px',
          borderBottom: '1px solid #1e293b',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ fontWeight: 700, fontSize: '13px', color: '#cbd5e1', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Library ({presentations.length})
        </div>
        <div style={{ display: 'flex', gap: '6px' }}>
          <button
            onClick={handleImportPresentation}
            disabled={isImportingPres}
            data-testid="import-presentation-btn"
            title="Import Presentation (PDF / PPTX)"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              padding: '4px 8px',
              backgroundColor: '#1e293b',
              border: '1px solid #334155',
              borderRadius: '4px',
              color: '#38bdf8',
              fontSize: '12px',
              fontWeight: 600,
              cursor: isImportingPres ? 'wait' : 'pointer',
            }}
          >
            <Upload size={13} />
            <span>{isImportingPres ? 'Importing...' : 'Import'}</span>
          </button>
          <button
            onClick={handleStartCreate}
            title="Create New Presentation"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              padding: '4px 8px',
              backgroundColor: '#2563eb',
              borderRadius: '4px',
              color: '#ffffff',
              fontSize: '12px',
              fontWeight: 600,
            }}
          >
            <Plus size={14} />
            <span>New</span>
          </button>
        </div>
      </div>

      {/* Search Input */}
      <div style={{ padding: '8px 12px', borderBottom: '1px solid #1e293b' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            backgroundColor: '#1e293b',
            borderRadius: '6px',
            padding: '6px 10px',
            border: '1px solid #334155',
          }}
        >
          <Search size={14} color="#94a3b8" />
          <input
            type="text"
            placeholder="Search songs, scriptures..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#f8fafc',
              fontSize: '12px',
              width: '100%',
            }}
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery('')} style={{ color: '#94a3b8' }}>
              <X size={13} />
            </button>
          )}
        </div>
      </div>

      {/* Category Filter Pills */}
      <div
        style={{
          display: 'flex',
          gap: '4px',
          padding: '6px 12px',
          borderBottom: '1px solid #1e293b',
          overflowX: 'auto',
          whiteSpace: 'nowrap',
        }}
      >
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => setSelectedCategory(cat)}
            style={{
              padding: '3px 8px',
              borderRadius: '12px',
              fontSize: '11px',
              fontWeight: 500,
              backgroundColor: selectedCategory === cat ? '#3b82f6' : '#1e293b',
              color: selectedCategory === cat ? '#ffffff' : '#94a3b8',
              transition: 'all 0.15s ease',
            }}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Inline Create Form */}
      {isCreating && (
        <div
          style={{
            padding: '10px 12px',
            backgroundColor: '#1e293b',
            borderBottom: '1px solid #3b82f6',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
          }}
        >
          <div style={{ fontSize: '11px', fontWeight: 600, color: '#93c5fd' }}>
            New Presentation
          </div>
          <input
            autoFocus
            type="text"
            placeholder="Title (e.g. Way Maker)"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSaveCreate()}
            style={{
              padding: '6px 8px',
              borderRadius: '4px',
              backgroundColor: '#0f172a',
              border: '1px solid #475569',
              color: '#f8fafc',
              fontSize: '12px',
            }}
          />
          <select
            value={newCategory}
            onChange={(e) => setNewCategory(e.target.value as Presentation['category'])}
            style={{
              padding: '5px 8px',
              borderRadius: '4px',
              backgroundColor: '#0f172a',
              border: '1px solid #475569',
              color: '#f8fafc',
              fontSize: '12px',
            }}
          >
            <option value="Worship">Worship</option>
            <option value="Hymn">Hymn</option>
            <option value="Scripture">Scripture</option>
            <option value="Sermon">Sermon</option>
            <option value="Announcements">Announcements</option>
            <option value="Other">Other</option>
          </select>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '6px' }}>
            <button
              onClick={() => setIsCreating(false)}
              style={{
                padding: '4px 8px',
                fontSize: '11px',
                borderRadius: '4px',
                backgroundColor: '#334155',
                color: '#cbd5e1',
              }}
            >
              Cancel
            </button>
            <button
              onClick={handleSaveCreate}
              style={{
                padding: '4px 10px',
                fontSize: '11px',
                borderRadius: '4px',
                backgroundColor: '#2563eb',
                color: '#ffffff',
                fontWeight: 600,
              }}
            >
              Add
            </button>
          </div>
        </div>
      )}

      {/* Presentations List */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '6px' }}>
        {filteredPresentations.length === 0 ? (
          <div
            style={{
              padding: '24px 12px',
              textAlign: 'center',
              color: '#64748b',
              fontSize: '12px',
            }}
          >
            {searchQuery ? 'No presentations match your search' : 'No presentations yet'}
          </div>
        ) : (
          filteredPresentations.map((p) => {
            const isSelected = p.id === selectedPresentationId;
            const isEditing = editingId === p.id;
            const isConfirmingDelete = deleteConfirmId === p.id;

            if (isEditing) {
              return (
                <div
                  key={p.id}
                  style={{
                    padding: '8px',
                    borderRadius: '6px',
                    backgroundColor: '#1e293b',
                    border: '1px solid #3b82f6',
                    marginBottom: '4px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px',
                  }}
                >
                  <input
                    type="text"
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    style={{
                      padding: '4px 6px',
                      borderRadius: '4px',
                      backgroundColor: '#0f172a',
                      border: '1px solid #475569',
                      color: '#ffffff',
                      fontSize: '12px',
                    }}
                  />
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <select
                      value={editCategory}
                      onChange={(e) => setEditCategory(e.target.value as Presentation['category'])}
                      style={{
                        padding: '3px 6px',
                        borderRadius: '4px',
                        backgroundColor: '#0f172a',
                        border: '1px solid #475569',
                        color: '#cbd5e1',
                        fontSize: '11px',
                      }}
                    >
                      <option value="Worship">Worship</option>
                      <option value="Hymn">Hymn</option>
                      <option value="Scripture">Scripture</option>
                      <option value="Sermon">Sermon</option>
                      <option value="Announcements">Announcements</option>
                      <option value="Other">Other</option>
                    </select>
                    <div style={{ display: 'flex', gap: '4px' }}>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingId(null);
                        }}
                        style={{ padding: '4px', color: '#94a3b8' }}
                      >
                        <X size={14} />
                      </button>
                      <button
                        onClick={handleSaveEdit}
                        style={{
                          padding: '4px 8px',
                          backgroundColor: '#2563eb',
                          borderRadius: '4px',
                          color: '#ffffff',
                        }}
                      >
                        <Check size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              );
            }

            return (
              <div
                key={p.id}
                onClick={() => onSelectPresentation(p.id)}
                style={{
                  padding: '8px 10px',
                  borderRadius: '6px',
                  backgroundColor: isSelected ? '#1e293b' : 'transparent',
                  border: isSelected ? '1px solid #3b82f6' : '1px solid transparent',
                  marginBottom: '2px',
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '4px',
                  transition: 'background-color 0.15s ease',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div
                    style={{
                      fontWeight: isSelected ? 600 : 500,
                      fontSize: '13px',
                      color: isSelected ? '#ffffff' : '#e2e8f0',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      flex: 1,
                    }}
                  >
                    {p.title}
                  </div>
                  <span
                    style={{
                      fontSize: '10px',
                      color: '#94a3b8',
                      backgroundColor: '#334155',
                      padding: '1px 6px',
                      borderRadius: '10px',
                      marginLeft: '6px',
                    }}
                  >
                    {p.slideCount ?? 0}
                  </span>
                </div>

                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    fontSize: '11px',
                    color: '#94a3b8',
                  }}
                >
                  <span
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      color: '#60a5fa',
                    }}
                  >
                    {getCategoryIcon(p.category)}
                    {p.category}
                  </span>

                  {/* Actions (visible on selection/hover) */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      opacity: isSelected ? 1 : 0.4,
                    }}
                  >
                    <button
                      onClick={(e) => handleStartEdit(p, e)}
                      title="Edit presentation"
                      style={{ padding: '2px', color: '#cbd5e1' }}
                    >
                      <Edit2 size={13} />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onDuplicatePresentation(p.id);
                      }}
                      title="Duplicate presentation"
                      style={{ padding: '2px', color: '#cbd5e1' }}
                    >
                      <Copy size={13} />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeleteConfirmId(p.id);
                      }}
                      title="Delete presentation"
                      style={{ padding: '2px', color: '#f87171' }}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>

                {/* Destructive Delete Confirmation Dialog */}
                {isConfirmingDelete && (
                  <div
                    onClick={(e) => e.stopPropagation()}
                    style={{
                      marginTop: '6px',
                      padding: '8px',
                      borderRadius: '4px',
                      backgroundColor: 'rgba(239, 68, 68, 0.15)',
                      border: '1px solid #ef4444',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '6px',
                    }}
                  >
                    <div style={{ fontSize: '11px', color: '#fca5a5', fontWeight: 600 }}>
                      Delete "{p.title}" and its slides?
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '6px' }}>
                      <button
                        onClick={() => setDeleteConfirmId(null)}
                        style={{
                          padding: '3px 8px',
                          borderRadius: '3px',
                          backgroundColor: '#334155',
                          fontSize: '11px',
                          color: '#ffffff',
                        }}
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => {
                          onDeletePresentation(p.id);
                          setDeleteConfirmId(null);
                        }}
                        style={{
                          padding: '3px 8px',
                          borderRadius: '3px',
                          backgroundColor: '#dc2626',
                          fontSize: '11px',
                          color: '#ffffff',
                          fontWeight: 600,
                        }}
                      >
                        Confirm Delete
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
