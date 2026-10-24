import React, { useState, useEffect } from 'react';
import { BookOpen, X, Check, AlertCircle } from 'lucide-react';
import { BiblePassageQuery, BiblePassageResult, Theme } from '../../types';
import { api } from '../../services/api';

interface BiblePassageModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddPassage: (
    query: BiblePassageQuery,
    themeId?: string,
    versesPerSlide?: number
  ) => Promise<void>;
  themes: Theme[];
}

export const BiblePassageModal: React.FC<BiblePassageModalProps> = ({
  isOpen,
  onClose,
  onAddPassage,
  themes,
}) => {
  const [translation, setTranslation] = useState<'KJV' | 'WEB' | 'Tamil'>('KJV');
  const [book, setBook] = useState<string>('John');
  const [chapter, setChapter] = useState<number>(3);
  const [startVerse, setStartVerse] = useState<number>(16);
  const [endVerse, setEndVerse] = useState<number | string>(17);
  const [versesPerSlide, setVersesPerSlide] = useState<number>(1);
  const [selectedThemeId, setSelectedThemeId] = useState<string>('theme-builtin-dark');
  const [quickRefInput, setQuickRefInput] = useState<string>('');

  const handleQuickRefChange = async (val: string) => {
    setQuickRefInput(val);
    try {
      const parsed = await api.parseBibleReference(val);
      if (parsed) {
        if (parsed.translation === 'Tamil' || parsed.translation === 'WEB' || parsed.translation === 'KJV') {
          setTranslation(parsed.translation);
        }
        setBook(parsed.book);
        setChapter(parsed.chapter);
        setStartVerse(parsed.startVerse);
        setEndVerse(parsed.endVerse ?? parsed.startVerse);
      }
    } catch {
      // Ignore parse failure on partial keystrokes
    }
  };

  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [queryResult, setQueryResult] = useState<BiblePassageResult | null>(null);

  // Common quick selections
  const quickBooks = [
    { label: 'John / யோவான்', en: 'John', ta: 'யோவான்', chapter: 3, start: 16, end: 17 },
    { label: 'Psalm 23 / சங்கீதம் 23', en: 'Psalms', ta: 'சங்கீதம்', chapter: 23, start: 1, end: 6 },
    { label: 'Psalm 100 / சங்கீதம் 100', en: 'Psalms', ta: 'சங்கீதம்', chapter: 100, start: 1, end: 5 },
    { label: 'Romans 8 / ரோமர் 8', en: 'Romans', ta: 'ரோமர்', chapter: 8, start: 38, end: 39 },
    { label: 'Lord\'s Prayer / மத்தேயு 6', en: 'Matthew', ta: 'மத்தேயு', chapter: 6, start: 9, end: 13 },
  ];

  const handleLookup = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const q: BiblePassageQuery = {
        translation,
        book: book.trim(),
        chapter: Number(chapter),
        startVerse: Number(startVerse),
        endVerse: endVerse !== '' ? Number(endVerse) : null,
      };

      const result = await api.queryBiblePassage(q);
      if (!result.verses || result.verses.length === 0) {
        setError(
          `Passage not found: "${book} ${chapter}:${startVerse}${
            endVerse ? '-' + endVerse : ''
          }" in ${translation}. Note: Offline database includes John, Psalms, Romans, and Matthew.`
        );
        setQueryResult(null);
      } else {
        setQueryResult(result);
      }
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : 'Failed to query offline Scripture database'
      );
      setQueryResult(null);
    } finally {
      setIsLoading(false);
    }
  };

  // Perform lookup whenever book, translation, chapter, or verse changes and modal is open
  useEffect(() => {
    if (isOpen) {
      handleLookup();
    }
  }, [isOpen, translation, book, chapter, startVerse, endVerse]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!queryResult || queryResult.verses.length === 0) {
      setError('Please search and verify scripture verses before adding.');
      return;
    }

    try {
      setIsLoading(true);
      await onAddPassage(
        {
          translation,
          book: book.trim(),
          chapter: Number(chapter),
          startVerse: Number(startVerse),
          endVerse: endVerse !== '' ? Number(endVerse) : null,
        },
        selectedThemeId,
        versesPerSlide
      );
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to add Bible passage to service');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.75)',
        backdropFilter: 'blur(4px)',
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '780px',
          maxHeight: '90vh',
          backgroundColor: '#0f172a',
          borderRadius: '12px',
          border: '1px solid #334155',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Modal Header */}
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid #1e293b',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            backgroundColor: '#090d16',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                backgroundColor: 'rgba(56, 189, 248, 0.15)',
                color: '#38bdf8',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <BookOpen size={18} />
            </div>
            <div>
              <h2 style={{ fontSize: '16px', fontWeight: 700, color: '#f8fafc', margin: 0 }}>
                Offline Scripture Passage Lookup
              </h2>
              <p style={{ fontSize: '11px', color: '#94a3b8', margin: '2px 0 0 0' }}>
                Look up and generate presentation slides directly from offline Scripture
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#94a3b8',
              cursor: 'pointer',
              padding: '6px',
              borderRadius: '6px',
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Modal Body */}
        <div style={{ padding: '20px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Quick preset selector */}
          <div>
            <label style={{ fontSize: '11px', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', display: 'block', marginBottom: '6px' }}>
              Quick Passages
            </label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              {quickBooks.map((qb, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => {
                    setBook(translation === 'Tamil' ? qb.ta : qb.en);
                    setChapter(qb.chapter);
                    setStartVerse(qb.start);
                    setEndVerse(qb.end);
                  }}
                  style={{
                    padding: '5px 10px',
                    backgroundColor: '#1e293b',
                    border: '1px solid #334155',
                    borderRadius: '6px',
                    color: '#e2e8f0',
                    fontSize: '11px',
                    fontWeight: 500,
                    cursor: 'pointer',
                  }}
                >
                  {qb.label}
                </button>
              ))}
            </div>
          </div>

          {/* Live Quick Reference Input */}
          <div style={{ backgroundColor: '#090d16', padding: '12px 14px', borderRadius: '8px', border: '1px solid #1e293b' }}>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#38bdf8', marginBottom: '6px' }}>
              Quick Reference (Type to auto-parse: e.g. John 3:16-18, Ps 23, Gen 1:1, மத்தேயு 6:9-13)
            </label>
            <input
              data-testid="quick-reference-input"
              type="text"
              placeholder="Type reference (e.g. John 3:16-18, Ps 23, Rom 8:38-39)..."
              value={quickRefInput}
              onChange={(e) => handleQuickRefChange(e.target.value)}
              style={{
                width: '100%',
                boxSizing: 'border-box',
                padding: '8px 12px',
                backgroundColor: '#1e293b',
                border: '1px solid #334155',
                borderRadius: '6px',
                color: '#fff',
                fontSize: '13px',
                outline: 'none',
              }}
            />
          </div>

          {/* Reference selection controls */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
              gap: '12px',
              backgroundColor: '#090d16',
              padding: '14px',
              borderRadius: '8px',
              border: '1px solid #1e293b',
            }}
          >
            {/* Translation */}
            <div>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#94a3b8', marginBottom: '4px' }}>
                Translation
              </label>
              <select
                value={translation}
                onChange={(e) => {
                  const newTrans = e.target.value as 'KJV' | 'WEB' | 'Tamil';
                  setTranslation(newTrans);
                  if (newTrans === 'Tamil' && (book === 'John' || book === 'Psalms' || book === 'Romans' || book === 'Matthew')) {
                    if (book === 'John') setBook('யோவான்');
                    if (book === 'Psalms') setBook('சங்கீதம்');
                    if (book === 'Romans') setBook('ரோமர்');
                    if (book === 'Matthew') setBook('மத்தேயு');
                  } else if (newTrans !== 'Tamil' && (book === 'யோவான்' || book === 'சங்கீதம்' || book === 'ரோமர்' || book === 'மத்தேயு')) {
                    if (book === 'யோவான்') setBook('John');
                    if (book === 'சங்கீதம்') setBook('Psalms');
                    if (book === 'ரோமர்') setBook('Romans');
                    if (book === 'மத்தேயு') setBook('Matthew');
                  }
                }}
                style={{
                  width: '100%',
                  padding: '7px 10px',
                  backgroundColor: '#1e293b',
                  border: '1px solid #334155',
                  borderRadius: '6px',
                  color: '#f8fafc',
                  fontSize: '13px',
                }}
              >
                <option value="KJV">KJV (King James)</option>
                <option value="WEB">WEB (World English)</option>
                <option value="Tamil">Tamil (பரிசுத்த வேதாகமம்)</option>
              </select>
            </div>

            {/* Book */}
            <div>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#94a3b8', marginBottom: '4px' }}>
                Book / புத்தகம்
              </label>
              <input
                type="text"
                value={book}
                onChange={(e) => setBook(e.target.value)}
                placeholder="e.g. John, Psalms, யோவான்"
                style={{
                  width: '100%',
                  padding: '7px 10px',
                  backgroundColor: '#1e293b',
                  border: '1px solid #334155',
                  borderRadius: '6px',
                  color: '#f8fafc',
                  fontSize: '13px',
                }}
              />
            </div>

            {/* Chapter */}
            <div>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#94a3b8', marginBottom: '4px' }}>
                Chapter / அதிகாரம்
              </label>
              <input
                type="number"
                min={1}
                value={chapter}
                onChange={(e) => setChapter(Math.max(1, parseInt(e.target.value) || 1))}
                style={{
                  width: '100%',
                  padding: '7px 10px',
                  backgroundColor: '#1e293b',
                  border: '1px solid #334155',
                  borderRadius: '6px',
                  color: '#f8fafc',
                  fontSize: '13px',
                }}
              />
            </div>

            {/* Start Verse */}
            <div>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#94a3b8', marginBottom: '4px' }}>
                From Verse
              </label>
              <input
                type="number"
                min={1}
                value={startVerse}
                onChange={(e) => setStartVerse(Math.max(1, parseInt(e.target.value) || 1))}
                style={{
                  width: '100%',
                  padding: '7px 10px',
                  backgroundColor: '#1e293b',
                  border: '1px solid #334155',
                  borderRadius: '6px',
                  color: '#f8fafc',
                  fontSize: '13px',
                }}
              />
            </div>

            {/* End Verse */}
            <div>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#94a3b8', marginBottom: '4px' }}>
                To Verse (Optional)
              </label>
              <input
                type="number"
                min={startVerse}
                value={endVerse}
                onChange={(e) => setEndVerse(e.target.value === '' ? '' : Math.max(startVerse, parseInt(e.target.value) || startVerse))}
                placeholder="Same as From"
                style={{
                  width: '100%',
                  padding: '7px 10px',
                  backgroundColor: '#1e293b',
                  border: '1px solid #334155',
                  borderRadius: '6px',
                  color: '#f8fafc',
                  fontSize: '13px',
                }}
              />
            </div>
          </div>

          {/* Presentation layout options */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '12px',
            }}
          >
            {/* Verses per slide */}
            <div>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#94a3b8', marginBottom: '4px' }}>
                Slide Splitting Behavior
              </label>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  type="button"
                  onClick={() => setVersesPerSlide(1)}
                  style={{
                    flex: 1,
                    padding: '7px',
                    borderRadius: '6px',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    backgroundColor: versesPerSlide === 1 ? '#0284c7' : '#1e293b',
                    color: '#ffffff',
                    border: '1px solid ' + (versesPerSlide === 1 ? '#38bdf8' : '#334155'),
                  }}
                >
                  1 Verse / Slide
                </button>
                <button
                  type="button"
                  onClick={() => setVersesPerSlide(2)}
                  style={{
                    flex: 1,
                    padding: '7px',
                    borderRadius: '6px',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    backgroundColor: versesPerSlide === 2 ? '#0284c7' : '#1e293b',
                    color: '#ffffff',
                    border: '1px solid ' + (versesPerSlide === 2 ? '#38bdf8' : '#334155'),
                  }}
                >
                  2 Verses / Slide
                </button>
                <button
                  type="button"
                  onClick={() => setVersesPerSlide(10)}
                  style={{
                    flex: 1,
                    padding: '7px',
                    borderRadius: '6px',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    backgroundColor: versesPerSlide > 2 ? '#0284c7' : '#1e293b',
                    color: '#ffffff',
                    border: '1px solid ' + (versesPerSlide > 2 ? '#38bdf8' : '#334155'),
                  }}
                >
                  Group All
                </button>
              </div>
            </div>

            {/* Theme Selector */}
            <div>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#94a3b8', marginBottom: '4px' }}>
                Presentation Theme
              </label>
              <select
                value={selectedThemeId}
                onChange={(e) => setSelectedThemeId(e.target.value)}
                style={{
                  width: '100%',
                  padding: '7px 10px',
                  backgroundColor: '#1e293b',
                  border: '1px solid #334155',
                  borderRadius: '6px',
                  color: '#f8fafc',
                  fontSize: '13px',
                }}
              >
                {themes.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Validation & Feedback */}
          {error && (
            <div
              style={{
                backgroundColor: 'rgba(239, 68, 68, 0.15)',
                border: '1px solid #ef4444',
                borderRadius: '8px',
                padding: '10px 14px',
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                color: '#fca5a5',
                fontSize: '12px',
              }}
            >
              <AlertCircle size={16} />
              <span>{error}</span>
            </div>
          )}

          {/* Preview of Verses Found */}
          {queryResult && queryResult.verses.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '12px', fontWeight: 700, color: '#38bdf8' }}>
                  {queryResult.reference} ({queryResult.verses.length} verses found)
                </span>
                <span style={{ fontSize: '11px', color: '#94a3b8' }}>
                  Will generate {Math.ceil(queryResult.verses.length / versesPerSlide)} slide(s)
                </span>
              </div>

              <div
                style={{
                  maxHeight: '220px',
                  overflowY: 'auto',
                  backgroundColor: '#090d16',
                  border: '1px solid #1e293b',
                  borderRadius: '8px',
                  padding: '12px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                }}
              >
                {queryResult.verses.map((v) => (
                  <div key={v.id} style={{ display: 'flex', gap: '8px', fontSize: '13px', lineHeight: 1.5 }}>
                    <span style={{ color: '#38bdf8', fontWeight: 700, minWidth: '22px' }}>
                      {v.verse}
                    </span>
                    <span style={{ color: '#f1f5f9' }}>{v.text}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div
          style={{
            padding: '14px 20px',
            borderTop: '1px solid #1e293b',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            gap: '10px',
            backgroundColor: '#090d16',
          }}
        >
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '8px 16px',
              backgroundColor: '#1e293b',
              color: '#cbd5e1',
              borderRadius: '6px',
              border: '1px solid #334155',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isLoading || !queryResult || queryResult.verses.length === 0}
            style={{
              padding: '8px 18px',
              backgroundColor: queryResult && queryResult.verses.length > 0 ? '#0284c7' : '#334155',
              color: '#ffffff',
              borderRadius: '6px',
              border: 'none',
              fontSize: '12px',
              fontWeight: 600,
              cursor: queryResult && queryResult.verses.length > 0 ? 'pointer' : 'not-allowed',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <Check size={15} />
            <span>Add Scripture to Service</span>
          </button>
        </div>
      </div>
    </div>
  );
};
