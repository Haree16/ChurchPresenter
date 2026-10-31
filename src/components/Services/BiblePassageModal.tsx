import React, { useState, useEffect, useRef } from 'react';
import { BookOpen, X, Check, Search, Upload, FileText, CheckCircle2 } from 'lucide-react';
import { BiblePassageQuery, BiblePassageResult, BibleSuggestion, BibleVerse, Theme } from '../../types';
import { api } from '../../services/api';
import { open as openFileDialog } from '@tauri-apps/plugin-dialog';

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

export function parseBibleImportContent(raw: string, defaultTranslation: string = 'KJV'): BibleVerse[] {
  const trimmed = raw.trim();
  if (!trimmed) return [];

  // 1. JSON Import
  if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed);
      const list: any[] = Array.isArray(parsed) ? parsed : parsed.verses || [];
      const tr = parsed.translation || defaultTranslation;
      return list.map((item, idx) => ({
        id: item.id || `${item.translation || tr}-${item.book}-${item.chapter}-${item.verse || idx}`,
        translation: item.translation || tr,
        book: item.book || 'Genesis',
        bookNumber: item.bookNumber || item.book_number || 1,
        chapter: Number(item.chapter) || 1,
        verse: Number(item.verse) || (idx + 1),
        text: item.text || String(item),
      }));
    } catch {
      // Not valid JSON, fall through to XML / USFM
    }
  }

  // 2. Zefania / OSIS XML Import
  if (trimmed.includes('<XMLBIBLE') || trimmed.includes('<bible') || trimmed.includes('<osis')) {
    const verses: BibleVerse[] = [];
    const bookRegex = /<BIBLEBOOK[^>]*bname=["']([^"']+)["'][^>]*bnumber=["']?(\d+)?["']?[^>]*>([\s\S]*?)<\/BIBLEBOOK>/gi;
    let bMatch;
    let fallbackBookNum = 1;

    while ((bMatch = bookRegex.exec(trimmed)) !== null) {
      const bname = bMatch[1];
      const bnum = bMatch[2] ? parseInt(bMatch[2], 10) : fallbackBookNum++;
      const bContent = bMatch[3];

      const chapRegex = /<CHAPTER[^>]*cnumber=["'](\d+)["'][^>]*>([\s\S]*?)<\/CHAPTER>/gi;
      let cMatch;
      while ((cMatch = chapRegex.exec(bContent)) !== null) {
        const chap = parseInt(cMatch[1], 10);
        const cContent = cMatch[2];

        const vRegex = /<VERS[^>]*vnumber=["'](\d+)["'][^>]*>([\s\S]*?)<\/VERS>/gi;
        let vMatch;
        while ((vMatch = vRegex.exec(cContent)) !== null) {
          const vnum = parseInt(vMatch[1], 10);
          const vtext = vMatch[2].replace(/<[^>]+>/g, '').trim();
          verses.push({
            id: `${defaultTranslation}-${bname}-${chap}-${vnum}`,
            translation: defaultTranslation,
            book: bname,
            bookNumber: bnum,
            chapter: chap,
            verse: vnum,
            text: vtext,
          });
        }
      }
    }
    if (verses.length > 0) return verses;
  }

  // 3. USFM Import
  if (trimmed.includes('\\id') || trimmed.includes('\\c ') || trimmed.includes('\\v ')) {
    const verses: BibleVerse[] = [];
    let currentBook = 'Genesis';
    let currentChap = 1;
    let bookNum = 1;

    const lines = trimmed.split('\n');
    for (const line of lines) {
      const l = line.trim();
      if (l.startsWith('\\id ')) {
        currentBook = l.substring(4).trim().split(' ')[0];
      } else if (l.startsWith('\\c ')) {
        currentChap = parseInt(l.substring(3).trim(), 10) || 1;
      } else if (l.startsWith('\\v ')) {
        const parts = l.substring(3).trim().split(' ');
        const vnum = parseInt(parts[0], 10) || 1;
        const vtext = parts.slice(1).join(' ').trim();
        verses.push({
          id: `${defaultTranslation}-${currentBook}-${currentChap}-${vnum}`,
          translation: defaultTranslation,
          book: currentBook,
          bookNumber: bookNum,
          chapter: currentChap,
          verse: vnum,
          text: vtext,
        });
      }
    }
    if (verses.length > 0) return verses;
  }

  return [];
}

const TRANSLATION_LABELS: Record<string, string> = {
  KJV: 'KJV (King James)',
  WEB: 'WEB (World English)',
  Tamil: 'Tamil (பரிசுத்த வேதாகமம்)',
};

const translationLabel = (t: string) => TRANSLATION_LABELS[t] || t;

export const BiblePassageModal: React.FC<BiblePassageModalProps> = ({
  isOpen,
  onClose,
  onAddPassage,
}) => {
  const [activeTab, setActiveTab] = useState<'lookup' | 'import'>('lookup');
  const [translation, setTranslation] = useState<string>('KJV');
  const [availableTranslations, setAvailableTranslations] = useState<string[]>(['KJV', 'WEB', 'Tamil']);
  const [isDualTranslation, setIsDualTranslation] = useState<boolean>(false);
  const [secondaryTranslation, setSecondaryTranslation] = useState<string>('Tamil');
  const [book, setBook] = useState<string>('John');
  const [chapter, setChapter] = useState<number>(3);
  const [startVerse, setStartVerse] = useState<number>(16);
  const [endVerse, setEndVerse] = useState<number | string>(17);
  const [versesPerSlide] = useState<number>(1);
  const [selectedThemeId] = useState<string>('theme-builtin-dark');
  const [quickRefInput, setQuickRefInput] = useState<string>('');
  const [autocompleteSuggestions, setAutocompleteSuggestions] = useState<BibleSuggestion[]>([]);
  // only the newest suggestion request may update the list (answers can arrive out of order)
  const suggestionRequest = useRef(0);
  // keyboard-highlighted suggestion (-1 = none)
  const [activeSuggestion, setActiveSuggestion] = useState<number>(-1);

  // Search keyword state
  const [keywordQuery, setKeywordQuery] = useState<string>('');
  const [searchResults, setSearchResults] = useState<BibleVerse[]>([]);
  const [isSearchingKeyword, setIsSearchingKeyword] = useState<boolean>(false);

  // Import wizard state
  const [importText, setImportText] = useState<string>('');
  const [importTranslation, setImportTranslation] = useState<string>('KJV');
  const [parsedImportVerses, setParsedImportVerses] = useState<BibleVerse[]>([]);
  const [isImporting, setIsImporting] = useState<boolean>(false);
  const [importSuccessMsg, setImportSuccessMsg] = useState<string | null>(null);

  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [queryResult, setQueryResult] = useState<BiblePassageResult | null>(null);
  const [secQueryResult, setSecQueryResult] = useState<BiblePassageResult | null>(null);

  // Common quick selections
  const quickBooks = [
    { label: 'John / யோவான்', en: 'John', ta: 'யோவான்', chapter: 3, start: 16, end: 17 },
    { label: 'Psalm 23 / சங்கீதம் 23', en: 'Psalms', ta: 'சங்கீதம்', chapter: 23, start: 1, end: 6 },
    { label: 'Psalm 100 / சங்கீதம் 100', en: 'Psalms', ta: 'சங்கீதம்', chapter: 100, start: 1, end: 5 },
    { label: 'Romans 8 / ரோமர் 8', en: 'Romans', ta: 'ரோமர்', chapter: 8, start: 38, end: 39 },
    { label: 'Lord\'s Prayer / மத்தேயு 6', en: 'Matthew', ta: 'மத்தேயு', chapter: 6, start: 9, end: 13 },
  ];

  const handleQuickRefChange = async (val: string) => {
    setQuickRefInput(val);

    // suggestions come from the verses imported for the chosen translation
    const requestId = ++suggestionRequest.current;
    setActiveSuggestion(-1);
    if (val.trim().length >= 2) {
      try {
        const found = await api.suggestBibleReferences(val, translation);
        if (requestId === suggestionRequest.current) setAutocompleteSuggestions(found);
      } catch {
        if (requestId === suggestionRequest.current) setAutocompleteSuggestions([]);
      }
    } else {
      setAutocompleteSuggestions([]);
    }

    try {
      const parsed = await api.parseBibleReference(val);
      if (parsed) {
        const known = availableTranslations.find(
          (t) => t.toLowerCase() === parsed.translation.toLowerCase()
        );
        if (known) {
          setTranslation(known);
        }
        setBook(parsed.book);
        setChapter(parsed.chapter);
        setStartVerse(parsed.startVerse);
        setEndVerse(parsed.endVerse ?? parsed.startVerse);
      }
    } catch {
      // Ignore partial typing parse errors
    }
  };

  const applySuggestion = (s: BibleSuggestion) => {
    if (s.chapter != null && s.startVerse != null) {
      // a full passage: fill the fields and stop suggesting
      setBook(s.book);
      setChapter(s.chapter);
      setStartVerse(s.startVerse);
      setEndVerse(s.endVerse ?? s.startVerse);
      setQuickRefInput(s.label);
      setAutocompleteSuggestions([]);
      return;
    }
    // a book (then its chapters) or a chapter (then its verses): keep typing from there
    void handleQuickRefChange(s.chapter == null ? `${s.label} ` : s.label);
  };

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

      // If dual translation is active, query secondary translation too
      if (isDualTranslation && secondaryTranslation !== translation) {
        try {
          const secRes = await api.queryBiblePassage({
            ...q,
            translation: secondaryTranslation,
          });
          setSecQueryResult(secRes);
        } catch {
          setSecQueryResult(null);
        }
      } else {
        setSecQueryResult(null);
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

  useEffect(() => {
    if (isOpen && activeTab === 'lookup') {
      handleLookup();
    }
  }, [isOpen, activeTab, translation, secondaryTranslation, isDualTranslation, book, chapter, startVerse, endVerse]);

  // Keyword search
  const handleKeywordSearch = async () => {
    if (!keywordQuery.trim()) return;
    setIsSearchingKeyword(true);
    try {
      const res = await api.searchBibleVerses(keywordQuery, translation, 15);
      setSearchResults(res);
    } catch (err) {
      console.error(err);
    } finally {
      setIsSearchingKeyword(false);
    }
  };

  // Import content parsing
  const handleImportTextChange = (text: string) => {
    setImportText(text);
    const verses = parseBibleImportContent(text, importTranslation);
    setParsedImportVerses(verses);
  };

  const handleRunImport = async () => {
    if (!importText.trim()) return;
    setIsImporting(true);
    setImportSuccessMsg(null);
    try {
      const count = await api.importBibleText(importText, importTranslation, parsedImportVerses);
      setImportSuccessMsg(`Successfully imported ${count} verses for ${importTranslation} into offline database!`);
      setImportText('');
      setParsedImportVerses([]);
      await refreshTranslations();
    } catch (err: any) {
      setError(typeof err === 'string' ? err : err?.message || 'Failed to import verses');
    } finally {
      setIsImporting(false);
    }
  };

  const refreshTranslations = async () => {
    try {
      const list = await api.listBibleTranslations();
      if (list.length > 0) setAvailableTranslations(list.map((t) => t.translation));
    } catch {
      // keep the built-in defaults
    }
  };

  useEffect(() => {
    if (isOpen) void refreshTranslations();
  }, [isOpen]);

  const handleChooseFiles = async () => {
    setError(null);
    setImportSuccessMsg(null);
    try {
      const picked = await openFileDialog({
        multiple: true,
        filters: [{ name: 'Bible files', extensions: ['usfm', 'sfm', 'usx', 'xml', 'osis', 'json', 'txt'] }],
      });
      if (!picked) return;
      const paths = Array.isArray(picked) ? picked : [picked];
      setIsImporting(true);
      const count = await api.importBibleFiles(paths, importTranslation);
      setImportSuccessMsg(`Imported ${count} verses for ${importTranslation} from ${paths.length} file(s).`);
      await refreshTranslations();
    } catch (err: any) {
      setError(typeof err === 'string' ? err : err?.message || 'Failed to import Bible files');
    } finally {
      setIsImporting(false);
    }
  };

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
          secondaryTranslation: isDualTranslation ? secondaryTranslation : undefined,
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
          maxWidth: '820px',
          maxHeight: '92vh',
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
            padding: '14px 20px',
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
                Offline Scripture Module
              </h2>
              <p style={{ fontSize: '11px', color: '#94a3b8', margin: '2px 0 0 0' }}>
                Look up passages, display dual translations side-by-side, or import Bible files
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ display: 'flex', backgroundColor: '#1e293b', borderRadius: '6px', padding: '2px' }}>
              <button
                type="button"
                onClick={() => setActiveTab('lookup')}
                style={{
                  padding: '4px 10px',
                  borderRadius: '4px',
                  border: 'none',
                  fontSize: '11px',
                  fontWeight: 600,
                  backgroundColor: activeTab === 'lookup' ? '#0284c7' : 'transparent',
                  color: activeTab === 'lookup' ? '#ffffff' : '#94a3b8',
                  cursor: 'pointer',
                }}
              >
                Passage Lookup
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('import')}
                style={{
                  padding: '4px 10px',
                  borderRadius: '4px',
                  border: 'none',
                  fontSize: '11px',
                  fontWeight: 600,
                  backgroundColor: activeTab === 'import' ? '#0284c7' : 'transparent',
                  color: activeTab === 'import' ? '#ffffff' : '#94a3b8',
                  cursor: 'pointer',
                }}
              >
                Import Wizard
              </button>
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
        </div>

        {/* Modal Body */}
        {activeTab === 'lookup' ? (
          <div style={{ padding: '20px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {/* Quick preset selector */}
            <div>
              <label style={{ fontSize: '11px', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', display: 'block', marginBottom: '6px' }}>
                Quick Popular Passages
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
                      padding: '4px 10px',
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

            {/* Quick Reference with Autocomplete */}
            <div style={{ backgroundColor: '#090d16', padding: '12px 14px', borderRadius: '8px', border: '1px solid #1e293b', position: 'relative' }}>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#38bdf8', marginBottom: '6px' }}>
                Quick Reference with Autocomplete (e.g. ps 23, jn 3:16, gen 1, rom 8)
              </label>
              <input
                data-testid="quick-reference-input"
                type="text"
                placeholder="Type passage (e.g. ps 23, jn 3:16-17, rom 8:38-39)..."
                value={quickRefInput}
                onChange={(e) => handleQuickRefChange(e.target.value)}
                onKeyDown={(e) => {
                  const count = autocompleteSuggestions.length;
                  if (count === 0) return;
                  if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    setActiveSuggestion((i) => (i + 1) % count);
                  } else if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    setActiveSuggestion((i) => (i <= 0 ? count - 1 : i - 1));
                  } else if (e.key === 'Enter' && activeSuggestion >= 0 && activeSuggestion < count) {
                    e.preventDefault();
                    applySuggestion(autocompleteSuggestions[activeSuggestion]);
                  } else if (e.key === 'Escape') {
                    e.stopPropagation();
                    setAutocompleteSuggestions([]);
                    setActiveSuggestion(-1);
                  }
                }}
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

              {/* Autocomplete Dropdown */}
              {autocompleteSuggestions.length > 0 && (
                <div
                  data-testid="autocomplete-dropdown"
                  style={{
                    position: 'absolute',
                    top: '100%',
                    left: '14px',
                    right: '14px',
                    zIndex: 50,
                    backgroundColor: '#020617',
                    border: '1px solid #38bdf8',
                    borderRadius: '0 0 6px 6px',
                    boxShadow: '0 10px 25px rgba(0,0,0,0.7)',
                    overflow: 'hidden',
                  }}
                >
                  {autocompleteSuggestions.map((s, idx) => (
                    <button
                      key={idx}
                      type="button"
                      data-active={idx === activeSuggestion}
                      onClick={() => applySuggestion(s)}
                      style={{
                        display: 'block',
                        width: '100%',
                        textAlign: 'left',
                        padding: '8px 12px',
                        backgroundColor: idx === activeSuggestion ? '#1e293b' : 'transparent',
                        border: 'none',
                        borderBottom: idx < autocompleteSuggestions.length - 1 ? '1px solid #1e293b' : 'none',
                        color: '#f8fafc',
                        fontSize: '12px',
                        cursor: 'pointer',
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#1e293b')}
                      onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = idx === activeSuggestion ? '#1e293b' : 'transparent')}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Reference Selection & Dual Translation */}
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
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#94a3b8', marginBottom: '4px' }}>
                  Primary Translation
                </label>
                <select
                  value={translation}
                  onChange={(e) => setTranslation(e.target.value)}
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
                  {availableTranslations.map((t) => (
                    <option key={t} value={t}>{translationLabel(t)}</option>
                  ))}
                </select>
              </div>

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

              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#94a3b8', marginBottom: '4px' }}>
                  Chapter / அதிகாரம்
                </label>
                <input
                  type="number"
                  min={1}
                  value={chapter}
                  onChange={(e) => setChapter(Number(e.target.value))}
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

              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#94a3b8', marginBottom: '4px' }}>
                  Start Verse / வசனம்
                </label>
                <input
                  type="number"
                  min={1}
                  value={startVerse}
                  onChange={(e) => setStartVerse(Number(e.target.value))}
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

              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#94a3b8', marginBottom: '4px' }}>
                  End Verse (Optional)
                </label>
                <input
                  type="number"
                  min={1}
                  value={endVerse}
                  onChange={(e) => setEndVerse(e.target.value)}
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

            {/* Side-by-side Dual Translation Selector */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '10px 14px',
                backgroundColor: '#090d16',
                borderRadius: '8px',
                border: '1px solid #1e293b',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <input
                  type="checkbox"
                  id="dual-trans-toggle"
                  data-testid="dual-translation-toggle"
                  checked={isDualTranslation}
                  onChange={(e) => setIsDualTranslation(e.target.checked)}
                  style={{ width: '16px', height: '16px', accentColor: '#0284c7' }}
                />
                <label htmlFor="dual-trans-toggle" style={{ fontSize: '12px', fontWeight: 600, color: '#f8fafc', cursor: 'pointer' }}>
                  Dual Translation (Tamil & English Side-by-Side)
                </label>
              </div>

              {isDualTranslation && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '11px', color: '#94a3b8' }}>Secondary:</span>
                  <select
                    value={secondaryTranslation}
                    data-testid="secondary-translation-select"
                    onChange={(e) => setSecondaryTranslation(e.target.value)}
                    style={{
                      padding: '4px 8px',
                      backgroundColor: '#1e293b',
                      border: '1px solid #334155',
                      borderRadius: '6px',
                      color: '#f8fafc',
                      fontSize: '11px',
                    }}
                  >
                    {availableTranslations.map((t) => (
                      <option key={t} value={t}>{translationLabel(t)}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {/* Keyword Scripture Search Toggle */}
            <div style={{ backgroundColor: '#090d16', padding: '12px 14px', borderRadius: '8px', border: '1px solid #1e293b' }}>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#94a3b8', marginBottom: '6px' }}>
                Search Scripture by Keyword
              </label>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  type="text"
                  placeholder="e.g. shepherd, love, light, faith..."
                  value={keywordQuery}
                  onChange={(e) => setKeywordQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleKeywordSearch()}
                  style={{
                    flex: 1,
                    padding: '6px 10px',
                    backgroundColor: '#1e293b',
                    border: '1px solid #334155',
                    borderRadius: '6px',
                    color: '#f8fafc',
                    fontSize: '12px',
                  }}
                />
                <button
                  type="button"
                  onClick={handleKeywordSearch}
                  disabled={isSearchingKeyword}
                  style={{
                    padding: '6px 12px',
                    backgroundColor: '#0284c7',
                    border: 'none',
                    borderRadius: '6px',
                    color: '#fff',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                  }}
                >
                  <Search size={13} />
                  <span>Search</span>
                </button>
              </div>

              {searchResults.length > 0 && (
                <div style={{ marginTop: '10px', maxHeight: '120px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  {searchResults.map((v) => (
                    <div
                      key={v.id}
                      onClick={() => {
                        setBook(v.book);
                        setChapter(v.chapter);
                        setStartVerse(v.verse);
                        setEndVerse(v.verse);
                        setSearchResults([]);
                      }}
                      style={{
                        padding: '6px 8px',
                        backgroundColor: '#1e293b',
                        borderRadius: '4px',
                        fontSize: '11px',
                        color: '#f1f5f9',
                        cursor: 'pointer',
                        lineHeight: 1.4,
                      }}
                    >
                      <strong style={{ color: '#38bdf8' }}>{v.book} {v.chapter}:{v.verse} ({v.translation}):</strong> {v.text}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Error Message */}
            {error && (
              <div style={{ padding: '8px 12px', backgroundColor: 'rgba(239, 68, 68, 0.1)', border: '1px solid #ef4444', borderRadius: '6px', color: '#fca5a5', fontSize: '12px' }}>
                {error}
              </div>
            )}

            {/* Verified Scripture Preview */}
            {queryResult && queryResult.verses.length > 0 && (
              <div style={{ backgroundColor: '#090d16', border: '1px solid #1e293b', borderRadius: '8px', padding: '14px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', borderBottom: '1px solid #1e293b', paddingBottom: '6px' }}>
                  <span style={{ fontSize: '13px', fontWeight: 700, color: '#38bdf8' }}>
                    {queryResult.reference} ({queryResult.translation})
                    {isDualTranslation && secQueryResult && ` + ${secondaryTranslation}`}
                  </span>
                  <span style={{ fontSize: '11px', color: '#94a3b8' }}>
                    {queryResult.verses.length} verse{queryResult.verses.length > 1 ? 's' : ''} verified
                  </span>
                </div>

                <div style={{ display: isDualTranslation && secQueryResult ? 'grid' : 'block', gridTemplateColumns: '1fr 1fr', gap: '16px', maxHeight: '180px', overflowY: 'auto' }}>
                  {/* Primary column */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {isDualTranslation && <div style={{ fontSize: '11px', fontWeight: 700, color: '#94a3b8' }}>{translation}</div>}
                    {queryResult.verses.map((v) => (
                      <div key={v.id} style={{ display: 'flex', gap: '6px', fontSize: '12px', lineHeight: 1.4 }}>
                        <span style={{ color: '#38bdf8', fontWeight: 700, minWidth: '18px' }}>{v.verse}</span>
                        <span style={{ color: '#f1f5f9' }}>{v.text}</span>
                      </div>
                    ))}
                  </div>

                  {/* Secondary column */}
                  {isDualTranslation && secQueryResult && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', borderLeft: '1px solid #1e293b', paddingLeft: '12px' }}>
                      <div style={{ fontSize: '11px', fontWeight: 700, color: '#94a3b8' }}>{secondaryTranslation}</div>
                      {secQueryResult.verses.map((v) => (
                        <div key={v.id} style={{ display: 'flex', gap: '6px', fontSize: '12px', lineHeight: 1.4 }}>
                          <span style={{ color: '#38bdf8', fontWeight: 700, minWidth: '18px' }}>{v.verse}</span>
                          <span style={{ color: '#f1f5f9' }}>{v.text}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        ) : (
          /* Bible Import Wizard Tab */
          <div style={{ padding: '20px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div style={{ backgroundColor: '#090d16', padding: '14px', borderRadius: '8px', border: '1px solid #1e293b' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                <FileText size={18} color="#38bdf8" />
                <h3 style={{ margin: 0, fontSize: '13px', color: '#f8fafc', fontWeight: 600 }}>
                  Offline Bible Translation Importer
                </h3>
              </div>
              <p style={{ margin: '0 0 12px 0', fontSize: '12px', color: '#94a3b8', lineHeight: 1.5 }}>
                Import Bible translations from <strong>USFM</strong>, <strong>OSIS</strong>, <strong>Zefania XML</strong> or <strong>JSON</strong> into your local offline SQLite database.
              </p>

              <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '12px' }}>
                <label style={{ fontSize: '11px', fontWeight: 600, color: '#94a3b8' }}>Translation Code:</label>
                <input
                  type="text"
                  value={importTranslation}
                  onChange={(e) => setImportTranslation(e.target.value)}
                  style={{
                    padding: '4px 8px',
                    backgroundColor: '#1e293b',
                    border: '1px solid #334155',
                    borderRadius: '4px',
                    color: '#f8fafc',
                    fontSize: '12px',
                    width: '80px',
                  }}
                />
              </div>

              <div style={{ marginBottom: '12px' }}>
                <button
                  type="button"
                  data-testid="bible-import-files-btn"
                  disabled={isImporting}
                  onClick={handleChooseFiles}
                  style={{
                    padding: '8px 14px',
                    backgroundColor: '#1e293b',
                    color: '#e2e8f0',
                    borderRadius: '6px',
                    border: '1px solid #334155',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                >
                  <FileText size={14} />
                  <span>{isImporting ? 'Importing...' : 'Choose Bible files (USFM, OSIS, Zefania, JSON)…'}</span>
                </button>
                <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>
                  Importing a book that already exists for this translation replaces it.
                </div>
              </div>

              <textarea
                data-testid="bible-import-textarea"
                rows={9}
                placeholder="Paste Bible JSON, Zefania XML, or USFM contents here..."
                value={importText}
                onChange={(e) => handleImportTextChange(e.target.value)}
                style={{
                  width: '100%',
                  boxSizing: 'border-box',
                  padding: '10px',
                  backgroundColor: '#1e293b',
                  border: '1px solid #334155',
                  borderRadius: '6px',
                  color: '#f8fafc',
                  fontSize: '12px',
                  fontFamily: 'monospace',
                }}
              />

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '10px' }}>
                <span style={{ fontSize: '12px', color: importText.trim() ? '#34d399' : '#94a3b8' }}>
                  {importText.trim()
                    ? parsedImportVerses.length > 0
                      ? `Ready to import ${parsedImportVerses.length} verses for ${importTranslation}`
                      : `Ready to import as ${importTranslation} (format is checked on import)`
                    : 'Paste content to import'}
                </span>
                <button
                  type="button"
                  data-testid="run-bible-import-btn"
                  disabled={isImporting || !importText.trim()}
                  onClick={handleRunImport}
                  style={{
                    padding: '8px 16px',
                    backgroundColor: importText.trim() ? '#0284c7' : '#334155',
                    color: '#fff',
                    borderRadius: '6px',
                    border: 'none',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: importText.trim() ? 'pointer' : 'not-allowed',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                >
                  <Upload size={14} />
                  <span>{isImporting ? 'Importing...' : 'Import to Offline Database'}</span>
                </button>
              </div>

              {importSuccessMsg && (
                <div style={{ marginTop: '10px', padding: '10px', backgroundColor: 'rgba(52, 211, 153, 0.15)', border: '1px solid #34d399', borderRadius: '6px', color: '#6ee7b7', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <CheckCircle2 size={16} />
                  <span>{importSuccessMsg}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Modal Footer */}
        <div
          style={{
            padding: '12px 20px',
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
          {activeTab === 'lookup' && (
            <button
              type="button"
              data-testid="add-scripture-btn"
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
          )}
        </div>
      </div>
    </div>
  );
};
