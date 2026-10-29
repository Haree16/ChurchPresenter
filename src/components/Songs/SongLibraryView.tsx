import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Search,
  Plus,
  Trash2,
  Copy,
  Edit3,
  Sparkles,
  FileJson,
  ClipboardPaste,
  Check,
  BookOpen,
} from 'lucide-react';
import { Song, SongSection, SongArrangement, Presentation } from '../../types';
import { api } from '../../services/api';
import { LyricsEditor } from './LyricsEditor';
import { ArrangementEditor } from './ArrangementEditor';
import { SlideGeneratorModal } from './SlideGeneratorModal';
import { SongImportExportModal } from './SongImportExportModal';
import { SongPasteModal } from './SongPasteModal';

interface SongLibraryViewProps {
  presentations: Presentation[];
  currentPresentationId: string | null;
  onSlidesGenerated: (presentationId: string) => void;
}

export const SongLibraryView: React.FC<SongLibraryViewProps> = ({
  presentations,
  currentPresentationId,
  onSlidesGenerated,
}) => {
  const [songs, setSongs] = useState<Song[]>([]);
  const [selectedSongId, setSelectedSongId] = useState<string | null>(null);
  const [currentSong, setCurrentSong] = useState<Song | null>(null);
  const [sections, setSections] = useState<SongSection[]>([]);
  const [arrangements, setArrangements] = useState<SongArrangement[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [languageFilter, setLanguageFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'title' | 'updated' | 'language'>('title');
  const [isSaving, setIsSaving] = useState(false);
  const [isSlideGeneratorOpen, setIsSlideGeneratorOpen] = useState(false);
  const [isImportExportOpen, setIsImportExportOpen] = useState(false);
  const [isPasteOpen, setIsPasteOpen] = useState(false);
  const [isCreatingSong, setIsCreatingSong] = useState(false);
  const [isEditingMetadata, setIsEditingMetadata] = useState(false);
  const [notification, setNotification] = useState<string | null>(null);

  // New Song Form State
  const [newTitle, setNewTitle] = useState('');
  const [newAltTitle, setNewAltTitle] = useState('');
  const [newLanguage, setNewLanguage] = useState('Tamil');
  const [newCategory, setNewCategory] = useState('Worship');
  const [newAuthor, setNewAuthor] = useState('');
  const [newSongKey, setNewSongKey] = useState('');
  const [newTags, setNewTags] = useState('');

  // Load songs list
  const loadSongs = useCallback(async () => {
    try {
      const list = await api.listSongs();
      setSongs(list);
      if (list.length > 0 && !selectedSongId) {
        setSelectedSongId(list[0].id);
      }
    } catch (err) {
      console.error('Failed to list songs:', err);
    }
  }, [selectedSongId]);

  useEffect(() => {
    loadSongs();
  }, [loadSongs]);

  // Load selected song details & sections
  useEffect(() => {
    if (!selectedSongId) {
      setCurrentSong(null);
      setSections([]);
      setArrangements([]);
      return;
    }
    let isCancelled = false;
    api.getSong(selectedSongId).then((data) => {
      if (!isCancelled && data) {
        setCurrentSong(data.song);
        setSections(data.sections);
      }
    });
    api.getSongArrangements(selectedSongId).then((list) => {
      if (!isCancelled) setArrangements(list);
    });
    return () => {
      isCancelled = true;
    };
  }, [selectedSongId]);

  // Search & Filter
  const filteredSongs = useMemo(() => {
    let result = songs;

    if (languageFilter !== 'all') {
      result = result.filter(
        (s) => s.language.toLowerCase() === languageFilter.toLowerCase()
      );
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(
        (s) =>
          s.title.toLowerCase().includes(q) ||
          (s.alternateTitle && s.alternateTitle.toLowerCase().includes(q)) ||
          s.tags.some((t) => t.toLowerCase().includes(q)) ||
          (s.author && s.author.toLowerCase().includes(q)) ||
          (s.category && s.category.toLowerCase().includes(q))
      );
    }

    return [...result].sort((a, b) => {
      if (sortBy === 'title') {
        return a.title.localeCompare(b.title, undefined, { sensitivity: 'base' });
      } else if (sortBy === 'updated') {
        return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
      } else if (sortBy === 'language') {
        return a.language.localeCompare(b.language);
      }
      return 0;
    });
  }, [songs, languageFilter, searchQuery, sortBy]);

  const showNotification = (msg: string) => {
    setNotification(msg);
    setTimeout(() => setNotification(null), 3000);
  };

  // Create Song
  const handleCreateSong = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;

    try {
      const tagsArray = newTags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);

      const created = await api.createSong(
        {
          title: newTitle.trim(),
          alternateTitle: newAltTitle.trim() || undefined,
          language: newLanguage,
          category: newCategory,
          author: newAuthor.trim() || undefined,
          songKey: newSongKey.trim() || undefined,
          tags: tagsArray,
        },
        [
          {
            id: `sec-${Date.now()}-1`,
            songId: '',
            sectionType: 'verse',
            label: 'Verse 1',
            lyrics: '',
            sortOrder: 0,
          },
        ]
      );

      await loadSongs();
      setSelectedSongId(created.song.id);
      setIsCreatingSong(false);
      setNewTitle('');
      setNewAltTitle('');
      setNewAuthor('');
      setNewSongKey('');
      setNewTags('');
      showNotification(`Created "${created.song.title}"`);
    } catch (err: any) {
      alert(err?.message || 'Failed to create song');
    }
  };

  // Update Song Metadata
  const handleUpdateMetadata = async () => {
    if (!currentSong) return;
    try {
      await api.updateSong(currentSong);
      await loadSongs();
      setIsEditingMetadata(false);
      showNotification('Song details updated');
    } catch (err: any) {
      alert(err?.message || 'Failed to update song details');
    }
  };

  // Save Sections
  const handleSaveSections = async () => {
    if (!currentSong) return;
    setIsSaving(true);
    try {
      const saved = await api.saveSongSections(currentSong.id, sections);
      setSections(saved);
      // arrangements reference section ids, so they are saved after the sections
      setArrangements(await api.saveSongArrangements(currentSong.id, arrangements));
      await loadSongs();
      showNotification('Song lyrics saved successfully');
    } catch (err: any) {
      alert(err?.message || 'Failed to save sections');
    } finally {
      setIsSaving(false);
    }
  };

  // Duplicate Song
  const handleDuplicateSong = async () => {
    if (!currentSong) return;
    try {
      const dup = await api.duplicateSong(currentSong.id);
      await loadSongs();
      setSelectedSongId(dup.song.id);
      showNotification(`Duplicated as "${dup.song.title}"`);
    } catch (err: any) {
      alert(err?.message || 'Failed to duplicate song');
    }
  };

  // Delete Song
  const handleDeleteSong = async () => {
    if (!currentSong) return;
    if (
      !window.confirm(
        `Are you sure you want to delete "${currentSong.title}" from the library?`
      )
    ) {
      return;
    }
    try {
      await api.deleteSong(currentSong.id);
      await loadSongs();
      setSelectedSongId(null);
      showNotification('Song deleted from library');
    } catch (err: any) {
      alert(err?.message || 'Failed to delete song');
    }
  };

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '320px 1fr',
        height: 'calc(100vh - 56px)',
        backgroundColor: '#090d16',
        overflow: 'hidden',
      }}
    >
      {/* Left Column: Song List & Filters */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: '#060a12',
          borderRight: '1px solid #1e293b',
          overflow: 'hidden',
        }}
      >
        {/* Top Controls: Search Bar & Actions */}
        <div
          style={{
            padding: '14px',
            borderBottom: '1px solid #1e293b',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div
              style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                backgroundColor: '#0f172a',
                border: '1px solid #1e293b',
                borderRadius: '6px',
                padding: '6px 10px',
                gap: '8px',
              }}
            >
              <Search size={15} color="#94a3b8" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search lyrics, title, Tamil..."
                style={{
                  width: '100%',
                  backgroundColor: 'transparent',
                  border: 'none',
                  color: '#f8fafc',
                  fontSize: '12px',
                }}
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  style={{ color: '#64748b', fontSize: '11px' }}
                >
                  Clear
                </button>
              )}
            </div>

            <button
              type="button"
              onClick={() => setIsCreatingSong(true)}
              title="Create New Song"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '8px',
                backgroundColor: '#2563eb',
                color: '#ffffff',
                borderRadius: '6px',
              }}
            >
              <Plus size={16} />
            </button>

            <button
              type="button"
              onClick={() => setIsPasteOpen(true)}
              title="Import lyrics from clipboard"
              data-testid="song-paste-btn"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '8px',
                backgroundColor: '#1e293b',
                color: '#38bdf8',
                borderRadius: '6px',
                border: '1px solid #334155',
              }}
            >
              <ClipboardPaste size={16} />
            </button>

            <button
              type="button"
              onClick={() => setIsImportExportOpen(true)}
              title="Import or Export Songs"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '8px',
                backgroundColor: '#1e293b',
                color: '#38bdf8',
                borderRadius: '6px',
                border: '1px solid #334155',
              }}
            >
              <FileJson size={16} />
            </button>
          </div>

          {/* Filter Chips: Language & Sort */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              fontSize: '11px',
            }}
          >
            {/* Language Pills */}
            <div style={{ display: 'flex', gap: '4px' }}>
              {(['all', 'Tamil', 'English'] as const).map((lang) => (
                <button
                  key={lang}
                  type="button"
                  onClick={() => setLanguageFilter(lang)}
                  style={{
                    padding: '2px 8px',
                    borderRadius: '4px',
                    fontWeight: 600,
                    backgroundColor:
                      languageFilter.toLowerCase() === lang.toLowerCase()
                        ? '#3b82f6'
                        : '#1e293b',
                    color:
                      languageFilter.toLowerCase() === lang.toLowerCase()
                        ? '#ffffff'
                        : '#94a3b8',
                  }}
                >
                  {lang === 'all' ? 'All Languages' : lang}
                </button>
              ))}
            </div>

            {/* Sort Dropdown */}
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              style={{
                backgroundColor: '#1e293b',
                border: '1px solid #334155',
                borderRadius: '4px',
                color: '#cbd5e1',
                padding: '2px 6px',
                fontSize: '11px',
              }}
            >
              <option value="title">Title (A-Z)</option>
              <option value="updated">Recently Modified</option>
              <option value="language">Language</option>
            </select>
          </div>
        </div>

        {/* Songs Count */}
        <div
          style={{
            padding: '8px 14px',
            fontSize: '11px',
            color: '#64748b',
            fontWeight: 600,
            borderBottom: '1px solid #1e293b',
          }}
        >
          {filteredSongs.length} {filteredSongs.length === 1 ? 'SONG' : 'SONGS'} FOUND
        </div>

        {/* Song Cards List */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '8px' }}>
          {filteredSongs.length === 0 ? (
            <div
              style={{
                padding: '32px 16px',
                textAlign: 'center',
                color: '#64748b',
                fontSize: '12px',
              }}
            >
              No songs found matching your search.
            </div>
          ) : (
            filteredSongs.map((song) => {
              const isSelected = selectedSongId === song.id;
              const isTamil = song.language.toLowerCase() === 'tamil';

              return (
                <div
                  key={song.id}
                  onClick={() => setSelectedSongId(song.id)}
                  style={{
                    padding: '10px 12px',
                    borderRadius: '8px',
                    marginBottom: '6px',
                    backgroundColor: isSelected ? '#1e293b' : '#0f172a',
                    border: `1px solid ${
                      isSelected ? '#3b82f6' : 'rgba(30, 41, 59, 0.5)'
                    }`,
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      justifyContent: 'space-between',
                      gap: '8px',
                    }}
                  >
                    <div style={{ flex: 1, overflow: 'hidden' }}>
                      <div
                        style={{
                          fontSize: '13px',
                          fontWeight: 700,
                          color: isSelected ? '#60a5fa' : '#f8fafc',
                          lineHeight: 1.3,
                        }}
                      >
                        {song.title}
                      </div>

                      {song.alternateTitle && (
                        <div
                          style={{
                            fontSize: '11px',
                            color: '#94a3b8',
                            marginTop: '2px',
                          }}
                        >
                          {song.alternateTitle}
                        </div>
                      )}
                    </div>

                    <span
                      style={{
                        padding: '2px 6px',
                        borderRadius: '4px',
                        fontSize: '10px',
                        fontWeight: 700,
                        backgroundColor: isTamil
                          ? 'rgba(234, 179, 8, 0.15)'
                          : 'rgba(59, 130, 246, 0.15)',
                        color: isTamil ? '#facc15' : '#60a5fa',
                        border: `1px solid ${
                          isTamil ? '#ca8a0440' : '#2563eb40'
                        }`,
                      }}
                    >
                      {song.language}
                    </span>
                  </div>

                  {/* Metadata Chips */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      marginTop: '6px',
                      fontSize: '10px',
                      color: '#64748b',
                    }}
                  >
                    <span>{song.category}</span>
                    {song.songKey && <span>• Key: {song.songKey}</span>}
                    {song.sectionsCount !== undefined && (
                      <span>• {song.sectionsCount} sections</span>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Right Column: Song Details & Lyrics Editor */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: '#090d16',
          overflowY: 'auto',
        }}
      >
        {currentSong ? (
          <>
            {/* Song Header & Actions Bar */}
            <div
              style={{
                padding: '16px 24px',
                backgroundColor: '#0f172a',
                borderBottom: '1px solid #1e293b',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '12px',
              }}
            >
              <div>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                  }}
                >
                  <h1
                    style={{
                      fontSize: '20px',
                      fontWeight: 800,
                      color: '#f8fafc',
                      letterSpacing: '-0.01em',
                    }}
                  >
                    {currentSong.title}
                  </h1>
                  {currentSong.alternateTitle && (
                    <span style={{ fontSize: '14px', color: '#94a3b8' }}>
                      ({currentSong.alternateTitle})
                    </span>
                  )}
                  <span
                    style={{
                      padding: '2px 8px',
                      borderRadius: '4px',
                      fontSize: '11px',
                      fontWeight: 700,
                      backgroundColor: 'rgba(56, 189, 248, 0.15)',
                      color: '#38bdf8',
                    }}
                  >
                    {currentSong.language}
                  </span>
                </div>

                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    marginTop: '6px',
                    fontSize: '11px',
                    color: '#94a3b8',
                  }}
                >
                  {currentSong.author && (
                    <span>
                      Author: <strong>{currentSong.author}</strong>
                    </span>
                  )}
                  {currentSong.songKey && (
                    <span>
                      Key: <strong>{currentSong.songKey}</strong>
                    </span>
                  )}
                  {currentSong.tempo && <span>Tempo: {currentSong.tempo} BPM</span>}
                  <span>Category: {currentSong.category}</span>
                  {currentSong.tags.length > 0 && (
                    <span>Tags: {currentSong.tags.join(', ')}</span>
                  )}
                </div>
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <button
                  type="button"
                  onClick={() => setIsSlideGeneratorOpen(true)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '8px 16px',
                    borderRadius: '6px',
                    backgroundColor: '#2563eb',
                    color: '#ffffff',
                    fontSize: '13px',
                    fontWeight: 700,
                    boxShadow: '0 2px 6px rgba(37, 99, 235, 0.4)',
                  }}
                  title="Generate presentation slides from this song"
                >
                  <Sparkles size={15} />
                  Generate Slides
                </button>

                <button
                  type="button"
                  onClick={() => setIsEditingMetadata(true)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: '8px 12px',
                    borderRadius: '6px',
                    backgroundColor: '#1e293b',
                    color: '#cbd5e1',
                    fontSize: '12px',
                    fontWeight: 600,
                    border: '1px solid #334155',
                  }}
                >
                  <Edit3 size={14} /> Edit Info
                </button>

                <button
                  type="button"
                  onClick={handleDuplicateSong}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: '8px 12px',
                    borderRadius: '6px',
                    backgroundColor: '#1e293b',
                    color: '#cbd5e1',
                    fontSize: '12px',
                    fontWeight: 600,
                    border: '1px solid #334155',
                  }}
                >
                  <Copy size={14} /> Duplicate
                </button>

                <button
                  type="button"
                  onClick={handleDeleteSong}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: '8px 12px',
                    borderRadius: '6px',
                    backgroundColor: '#1e293b',
                    color: '#f87171',
                    fontSize: '12px',
                    fontWeight: 600,
                    border: '1px solid #ef444430',
                  }}
                >
                  <Trash2 size={14} /> Delete
                </button>
              </div>
            </div>

            {/* Notification Toast */}
            {notification && (
              <div
                style={{
                  backgroundColor: '#10b981',
                  color: '#ffffff',
                  padding: '6px 20px',
                  fontSize: '12px',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <Check size={14} /> {notification}
              </div>
            )}

            {/* Sections & Lyrics Editor */}
            <div style={{ padding: '24px', flex: 1, overflowY: 'auto' }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: '16px',
                }}
              >
                <div>
                  <h2
                    style={{
                      fontSize: '15px',
                      fontWeight: 700,
                      color: '#f8fafc',
                    }}
                  >
                    Song Sections & Lyrics ({sections.length} Sections)
                  </h2>
                  <p style={{ fontSize: '11px', color: '#64748b' }}>
                    Drag sections to reorder, or use the Move Up / Down buttons. Tamil Unicode combining characters are preserved.
                  </p>
                </div>

                <button
                  type="button"
                  disabled={isSaving}
                  onClick={handleSaveSections}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '8px 18px',
                    borderRadius: '6px',
                    backgroundColor: isSaving ? '#10b98180' : '#10b981',
                    color: '#ffffff',
                    fontSize: '13px',
                    fontWeight: 700,
                    cursor: isSaving ? 'not-allowed' : 'pointer',
                  }}
                >
                  <Check size={15} />
                  {isSaving ? 'Saving...' : 'Save Lyrics'}
                </button>
              </div>

              <LyricsEditor sections={sections} onChange={setSections} />
              <ArrangementEditor
                sections={sections}
                arrangements={arrangements}
                onChange={setArrangements}
              />
            </div>
          </>
        ) : (
          /* Empty State */
          <div
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#64748b',
              padding: '40px',
            }}
          >
            <BookOpen size={48} style={{ opacity: 0.4, marginBottom: '16px' }} />
            <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#94a3b8' }}>
              No Song Selected
            </h3>
            <p style={{ fontSize: '12px', marginTop: '6px', maxWidth: '360px', textAlign: 'center' }}>
              Select a worship song from the library on the left, or create a new song to enter Tamil and English lyrics.
            </p>
            <button
              type="button"
              onClick={() => setIsCreatingSong(true)}
              style={{
                marginTop: '16px',
                padding: '8px 16px',
                borderRadius: '6px',
                backgroundColor: '#2563eb',
                color: '#ffffff',
                fontSize: '13px',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <Plus size={15} /> Create Song
            </button>
          </div>
        )}
      </div>

      {/* Slide Generator Modal */}
      <SlideGeneratorModal
        isOpen={isSlideGeneratorOpen}
        onClose={() => setIsSlideGeneratorOpen(false)}
        song={currentSong}
        sections={sections}
        presentations={presentations}
        currentPresentationId={currentPresentationId}
        onSlidesGenerated={onSlidesGenerated}
      />

      {/* Paste lyrics from clipboard */}
      <SongPasteModal
        isOpen={isPasteOpen}
        onClose={() => setIsPasteOpen(false)}
        onCreated={async (id, title) => {
          await loadSongs();
          setSelectedSongId(id);
          showNotification(`Created "${title}"`);
        }}
      />

      {/* Import / Export Modal */}
      <SongImportExportModal
        isOpen={isImportExportOpen}
        onClose={() => setIsImportExportOpen(false)}
        currentSong={currentSong}
        onImportComplete={loadSongs}
      />

      {/* Create New Song Dialog */}
      {isCreatingSong && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.75)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1100,
            padding: '20px',
          }}
        >
          <form
            onSubmit={handleCreateSong}
            style={{
              width: '520px',
              backgroundColor: '#090d16',
              borderRadius: '10px',
              border: '1px solid #1e293b',
              padding: '20px',
              display: 'flex',
              flexDirection: 'column',
              gap: '14px',
            }}
          >
            <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#f8fafc' }}>
              Create New Worship Song
            </h3>

            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#94a3b8', marginBottom: '4px' }}>
                Song Title (Tamil or English) *
              </label>
              <input
                type="text"
                required
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="e.g. எந்தன் கண்மலையானவரே or 10,000 Reasons"
                style={{
                  width: '100%',
                  backgroundColor: '#0f172a',
                  border: '1px solid #1e293b',
                  borderRadius: '6px',
                  color: '#f8fafc',
                  padding: '8px 10px',
                  fontSize: '13px',
                }}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#94a3b8', marginBottom: '4px' }}>
                  Alternate Title (Optional)
                </label>
                <input
                  type="text"
                  value={newAltTitle}
                  onChange={(e) => setNewAltTitle(e.target.value)}
                  placeholder="e.g. You Are My Rock"
                  style={{
                    width: '100%',
                    backgroundColor: '#0f172a',
                    border: '1px solid #1e293b',
                    borderRadius: '6px',
                    color: '#f8fafc',
                    padding: '8px 10px',
                    fontSize: '13px',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#94a3b8', marginBottom: '4px' }}>
                  Language
                </label>
                <select
                  value={newLanguage}
                  onChange={(e) => setNewLanguage(e.target.value)}
                  style={{
                    width: '100%',
                    backgroundColor: '#0f172a',
                    border: '1px solid #1e293b',
                    borderRadius: '6px',
                    color: '#f8fafc',
                    padding: '8px 10px',
                    fontSize: '13px',
                  }}
                >
                  <option value="Tamil">Tamil (தமிழ்)</option>
                  <option value="English">English</option>
                  <option value="Bilingual">Bilingual</option>
                  <option value="Hindi">Hindi</option>
                  <option value="Other">Other</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#94a3b8', marginBottom: '4px' }}>
                  Category
                </label>
                <select
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value)}
                  style={{
                    width: '100%',
                    backgroundColor: '#0f172a',
                    border: '1px solid #1e293b',
                    borderRadius: '6px',
                    color: '#f8fafc',
                    padding: '8px 10px',
                    fontSize: '13px',
                  }}
                >
                  <option value="Worship">Worship</option>
                  <option value="Praise">Praise</option>
                  <option value="Hymn">Hymn</option>
                  <option value="Offertory">Offertory</option>
                  <option value="Communion">Communion</option>
                </select>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#94a3b8', marginBottom: '4px' }}>
                  Author / Composer
                </label>
                <input
                  type="text"
                  value={newAuthor}
                  onChange={(e) => setNewAuthor(e.target.value)}
                  placeholder="e.g. Traditional / Matt Redman"
                  style={{
                    width: '100%',
                    backgroundColor: '#0f172a',
                    border: '1px solid #1e293b',
                    borderRadius: '6px',
                    color: '#f8fafc',
                    padding: '8px 10px',
                    fontSize: '13px',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#94a3b8', marginBottom: '4px' }}>
                  Song Key
                </label>
                <input
                  type="text"
                  value={newSongKey}
                  onChange={(e) => setNewSongKey(e.target.value)}
                  placeholder="e.g. D Major / G"
                  style={{
                    width: '100%',
                    backgroundColor: '#0f172a',
                    border: '1px solid #1e293b',
                    borderRadius: '6px',
                    color: '#f8fafc',
                    padding: '8px 10px',
                    fontSize: '13px',
                  }}
                />
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#94a3b8', marginBottom: '4px' }}>
                Tags (comma-separated)
              </label>
              <input
                type="text"
                value={newTags}
                onChange={(e) => setNewTags(e.target.value)}
                placeholder="e.g. praise, worship, fast, communion"
                style={{
                  width: '100%',
                  backgroundColor: '#0f172a',
                  border: '1px solid #1e293b',
                  borderRadius: '6px',
                  color: '#f8fafc',
                  padding: '8px 10px',
                  fontSize: '13px',
                }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
              <button
                type="button"
                onClick={() => setIsCreatingSong(false)}
                style={{
                  padding: '8px 16px',
                  borderRadius: '6px',
                  backgroundColor: '#1e293b',
                  color: '#cbd5e1',
                  fontSize: '13px',
                }}
              >
                Cancel
              </button>
              <button
                type="submit"
                style={{
                  padding: '8px 20px',
                  borderRadius: '6px',
                  backgroundColor: '#2563eb',
                  color: '#ffffff',
                  fontSize: '13px',
                  fontWeight: 700,
                }}
              >
                Create Song
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Edit Metadata Dialog */}
      {isEditingMetadata && currentSong && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.75)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1100,
            padding: '20px',
          }}
        >
          <div
            style={{
              width: '520px',
              backgroundColor: '#090d16',
              borderRadius: '10px',
              border: '1px solid #1e293b',
              padding: '20px',
              display: 'flex',
              flexDirection: 'column',
              gap: '14px',
            }}
          >
            <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#f8fafc' }}>
              Edit Song Information
            </h3>

            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#94a3b8', marginBottom: '4px' }}>
                Title
              </label>
              <input
                type="text"
                value={currentSong.title}
                onChange={(e) => setCurrentSong({ ...currentSong, title: e.target.value })}
                style={{
                  width: '100%',
                  backgroundColor: '#0f172a',
                  border: '1px solid #1e293b',
                  borderRadius: '6px',
                  color: '#f8fafc',
                  padding: '8px 10px',
                  fontSize: '13px',
                }}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#94a3b8', marginBottom: '4px' }}>
                  Alternate Title
                </label>
                <input
                  type="text"
                  value={currentSong.alternateTitle || ''}
                  onChange={(e) =>
                    setCurrentSong({ ...currentSong, alternateTitle: e.target.value })
                  }
                  style={{
                    width: '100%',
                    backgroundColor: '#0f172a',
                    border: '1px solid #1e293b',
                    borderRadius: '6px',
                    color: '#f8fafc',
                    padding: '8px 10px',
                    fontSize: '13px',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#94a3b8', marginBottom: '4px' }}>
                  Language
                </label>
                <input
                  type="text"
                  value={currentSong.language}
                  onChange={(e) => setCurrentSong({ ...currentSong, language: e.target.value })}
                  style={{
                    width: '100%',
                    backgroundColor: '#0f172a',
                    border: '1px solid #1e293b',
                    borderRadius: '6px',
                    color: '#f8fafc',
                    padding: '8px 10px',
                    fontSize: '13px',
                  }}
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#94a3b8', marginBottom: '4px' }}>
                  Author
                </label>
                <input
                  type="text"
                  value={currentSong.author || ''}
                  onChange={(e) => setCurrentSong({ ...currentSong, author: e.target.value })}
                  style={{
                    width: '100%',
                    backgroundColor: '#0f172a',
                    border: '1px solid #1e293b',
                    borderRadius: '6px',
                    color: '#f8fafc',
                    padding: '8px 10px',
                    fontSize: '13px',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#94a3b8', marginBottom: '4px' }}>
                  Key
                </label>
                <input
                  type="text"
                  value={currentSong.songKey || ''}
                  onChange={(e) => setCurrentSong({ ...currentSong, songKey: e.target.value })}
                  style={{
                    width: '100%',
                    backgroundColor: '#0f172a',
                    border: '1px solid #1e293b',
                    borderRadius: '6px',
                    color: '#f8fafc',
                    padding: '8px 10px',
                    fontSize: '13px',
                  }}
                />
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
              <button
                type="button"
                onClick={() => setIsEditingMetadata(false)}
                style={{
                  padding: '8px 16px',
                  borderRadius: '6px',
                  backgroundColor: '#1e293b',
                  color: '#cbd5e1',
                  fontSize: '13px',
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleUpdateMetadata}
                style={{
                  padding: '8px 20px',
                  borderRadius: '6px',
                  backgroundColor: '#2563eb',
                  color: '#ffffff',
                  fontSize: '13px',
                  fontWeight: 700,
                }}
              >
                Save Info
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
