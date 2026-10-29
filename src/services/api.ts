import { invoke } from '@tauri-apps/api/core';
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import {
  Presentation,
  Slide,
  PresentationState,
  DisplayMonitor,
  AudienceWindowStatus,
  BackupData,
  ImportResult,
  Song,
  SongSection,
  SongWithSections,
  Theme,
  MediaAsset,
  SongExportData,
  SongImportOptions,
  SongImportResult,
  SlideGenerationOptions,
  GenerateSlidesResponse,
  Service,
  PlaylistItem,
  ServiceWithItems,
  PlaylistItemWithSlides,
  BibleVerse,
  BiblePassageQuery,
  BiblePassageResult,
  DatabaseHealth,
  MediaPlaybackState,
  Timer,
  TimerState,
  StageConfig,
  StageWindowStatus,
  OutputConfig,
  LivestreamOverlayConfig,
  OverlayWindowStatus,
  OverlayRenderPayload,
  RemoteDevice,
  RemoteServerStatus,
  MidiMapping,
  MidiStatus,
  OscConfig,
  OscStatus,
  ActionMapping,
  SystemDiagnostics,
  WorkspaceState,
  AppDiagnosticEntry,
  AppDiagnosticFilter,
  AppInfo,
  BibleTranslationInfo,
  SongArrangement,
  Prop,
  ThemeExportResult,
  ThemeImportResult,
  SlideTemplate,
  Macro,
  MacroStep,
  Look,
  KeyBinding,
  ClearGroup,
  BibleSuggestion,
} from '../types';
import { validateTemplate } from './slideTemplates';
import { validateMacro, validateStep } from './macroSteps';
import { validateLook } from './looks';
import { validateKeyBinding, MAX_KEY_BINDINGS } from './keyBindings';
import { validateClearGroup, MAX_CLEAR_GROUPS } from './clearGroups';
import { suggestFromVerses } from './bibleSuggest';
import { validatePanels } from './stageLayouts';
import { validateProp } from './propLayout';
import { validateLayout, isEmptyLayout } from './slideLayout';
import { sectionColor } from './sectionColors';

// Detect whether we are running inside native Tauri runtime
export const isTauri = (): boolean => {
  if (typeof window !== 'undefined' && '__VITEST__' in window) {
    return false;
  }
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
};

// In-memory mock store for tests and browser development preview
class MockDataStore {
  private presentations: Presentation[] = [
    {
      id: 'pres-1',
      title: 'Amazing Grace',
      category: 'Hymn',
      themeName: 'Default Dark',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      slideCount: 3,
    },
    {
      id: 'pres-2',
      title: 'கிருபையும் சமாதானமும் (Grace and Peace)',
      category: 'Worship',
      themeName: 'Default Dark',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      slideCount: 2,
    },
    {
      id: 'pres-3',
      title: 'Psalm 23 / சங்கீதம் 23',
      category: 'Scripture',
      themeName: 'Scripture Gold',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      slideCount: 2,
    },
  ];

  private slides: Slide[] = [
    {
      id: 'slide-1-1',
      presentationId: 'pres-1',
      sortOrder: 0,
      title: 'Verse 1',
      body: 'Amazing grace! How sweet the sound\nThat saved a wretch like me!\nI once was lost, but now am found;\nWas blind, but now I see.',
      backgroundColor: '#0a0f1d',
      foregroundColor: '#ffffff',
      fontSize: 'large',
      textAlignment: 'center',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'slide-1-2',
      presentationId: 'pres-1',
      sortOrder: 1,
      title: 'Verse 2',
      body: "'Twas grace that taught my heart to fear,\nAnd grace my fears relieved;\nHow precious did that grace appear\nThe hour I first believed.",
      backgroundColor: '#0a0f1d',
      foregroundColor: '#ffffff',
      fontSize: 'large',
      textAlignment: 'center',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'slide-1-3',
      presentationId: 'pres-1',
      sortOrder: 2,
      title: 'Verse 3',
      body: 'Through many dangers, toils, and snares,\nI have already come;\n’Tis grace hath brought me safe thus far,\nAnd grace will lead me home.',
      backgroundColor: '#0a0f1d',
      foregroundColor: '#ffffff',
      fontSize: 'large',
      textAlignment: 'center',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'slide-2-1',
      presentationId: 'pres-2',
      sortOrder: 0,
      title: 'பல்லவி (Chorus)',
      body: 'கிருபையும் சமாதானமும்\nநிறைந்த என் இயேசுவே\nஉம்மை என்றென்றும் துதிப்பேன்\nஉம் நாமம் வாழ்கவே!',
      backgroundColor: '#111827',
      foregroundColor: '#fbbf24',
      fontSize: 'xlarge',
      textAlignment: 'center',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'slide-2-2',
      presentationId: 'pres-2',
      sortOrder: 1,
      title: 'சரணங்கள் (Verse)',
      body: 'காரிருள் சூழ்ந்திடும் வேளையிலும்\nவெளிச்சமாய் என்னைத் தாங்கினீரே\nவழுவாமல் என்னைக் காப்பவரே\nஉமக்கே துதி மகிமை!',
      backgroundColor: '#111827',
      foregroundColor: '#ffffff',
      fontSize: 'large',
      textAlignment: 'center',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'slide-3-1',
      presentationId: 'pres-3',
      sortOrder: 0,
      title: 'Psalm 23:1-2',
      body: 'The Lord is my shepherd; I shall not want.\nHe makes me lie down in green pastures.\nHe leads me beside still waters.',
      backgroundColor: '#1a1005',
      foregroundColor: '#fef08a',
      fontSize: 'large',
      textAlignment: 'center',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'slide-3-2',
      presentationId: 'pres-3',
      sortOrder: 1,
      title: 'சங்கீதம் 23:1-2',
      body: 'கர்த்தர் என் மேய்ப்பராயிருக்கிறார்; நான் தாழ்ச்சியடையேன்.\nஅவர் என்னைப் புல்லுள்ள இடங்களில் படுக்கப்பண்ணி,\nஅமர்ந்த தண்ணீர்கள் அண்டையில் என்னைக் கொண்டுபோய் விடுகிறார்.',
      backgroundColor: '#1a1005',
      foregroundColor: '#fef08a',
      fontSize: 'large',
      textAlignment: 'center',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ];

  // Phase 2: Songs
  private songs: Song[] = [
    {
      id: 'song-amazing-grace',
      title: 'Amazing Grace',
      alternateTitle: 'How Sweet the Sound',
      language: 'English',
      author: 'John Newton',
      composer: 'Traditional American Melody',
      copyright: 'Public Domain',
      ccliNumber: '22025',
      songKey: 'G',
      tempo: 72,
      tags: ['hymn', 'grace', 'classic'],
      category: 'Hymn',
      defaultThemeId: 'theme-builtin-dark',
      sectionsCount: 4,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'song-tamil-kirubaiyum',
      title: 'கிருபையும் சமாதானமும்',
      alternateTitle: 'Kirubaiyum Samadhanamum (Grace & Peace)',
      language: 'Tamil',
      author: 'Traditional',
      composer: undefined,
      copyright: 'Public Domain',
      ccliNumber: undefined,
      songKey: 'D',
      tempo: 68,
      tags: ['tamil', 'worship', 'kirubai'],
      category: 'Worship',
      defaultThemeId: 'theme-builtin-overlay',
      sectionsCount: 3,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'song-tamil-en-uyirana-yesu',
      title: 'என் உயிரான இயேசு (En Uyirana Yesu)',
      alternateTitle: 'Jesus, My Soul’s Delight',
      language: 'Tamil',
      author: 'Fr. Berchmans',
      composer: undefined,
      copyright: 'Used by Permission',
      ccliNumber: undefined,
      songKey: 'E',
      tempo: 105,
      tags: ['tamil', 'praise', 'berchmans'],
      category: 'Praise',
      defaultThemeId: 'theme-builtin-dark',
      sectionsCount: 2,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'song-seed-kanmalai',
      title: 'எந்தன் கண்மலையானவரே (Enthan Kanmalaiyaanavarae)',
      alternateTitle: 'You Are My Rock and Fortress',
      language: 'Tamil',
      author: 'Rev. Alwin Thomas',
      composer: undefined,
      copyright: 'Used by Permission',
      ccliNumber: undefined,
      songKey: 'D',
      tempo: 75,
      tags: ['tamil', 'worship', 'praise', 'rock'],
      category: 'Worship',
      defaultThemeId: 'theme-tamil-classical',
      sectionsCount: 2,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ];

  // Phase 2: Song Sections
  private songSections: SongSection[] = [
    {
      id: 'sec-ag-1',
      songId: 'song-amazing-grace',
      sectionType: 'verse',
      label: 'Verse 1',
      lyrics:
        'Amazing grace! How sweet the sound\nThat saved a wretch like me!\nI once was lost, but now am found;\nWas blind, but now I see.',
      sortOrder: 0,
      notes: 'Gentle acoustic intro',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'sec-ag-2',
      songId: 'song-amazing-grace',
      sectionType: 'verse',
      label: 'Verse 2',
      lyrics:
        "'Twas grace that taught my heart to fear,\nAnd grace my fears relieved;\nHow precious did that grace appear\nThe hour I first believed.",
      sortOrder: 1,
      notes: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'sec-ag-3',
      songId: 'song-amazing-grace',
      sectionType: 'verse',
      label: 'Verse 3',
      lyrics:
        'Through many dangers, toils, and snares,\nI have already come;\n’Tis grace hath brought me safe thus far,\nAnd grace will lead me home.',
      sortOrder: 2,
      notes: 'Build dynamics',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'sec-ag-4',
      songId: 'song-amazing-grace',
      sectionType: 'verse',
      label: 'Verse 4',
      lyrics:
        'When we’ve been there ten thousand years,\nBright shining as the sun,\nWe’ve no less days to sing God’s praise\nThan when we’d first begun.',
      sortOrder: 3,
      notes: 'Full choir / congregation',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'sec-tk-1',
      songId: 'song-tamil-kirubaiyum',
      sectionType: 'chorus',
      label: 'பல்லவி (Chorus)',
      lyrics:
        'கிருபையும் சமாதானமும்\nநிறைந்த என் இயேசுவே\nஉம்மை என்றென்றும் துதிப்பேன்\nஉம் நாமம் வாழ்கவே!',
      sortOrder: 0,
      notes: 'Chorus with full strings',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'sec-tk-2',
      songId: 'song-tamil-kirubaiyum',
      sectionType: 'verse',
      label: 'சரணம் 1 (Verse 1)',
      lyrics:
        'காரிருள் சூழ்ந்திடும் வேளையிலும்\nவெளிச்சமாய் என்னைத் தாங்கினீரே\nவழுவாமல் என்னைக் காப்பவரே\nஉமக்கே துதி மகிமை!',
      sortOrder: 1,
      notes: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'sec-tk-3',
      songId: 'song-tamil-kirubaiyum',
      sectionType: 'verse',
      label: 'சரணம் 2 (Verse 2)',
      lyrics:
        'ஆபத்து நாளில் அரணானீரே\nகன்மலை மேல் என்னை நிறுத்தினீரே\nஜீவனுள்ள நாளெல்லாம் நன்மை கிருபை\nஎன்னைத் தொடரச் செய்பவரே!',
      sortOrder: 2,
      notes: 'High praise',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'sec-eu-1',
      songId: 'song-tamil-en-uyirana-yesu',
      sectionType: 'chorus',
      label: 'பல்லவி (Chorus)',
      lyrics:
        'என் உயிரான உயிரான இயேசு\nஎன் உயிரோடு கலந்த என் இயேசு\nஉம்மைத்தானே என் வாழ்நாளெல்லாம்\nஉயிரோடு வாழும் வரை பாடுவேன்',
      sortOrder: 0,
      notes: 'Upbeat tempo',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'sec-eu-2',
      songId: 'song-tamil-en-uyirana-yesu',
      sectionType: 'verse',
      label: 'Verse 1 (English Translation)',
      lyrics:
        'Jesus, the very life of my soul,\nUnited with my spirit made whole.\nAll the days of my life I will sing,\nPraising Your name, my Lord and King.',
      sortOrder: 1,
      notes: 'Bilingual congregation singing',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'sec-kan-1',
      songId: 'song-seed-kanmalai',
      sectionType: 'chorus',
      label: 'பல்லவி (Chorus)',
      lyrics:
        'எந்தன் கண்மலையானவரே\nஎன் கோட்டையும் என் இரட்சகரும்\nநீர் மாத்ரம் தான் என் ஆதரவு\nஉம்மைத்தானே நான் நம்பியுள்ளேன்',
      sortOrder: 0,
      notes: 'Worship chorus',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'sec-kan-2',
      songId: 'song-seed-kanmalai',
      sectionType: 'verse',
      label: 'சரணம் 1 (Verse 1)',
      lyrics:
        'காரிருள் போன்ற பாதையிலே\nவெளிச்சமாய் என்னை நடத்தினீரே\nவழுவாமல் என்னைத் தாங்கிடுவீர்\nஉம் கிருபை எனக்குப் போதும்',
      sortOrder: 1,
      notes: 'Verse 1 acoustic',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ];

  // Phase 2: Themes
  private themes: Theme[] = [
    {
      id: 'theme-default-dark',
      name: 'Default Dark',
      isBuiltIn: true,
      backgroundColor: '#0a0f1d',
      backgroundMode: 'cover',
      fontFamily: 'system-ui, -apple-system, "Noto Sans Tamil", sans-serif',
      fontSize: 'large',
      fontWeight: 'bold',
      textColor: '#ffffff',
      textAlignment: 'center',
      verticalAlignment: 'center',
      lineSpacing: 1.35,
      textMargin: 6,
      textShadow: '0 2px 8px rgba(0,0,0,0.8)',
      overlayColor: undefined,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'theme-tamil-classical',
      name: 'Tamil Worship Classical',
      isBuiltIn: true,
      backgroundColor: '#1a1005',
      backgroundMode: 'cover',
      fontFamily: '"Noto Sans Tamil", "Latha", "Mukta Malar", system-ui, sans-serif',
      fontSize: 'large',
      fontWeight: 'bold',
      textColor: '#fef08a',
      textAlignment: 'center',
      verticalAlignment: 'center',
      lineSpacing: 1.45,
      textMargin: 8,
      textShadow: '0 2px 10px rgba(0,0,0,0.9)',
      overlayColor: 'rgba(0,0,0,0.4)',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'theme-scripture-modern',
      name: 'Modern Scripture',
      isBuiltIn: true,
      backgroundColor: '#0f172a',
      backgroundMode: 'cover',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      fontSize: 'large',
      fontWeight: 'normal',
      textColor: '#38bdf8',
      textAlignment: 'center',
      verticalAlignment: 'center',
      lineSpacing: 1.4,
      textMargin: 6,
      textShadow: '0 2px 8px rgba(0,0,0,0.7)',
      overlayColor: undefined,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'theme-deep-blue',
      name: 'Deep Ocean Blue',
      isBuiltIn: true,
      backgroundColor: '#02182b',
      backgroundMode: 'cover',
      fontFamily: 'system-ui, -apple-system, "Noto Sans Tamil", sans-serif',
      fontSize: 'large',
      fontWeight: 'bold',
      textColor: '#ffffff',
      textAlignment: 'center',
      verticalAlignment: 'center',
      lineSpacing: 1.35,
      textMargin: 6,
      textShadow: '0 2px 8px rgba(0,0,0,0.8)',
      overlayColor: 'rgba(0,0,0,0.35)',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ];

  private mediaAssets: MediaAsset[] = [
    {
      id: 'media-bg-stars',
      filename: 'stars-motion.mp4',
      originalFilename: 'stars-motion.mp4',
      relativePath: 'media/stars-motion.mp4',
      mimeType: 'video/mp4',
      fileSize: 1024 * 1024 * 4,
      mediaType: 'video',
      durationSeconds: 30,
      width: 1920,
      height: 1080,
      createdAt: new Date().toISOString(),
    },
    {
      id: 'media-bg-cross',
      filename: 'wooden-cross.jpg',
      originalFilename: 'wooden-cross.jpg',
      relativePath: 'media/wooden-cross.jpg',
      mimeType: 'image/jpeg',
      fileSize: 1024 * 350,
      mediaType: 'image',
      width: 1920,
      height: 1080,
      createdAt: new Date().toISOString(),
    },
    {
      id: 'media-audio-prelude',
      filename: 'ambient-worship.mp3',
      originalFilename: 'ambient-worship.mp3',
      relativePath: 'media/ambient-worship.mp3',
      mimeType: 'audio/mpeg',
      fileSize: 1024 * 1024 * 3,
      mediaType: 'audio',
      durationSeconds: 180,
      createdAt: new Date().toISOString(),
    },
  ];

  // Phase 4: Timers & Stage
  private timers: Timer[] = [
    {
      id: 'timer-preservice-5min',
      serviceId: 'service-sunday-morning',
      name: 'Pre-Service Countdown',
      timerType: 'countdown',
      durationSeconds: 300,
      warningThresholdSeconds: 60,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'timer-sermon-elapsed',
      serviceId: 'service-sunday-morning',
      name: 'Sermon Elapsed Timer',
      timerType: 'elapsed',
      durationSeconds: 0,
      warningThresholdSeconds: 1800,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ];

  private stageConfig: StageConfig = {
    id: 'default-stage',
    fontSize: 'large',
    showNotes: true,
    showTimer: true,
    showNext: true,
    highContrast: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  private stageStatus: StageWindowStatus = {
    isOpen: false,
    monitorName: null,
    isFullscreen: false,
    error: null,
  };

  // Phase 3: Services
  private services: Service[] = [
    {
      id: 'service-sunday-morning',
      title: 'Sunday Morning Worship & Word',
      description:
        'Full Sunday service order with praise lyrics, scripture reading, sermon, and announcements',
      serviceDate: '2026-10-18',
      category: 'Sunday Worship',
      notes:
        'Band sound check at 8:45 AM. Pastor will reference John 3:16-17 during sermon.',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      itemCount: 8,
    },
  ];

  // Phase 3: Service Items
  private serviceItems: PlaylistItem[] = [
    {
      id: 'item-srv-01',
      serviceId: 'service-sunday-morning',
      sortOrder: 0,
      itemType: 'divider',
      title: '— Prelude & Call to Worship —',
      notes: 'Gentle instrumental prelude',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      slideCount: 0,
    },
    {
      id: 'item-srv-02',
      serviceId: 'service-sunday-morning',
      sortOrder: 1,
      itemType: 'song',
      title: 'Amazing Grace',
      notes: 'Congregation stands for worship',
      sourceId: 'song-amazing-grace',
      themeId: 'theme-default-dark',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      slideCount: 4,
    },
    {
      id: 'item-srv-03',
      serviceId: 'service-sunday-morning',
      sortOrder: 2,
      itemType: 'song',
      title: 'கிருபையும் சமாதானமும்',
      notes: 'Tamil worship chorus and verse',
      sourceId: 'song-seed-kirubaiyum',
      themeId: 'theme-tamil-classical',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      slideCount: 2,
    },
    {
      id: 'item-srv-04',
      serviceId: 'service-sunday-morning',
      sortOrder: 3,
      itemType: 'divider',
      title: '— Scripture Reading —',
      notes: 'Deacon leads scripture reading',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      slideCount: 0,
    },
    {
      id: 'item-srv-05',
      serviceId: 'service-sunday-morning',
      sortOrder: 4,
      itemType: 'bible',
      title: 'Scripture: John 3:16-17 (KJV)',
      notes: 'Responsive reading',
      sourceId: 'John 3:16-17',
      themeId: 'theme-default-dark',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      slideCount: 2,
    },
    {
      id: 'item-srv-06',
      serviceId: 'service-sunday-morning',
      sortOrder: 5,
      itemType: 'sermon',
      title: 'Sermon: Walking in Unshakable Grace',
      notes: 'Pastor David sermon deck',
      themeId: 'theme-default-dark',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      slideCount: 3,
    },
    {
      id: 'item-srv-07',
      serviceId: 'service-sunday-morning',
      sortOrder: 6,
      itemType: 'announcement',
      title: 'Weekly Church Announcements',
      notes: 'Projected during pastoral welcome',
      themeId: 'theme-tamil-classical',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      slideCount: 2,
    },
    {
      id: 'item-srv-08',
      serviceId: 'service-sunday-morning',
      sortOrder: 7,
      itemType: 'timer',
      title: 'Benediction & 5-Min Fellowship Countdown',
      notes: 'Display timer for fellowship time',
      durationSeconds: 300,
      themeId: 'theme-default-dark',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      slideCount: 1,
    },
  ];

  // Phase 3: Service Item Slides
  private serviceItemSlides: Slide[] = [
    {
      id: 'slide-srv-02-1',
      presentationId: 'item-srv-02',
      sortOrder: 0,
      title: 'Amazing Grace - Verse 1',
      body: 'Amazing grace! How sweet the sound\nThat saved a wretch like me!\nI once was lost, but now am found;\nWas blind, but now I see.',
      backgroundColor: '#0a0f1d',
      foregroundColor: '#ffffff',
      fontSize: 'large',
      textAlignment: 'center',
      themeOverride: 'theme-default-dark',
      lineSpacing: 1.35,
      textShadow: '0 2px 8px rgba(0,0,0,0.8)',
      verticalAlignment: 'center',
      fontFamily: 'system-ui, sans-serif',
      fontWeight: 'bold',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'slide-srv-02-2',
      presentationId: 'item-srv-02',
      sortOrder: 1,
      title: 'Amazing Grace - Verse 2',
      body: "'Twas grace that taught my heart to fear,\nAnd grace my fears relieved;\nHow precious did that grace appear\nThe hour I first believed.",
      backgroundColor: '#0a0f1d',
      foregroundColor: '#ffffff',
      fontSize: 'large',
      textAlignment: 'center',
      themeOverride: 'theme-default-dark',
      lineSpacing: 1.35,
      textShadow: '0 2px 8px rgba(0,0,0,0.8)',
      verticalAlignment: 'center',
      fontFamily: 'system-ui, sans-serif',
      fontWeight: 'bold',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'slide-srv-02-3',
      presentationId: 'item-srv-02',
      sortOrder: 2,
      title: 'Amazing Grace - Verse 3',
      body: 'Through many dangers, toils, and snares,\nI have already come;\n’Tis grace hath brought me safe thus far,\nAnd grace will lead me home.',
      backgroundColor: '#0a0f1d',
      foregroundColor: '#ffffff',
      fontSize: 'large',
      textAlignment: 'center',
      themeOverride: 'theme-default-dark',
      lineSpacing: 1.35,
      textShadow: '0 2px 8px rgba(0,0,0,0.8)',
      verticalAlignment: 'center',
      fontFamily: 'system-ui, sans-serif',
      fontWeight: 'bold',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'slide-srv-02-4',
      presentationId: 'item-srv-02',
      sortOrder: 3,
      title: 'Amazing Grace - Verse 4',
      body: 'When we’ve been there ten thousand years,\nBright shining as the sun,\nWe’ve no less days to sing God’s praise\nThan when we’d first begun.',
      backgroundColor: '#0a0f1d',
      foregroundColor: '#ffffff',
      fontSize: 'large',
      textAlignment: 'center',
      themeOverride: 'theme-default-dark',
      lineSpacing: 1.35,
      textShadow: '0 2px 8px rgba(0,0,0,0.8)',
      verticalAlignment: 'center',
      fontFamily: 'system-ui, sans-serif',
      fontWeight: 'bold',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'slide-srv-03-1',
      presentationId: 'item-srv-03',
      sortOrder: 0,
      title: 'கிருபையும் சமாதானமும் - Chorus',
      body: 'கிருபையும் சமாதானமும்\nநிறைந்த என் இயேசுவே\nஉம்மை என்றென்றும் துதிப்பேன்\nஉம் நாமம் வாழ்கவே!',
      backgroundColor: '#1a1005',
      foregroundColor: '#fef08a',
      fontSize: 'large',
      textAlignment: 'center',
      themeOverride: 'theme-tamil-classical',
      lineSpacing: 1.45,
      textShadow: '0 2px 10px rgba(0,0,0,0.9)',
      verticalAlignment: 'center',
      fontFamily: '"Noto Sans Tamil", sans-serif',
      fontWeight: 'bold',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'slide-srv-03-2',
      presentationId: 'item-srv-03',
      sortOrder: 1,
      title: 'கிருபையும் சமாதானமும் - Verse 1',
      body: 'காரிருள் சூழ்ந்திடும் வேளையிலும்\nவெளிச்சமாய் என்னைத் தாங்கினீரே\nவழுவாமல் என்னைக் காப்பவரே\nஉமக்கே துதி மகிமை!',
      backgroundColor: '#1a1005',
      foregroundColor: '#fef08a',
      fontSize: 'large',
      textAlignment: 'center',
      themeOverride: 'theme-tamil-classical',
      lineSpacing: 1.45,
      textShadow: '0 2px 10px rgba(0,0,0,0.9)',
      verticalAlignment: 'center',
      fontFamily: '"Noto Sans Tamil", sans-serif',
      fontWeight: 'bold',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'slide-srv-05-1',
      presentationId: 'item-srv-05',
      sortOrder: 0,
      title: 'John 3:16 (KJV)',
      body: 'For God so loved the world, that he gave his only begotten Son, that whosoever believeth in him should not perish, but have everlasting life.',
      backgroundColor: '#0a0f1d',
      foregroundColor: '#ffffff',
      fontSize: 'large',
      textAlignment: 'center',
      themeOverride: 'theme-default-dark',
      lineSpacing: 1.4,
      textShadow: '0 2px 8px rgba(0,0,0,0.8)',
      verticalAlignment: 'center',
      fontFamily: 'system-ui, sans-serif',
      fontWeight: 'normal',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'slide-srv-05-2',
      presentationId: 'item-srv-05',
      sortOrder: 1,
      title: 'John 3:17 (KJV)',
      body: 'For God sent not his Son into the world to condemn the world; but that the world through him might be saved.',
      backgroundColor: '#0a0f1d',
      foregroundColor: '#ffffff',
      fontSize: 'large',
      textAlignment: 'center',
      themeOverride: 'theme-default-dark',
      lineSpacing: 1.4,
      textShadow: '0 2px 8px rgba(0,0,0,0.8)',
      verticalAlignment: 'center',
      fontFamily: 'system-ui, sans-serif',
      fontWeight: 'normal',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'slide-srv-06-1',
      presentationId: 'item-srv-06',
      sortOrder: 0,
      title: 'Walking in Unshakable Grace',
      body: 'Sunday Sermon Series\n\nPastor David',
      backgroundColor: '#0a0f1d',
      foregroundColor: '#38bdf8',
      fontSize: 'xlarge',
      textAlignment: 'center',
      themeOverride: 'theme-default-dark',
      lineSpacing: 1.4,
      textShadow: '0 2px 10px rgba(0,0,0,0.9)',
      verticalAlignment: 'center',
      fontFamily: 'system-ui, sans-serif',
      fontWeight: 'bold',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'slide-srv-06-2',
      presentationId: 'item-srv-06',
      sortOrder: 1,
      title: '1. Grace Founded on Truth',
      body: "God's grace does not ignore our reality;\nit redeems our future through Christ.",
      backgroundColor: '#0a0f1d',
      foregroundColor: '#ffffff',
      fontSize: 'large',
      textAlignment: 'center',
      themeOverride: 'theme-default-dark',
      lineSpacing: 1.4,
      textShadow: '0 2px 8px rgba(0,0,0,0.8)',
      verticalAlignment: 'center',
      fontFamily: 'system-ui, sans-serif',
      fontWeight: 'normal',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'slide-srv-06-3',
      presentationId: 'item-srv-06',
      sortOrder: 2,
      title: '2. Grace Empowering Daily Walk',
      body: 'We are not just saved by grace;\nwe are sustained and sanctified by grace every day.',
      backgroundColor: '#0a0f1d',
      foregroundColor: '#ffffff',
      fontSize: 'large',
      textAlignment: 'center',
      themeOverride: 'theme-default-dark',
      lineSpacing: 1.4,
      textShadow: '0 2px 8px rgba(0,0,0,0.8)',
      verticalAlignment: 'center',
      fontFamily: 'system-ui, sans-serif',
      fontWeight: 'normal',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'slide-srv-07-1',
      presentationId: 'item-srv-07',
      sortOrder: 0,
      title: 'Youth Fellowship',
      body: 'Friday 6:30 PM in the Fellowship Hall\nFood, games, and Bible study for teens and young adults.',
      backgroundColor: '#1a1005',
      foregroundColor: '#fef08a',
      fontSize: 'large',
      textAlignment: 'center',
      themeOverride: 'theme-tamil-classical',
      lineSpacing: 1.35,
      textShadow: '0 2px 8px rgba(0,0,0,0.9)',
      verticalAlignment: 'center',
      fontFamily: 'system-ui, sans-serif',
      fontWeight: 'bold',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'slide-srv-07-2',
      presentationId: 'item-srv-07',
      sortOrder: 1,
      title: 'Wednesday Midweek Prayer',
      body: 'Wednesday 7:00 PM in the Main Sanctuary\nJoin us as we intercede for our community and families.',
      backgroundColor: '#1a1005',
      foregroundColor: '#fef08a',
      fontSize: 'large',
      textAlignment: 'center',
      themeOverride: 'theme-tamil-classical',
      lineSpacing: 1.35,
      textShadow: '0 2px 8px rgba(0,0,0,0.9)',
      verticalAlignment: 'center',
      fontFamily: 'system-ui, sans-serif',
      fontWeight: 'bold',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'slide-srv-08-1',
      presentationId: 'item-srv-08',
      sortOrder: 0,
      title: 'Fellowship & Tea',
      body: 'May the grace of our Lord Jesus Christ be with you all.\n\nEnjoy fellowship in the courtyard!',
      backgroundColor: '#0a0f1d',
      foregroundColor: '#38bdf8',
      fontSize: 'large',
      textAlignment: 'center',
      themeOverride: 'theme-default-dark',
      lineSpacing: 1.4,
      textShadow: '0 2px 8px rgba(0,0,0,0.8)',
      verticalAlignment: 'center',
      fontFamily: 'system-ui, sans-serif',
      fontWeight: 'bold',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ];

  // Phase 3: Offline Bible Verses
  private bibleVerses: BibleVerse[] = [
    {
      id: 'bv-kjv-jhn-3-16',
      translation: 'KJV',
      book: 'John',
      bookNumber: 43,
      chapter: 3,
      verse: 16,
      text: 'For God so loved the world, that he gave his only begotten Son, that whosoever believeth in him should not perish, but have everlasting life.',
    },
    {
      id: 'bv-kjv-jhn-3-17',
      translation: 'KJV',
      book: 'John',
      bookNumber: 43,
      chapter: 3,
      verse: 17,
      text: 'For God sent not his Son into the world to condemn the world; but that the world through him might be saved.',
    },
    {
      id: 'bv-kjv-jhn-3-18',
      translation: 'KJV',
      book: 'John',
      bookNumber: 43,
      chapter: 3,
      verse: 18,
      text: 'He that believeth on him is not condemned: but he that believeth not is condemned already, because he hath not believed in the name of the only begotten Son of God.',
    },
    {
      id: 'bv-web-jhn-3-16',
      translation: 'WEB',
      book: 'John',
      bookNumber: 43,
      chapter: 3,
      verse: 16,
      text: 'For God so loved the world, that he gave his one and only Son, that whoever believes in him should not perish, but have eternal life.',
    },
    {
      id: 'bv-web-jhn-3-17',
      translation: 'WEB',
      book: 'John',
      bookNumber: 43,
      chapter: 3,
      verse: 17,
      text: "For God didn't send his Son into the world to judge the world, but that the world should be saved through him.",
    },
    {
      id: 'bv-web-jhn-3-18',
      translation: 'WEB',
      book: 'John',
      bookNumber: 43,
      chapter: 3,
      verse: 18,
      text: "He who believes in him is not judged. He who doesn't believe has been judged already, because he has not believed in the name of the one and only Son of God.",
    },
    {
      id: 'bv-tam-jhn-3-16',
      translation: 'Tamil',
      book: 'யோவான்',
      bookNumber: 43,
      chapter: 3,
      verse: 16,
      text: 'தேவன், தம்முடைய ஒரேபேறான குமாரனை விசுவாசிக்கிற எவனும் கெட்டுப்போகாமல் நித்தியஜீவனை அடையும்படிக்கு, அவரைத் தந்தருளி, இவ்வளவாய் உலகத்தில் அன்புகூர்ந்தார்.',
    },
    {
      id: 'bv-tam-jhn-3-17',
      translation: 'Tamil',
      book: 'யோவான்',
      bookNumber: 43,
      chapter: 3,
      verse: 17,
      text: 'உலகத்தை ஆக்கினைக்குள்ளாகத் தீர்க்கும்படி தேவன் தம்முடைய குமாரனை உலகத்தில் அனுப்பாமல், அவராலே உலகம் இரட்சிக்கப்படுவதற்காகவே அவரை அனுப்பினார்.',
    },
    {
      id: 'bv-tam-jhn-3-18',
      translation: 'Tamil',
      book: 'யோவான்',
      bookNumber: 43,
      chapter: 3,
      verse: 18,
      text: 'அவரை விசுவாசிக்கிறவன் ஆக்கினைக்குள்ளாகத் தீர்க்கப்படான்; விசுவாசியாதவனோ தேவனுடைய ஒரேபேறான குமாரனின் நாமத்தில் விசுவாசமுள்ளவனாயிராதபடியினால், அவன் ஆக்கினைத்தீர்ப்புக்குட்பட்டாயிற்று.',
    },
    {
      id: 'bv-kjv-psa-23-1',
      translation: 'KJV',
      book: 'Psalms',
      bookNumber: 19,
      chapter: 23,
      verse: 1,
      text: 'The LORD is my shepherd; I shall not want.',
    },
    {
      id: 'bv-kjv-psa-23-2',
      translation: 'KJV',
      book: 'Psalms',
      bookNumber: 19,
      chapter: 23,
      verse: 2,
      text: 'He maketh me to lie down in green pastures: he leadeth me beside the still waters.',
    },
    {
      id: 'bv-kjv-psa-23-3',
      translation: 'KJV',
      book: 'Psalms',
      bookNumber: 19,
      chapter: 23,
      verse: 3,
      text: "He restoreth my soul: he leadeth me in the paths of righteousness for his name's sake.",
    },
    {
      id: 'bv-kjv-psa-23-4',
      translation: 'KJV',
      book: 'Psalms',
      bookNumber: 19,
      chapter: 23,
      verse: 4,
      text: 'Yea, though I walk through the valley of the shadow of death, I will fear no evil: for thou art with me; thy rod and thy staff they comfort me.',
    },
    {
      id: 'bv-kjv-psa-23-5',
      translation: 'KJV',
      book: 'Psalms',
      bookNumber: 19,
      chapter: 23,
      verse: 5,
      text: 'Thou preparest a table before me in the presence of mine enemies: thou anointest my head with oil; my cup runneth over.',
    },
    {
      id: 'bv-kjv-psa-23-6',
      translation: 'KJV',
      book: 'Psalms',
      bookNumber: 19,
      chapter: 23,
      verse: 6,
      text: 'Surely goodness and mercy shall follow me all the days of my life: and I will dwell in the house of the LORD for ever.',
    },
    {
      id: 'bv-tam-psa-23-1',
      translation: 'Tamil',
      book: 'சங்கீதம்',
      bookNumber: 19,
      chapter: 23,
      verse: 1,
      text: 'கர்த்தர் என் மேய்ப்பராயிருக்கிறார், நான் தாழ்ச்சியடையேன்.',
    },
    {
      id: 'bv-tam-psa-23-2',
      translation: 'Tamil',
      book: 'சங்கீதம்',
      bookNumber: 19,
      chapter: 23,
      verse: 2,
      text: 'அவர் என்னைப் பசும்புல்லுள்ள இடங்களில் படுக்கப்பண்ணி, அமர்ந்த தண்ணீர்கள் அண்டையில் என்னைக் கொண்டுபோய் விடுகிறார்.',
    },
    {
      id: 'bv-tam-psa-23-3',
      translation: 'Tamil',
      book: 'சங்கீதம்',
      bookNumber: 19,
      chapter: 23,
      verse: 3,
      text: 'அவர் என் ஆத்துமாவைத் தேற்றி, தம்முடைய நாமத்தினிமித்தம் என்னை நீதியின் பாதைகளில் நடத்துகிறார்.',
    },
    {
      id: 'bv-tam-psa-23-4',
      translation: 'Tamil',
      book: 'சங்கீதம்',
      bookNumber: 19,
      chapter: 23,
      verse: 4,
      text: 'நான் மரண இருளின் பள்ளத்தாக்கிலே நடந்தாலும் பொல்லாப்புக்குப் பயப்படேன்; தேவரீர் என்னோடேகூட இருக்கிறீர்; உமது கோலும் உமது தடியும் என்னைத் தேற்றும்.',
    },
    {
      id: 'bv-tam-psa-23-5',
      translation: 'Tamil',
      book: 'சங்கீதம்',
      bookNumber: 19,
      chapter: 23,
      verse: 5,
      text: 'என் சத்துருக்களுக்கு முன்பாக நீர் எனக்கு ஒரு பந்தியை ஆயத்தப்படுத்தி, என் தலையை எண்ணெயினால் அபிஷேகம் பண்ணுகிறீர்; என் பாத்திரம் நிரம்பி வழிகிறது.',
    },
    {
      id: 'bv-tam-psa-23-6',
      translation: 'Tamil',
      book: 'சங்கீதம்',
      bookNumber: 19,
      chapter: 23,
      verse: 6,
      text: 'என் ஜீவனுள்ள நாளெல்லாம் நன்மையும் கிருபையும் என்னைத் தொடரும்; நான் கர்த்தருடைய வீட்டிலே நீடித்த நாட்களாய் நிலைத்திருப்பேன்.',
    },
  ];

  private state: PresentationState = {
    currentPresentationId: 'pres-1',
    currentSlideId: 'slide-1-1',
    currentSlideIndex: 0,
    totalSlides: 3,
    currentSlide: null,
    nextSlide: null,
    isBlackout: false,
    isLogo: false,
    isLive: false,
  };

  private listeners: ((state: PresentationState) => void)[] = [];
  private settings: Record<string, string> = {
    selectedMonitorId: '',
    defaultFontSize: 'large',
    audienceFullscreen: 'true',
  };

  constructor() {
    this.updateStatePointers();
  }

  private updateStatePointers() {
    if (this.state.currentServiceId && this.state.currentItemId) {
      const itemSlides = this.serviceItemSlides
        .filter((s) => s.presentationId === this.state.currentItemId)
        .sort((a, b) => a.sortOrder - b.sortOrder);

      this.state.totalSlides = itemSlides.length;

      let idx = itemSlides.findIndex((s) => s.id === this.state.currentSlideId);
      if (idx === -1 && itemSlides.length > 0) {
        idx = 0;
        this.state.currentSlideId = itemSlides[0].id;
      }
      this.state.currentSlideIndex = idx >= 0 ? idx : 0;
      this.state.currentSlide = idx >= 0 ? itemSlides[idx] : null;

      if (idx >= 0 && idx + 1 < itemSlides.length) {
        this.state.nextSlide = itemSlides[idx + 1];
      } else {
        const items = this.serviceItems
          .filter((it) => it.serviceId === this.state.currentServiceId)
          .sort((a, b) => a.sortOrder - b.sortOrder);
        const itemIdx = items.findIndex((it) => it.id === this.state.currentItemId);
        let nextFound: Slide | null = null;
        if (itemIdx >= 0) {
          for (let i = itemIdx + 1; i < items.length; i++) {
            const nextSlides = this.serviceItemSlides
              .filter((s) => s.presentationId === items[i].id)
              .sort((a, b) => a.sortOrder - b.sortOrder);
            if (nextSlides.length > 0) {
              nextFound = nextSlides[0];
              break;
            }
          }
        }
        this.state.nextSlide = nextFound;
      }
      return;
    }

    if (!this.state.currentPresentationId) {
      this.state.currentSlide = null;
      this.state.nextSlide = null;
      this.state.totalSlides = 0;
      return;
    }
    const currentPresSlides = this.slides
      .filter((s) => s.presentationId === this.state.currentPresentationId)
      .sort((a, b) => a.sortOrder - b.sortOrder);

    this.state.totalSlides = currentPresSlides.length;

    let idx = currentPresSlides.findIndex((s) => s.id === this.state.currentSlideId);
    if (idx === -1 && currentPresSlides.length > 0) {
      idx = 0;
      this.state.currentSlideId = currentPresSlides[0].id;
    }
    this.state.currentSlideIndex = idx >= 0 ? idx : 0;
    this.state.currentSlide = idx >= 0 ? currentPresSlides[idx] : null;
    this.state.nextSlide =
      idx >= 0 && idx + 1 < currentPresSlides.length ? currentPresSlides[idx + 1] : null;
  }

  private notify() {
    this.updateStatePointers();
    const cloned = JSON.parse(JSON.stringify(this.state));
    this.listeners.forEach((cb) => cb(cloned));
  }

  public subscribe(cb: (state: PresentationState) => void): () => void {
    this.listeners.push(cb);
    cb(JSON.parse(JSON.stringify(this.state)));
    return () => {
      this.listeners = this.listeners.filter((l) => l !== cb);
    };
  }

  public async listPresentations(): Promise<Presentation[]> {
    return this.presentations.map((p) => ({
      ...p,
      slideCount: this.slides.filter((s) => s.presentationId === p.id).length,
    }));
  }

  public async getPresentation(id: string): Promise<Presentation | null> {
    const p = this.presentations.find((x) => x.id === id);
    if (!p) return null;
    return {
      ...p,
      slideCount: this.slides.filter((s) => s.presentationId === p.id).length,
    };
  }

  public async createPresentation(
    title: string,
    category: Presentation['category'],
    themeName?: string | null
  ): Promise<Presentation> {
    const newPres: Presentation = {
      id: 'pres-' + Math.random().toString(36).substring(2, 9),
      title: title.trim() || 'Untitled Presentation',
      category: category || 'Worship',
      themeName: themeName || 'Default Dark',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      slideCount: 0,
    };
    this.presentations.push(newPres);
    return newPres;
  }

  public async updatePresentation(
    id: string,
    title: string,
    category: Presentation['category'],
    themeName?: string | null
  ): Promise<Presentation> {
    const p = this.presentations.find((x) => x.id === id);
    if (!p) throw new Error('Presentation not found');
    p.title = title.trim();
    p.category = category;
    p.themeName = themeName;
    p.updatedAt = new Date().toISOString();
    return p;
  }

  public async deletePresentation(id: string): Promise<void> {
    this.presentations = this.presentations.filter((p) => p.id !== id);
    this.slides = this.slides.filter((s) => s.presentationId !== id);
    if (this.state.currentPresentationId === id) {
      this.state.currentPresentationId = this.presentations[0]?.id || null;
      this.state.currentSlideId = null;
      this.state.isLive = false;
      this.notify();
    }
  }

  public async duplicatePresentation(id: string): Promise<Presentation> {
    const original = this.presentations.find((p) => p.id === id);
    if (!original) throw new Error('Presentation not found');
    const newId = 'pres-' + Math.random().toString(36).substring(2, 9);
    const duplicated: Presentation = {
      ...original,
      id: newId,
      title: `${original.title} (Copy)`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.presentations.push(duplicated);

    const origSlides = this.slides.filter((s) => s.presentationId === id);
    origSlides.forEach((s) => {
      this.slides.push({
        ...s,
        id: 'slide-' + Math.random().toString(36).substring(2, 9),
        presentationId: newId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    });

    return duplicated;
  }

  public async getSlides(presentationId: string): Promise<Slide[]> {
    return this.slides
      .filter((s) => s.presentationId === presentationId)
      .sort((a, b) => a.sortOrder - b.sortOrder);
  }

  public async createSlide(
    presentationId: string,
    slideData: Partial<Slide>
  ): Promise<Slide> {
    const current = this.slides.filter((s) => s.presentationId === presentationId);
    const layoutProblem = validateLayout(slideData.layout);
    if (layoutProblem) throw new Error(layoutProblem);
    const newSlide: Slide = {
      id: 'slide-' + Math.random().toString(36).substring(2, 9),
      presentationId,
      sortOrder: current.length,
      title: slideData.title || `Slide ${current.length + 1}`,
      body: slideData.body || '',
      backgroundColor: slideData.backgroundColor || '#0a0f1d',
      foregroundColor: slideData.foregroundColor || '#ffffff',
      fontSize: slideData.fontSize || 'large',
      textAlignment: slideData.textAlignment || 'center',
      themeOverride: slideData.themeOverride || null,
      backgroundImage: slideData.backgroundImage || null,
      overlayColor: slideData.overlayColor || null,
      lineSpacing: slideData.lineSpacing || null,
      textShadow: slideData.textShadow || null,
      verticalAlignment: slideData.verticalAlignment || null,
      fontFamily: slideData.fontFamily || null,
      fontWeight: slideData.fontWeight || null,
      groupLabel: slideData.groupLabel || null,
      groupColor: slideData.groupColor || null,
      layout: isEmptyLayout(slideData.layout) ? null : { ...slideData.layout },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.slides.push(newSlide);
    if (this.state.currentPresentationId === presentationId) {
      this.notify();
    }
    return newSlide;
  }

  public async updateSlide(id: string, slideData: Partial<Slide>): Promise<Slide> {
    const slide = this.slides.find((s) => s.id === id);
    if (!slide) throw new Error('Slide not found');
    const problem = validateLayout(slideData.layout);
    if (problem) throw new Error(problem);
    const { layout, ...rest } = slideData;
    Object.assign(slide, rest, { updatedAt: new Date().toISOString() });
    // layout: undefined keeps the stored one; an empty layout clears it
    if (layout !== undefined) slide.layout = isEmptyLayout(layout) ? null : { ...layout };
    if (this.state.currentSlideId === id) {
      this.notify();
    }
    return slide;
  }

  public async deleteSlide(id: string): Promise<void> {
    const slide = this.slides.find((s) => s.id === id);
    if (!slide) return;
    const presId = slide.presentationId;
    this.slides = this.slides.filter((s) => s.id !== id);

    const remaining = this.slides
      .filter((s) => s.presentationId === presId)
      .sort((a, b) => a.sortOrder - b.sortOrder);
    remaining.forEach((s, idx) => {
      s.sortOrder = idx;
    });

    if (this.state.currentSlideId === id) {
      this.state.currentSlideId = remaining[0]?.id || null;
      this.notify();
    }
  }

  public async duplicateSlide(id: string): Promise<Slide> {
    const orig = this.slides.find((s) => s.id === id);
    if (!orig) throw new Error('Slide not found');
    const newSlide: Slide = {
      ...orig,
      id: 'slide-' + Math.random().toString(36).substring(2, 9),
      title: `${orig.title} (Copy)`,
      sortOrder: orig.sortOrder + 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.slides
      .filter((s) => s.presentationId === orig.presentationId && s.sortOrder > orig.sortOrder)
      .forEach((s) => s.sortOrder++);

    this.slides.push(newSlide);
    this.notify();
    return newSlide;
  }

  public async reorderSlides(presentationId: string, slideIds: string[]): Promise<void> {
    slideIds.forEach((id, idx) => {
      const slide = this.slides.find((s) => s.id === id && s.presentationId === presentationId);
      if (slide) {
        slide.sortOrder = idx;
      }
    });
    this.notify();
  }

  public async setLiveSlide(presentationId: string, slideId: string): Promise<PresentationState> {
    this.state.currentServiceId = null;
    this.state.currentItemId = null;
    this.state.currentPresentationId = presentationId;
    this.state.currentSlideId = slideId;
    this.state.isLive = true;
    this.state.isLogo = false;
    this.notify();
    return this.state;
  }

  public async setLiveServiceItemSlide(
    serviceId: string,
    itemId: string,
    slideId: string
  ): Promise<PresentationState> {
    this.state.currentServiceId = serviceId;
    this.state.currentItemId = itemId;
    this.state.currentPresentationId = null;
    this.state.currentSlideId = slideId;
    this.state.isLive = true;
    this.state.isLogo = false;
    this.notify();
    return this.state;
  }

  public async setSelectedServiceItem(
    serviceId?: string | null,
    itemId?: string | null
  ): Promise<PresentationState> {
    this.state.selectedServiceId = serviceId ?? null;
    this.state.selectedItemId = itemId ?? null;
    this.notify();
    return this.state;
  }

  public async clearLive(): Promise<PresentationState> {
    this.state.isLive = false;
    this.notify();
    return this.state;
  }

  // ---- clear groups
  private clearGroups: ClearGroup[] = [];

  public async listClearGroups(): Promise<ClearGroup[]> {
    return this.clearGroups.map((g) => ({ ...g, layers: [...g.layers] }));
  }

  public async createClearGroup(g: ClearGroup): Promise<ClearGroup> {
    const problem = validateClearGroup(g);
    if (problem) throw new Error(problem);
    if (this.clearGroups.length >= MAX_CLEAR_GROUPS) throw new Error(`You can keep at most ${MAX_CLEAR_GROUPS} clear groups.`);
    const now = new Date().toISOString();
    const saved: ClearGroup = {
      ...g,
      id: 'clear-' + Math.random().toString(36).substring(2, 9),
      name: g.name.trim(),
      layers: [...g.layers],
      sortOrder: this.clearGroups.length,
      createdAt: now,
      updatedAt: now,
    };
    this.clearGroups.push(saved);
    return { ...saved, layers: [...saved.layers] };
  }

  public async updateClearGroup(g: ClearGroup): Promise<ClearGroup> {
    const problem = validateClearGroup(g);
    if (problem) throw new Error(problem);
    const idx = this.clearGroups.findIndex((o) => o.id === g.id);
    if (idx < 0) throw new Error('That clear group no longer exists.');
    this.clearGroups[idx] = { ...this.clearGroups[idx], ...g, name: g.name.trim(), layers: [...g.layers], updatedAt: new Date().toISOString() };
    return { ...this.clearGroups[idx], layers: [...this.clearGroups[idx].layers] };
  }

  public async deleteClearGroup(id: string): Promise<void> {
    this.clearGroups = this.clearGroups.filter((g) => g.id !== id);
  }

  /** Clears the layers of a saved group; everything else on the output stays as it is. */
  public async runClearGroup(id: string): Promise<PresentationState> {
    const group = this.clearGroups.find((g) => g.id === id);
    if (!group) throw new Error('That clear group no longer exists.');
    for (const layer of group.layers) {
      switch (layer) {
        case 'slide': this.state.isLive = false; break;
        case 'media': this.state.mediaPlayback = null; break;
        case 'logo': this.state.isLogo = false; break;
        case 'blackout': this.state.isBlackout = false; break;
        case 'alert': this.state.alert = null; break;
        case 'props': this.state.activeProps = []; break;
        case 'autoAdvance':
          this.state.autoAdvance = null;
          if (this.autoAdvanceTimer) clearTimeout(this.autoAdvanceTimer);
          this.autoAdvanceTimer = null;
          break;
      }
    }
    this.notify();
    return this.state;
  }

  // ---- key bindings
  private keyBindings: KeyBinding[] = [];

  public async listKeyBindings(): Promise<KeyBinding[]> {
    return this.keyBindings.map((b) => ({ ...b }));
  }

  private checkKeyBinding(b: KeyBinding): void {
    const problem = validateKeyBinding(b);
    if (problem) throw new Error(problem);
    const exists =
      b.targetType === 'prop' ? this.props.some((p) => p.id === b.targetId)
      : b.targetType === 'macro' ? this.macros.some((m) => m.id === b.targetId)
      : b.targetType === 'look' ? this.looks.some((l) => l.id === b.targetId)
      : b.targetType === 'clearGroup' ? this.clearGroups.some((g) => g.id === b.targetId)
      : true;
    if (!exists) throw new Error('That prop, macro or look no longer exists.');
    if (this.keyBindings.some((o) => o.combo === b.combo && o.id !== b.id)) {
      throw new Error(`${b.combo} is already assigned to another shortcut.`);
    }
  }

  public async createKeyBinding(b: KeyBinding): Promise<KeyBinding> {
    this.checkKeyBinding({ ...b, id: '' });
    if (this.keyBindings.length >= MAX_KEY_BINDINGS) throw new Error(`You can keep at most ${MAX_KEY_BINDINGS} shortcuts.`);
    const now = new Date().toISOString();
    const saved: KeyBinding = { ...b, id: 'key-' + Math.random().toString(36).substring(2, 9), createdAt: now, updatedAt: now };
    this.keyBindings.push(saved);
    return { ...saved };
  }

  public async updateKeyBinding(b: KeyBinding): Promise<KeyBinding> {
    this.checkKeyBinding(b);
    const idx = this.keyBindings.findIndex((o) => o.id === b.id);
    if (idx < 0) throw new Error('That shortcut no longer exists.');
    this.keyBindings[idx] = { ...this.keyBindings[idx], ...b, updatedAt: new Date().toISOString() };
    return { ...this.keyBindings[idx] };
  }

  public async deleteKeyBinding(id: string): Promise<void> {
    this.keyBindings = this.keyBindings.filter((b) => b.id !== id);
  }

  // ---- looks
  private looks: Look[] = [];

  public async listLooks(): Promise<Look[]> {
    return this.looks.map((l) => JSON.parse(JSON.stringify(l)));
  }

  public async createLook(look: Look): Promise<Look> {
    const problem = validateLook(look);
    if (problem) throw new Error(problem);
    if (this.looks.length >= 100) throw new Error('You can keep at most 100 looks.');
    const now = new Date().toISOString();
    const saved: Look = {
      ...JSON.parse(JSON.stringify(look)),
      id: 'look-' + Math.random().toString(36).substring(2, 9),
      name: look.name.trim(),
      sortOrder: this.looks.length,
      createdAt: now,
      updatedAt: now,
    };
    this.looks.push(saved);
    return JSON.parse(JSON.stringify(saved));
  }

  public async updateLook(look: Look): Promise<Look> {
    const problem = validateLook(look);
    if (problem) throw new Error(problem);
    const idx = this.looks.findIndex((l) => l.id === look.id);
    if (idx < 0) throw new Error('That look no longer exists.');
    this.looks[idx] = { ...this.looks[idx], ...JSON.parse(JSON.stringify(look)), name: look.name.trim(), updatedAt: new Date().toISOString() };
    return JSON.parse(JSON.stringify(this.looks[idx]));
  }

  public async deleteLook(id: string): Promise<void> {
    this.looks = this.looks.filter((l) => l.id !== id);
  }

  /** Sets the logo, blackout and props to match the look; the live slide is not changed. */
  public async applyLook(id: string): Promise<PresentationState> {
    const look = this.looks.find((l) => l.id === id);
    if (!look) throw new Error('That look no longer exists.');
    this.state.isLogo = look.logo;
    this.state.isBlackout = look.blackout;
    this.state.activeProps = look.propIds
      .map((pid) => this.props.find((p) => p.id === pid))
      .filter((p): p is Prop => !!p)
      .map((p) => ({ ...p }));
    this.notify();
    return this.state;
  }

  /** Saves the screen as it is now as a new look. */
  public async captureLook(name: string): Promise<Look> {
    return this.createLook({
      id: '',
      name,
      logo: !!this.state.isLogo,
      blackout: !!this.state.isBlackout,
      propIds: (this.state.activeProps || []).map((p) => p.id),
    });
  }

  // ---- automation (macros and auto-advance)
  private macros: Macro[] = [];
  private autoAdvanceTimer: ReturnType<typeof setTimeout> | null = null;
  private macroRunId: string | null = null;

  public async listMacros(): Promise<Macro[]> {
    return this.macros.map((m) => JSON.parse(JSON.stringify(m)));
  }

  public async createMacro(macro: Macro): Promise<Macro> {
    const problem = validateMacro(macro);
    if (problem) throw new Error(problem);
    if (this.macros.length >= 100) throw new Error('You can keep at most 100 macros.');
    const now = new Date().toISOString();
    const saved: Macro = {
      ...JSON.parse(JSON.stringify(macro)),
      id: 'macro-' + Math.random().toString(36).substring(2, 9),
      name: macro.name.trim(),
      sortOrder: this.macros.length,
      createdAt: now,
      updatedAt: now,
    };
    this.macros.push(saved);
    return JSON.parse(JSON.stringify(saved));
  }

  public async updateMacro(macro: Macro): Promise<Macro> {
    const problem = validateMacro(macro);
    if (problem) throw new Error(problem);
    const idx = this.macros.findIndex((m) => m.id === macro.id);
    if (idx < 0) throw new Error('That macro no longer exists.');
    this.macros[idx] = {
      ...this.macros[idx],
      name: macro.name.trim(),
      steps: JSON.parse(JSON.stringify(macro.steps)),
      updatedAt: new Date().toISOString(),
    };
    return JSON.parse(JSON.stringify(this.macros[idx]));
  }

  public async deleteMacro(id: string): Promise<void> {
    this.macros = this.macros.filter((m) => m.id !== id);
  }

  private async applyMacroStep(step: MacroStep): Promise<void> {
    const problem = validateStep(step);
    if (problem) throw new Error(problem);
    switch (step.type) {
      case 'action':
        await this.dispatchAction(step.action);
        return;
      case 'alert':
        await this.sendAlert(step.message, step.seconds ?? undefined);
        return;
      case 'prop': {
        const on = (this.state.activeProps || []).some((p) => p.id === step.propId);
        const want = step.mode === 'show' ? true : step.mode === 'hide' ? false : !on;
        if (want !== on) await this.toggleProp(step.propId);
        return;
      }
      case 'autoAdvance':
        await this.startAutoAdvance(step.intervalSeconds, !!step.loopAtEnd);
        return;
      case 'look':
        await this.applyLook(step.lookId);
        return;
      case 'clearGroup':
        await this.runClearGroup(step.groupId);
        return;
      case 'wait':
        return; // handled by the runner
    }
  }

  /** Runs a macro in the background, like the desktop app. Only one runs at a time. */
  public async runMacro(id: string): Promise<void> {
    const macro = this.macros.find((m) => m.id === id);
    if (!macro) throw new Error('That macro no longer exists.');
    const problem = validateMacro(macro);
    if (problem) throw new Error(problem);
    if (this.macroRunId) throw new Error('A macro is already running. Stop it first.');
    const runId = 'run-' + Math.random().toString(36).substring(2, 9);
    this.macroRunId = runId;

    void (async () => {
      const total = macro.steps.length;
      try {
        for (let i = 0; i < total; i++) {
          if (this.macroRunId !== runId) return;
          const step = macro.steps[i];
          this.state.runningMacro = { id: macro.id, name: macro.name, step: i + 1, total };
          this.notify();
          if (step.type === 'wait') {
            for (let t = 0; t < step.seconds * 10; t++) {
              if (this.macroRunId !== runId) return;
              await new Promise((r) => setTimeout(r, 100));
            }
          } else {
            await this.applyMacroStep(step);
          }
        }
      } catch {
        // a failing step ends the macro, like the desktop app
      } finally {
        if (this.macroRunId === runId) this.macroRunId = null;
        this.state.runningMacro = null;
        this.notify();
      }
    })();
  }

  public async stopMacro(): Promise<PresentationState> {
    this.macroRunId = null;
    this.state.runningMacro = null;
    this.notify();
    return this.state;
  }

  public async startAutoAdvance(intervalSeconds: number, loopAtEnd: boolean): Promise<PresentationState> {
    if (!Number.isInteger(intervalSeconds) || intervalSeconds < 1 || intervalSeconds > 3600) {
      throw new Error('Interval must be between 1 and 3600 seconds.');
    }
    if (!this.state.isLive || !this.state.currentSlideId) {
      throw new Error('Take a slide live first; auto-advance continues from the live slide.');
    }
    const runId = 'aa-' + Math.random().toString(36).substring(2, 9);
    this.state.autoAdvance = {
      id: runId,
      intervalSeconds,
      loopAtEnd,
      nextAtMs: Date.now() + this.slideHoldMs(intervalSeconds),
      slideId: this.state.currentSlideId,
    };
    this.notify();
    this.scheduleAutoAdvanceTick(runId);
    return this.state;
  }

  public async stopAutoAdvance(): Promise<PresentationState> {
    this.state.autoAdvance = null;
    if (this.autoAdvanceTimer) clearTimeout(this.autoAdvanceTimer);
    this.autoAdvanceTimer = null;
    this.notify();
    return this.state;
  }

  /** How long auto-advance keeps the current slide up: its own time if it has one, else the run's interval. */
  private slideHoldMs(intervalSeconds: number): number {
    const id = this.state.currentSlideId;
    const slide = this.slides.find((s) => s.id === id) ?? this.serviceItemSlides.find((s) => s.id === id);
    return (slide?.layout?.advanceSeconds ?? intervalSeconds) * 1000;
  }

  private scheduleAutoAdvanceTick(runId: string): void {
    if (this.autoAdvanceTimer) clearTimeout(this.autoAdvanceTimer);
    this.autoAdvanceTimer = setTimeout(() => void this.autoAdvanceTick(runId), 250);
  }

  private goToFirstSlide(): void {
    const ctxSlides =
      this.state.currentServiceId && this.state.currentItemId
        ? this.serviceItemSlides.filter((s) => s.presentationId === this.state.currentItemId)
        : this.slides.filter((s) => s.presentationId === this.state.currentPresentationId);
    const first = [...ctxSlides].sort((a, b) => a.sortOrder - b.sortOrder)[0];
    if (first) {
      this.state.currentSlideId = first.id;
      this.state.isLive = true;
      this.state.isLogo = false;
    }
  }

  private async autoAdvanceTick(runId: string): Promise<void> {
    const run = this.state.autoAdvance;
    if (!run || run.id !== runId) return;
    const now = Date.now();
    if (run.slideId !== this.state.currentSlideId) {
      // the operator moved to another slide: its own time starts now
      run.slideId = this.state.currentSlideId;
      run.nextAtMs = now + this.slideHoldMs(run.intervalSeconds);
    } else if (now >= run.nextAtMs) {
      if (!this.state.isLive || this.state.isBlackout) {
        run.nextAtMs = now + this.slideHoldMs(run.intervalSeconds); // paused while blank or blacked out
      } else {
        const before = this.state.currentSlideId;
        await this.nextSlide();
        if (this.state.currentSlideId === before) {
          if (run.loopAtEnd) {
            this.goToFirstSlide();
          } else {
            this.state.autoAdvance = null;
            this.notify();
            return;
          }
        }
        run.nextAtMs = now + this.slideHoldMs(run.intervalSeconds);
        run.slideId = this.state.currentSlideId;
        this.notify();
      }
    }
    if (this.state.autoAdvance?.id === runId) this.scheduleAutoAdvanceTick(runId);
  }

  private slideTemplates: SlideTemplate[] = [];

  public async listSlideTemplates(): Promise<SlideTemplate[]> {
    return this.slideTemplates.map((t) => JSON.parse(JSON.stringify(t)));
  }

  public async createSlideTemplate(template: SlideTemplate): Promise<SlideTemplate> {
    const problem = validateTemplate(template);
    if (problem) throw new Error(problem);
    if (this.slideTemplates.length >= 200) throw new Error('You can keep at most 200 templates.');
    const now = new Date().toISOString();
    const saved: SlideTemplate = {
      ...JSON.parse(JSON.stringify(template)),
      id: 'tpl-' + Math.random().toString(36).substring(2, 9),
      name: template.name.trim(),
      backgroundImage: template.backgroundImage?.trim() ? template.backgroundImage : null,
      layout: isEmptyLayout(template.layout) ? null : JSON.parse(JSON.stringify(template.layout)),
      sortOrder: this.slideTemplates.length,
      createdAt: now,
      updatedAt: now,
    };
    this.slideTemplates.push(saved);
    return JSON.parse(JSON.stringify(saved));
  }

  public async updateSlideTemplate(template: SlideTemplate): Promise<SlideTemplate> {
    const problem = validateTemplate(template);
    if (problem) throw new Error(problem);
    const idx = this.slideTemplates.findIndex((t) => t.id === template.id);
    if (idx < 0) throw new Error('That template no longer exists.');
    this.slideTemplates[idx] = {
      ...this.slideTemplates[idx],
      ...JSON.parse(JSON.stringify(template)),
      name: template.name.trim(),
      layout: isEmptyLayout(template.layout) ? null : JSON.parse(JSON.stringify(template.layout)),
      updatedAt: new Date().toISOString(),
    };
    return JSON.parse(JSON.stringify(this.slideTemplates[idx]));
  }

  public async deleteSlideTemplate(id: string): Promise<void> {
    this.slideTemplates = this.slideTemplates.filter((t) => t.id !== id);
  }

  private props: Prop[] = [];

  public async listProps(): Promise<Prop[]> {
    return this.props.map((p) => ({ ...p }));
  }

  public async createProp(prop: Prop): Promise<Prop> {
    const error = validateProp(prop);
    if (error) throw new Error(error);
    const now = new Date().toISOString();
    const saved: Prop = {
      ...prop,
      id: 'prop-' + Math.random().toString(36).substring(2, 9),
      name: prop.name.trim(),
      text: prop.text?.trim() ?? null,
      sortOrder: this.props.length,
      createdAt: now,
      updatedAt: now,
    };
    this.props.push(saved);
    return { ...saved };
  }

  public async updateProp(prop: Prop): Promise<Prop> {
    const error = validateProp(prop);
    if (error) throw new Error(error);
    const idx = this.props.findIndex((p) => p.id === prop.id);
    if (idx < 0) throw new Error('That prop no longer exists.');
    this.props[idx] = { ...this.props[idx], ...prop, name: prop.name.trim(), updatedAt: new Date().toISOString() };
    this.syncActiveProps();
    return { ...this.props[idx] };
  }

  public async deleteProp(id: string): Promise<void> {
    this.props = this.props.filter((p) => p.id !== id);
    this.syncActiveProps();
  }

  public async toggleProp(id: string): Promise<PresentationState> {
    const active = this.state.activeProps || [];
    if (active.some((p) => p.id === id)) {
      this.state.activeProps = active.filter((p) => p.id !== id);
    } else {
      const prop = this.props.find((p) => p.id === id);
      if (!prop) throw new Error('That prop no longer exists.');
      this.state.activeProps = [...active, { ...prop }];
    }
    this.notify();
    return this.state;
  }

  public async clearProps(): Promise<PresentationState> {
    this.state.activeProps = [];
    this.notify();
    return this.state;
  }

  /** Keeps the on-screen copies of props in step with the saved ones. */
  private syncActiveProps(): void {
    this.state.activeProps = (this.state.activeProps || [])
      .map((a) => this.props.find((p) => p.id === a.id))
      .filter((p): p is Prop => !!p)
      .map((p) => ({ ...p }));
    this.notify();
  }

  public async sendAlert(message: string, durationSeconds?: number): Promise<PresentationState> {
    const text = message.trim();
    if (!text) throw new Error('Alert message cannot be empty.');
    if ([...text].length > 200) throw new Error('Alert message is too long (maximum 200 characters).');
    const secs = durationSeconds ?? 30;
    this.state.alert = {
      id: 'alert-' + Math.random().toString(36).substring(2, 9),
      message: text,
      expiresAtMs: secs === 0 ? null : Date.now() + Math.min(secs, 3600) * 1000,
    };
    this.notify();
    return this.state;
  }

  public async clearAlert(): Promise<PresentationState> {
    this.state.alert = null;
    this.notify();
    return this.state;
  }

  public async clearMedia(): Promise<PresentationState> {
    this.state.mediaPlayback = null;
    this.notify();
    return this.state;
  }

  public async clearAll(): Promise<PresentationState> {
    this.state.isLive = false;
    this.state.isLogo = false;
    this.state.isBlackout = false;
    this.state.mediaPlayback = null;
    this.state.alert = null;
    this.state.activeProps = [];
    this.state.autoAdvance = null;
    if (this.autoAdvanceTimer) clearTimeout(this.autoAdvanceTimer);
    this.autoAdvanceTimer = null;
    this.notify();
    return this.state;
  }

  public async toggleLogo(): Promise<boolean> {
    this.state.isLogo = !this.state.isLogo;
    this.notify();
    return !!this.state.isLogo;
  }

  public async toggleBlackout(): Promise<boolean> {
    this.state.isBlackout = !this.state.isBlackout;
    this.notify();
    return this.state.isBlackout;
  }

  public async nextSlide(): Promise<PresentationState> {
    if (this.state.currentServiceId && this.state.currentItemId) {
      const itemSlides = this.serviceItemSlides
        .filter((s) => s.presentationId === this.state.currentItemId)
        .sort((a, b) => a.sortOrder - b.sortOrder);
      const currIdx = itemSlides.findIndex((s) => s.id === this.state.currentSlideId);
      if (currIdx >= 0 && currIdx + 1 < itemSlides.length) {
        this.state.currentSlideId = itemSlides[currIdx + 1].id;
        this.state.isLive = true;
        this.state.isLogo = false;
        this.notify();
      } else {
        // Boundary transition: first slide of next item with slides
        const items = this.serviceItems
          .filter((it) => it.serviceId === this.state.currentServiceId)
          .sort((a, b) => a.sortOrder - b.sortOrder);
        const itemIdx = items.findIndex((it) => it.id === this.state.currentItemId);
        if (itemIdx >= 0) {
          for (let i = itemIdx + 1; i < items.length; i++) {
            const nextSlides = this.serviceItemSlides
              .filter((s) => s.presentationId === items[i].id)
              .sort((a, b) => a.sortOrder - b.sortOrder);
            if (nextSlides.length > 0) {
              this.state.currentItemId = items[i].id;
              this.state.currentSlideId = nextSlides[0].id;
              this.state.isLive = true;
              this.state.isLogo = false;
              this.notify();
              break;
            }
          }
        }
      }
      return this.state;
    }

    if (!this.state.currentPresentationId) return this.state;
    const slides = this.slides
      .filter((s) => s.presentationId === this.state.currentPresentationId)
      .sort((a, b) => a.sortOrder - b.sortOrder);

    const currIdx = slides.findIndex((s) => s.id === this.state.currentSlideId);
    if (currIdx >= 0 && currIdx + 1 < slides.length) {
      this.state.currentSlideId = slides[currIdx + 1].id;
      this.state.isLive = true;
      this.state.isLogo = false;
      this.notify();
    }
    return this.state;
  }

  public async previousSlide(): Promise<PresentationState> {
    if (this.state.currentServiceId && this.state.currentItemId) {
      const itemSlides = this.serviceItemSlides
        .filter((s) => s.presentationId === this.state.currentItemId)
        .sort((a, b) => a.sortOrder - b.sortOrder);
      const currIdx = itemSlides.findIndex((s) => s.id === this.state.currentSlideId);
      if (currIdx > 0) {
        this.state.currentSlideId = itemSlides[currIdx - 1].id;
        this.state.isLive = true;
        this.state.isLogo = false;
        this.notify();
      } else {
        // Boundary transition: last slide of previous item with slides
        const items = this.serviceItems
          .filter((it) => it.serviceId === this.state.currentServiceId)
          .sort((a, b) => a.sortOrder - b.sortOrder);
        const itemIdx = items.findIndex((it) => it.id === this.state.currentItemId);
        if (itemIdx > 0) {
          for (let i = itemIdx - 1; i >= 0; i--) {
            const prevSlides = this.serviceItemSlides
              .filter((s) => s.presentationId === items[i].id)
              .sort((a, b) => a.sortOrder - b.sortOrder);
            if (prevSlides.length > 0) {
              this.state.currentItemId = items[i].id;
              this.state.currentSlideId = prevSlides[prevSlides.length - 1].id;
              this.state.isLive = true;
              this.state.isLogo = false;
              this.notify();
              break;
            }
          }
        }
      }
      return this.state;
    }

    if (!this.state.currentPresentationId) return this.state;
    const slides = this.slides
      .filter((s) => s.presentationId === this.state.currentPresentationId)
      .sort((a, b) => a.sortOrder - b.sortOrder);

    const currIdx = slides.findIndex((s) => s.id === this.state.currentSlideId);
    if (currIdx > 0) {
      this.state.currentSlideId = slides[currIdx - 1].id;
      this.state.isLive = true;
      this.state.isLogo = false;
      this.notify();
    }
    return this.state;
  }

  public async getPresentationState(): Promise<PresentationState> {
    this.updateStatePointers();
    return JSON.parse(JSON.stringify(this.state));
  }

  public async getAvailableMonitors(): Promise<DisplayMonitor[]> {
    return [
      {
        id: 'primary-monitor',
        name: 'Built-in Display / Laptop Screen',
        width: 1920,
        height: 1080,
        x: 0,
        y: 0,
        scaleFactor: 1.0,
        isPrimary: true,
      },
      {
        id: 'external-projector',
        name: 'HDMI-1 Projector / Sanctuary Output',
        width: 1920,
        height: 1080,
        x: 1920,
        y: 0,
        scaleFactor: 1.0,
        isPrimary: false,
      },
    ];
  }

  public async getAudienceStatus(): Promise<AudienceWindowStatus> {
    return {
      isOpen: false,
      monitorName: null,
      isFullscreen: false,
    };
  }

  // ================= Phase 2: Songs Mock Methods =================

  public async listSongs(
    sortBy?: string,
    language?: string,
    category?: string
  ): Promise<Song[]> {
    let result = [...this.songs];
    if (language) {
      result = result.filter((s) => s.language === language);
    }
    if (category) {
      result = result.filter((s) => s.category === category);
    }

    if (sortBy === 'recently_modified') {
      result.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    } else if (sortBy === 'language') {
      result.sort((a, b) => a.language.localeCompare(b.language) || a.title.localeCompare(b.title));
    } else {
      result.sort((a, b) => a.title.localeCompare(b.title));
    }

    return result.map((s) => ({
      ...s,
      sectionsCount: this.songSections.filter((sec) => sec.songId === s.id).length,
    }));
  }

  public async getSong(id: string): Promise<Song | null> {
    const s = this.songs.find((x) => x.id === id);
    if (!s) return null;
    return {
      ...s,
      sectionsCount: this.songSections.filter((sec) => sec.songId === s.id).length,
    };
  }

  public async getSongWithSections(id: string): Promise<SongWithSections | null> {
    const s = this.songs.find((x) => x.id === id);
    if (!s) return null;
    const secs = this.songSections
      .filter((sec) => sec.songId === id)
      .sort((a, b) => a.sortOrder - b.sortOrder);
    return {
      song: {
        ...s,
        sectionsCount: secs.length,
      },
      sections: secs,
    };
  }

  public async createSong(songData: Partial<Song>): Promise<Song> {
    const newSong: Song = {
      id: songData.id || 'song-' + Math.random().toString(36).substring(2, 9),
      title: songData.title?.trim() || 'Untitled Song',
      alternateTitle: songData.alternateTitle || null,
      language: songData.language || 'English',
      author: songData.author || null,
      composer: songData.composer || null,
      copyright: songData.copyright || null,
      ccliNumber: songData.ccliNumber || null,
      songKey: songData.songKey || null,
      tempo: songData.tempo || null,
      tags: songData.tags || [],
      category: songData.category || 'Worship',
      defaultThemeId: songData.defaultThemeId || 'theme-default-dark',
      sectionsCount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.songs.push(newSong);
    return newSong;
  }

  public async createSongWithSections(
    songData: Partial<Song>,
    sections?: SongSection[]
  ): Promise<SongWithSections> {
    const newSong: Song = {
      id: songData.id || 'song-' + Math.random().toString(36).substring(2, 9),
      title: songData.title?.trim() || 'Untitled Song',
      alternateTitle: songData.alternateTitle || null,
      language: songData.language || 'English',
      author: songData.author || null,
      composer: songData.composer || null,
      copyright: songData.copyright || null,
      ccliNumber: songData.ccliNumber || null,
      songKey: songData.songKey || null,
      tempo: songData.tempo || null,
      tags: songData.tags || [],
      category: songData.category || 'Worship',
      defaultThemeId: songData.defaultThemeId || 'theme-default-dark',
      sectionsCount: sections?.length || 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.songs.push(newSong);

    const savedSections: SongSection[] = [];
    if (sections && sections.length > 0) {
      sections.forEach((sec, idx) => {
        const s: SongSection = {
          ...sec,
          id: sec.id || 'sec-' + Math.random().toString(36).substring(2, 9),
          songId: newSong.id,
          sortOrder: idx,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        this.songSections.push(s);
        savedSections.push(s);
      });
    }

    return {
      song: newSong,
      sections: savedSections,
    };
  }

  public async updateSong(songData: Song): Promise<Song> {
    const s = this.songs.find((x) => x.id === songData.id);
    if (!s) throw new Error('Song not found');
    Object.assign(s, songData, { updatedAt: new Date().toISOString() });
    return s;
  }

  public async deleteSong(id: string): Promise<void> {
    this.songs = this.songs.filter((s) => s.id !== id);
    this.songSections = this.songSections.filter((sec) => sec.songId !== id);
  }

  public async duplicateSong(id: string): Promise<SongWithSections> {
    const orig = this.songs.find((s) => s.id === id);
    if (!orig) throw new Error('Song not found');

    const newSongId = 'song-' + Math.random().toString(36).substring(2, 9);
    const dupSong: Song = {
      ...orig,
      id: newSongId,
      title: `${orig.title} (Copy)`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.songs.push(dupSong);

    const origSections = this.songSections.filter((sec) => sec.songId === id);
    const idMap = new Map<string, string>();
    const dupSections: SongSection[] = origSections.map((sec) => {
      const s: SongSection = {
        ...sec,
        id: 'sec-' + Math.random().toString(36).substring(2, 9),
        songId: newSongId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      idMap.set(sec.id, s.id);
      this.songSections.push(s);
      return s;
    });
    const arrangements = this.insertMappedArrangements(
      newSongId,
      this.songArrangements.filter((a) => a.songId === id),
      idMap
    );

    return { song: dupSong, sections: dupSections, arrangements };
  }

  public async searchSongs(
    query: string,
    language?: string,
    category?: string
  ): Promise<Song[]> {
    const q = query.trim().toLowerCase();
    let result = this.songs.filter((s) => {
      const titleMatch = s.title.toLowerCase().includes(q);
      const altMatch = s.alternateTitle?.toLowerCase().includes(q) ?? false;
      const authorMatch = s.author?.toLowerCase().includes(q) ?? false;
      const tagsMatch = s.tags.some((t) => t.toLowerCase().includes(q));

      const sections = this.songSections.filter((sec) => sec.songId === s.id);
      const lyricsMatch = sections.some((sec) => sec.lyrics.toLowerCase().includes(q));

      return titleMatch || altMatch || authorMatch || tagsMatch || lyricsMatch;
    });

    if (language) {
      result = result.filter((s) => s.language === language);
    }
    if (category) {
      result = result.filter((s) => s.category === category);
    }

    return result.map((s) => ({
      ...s,
      sectionsCount: this.songSections.filter((sec) => sec.songId === s.id).length,
    }));
  }

  public async getSongSections(songId: string): Promise<SongSection[]> {
    return this.songSections
      .filter((s) => s.songId === songId)
      .sort((a, b) => a.sortOrder - b.sortOrder);
  }

  private songArrangements: SongArrangement[] = [];

  public async getSongArrangements(songId: string): Promise<SongArrangement[]> {
    return this.songArrangements.filter((a) => a.songId === songId);
  }

  public async saveSongArrangements(
    songId: string,
    arrangements: SongArrangement[]
  ): Promise<SongArrangement[]> {
    const valid = new Set(this.songSections.filter((s) => s.songId === songId).map((s) => s.id));
    let defaultTaken = false;
    const saved = arrangements.map((a, idx) => {
      const isDefault = a.isDefault && !defaultTaken;
      defaultTaken = defaultTaken || isDefault;
      return {
        id: a.id || 'arr-' + Math.random().toString(36).substring(2, 9),
        songId,
        name: a.name.trim() || `Arrangement ${idx + 1}`,
        sectionIds: a.sectionIds.filter((id) => valid.has(id)),
        isDefault,
      };
    });
    this.songArrangements = this.songArrangements.filter((a) => a.songId !== songId).concat(saved);
    return saved;
  }

  /** Stores copies of `arrangements` for `songId`, translating section ids; empty ones are dropped. */
  private insertMappedArrangements(
    songId: string,
    arrangements: SongArrangement[],
    idMap: Map<string, string>
  ): SongArrangement[] {
    let defaultTaken: boolean = false;
    const added: SongArrangement[] = [];
    for (const arr of arrangements) {
      const sectionIds = arr.sectionIds
        .map((id) => idMap.get(id))
        .filter((id): id is string => !!id);
      if (sectionIds.length === 0) continue;
      const isDefault: boolean = arr.isDefault && !defaultTaken;
      defaultTaken = defaultTaken || isDefault;
      added.push({
        id: 'arr-' + Math.random().toString(36).substring(2, 9),
        songId,
        name: arr.name.trim() || `Arrangement ${added.length + 1}`,
        sectionIds,
        isDefault,
      });
    }
    this.songArrangements.push(...added);
    return added;
  }

  /** Sections in playing order: requested arrangement, else the default one, else all. */
  private orderedSongSections(songId: string, arrangementId?: string | null): SongSection[] {
    const all = this.songSections
      .filter((s) => s.songId === songId)
      .sort((a, b) => a.sortOrder - b.sortOrder);
    const arrs = this.songArrangements.filter((a) => a.songId === songId);
    const chosen = arrangementId ? arrs.find((a) => a.id === arrangementId) : arrs.find((a) => a.isDefault);
    if (chosen) {
      const ordered = chosen.sectionIds
        .map((id) => all.find((s) => s.id === id))
        .filter((s): s is SongSection => !!s);
      if (ordered.length > 0) return ordered;
    }
    return all;
  }

  public async saveSongSections(
    songId: string,
    sections: SongSection[]
  ): Promise<SongSection[]> {
    this.songSections = this.songSections.filter((s) => s.songId !== songId);
    const saved = sections.map((sec, idx) => ({
      ...sec,
      id: sec.id || 'sec-' + Math.random().toString(36).substring(2, 9),
      songId,
      sortOrder: idx,
      createdAt: sec.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }));
    this.songSections.push(...saved);

    const song = this.songs.find((s) => s.id === songId);
    if (song) {
      song.sectionsCount = saved.length;
      song.updatedAt = new Date().toISOString();
    }

    return saved;
  }

  // ================= Phase 2: Themes Mock Methods =================

  public async listThemes(): Promise<Theme[]> {
    return [...this.themes].sort((a, b) => (b.isBuiltIn ? 1 : 0) - (a.isBuiltIn ? 1 : 0));
  }

  public async getTheme(id: string): Promise<Theme | null> {
    return this.themes.find((t) => t.id === id) || null;
  }

  public async createTheme(themeData: Partial<Theme>): Promise<Theme> {
    const themeProblem = validateLayout(themeData.layout);
    if (themeProblem) throw new Error(themeProblem);
    const newTheme: Theme = {
      id: 'theme-' + Math.random().toString(36).substring(2, 9),
      name: themeData.name || 'Custom Theme',
      isBuiltIn: false,
      backgroundColor: themeData.backgroundColor || '#0a0f1d',
      backgroundImageId: themeData.backgroundImageId || null,
      backgroundImagePath: themeData.backgroundImagePath || null,
      backgroundMode: themeData.backgroundMode || 'cover',
      fontFamily: themeData.fontFamily || 'system-ui, -apple-system, sans-serif',
      fontSize: themeData.fontSize || 'large',
      fontWeight: themeData.fontWeight || 'bold',
      textColor: themeData.textColor || '#ffffff',
      textAlignment: themeData.textAlignment || 'center',
      verticalAlignment: themeData.verticalAlignment || 'center',
      lineSpacing: themeData.lineSpacing || 1.35,
      textMargin: themeData.textMargin || 6,
      textShadow: themeData.textShadow || null,
      overlayColor: themeData.overlayColor || null,
      layout: isEmptyLayout(themeData.layout) ? null : { ...themeData.layout },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.themes.push(newTheme);
    return newTheme;
  }

  public async updateTheme(themeData: Theme): Promise<Theme> {
    const t = this.themes.find((x) => x.id === themeData.id);
    if (!t) throw new Error('Theme not found');
    const problem = validateLayout(themeData.layout);
    if (problem) throw new Error(problem);
    Object.assign(t, themeData, {
      layout: isEmptyLayout(themeData.layout) ? null : { ...themeData.layout },
      updatedAt: new Date().toISOString(),
    });
    return t;
  }

  public async deleteTheme(id: string): Promise<void> {
    const t = this.themes.find((x) => x.id === id);
    if (!t) throw new Error('Theme not found');
    if (t.isBuiltIn) {
      throw new Error('Cannot delete built-in theme');
    }
    this.themes = this.themes.filter((x) => x.id !== id);
  }

  public async duplicateTheme(id: string): Promise<Theme> {
    const orig = this.themes.find((x) => x.id === id);
    if (!orig) throw new Error('Theme not found');
    const dup: Theme = {
      ...orig,
      id: 'theme-' + Math.random().toString(36).substring(2, 9),
      name: `${orig.name} (Copy)`,
      isBuiltIn: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.themes.push(dup);
    return dup;
  }

  // ================= Phase 2 & 4: Media Assets Mock Methods =================

  public async listMediaAssets(): Promise<MediaAsset[]> {
    return [...this.mediaAssets];
  }

  public async getMediaAsset(id: string): Promise<MediaAsset | null> {
    const asset = this.mediaAssets.find((m) => m.id === id);
    return asset ? { ...asset } : null;
  }

  public async checkMediaAssetUsage(id: string): Promise<number> {
    let count = 0;
    for (const t of this.themes) {
      if (t.backgroundImageId === id || t.backgroundImagePath?.includes(id)) count++;
    }
    for (const s of this.slides) {
      if (s.backgroundImage?.includes(id)) count++;
    }
    for (const s of this.serviceItemSlides) {
      if (s.backgroundImage?.includes(id)) count++;
    }
    return count;
  }

  public async importMediaAsset(sourcePath: string): Promise<MediaAsset> {
    const filename = sourcePath.split(/[\/\\]/).pop() || 'media.png';
    const ext = filename.split('.').pop()?.toLowerCase() || 'png';
    let mimeType = 'image/png';
    let mediaType: 'image' | 'video' | 'audio' = 'image';

    if (['jpg', 'jpeg'].includes(ext)) {
      mimeType = 'image/jpeg';
      mediaType = 'image';
    } else if (ext === 'png') {
      mimeType = 'image/png';
      mediaType = 'image';
    } else if (ext === 'webp') {
      mimeType = 'image/webp';
      mediaType = 'image';
    } else if (ext === 'gif') {
      mimeType = 'image/gif';
      mediaType = 'image';
    } else if (ext === 'svg') {
      mimeType = 'image/svg+xml';
      mediaType = 'image';
    } else if (ext === 'mp4') {
      mimeType = 'video/mp4';
      mediaType = 'video';
    } else if (ext === 'webm') {
      mimeType = 'video/webm';
      mediaType = 'video';
    } else if (ext === 'mov') {
      mimeType = 'video/quicktime';
      mediaType = 'video';
    } else if (ext === 'mkv') {
      mimeType = 'video/x-matroska';
      mediaType = 'video';
    } else if (ext === 'mp3') {
      mimeType = 'audio/mpeg';
      mediaType = 'audio';
    } else if (ext === 'wav') {
      mimeType = 'audio/wav';
      mediaType = 'audio';
    } else if (ext === 'ogg') {
      mimeType = 'audio/ogg';
      mediaType = 'audio';
    } else if (ext === 'aac') {
      mimeType = 'audio/aac';
      mediaType = 'audio';
    } else if (ext === 'm4a') {
      mimeType = 'audio/mp4';
      mediaType = 'audio';
    } else if (ext === 'flac') {
      mimeType = 'audio/flac';
      mediaType = 'audio';
    } else {
      throw new Error(
        `Unsupported media format '${ext}'. Supported formats: JPG, PNG, WEBP, GIF, SVG, MP4, WEBM, MOV, MKV, MP3, WAV, OGG, AAC, M4A, FLAC`
      );
    }

    const asset: MediaAsset = {
      id: 'media-' + Math.random().toString(36).substring(2, 9),
      filename,
      originalFilename: filename,
      relativePath: `media/${filename}`,
      mimeType,
      mediaType,
      fileSize: 1024 * 150,
      createdAt: new Date().toISOString(),
    };
    this.mediaAssets.push(asset);
    return asset;
  }

  public async deleteMediaAsset(id: string): Promise<void> {
    this.mediaAssets = this.mediaAssets.filter((m) => m.id !== id);
  }

  // ================= Phase 2: Slide Generation & Interchange =================

  public async generateSlidesFromSong(
    options: SlideGenerationOptions
  ): Promise<GenerateSlidesResponse> {
    const song = this.songs.find((s) => s.id === options.songId);
    if (!song) throw new Error('Song not found');

    const sections = this.songSections
      .filter((s) => s.songId === options.songId)
      .sort((a, b) => a.sortOrder - b.sortOrder);

    const targetSecs =
      options.sectionIds.length > 0
        ? options.sectionIds
            .map((id) => sections.find((s) => s.id === id))
            .filter((s): s is SongSection => !!s)
        : this.orderedSongSections(options.songId, options.arrangementId);

    const theme =
      this.themes.find((t) => t.id === options.themeId) ||
      this.themes.find((t) => t.id === song.defaultThemeId) ||
      this.themes[0];

    let presentationId = options.targetPresentationId;
    if (options.createNewPresentation || !presentationId) {
      const pres = await this.createPresentation(
        options.newPresentationTitle || song.title,
        'Worship',
        theme?.name
      );
      presentationId = pres.id;
    }

    const createdSlides: Slide[] = [];

    for (const sec of targetSecs) {
      let blocks: string[] = [];

      if (options.customDelimiter && sec.lyrics.includes(options.customDelimiter)) {
        blocks = sec.lyrics
          .split(options.customDelimiter)
          .map((s) => s.trim())
          .filter((s) => s.length > 0);
      } else if (options.linesPerSlide && options.linesPerSlide > 0) {
        const lines = sec.lyrics
          .split('\n')
          .map((l) => l.trim())
          .filter((l) => l.length > 0);
        for (let i = 0; i < lines.length; i += options.linesPerSlide) {
          blocks.push(lines.slice(i, i + options.linesPerSlide).join('\n'));
        }
      } else {
        blocks = sec.lyrics
          .split(/\n\s*\n/)
          .map((s) => s.trim())
          .filter((s) => s.length > 0);
        if (blocks.length === 0 && sec.lyrics.trim().length > 0) {
          blocks = [sec.lyrics.trim()];
        }
      }

      for (let i = 0; i < blocks.length; i++) {
        const title = blocks.length > 1 ? `${sec.label} (${i + 1}/${blocks.length})` : sec.label;
        const slide = await this.createSlide(presentationId, {
          title,
          body: blocks[i],
          backgroundColor: theme?.backgroundColor || '#0a0f1d',
          foregroundColor: theme?.textColor || '#ffffff',
          fontSize: theme?.fontSize || 'large',
          textAlignment: theme?.textAlignment || 'center',
          themeOverride: theme?.name || null,
          backgroundImage: theme?.backgroundImagePath || null,
          overlayColor: theme?.overlayColor || null,
          lineSpacing: theme?.lineSpacing || null,
          textShadow: theme?.textShadow || null,
          verticalAlignment: theme?.verticalAlignment || null,
          fontFamily: theme?.fontFamily || null,
          fontWeight: theme?.fontWeight || null,
          groupLabel: sec.label,
          groupColor: sectionColor(sec),
          layout: theme?.layout ?? null,
        });
        createdSlides.push(slide);
      }
    }

    return {
      presentationId,
      slides: createdSlides,
    };
  }

  public async exportSong(songId: string): Promise<SongExportData> {
    const song = this.songs.find((s) => s.id === songId);
    if (!song) throw new Error('Song not found');
    const sections = this.songSections.filter((s) => s.songId === songId);
    const theme = this.themes.find((t) => t.id === song.defaultThemeId);

    return {
      version: '1.0.0',
      exportedAt: new Date().toISOString(),
      app: 'ChurchPresenter',
      songs: [
        {
          song: { ...song },
          sections: sections.map((s) => ({ ...s })),
          arrangements: this.songArrangements.filter((a) => a.songId === songId).map((a) => ({ ...a })),
        },
      ],
      themes: theme ? [theme] : [],
    };
  }

  public async exportAllSongs(songIds?: string[]): Promise<SongExportData> {
    const songsToExport = songIds
      ? this.songs.filter((s) => songIds.includes(s.id))
      : this.songs;

    const songsWithSections: SongWithSections[] = songsToExport.map((song) => ({
      song: { ...song },
      sections: this.songSections
        .filter((s) => s.songId === song.id)
        .map((s) => ({ ...s })),
      arrangements: this.songArrangements.filter((a) => a.songId === song.id).map((a) => ({ ...a })),
    }));

    return {
      version: '1.0.0',
      exportedAt: new Date().toISOString(),
      app: 'ChurchPresenter',
      songs: songsWithSections,
      themes: this.themes,
    };
  }

  public async importSongs(
    data: SongExportData,
    options: SongImportOptions
  ): Promise<SongImportResult> {
    if (!data || !data.version || !Array.isArray(data.songs)) {
      throw new Error(
        'Invalid song interchange format: missing required "songs" array'
      );
    }

    let imported = 0;
    let updated = 0;
    let skipped = 0;

    for (const item of data.songs) {
      const existing = this.songs.find(
        (s) => s.id === item.song.id || s.title.toLowerCase() === item.song.title.toLowerCase()
      );

      if (existing) {
        if (options.duplicateMode === 'skip') {
          skipped++;
          continue;
        } else if (options.duplicateMode === 'copy') {
          const newId = 'song-' + Math.random().toString(36).substring(2, 9);
          const copySong: Song = {
            ...item.song,
            id: newId,
            title: `${item.song.title} (Imported)`,
          };
          this.songs.push(copySong);
          const copyMap = new Map<string, string>();
          item.sections.forEach((sec, idx) => {
            const sid = 'sec-' + Math.random().toString(36).substring(2, 9);
            copyMap.set(sec.id, sid);
            this.songSections.push({ ...sec, id: sid, songId: newId, sortOrder: idx });
          });
          this.insertMappedArrangements(newId, item.arrangements || [], copyMap);
          imported++;
        } else {
          // update
          Object.assign(existing, item.song);
          this.songSections = this.songSections.filter((s) => s.songId !== existing.id);
          // old arrangements point at the sections removed above
          this.songArrangements = this.songArrangements.filter((a) => a.songId !== existing.id);
          const updateMap = new Map<string, string>();
          item.sections.forEach((sec, idx) => {
            const sid = 'sec-' + Math.random().toString(36).substring(2, 9);
            updateMap.set(sec.id, sid);
            this.songSections.push({ ...sec, id: sid, songId: existing.id, sortOrder: idx });
          });
          this.insertMappedArrangements(existing.id, item.arrangements || [], updateMap);
          updated++;
        }
      } else {
        const newSong = { ...item.song };
        this.songs.push(newSong);
        const newMap = new Map<string, string>();
        item.sections.forEach((sec, idx) => {
          const sid = sec.id || 'sec-' + Math.random().toString(36).substring(2, 9);
          newMap.set(sec.id, sid);
          this.songSections.push({ ...sec, id: sid, songId: newSong.id, sortOrder: idx });
        });
        this.insertMappedArrangements(newSong.id, item.arrangements || [], newMap);
        imported++;
      }
    }

    return {
      importedCount: imported,
      updatedCount: updated,
      skippedCount: skipped,
      errorCount: 0,
      errors: [],
    };
  }

  // ================= Phase 3 Services & Service Items =================

  public async listServices(): Promise<Service[]> {
    return this.services.map((s) => ({
      ...s,
      itemCount: this.serviceItems.filter((it) => it.serviceId === s.id).length,
    }));
  }

  public async getService(id: string): Promise<Service | null> {
    const s = this.services.find((x) => x.id === id);
    if (!s) return null;
    return {
      ...s,
      itemCount: this.serviceItems.filter((it) => it.serviceId === s.id).length,
    };
  }

  public async getServiceWithItems(id: string): Promise<ServiceWithItems | null> {
    const service = await this.getService(id);
    if (!service) return null;
    const items = await this.getServiceItems(id);
    return { service, items };
  }

  public async createService(service: Partial<Service>): Promise<Service> {
    const newService: Service = {
      id: service.id || 'srv-' + Math.random().toString(36).substring(2, 9),
      title: service.title || 'Untitled Service',
      description: service.description || null,
      serviceDate: service.serviceDate || null,
      category: service.category || 'Sunday Worship',
      notes: service.notes || null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      itemCount: 0,
    };
    this.services.unshift(newService);
    return newService;
  }

  public async updateService(service: Service): Promise<Service> {
    const idx = this.services.findIndex((s) => s.id === service.id);
    if (idx === -1) throw new Error('Service not found');
    const updated = {
      ...service,
      updatedAt: new Date().toISOString(),
      itemCount: this.serviceItems.filter((it) => it.serviceId === service.id).length,
    };
    this.services[idx] = updated;
    return updated;
  }

  public async deleteService(id: string): Promise<void> {
    this.services = this.services.filter((s) => s.id !== id);
    const itemIds = this.serviceItems.filter((it) => it.serviceId === id).map((it) => it.id);
    this.serviceItems = this.serviceItems.filter((it) => it.serviceId !== id);
    this.serviceItemSlides = this.serviceItemSlides.filter((s) => !itemIds.includes(s.presentationId));
  }

  public async duplicateService(id: string, newTitle?: string): Promise<Service> {
    const orig = await this.getService(id);
    if (!orig) throw new Error('Service not found');
    const items = await this.getServiceItems(id);

    const newServiceId = 'srv-' + Math.random().toString(36).substring(2, 9);
    const title = newTitle || `${orig.title} (Copy)`;
    const now = new Date().toISOString();

    const duplicated: Service = {
      ...orig,
      id: newServiceId,
      title,
      createdAt: now,
      updatedAt: now,
      itemCount: items.length,
    };
    this.services.unshift(duplicated);

    for (const item of items) {
      const newItemId = 'item-' + Math.random().toString(36).substring(2, 9);
      const slides = await this.getServiceItemSlides(item.id);
      this.serviceItems.push({
        ...item,
        id: newItemId,
        serviceId: newServiceId,
        createdAt: now,
        updatedAt: now,
      });

      for (const s of slides) {
        this.serviceItemSlides.push({
          ...s,
          id: 'slide-' + Math.random().toString(36).substring(2, 9),
          presentationId: newItemId,
          createdAt: now,
          updatedAt: now,
        });
      }
    }

    return duplicated;
  }

  public async getServiceItems(serviceId: string): Promise<PlaylistItem[]> {
    return this.serviceItems
      .filter((it) => it.serviceId === serviceId)
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((it) => ({
        ...it,
        slideCount: this.serviceItemSlides.filter((s) => s.presentationId === it.id).length,
      }));
  }

  public async getServiceItem(itemId: string): Promise<PlaylistItem | null> {
    const it = this.serviceItems.find((x) => x.id === itemId);
    if (!it) return null;
    return {
      ...it,
      slideCount: this.serviceItemSlides.filter((s) => s.presentationId === it.id).length,
    };
  }

  public async getServiceItemWithSlides(itemId: string): Promise<PlaylistItemWithSlides | null> {
    const item = await this.getServiceItem(itemId);
    if (!item) return null;
    const slides = await this.getServiceItemSlides(itemId);
    return { item, slides };
  }

  public async addServiceItem(
    item: Partial<PlaylistItem>,
    slides?: Slide[]
  ): Promise<PlaylistItem> {
    const nextOrder =
      this.serviceItems
        .filter((it) => it.serviceId === item.serviceId)
        .reduce((max, it) => Math.max(max, it.sortOrder), -1) + 1;

    const id = item.id || 'item-' + Math.random().toString(36).substring(2, 9);
    const now = new Date().toISOString();

    const newItem: PlaylistItem = {
      id,
      serviceId: item.serviceId!,
      sortOrder: item.sortOrder !== undefined && item.sortOrder >= 0 ? item.sortOrder : nextOrder,
      itemType: item.itemType || 'text',
      title: item.title || 'Untitled Item',
      notes: item.notes || null,
      sourceId: item.sourceId || null,
      themeId: item.themeId || null,
      durationSeconds: item.durationSeconds || null,
      createdAt: now,
      updatedAt: now,
      slideCount: slides ? slides.length : 0,
    };

    this.serviceItems.push(newItem);

    if (slides && slides.length > 0) {
      slides.forEach((s, idx) => {
        this.serviceItemSlides.push({
          ...s,
          id: s.id || 'slide-' + Math.random().toString(36).substring(2, 9),
          presentationId: id,
          sortOrder: idx,
          createdAt: now,
          updatedAt: now,
        });
      });
    }

    return newItem;
  }

  public async updateServiceItem(item: PlaylistItem): Promise<PlaylistItem> {
    const idx = this.serviceItems.findIndex((it) => it.id === item.id);
    if (idx === -1) throw new Error('Service item not found');
    const now = new Date().toISOString();
    const updated = {
      ...item,
      updatedAt: now,
      slideCount: this.serviceItemSlides.filter((s) => s.presentationId === item.id).length,
    };
    this.serviceItems[idx] = updated;
    return updated;
  }

  public async deleteServiceItem(itemId: string): Promise<void> {
    this.serviceItems = this.serviceItems.filter((it) => it.id !== itemId);
    this.serviceItemSlides = this.serviceItemSlides.filter((s) => s.presentationId !== itemId);
  }

  public async reorderServiceItems(serviceId: string, itemIds: string[]): Promise<void> {
    itemIds.forEach((id, idx) => {
      const it = this.serviceItems.find((x) => x.id === id && x.serviceId === serviceId);
      if (it) it.sortOrder = idx;
    });
  }

  public async duplicateServiceItem(itemId: string): Promise<PlaylistItem> {
    const orig = await this.getServiceItem(itemId);
    if (!orig) throw new Error('Service item not found');
    const slides = await this.getServiceItemSlides(itemId);

    const newItem: Partial<PlaylistItem> = {
      serviceId: orig.serviceId,
      sortOrder: orig.sortOrder + 1,
      itemType: orig.itemType,
      title: `${orig.title} (Copy)`,
      notes: orig.notes,
      sourceId: orig.sourceId,
      themeId: orig.themeId,
      durationSeconds: orig.durationSeconds,
    };

    this.serviceItems
      .filter((it) => it.serviceId === orig.serviceId && it.sortOrder > orig.sortOrder)
      .forEach((it) => it.sortOrder++);

    const newSlides = slides.map((s) => ({
      ...s,
      id: 'slide-' + Math.random().toString(36).substring(2, 9),
    }));

    return this.addServiceItem(newItem, newSlides);
  }

  public async getServiceItemSlides(itemId: string): Promise<Slide[]> {
    return this.serviceItemSlides
      .filter((s) => s.presentationId === itemId)
      .sort((a, b) => a.sortOrder - b.sortOrder);
  }

  public async saveServiceItemSlides(itemId: string, slides: Slide[]): Promise<Slide[]> {
    this.serviceItemSlides = this.serviceItemSlides.filter((s) => s.presentationId !== itemId);
    const now = new Date().toISOString();
    const saved: Slide[] = slides.map((s, idx) => ({
      ...s,
      id: s.id || 'slide-' + Math.random().toString(36).substring(2, 9),
      presentationId: itemId,
      sortOrder: idx,
      createdAt: s.createdAt || now,
      updatedAt: now,
    }));
    this.serviceItemSlides.push(...saved);
    this.notify();
    return saved;
  }

  public async addSongToService(
    serviceId: string,
    songId: string,
    themeId?: string,
    linesPerSlide?: number,
    arrangementId?: string
  ): Promise<PlaylistItem> {
    const song = await this.getSong(songId);
    if (!song) throw new Error('Song not found');
    const sections = this.orderedSongSections(songId, arrangementId);

    const effThemeId = themeId || song.defaultThemeId || 'theme-default-dark';
    const theme = (await this.getTheme(effThemeId)) || this.themes[0];

    const lPerSlide = linesPerSlide || 4;
    const slides: Slide[] = [];

    for (const sec of sections) {
      const lines = sec.lyrics
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l.length > 0);

      for (let i = 0; i < lines.length; i += lPerSlide) {
        const chunk = lines.slice(i, i + lPerSlide).join('\n');
        slides.push({
          id: 'slide-' + Math.random().toString(36).substring(2, 9),
          presentationId: '',
          sortOrder: slides.length,
          title: `${song.title} - ${sec.label}`,
          body: chunk,
          backgroundColor: theme.backgroundColor,
          foregroundColor: theme.textColor,
          fontSize: theme.fontSize,
          textAlignment: theme.textAlignment,
          themeOverride: effThemeId,
          lineSpacing: theme.lineSpacing,
          textShadow: theme.textShadow || undefined,
          verticalAlignment: theme.verticalAlignment,
          fontFamily: theme.fontFamily,
          fontWeight: theme.fontWeight,
          groupLabel: sec.label,
          groupColor: sectionColor(sec),
          layout: theme.layout ?? null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
      }
    }

    return this.addServiceItem(
      {
        serviceId,
        itemType: 'song',
        title: song.title,
        notes: `Language: ${song.language} | Key: ${song.songKey || 'N/A'}`,
        sourceId: song.id,
        themeId: effThemeId,
      },
      slides
    );
  }

  public async queryBiblePassage(query: BiblePassageQuery): Promise<BiblePassageResult> {
    const endV = query.endVerse || query.startVerse;
    const lowerBook = query.book.trim().toLowerCase();

    const bookMatches = (b: string, bNum: number) => {
      const lower = b.toLowerCase();
      if (lowerBook === 'john' || lowerBook === 'jn' || lowerBook === 'யோவான்') {
        return bNum === 43 || lower.includes('john') || lower.includes('யோவான்');
      }
      if (
        lowerBook === 'psalms' ||
        lowerBook === 'psalm' ||
        lowerBook === 'ps' ||
        lowerBook === 'சங்கீதம்'
      ) {
        return bNum === 19 || lower.includes('psalm') || lower.includes('சங்கீதம்');
      }
      if (lowerBook === 'romans' || lowerBook === 'rom' || lowerBook === 'ரோமர்') {
        return bNum === 45 || lower.includes('roman') || lower.includes('ரோமர்');
      }
      if (lowerBook === 'matthew' || lowerBook === 'matt' || lowerBook === 'மத்தேயு') {
        return bNum === 40 || lower.includes('matthew') || lower.includes('மத்தேயு');
      }
      return lower.includes(lowerBook);
    };

    const verses = this.bibleVerses.filter(
      (v) =>
        v.translation.toLowerCase() === query.translation.toLowerCase() &&
        v.chapter === query.chapter &&
        v.verse >= query.startVerse &&
        v.verse <= endV &&
        bookMatches(v.book, v.bookNumber)
    );

    const ref =
      query.startVerse === endV
        ? `${query.book} ${query.chapter}:${query.startVerse} (${query.translation})`
        : `${query.book} ${query.chapter}:${query.startVerse}-${endV} (${query.translation})`;

    return {
      reference: ref,
      translation: query.translation,
      verses,
    };
  }

  public async addBiblePassageToService(
    serviceId: string,
    query: BiblePassageQuery,
    themeId?: string,
    versesPerSlide?: number
  ): Promise<PlaylistItem> {
    const result = await this.queryBiblePassage(query);
    if (!result.verses || result.verses.length === 0) {
      throw new Error(`Passage not found: ${query.book} ${query.chapter}:${query.startVerse}`);
    }

    const effThemeId = themeId || 'theme-default-dark';
    const theme = (await this.getTheme(effThemeId)) || this.themes[0];

    const chunkSize = versesPerSlide || 1;
    const slides: Slide[] = [];

    let secResult: BiblePassageResult | null = null;
    if (query.secondaryTranslation) {
      try {
        secResult = await this.queryBiblePassage({
          ...query,
          translation: query.secondaryTranslation,
          secondaryTranslation: undefined,
        });
      } catch (_) {}
    }

    for (let i = 0; i < result.verses.length; i += chunkSize) {
      const chunk = result.verses.slice(i, i + chunkSize);
      const title =
        chunk.length === 1
          ? `${chunk[0].book} ${chunk[0].chapter}:${chunk[0].verse} (${chunk[0].translation}${query.secondaryTranslation ? ' / ' + query.secondaryTranslation : ''})`
          : `${chunk[0].book} ${chunk[0].chapter}:${chunk[0].verse}-${chunk[chunk.length - 1].verse} (${chunk[0].translation}${query.secondaryTranslation ? ' / ' + query.secondaryTranslation : ''})`;

      let body = chunk
        .map((v) => (chunkSize > 1 ? `${v.verse}. ${v.text}` : v.text))
        .join('\n\n');

      if (secResult && secResult.verses) {
        const secLines = chunk.map((v) => {
          const sv = secResult?.verses.find((x) => x.chapter === v.chapter && x.verse === v.verse);
          if (sv) {
            return chunkSize > 1 ? `${sv.verse}. ${sv.text}` : sv.text;
          }
          return '';
        }).filter(Boolean);
        if (secLines.length > 0) {
          body = `${body}\n\n${secLines.join('\n\n')}`;
        }
      }

      slides.push({
        id: 'slide-' + Math.random().toString(36).substring(2, 9),
        presentationId: '',
        sortOrder: slides.length,
        title,
        body,
        backgroundColor: theme.backgroundColor,
        foregroundColor: theme.textColor,
        fontSize: theme.fontSize,
        textAlignment: theme.textAlignment,
        themeOverride: effThemeId,
        lineSpacing: 1.4,
        textShadow: theme.textShadow || undefined,
        verticalAlignment: theme.verticalAlignment,
        fontFamily: theme.fontFamily,
        fontWeight: 'normal',
        layout: theme.layout ?? null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }

    return this.addServiceItem(
      {
        serviceId,
        itemType: 'bible',
        title: `Scripture: ${result.reference}`,
        notes: `Offline Scripture lookup: ${result.reference}`,
        sourceId: result.reference,
        themeId: effThemeId,
      },
      slides
    );
  }

  // ================= Backup & Restore =================

  public async exportBackup(): Promise<BackupData> {
    return {
      version: '6.0.0',
      exportedAt: new Date().toISOString(),
      app: 'ChurchPresenter',
      presentations: this.presentations,
      slides: this.slides,
      songs: this.songs,
      songSections: this.songSections,
      themes: this.themes,
      mediaAssets: this.mediaAssets,
      services: this.services,
      serviceItems: this.serviceItems,
      serviceItemSlides: this.serviceItemSlides,
      timers: this.timers,
      stageConfigs: [this.stageConfig],
      outputConfigs: this.outputs,
      overlayConfigs: [this.overlayConfig],
      remoteDevices: this.remoteDevices,
      midiMappings: this.midiMappings,
      oscConfigs: [this.oscConfig],
      actionMappings: this.actionMappings,
      workspaceState: this.workspaceState,
      settings: this.settings,
    };
  }

  public async importBackup(
    backup: BackupData,
    mode: 'merge' | 'overwrite'
  ): Promise<ImportResult> {
    if (
      !backup ||
      !backup.version ||
      !Array.isArray(backup.presentations) ||
      !Array.isArray(backup.slides)
    ) {
      throw new Error(
        'Invalid backup file format: missing required presentation or slide collections'
      );
    }

    if (mode === 'overwrite') {
      this.presentations = [...backup.presentations];
      this.slides = [...backup.slides];
      this.songs = backup.songs ? [...backup.songs] : [];
      this.songSections = backup.songSections ? [...backup.songSections] : [];
      this.themes = backup.themes ? [...backup.themes] : [...this.themes];
      this.mediaAssets = backup.mediaAssets ? [...backup.mediaAssets] : [];
      this.services = backup.services ? [...backup.services] : [];
      this.serviceItems = backup.serviceItems ? [...backup.serviceItems] : [];
      this.serviceItemSlides = backup.serviceItemSlides ? [...backup.serviceItemSlides] : [];
      this.settings = { ...this.settings, ...(backup.settings || {}) };
    } else {
      for (const p of backup.presentations) {
        if (!this.presentations.some((existing) => existing.id === p.id)) {
          this.presentations.push(p);
        }
      }
      for (const s of backup.slides) {
        if (!this.slides.some((existing) => existing.id === s.id)) {
          this.slides.push(s);
        }
      }
      if (backup.songs) {
        for (const song of backup.songs) {
          if (!this.songs.some((existing) => existing.id === song.id)) {
            this.songs.push(song);
          }
        }
      }
      if (backup.songSections) {
        for (const sec of backup.songSections) {
          if (!this.songSections.some((existing) => existing.id === sec.id)) {
            this.songSections.push(sec);
          }
        }
      }
      if (backup.themes) {
        for (const th of backup.themes) {
          if (!this.themes.some((existing) => existing.id === th.id)) {
            this.themes.push(th);
          }
        }
      }
      if (backup.services) {
        for (const srv of backup.services) {
          if (!this.services.some((existing) => existing.id === srv.id)) {
            this.services.push(srv);
          }
        }
      }
      if (backup.serviceItems) {
        for (const it of backup.serviceItems) {
          if (!this.serviceItems.some((existing) => existing.id === it.id)) {
            this.serviceItems.push(it);
          }
        }
      }
      if (backup.serviceItemSlides) {
        for (const sl of backup.serviceItemSlides) {
          if (!this.serviceItemSlides.some((existing) => existing.id === sl.id)) {
            this.serviceItemSlides.push(sl);
          }
        }
      }
    }
    this.notify();
    return {
      presentationsImported: backup.presentations.length,
      slidesImported: backup.slides.length,
      songsImported: backup.songs?.length || 0,
      themesImported: backup.themes?.length || 0,
      servicesImported: backup.services?.length || 0,
      serviceItemsImported: backup.serviceItems?.length || 0,
    };
  }

  // ================= Phase 4: Timers, Stage Display & Media Playback Mock Methods =================

  public async listTimers(serviceId?: string): Promise<Timer[]> {
    if (serviceId) {
      return this.timers.filter((t) => !t.serviceId || t.serviceId === serviceId);
    }
    return [...this.timers];
  }

  public async getTimer(id: string): Promise<Timer | null> {
    const timer = this.timers.find((t) => t.id === id);
    return timer ? { ...timer } : null;
  }

  public async createTimer(timer: Timer): Promise<Timer> {
    const id = timer.id || 'timer-' + Math.random().toString(36).substring(2, 9);
    const now = new Date().toISOString();
    const created: Timer = {
      ...timer,
      id,
      createdAt: now,
      updatedAt: now,
    };
    this.timers.push(created);
    return created;
  }

  public async updateTimer(timer: Timer): Promise<Timer> {
    const idx = this.timers.findIndex((t) => t.id === timer.id);
    const now = new Date().toISOString();
    const updated = { ...timer, updatedAt: now };
    if (idx !== -1) {
      this.timers[idx] = updated;
    } else {
      this.timers.push(updated);
    }
    return updated;
  }

  public async deleteTimer(id: string): Promise<void> {
    this.timers = this.timers.filter((t) => t.id !== id);
  }

  public async getStageConfig(_id?: string): Promise<StageConfig> {
    return { ...this.stageConfig, panels: JSON.parse(JSON.stringify(this.stageConfig.panels || [])) };
  }

  private stageConfigListeners = new Set<(c: StageConfig) => void>();

  public subscribeStageConfig(callback: (c: StageConfig) => void): () => void {
    this.stageConfigListeners.add(callback);
    return () => {
      this.stageConfigListeners.delete(callback);
    };
  }

  public async updateStageConfig(config: StageConfig): Promise<StageConfig> {
    const problem = validatePanels(config.panels);
    if (problem) throw new Error(problem);
    this.stageConfig = {
      ...config,
      panels: JSON.parse(JSON.stringify(config.panels || [])),
      updatedAt: new Date().toISOString(),
    };
    const saved = { ...this.stageConfig, panels: JSON.parse(JSON.stringify(this.stageConfig.panels || [])) };
    this.stageConfigListeners.forEach((cb) => cb(saved));
    return saved;
  }

  public async openStageWindow(
    monitorId?: string,
    fullscreen?: boolean
  ): Promise<StageWindowStatus> {
    this.stageStatus = {
      isOpen: true,
      monitorName: monitorId || 'Stage Monitor (External)',
      isFullscreen: !!fullscreen,
      error: null,
    };
    return { ...this.stageStatus };
  }

  public async closeStageWindow(): Promise<StageWindowStatus> {
    this.stageStatus = {
      isOpen: false,
      monitorName: null,
      isFullscreen: false,
      error: null,
    };
    return { ...this.stageStatus };
  }

  public async getStageStatus(): Promise<StageWindowStatus> {
    return { ...this.stageStatus };
  }

  public async setMediaPlayback(
    mediaPlayback: MediaPlaybackState | null
  ): Promise<PresentationState> {
    this.state.mediaPlayback = mediaPlayback;
    this.notify();
    return JSON.parse(JSON.stringify(this.state));
  }

  public async setTimerState(
    timerState: TimerState | null
  ): Promise<PresentationState> {
    this.state.timerState = timerState;
    this.notify();
    return JSON.parse(JSON.stringify(this.state));
  }

  public async getSetting(key: string): Promise<string | null> {
    return this.settings[key] || null;
  }

  public async setSetting(key: string, value: string): Promise<void> {
    this.settings[key] = value;
  }

  // ================= Phase 5 Mock Data & Methods =================

  private outputs: OutputConfig[] = [
    {
      id: 'output-audience',
      name: 'Main Projector / Audience',
      outputType: 'audience',
      targetMonitorId: null,
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
    },
    {
      id: 'output-stage',
      name: 'Confidence Stage Display',
      outputType: 'stage',
      targetMonitorId: null,
      resolutionWidth: 1920,
      resolutionHeight: 1080,
      aspectRatio: '16:9',
      safeMarginPercent: 4.0,
      contentSource: 'stage_layout',
      themeId: null,
      isEnabled: true,
      isActive: false,
      error: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'output-overlay',
      name: 'Livestream Lower-Thirds Overlay',
      outputType: 'overlay',
      targetMonitorId: null,
      resolutionWidth: 1920,
      resolutionHeight: 1080,
      aspectRatio: '16:9',
      safeMarginPercent: 5.0,
      contentSource: 'lyrics_only',
      themeId: null,
      isEnabled: true,
      isActive: false,
      error: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ];

  private overlayConfig: LivestreamOverlayConfig = {
    id: 'default-overlay',
    layoutMode: 'lower_third',
    fontFamily: 'Inter, system-ui, sans-serif',
    fontSizePx: 42,
    textColor: '#ffffff',
    textShadow: '2px 2px 4px rgba(0,0,0,0.85)',
    textAlignment: 'center',
    safeMarginHorizontalPct: 5.0,
    safeMarginVerticalPct: 6.0,
    showSpeakerLabel: true,
    showReference: true,
    isCleared: false,
    authToken: 'mock-overlay-token-xyz',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  private overlayStatus: OverlayWindowStatus = {
    isOpen: false,
    monitorName: null,
    isFullscreen: false,
    error: null,
  };

  private remoteDevices: RemoteDevice[] = [
    {
      id: 'dev-remote-1',
      deviceName: 'Pastor iPad Mini',
      ipAddress: '192.168.1.105',
      tokenHash: 'sample-token-hash-1',
      isApproved: true,
      canNavigate: true,
      canBlackout: true,
      canTakeLive: false,
      canControlTimer: true,
      canRunMacros: false,
      pairedAt: new Date().toISOString(),
      lastSeenAt: new Date().toISOString(),
    },
  ];
  private remoteServerStatus: RemoteServerStatus = {
    isRunning: false,
    port: 8088,
    lanIps: ['192.168.1.150', '127.0.0.1'],
    pairingPin: null,
    connectedClientsCount: 0,
    error: null,
  };

  private midiMappings: MidiMapping[] = [
    {
      id: 'midi-next-slide',
      name: 'Next Slide (Note C4 / 60)',
      channel: 0,
      messageType: 'note_on',
      noteOrCc: 60,
      actionType: 'next_slide',
      isEnabled: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'midi-prev-slide',
      name: 'Previous Slide (Note B3 / 59)',
      channel: 0,
      messageType: 'note_on',
      noteOrCc: 59,
      actionType: 'prev_slide',
      isEnabled: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'midi-blackout',
      name: 'Toggle Blackout (Note D4 / 62)',
      channel: 0,
      messageType: 'note_on',
      noteOrCc: 62,
      actionType: 'toggle_blackout',
      isEnabled: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ];

  private midiStatus: MidiStatus = {
    isRunning: false,
    currentDeviceName: null,
    availableDevices: ['USB MIDI Controller (Simulated)'],
    lastEvent: null,
    error: null,
  };

  private oscConfig: OscConfig = {
    id: 'default-osc',
    isEnabled: false,
    listenPort: 8000,
    allowlistActions: 'next_slide,prev_slide,next_item,prev_item,toggle_blackout,toggle_live,start_timer,stop_timer,reset_timer,clear_overlay',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  private oscStatus: OscStatus = {
    isRunning: false,
    port: 8000,
    lastReceivedPath: null,
    lastReceivedTime: null,
    error: null,
  };

  private actionMappings: ActionMapping[] = [
    { id: 'act-next-slide', actionName: 'next_slide', displayLabel: 'Next Slide', category: 'presentation', keyboardShortcut: 'Right / Space / PageDown', isEnabled: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
    { id: 'act-prev-slide', actionName: 'prev_slide', displayLabel: 'Previous Slide', category: 'presentation', keyboardShortcut: 'Left / PageUp', isEnabled: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
    { id: 'act-next-item', actionName: 'next_item', displayLabel: 'Next Playlist Item', category: 'service', keyboardShortcut: 'Ctrl+Right', isEnabled: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
    { id: 'act-prev-item', actionName: 'prev_item', displayLabel: 'Previous Playlist Item', category: 'service', keyboardShortcut: 'Ctrl+Left', isEnabled: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
    { id: 'act-toggle-blackout', actionName: 'toggle_blackout', displayLabel: 'Toggle Blackout / Blank', category: 'display', keyboardShortcut: 'B / F7', isEnabled: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
    { id: 'act-toggle-live', actionName: 'toggle_live', displayLabel: 'Toggle Live Output', category: 'presentation', keyboardShortcut: 'F5', isEnabled: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
    { id: 'act-start-timer', actionName: 'start_timer', displayLabel: 'Start Timer', category: 'timer', keyboardShortcut: 'Alt+S', isEnabled: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
    { id: 'act-stop-timer', actionName: 'stop_timer', displayLabel: 'Stop / Pause Timer', category: 'timer', keyboardShortcut: 'Alt+P', isEnabled: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
    { id: 'act-reset-timer', actionName: 'reset_timer', displayLabel: 'Reset Timer', category: 'timer', keyboardShortcut: 'Alt+R', isEnabled: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
    { id: 'act-clear-overlay', actionName: 'clear_overlay', displayLabel: 'Clear Livestream Overlay', category: 'display', keyboardShortcut: 'F8', isEnabled: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  ];

  public async listOutputs(): Promise<OutputConfig[]> {
    return JSON.parse(JSON.stringify(this.outputs));
  }

  public async getOutput(id: string): Promise<OutputConfig | null> {
    const o = this.outputs.find((item) => item.id === id);
    return o ? JSON.parse(JSON.stringify(o)) : null;
  }

  public async createOutput(output: OutputConfig): Promise<OutputConfig> {
    const created: OutputConfig = {
      ...output,
      id: output.id || `output-${Date.now()}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.outputs.push(created);
    return JSON.parse(JSON.stringify(created));
  }

  public async updateOutput(output: OutputConfig): Promise<OutputConfig> {
    const idx = this.outputs.findIndex((item) => item.id === output.id);
    if (idx !== -1) {
      this.outputs[idx] = { ...output, updatedAt: new Date().toISOString() };
      return JSON.parse(JSON.stringify(this.outputs[idx]));
    }
    return output;
  }

  public async deleteOutput(id: string): Promise<void> {
    this.outputs = this.outputs.filter((item) => item.id !== id);
  }

  public async getOverlayConfig(): Promise<LivestreamOverlayConfig> {
    return JSON.parse(JSON.stringify(this.overlayConfig));
  }

  public async updateOverlayConfig(config: LivestreamOverlayConfig): Promise<LivestreamOverlayConfig> {
    this.overlayConfig = { ...config, updatedAt: new Date().toISOString() };
    return JSON.parse(JSON.stringify(this.overlayConfig));
  }

  public async regenerateOverlayToken(): Promise<string> {
    this.overlayConfig.authToken = `token-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    return this.overlayConfig.authToken;
  }

  public async toggleOverlayClear(): Promise<boolean> {
    this.overlayConfig.isCleared = !this.overlayConfig.isCleared;
    return this.overlayConfig.isCleared;
  }

  public async openOverlayWindow(monitorId?: string, fullscreen?: boolean): Promise<OverlayWindowStatus> {
    this.overlayStatus = {
      isOpen: true,
      monitorName: monitorId || 'Overlay (Transparent)',
      isFullscreen: !!fullscreen,
      error: null,
    };
    return { ...this.overlayStatus };
  }

  public async closeOverlayWindow(): Promise<OverlayWindowStatus> {
    this.overlayStatus = {
      isOpen: false,
      monitorName: null,
      isFullscreen: false,
      error: null,
    };
    return { ...this.overlayStatus };
  }

  public async getOverlayStatus(): Promise<OverlayWindowStatus> {
    return { ...this.overlayStatus };
  }

  public async getOverlayRenderPayload(): Promise<OverlayRenderPayload> {
    return {
      isLive: this.state.isLive,
      isBlackout: this.state.isBlackout,
      isCleared: this.overlayConfig.isCleared,
      slide: this.state.isLive && !this.state.isBlackout && !this.overlayConfig.isCleared ? this.state.currentSlide : null,
      itemTitle: 'Mock Item',
      serviceTitle: 'Sunday Morning Service',
      layoutMode: this.overlayConfig.layoutMode,
      fontFamily: this.overlayConfig.fontFamily,
      fontSizePx: this.overlayConfig.fontSizePx,
      textColor: this.overlayConfig.textColor,
      textShadow: this.overlayConfig.textShadow,
      textAlignment: this.overlayConfig.textAlignment,
      safeMarginHorizontalPct: this.overlayConfig.safeMarginHorizontalPct,
      safeMarginVerticalPct: this.overlayConfig.safeMarginVerticalPct,
      showSpeakerLabel: this.overlayConfig.showSpeakerLabel,
      showReference: this.overlayConfig.showReference,
    };
  }

  public async setCustomLogo(sourcePath: string): Promise<string> {
    const ext = sourcePath.split('.').pop()?.toLowerCase() || '';
    if (!['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg'].includes(ext)) {
      throw new Error('Logo must be a PNG, JPG, WEBP, GIF or SVG image.');
    }
    await this.setSetting('logo_path', sourcePath);
    return sourcePath;
  }

  public async clearCustomLogo(): Promise<void> {
    await this.setSetting('logo_path', '');
  }

  public async getNetworkBindMode(): Promise<'local' | 'lan'> {
    return (await this.getSetting('network_bind_mode')) === 'local' ? 'local' : 'lan';
  }

  public async setNetworkBindMode(mode: string): Promise<'local' | 'lan'> {
    if (mode !== 'local' && mode !== 'lan') {
      throw new Error(`Unknown network mode '${mode}'. Use 'local' or 'lan'.`);
    }
    await this.setSetting('network_bind_mode', mode);
    return mode;
  }

  public async getRemoteServerStatus(): Promise<RemoteServerStatus> {
    return JSON.parse(JSON.stringify(this.remoteServerStatus));
  }

  public async startRemoteServer(port = 8088): Promise<RemoteServerStatus> {
    this.remoteServerStatus.isRunning = true;
    this.remoteServerStatus.port = port;
    this.remoteServerStatus.pairingPin = Math.floor(100000 + Math.random() * 900000).toString();
    return JSON.parse(JSON.stringify(this.remoteServerStatus));
  }

  public async stopRemoteServer(): Promise<RemoteServerStatus> {
    this.remoteServerStatus.isRunning = false;
    this.remoteServerStatus.pairingPin = null;
    return JSON.parse(JSON.stringify(this.remoteServerStatus));
  }

  public async listRemoteDevices(): Promise<RemoteDevice[]> {
    return JSON.parse(JSON.stringify(this.remoteDevices));
  }

  public async approveRemoteDevice(id: string, isApproved: boolean): Promise<void> {
    const dev = this.remoteDevices.find((d) => d.id === id);
    if (dev) {
      dev.isApproved = isApproved;
    }
  }

  public async updateRemoteDevicePermissions(
    id: string,
    canNavigate: boolean,
    canBlackout: boolean,
    canTakeLive: boolean,
    canControlTimer: boolean,
    canRunMacros: boolean
  ): Promise<void> {
    const dev = this.remoteDevices.find((d) => d.id === id);
    if (dev) {
      dev.canRunMacros = canRunMacros;
      dev.canNavigate = canNavigate;
      dev.canBlackout = canBlackout;
      dev.canTakeLive = canTakeLive;
      dev.canControlTimer = canControlTimer;
    }
  }

  public async deleteRemoteDevice(id: string): Promise<void> {
    this.remoteDevices = this.remoteDevices.filter((d) => d.id !== id);
  }

  public async getMidiStatus(): Promise<MidiStatus> {
    return JSON.parse(JSON.stringify(this.midiStatus));
  }

  public async listMidiDevices(): Promise<string[]> {
    return [...this.midiStatus.availableDevices];
  }

  public async startMidiListener(devicePattern?: string): Promise<MidiStatus> {
    this.midiStatus.isRunning = true;
    this.midiStatus.currentDeviceName = devicePattern || this.midiStatus.availableDevices[0] || 'Default MIDI';
    return JSON.parse(JSON.stringify(this.midiStatus));
  }

  public async stopMidiListener(): Promise<MidiStatus> {
    this.midiStatus.isRunning = false;
    this.midiStatus.currentDeviceName = null;
    return JSON.parse(JSON.stringify(this.midiStatus));
  }

  public async listMidiMappings(): Promise<MidiMapping[]> {
    return JSON.parse(JSON.stringify(this.midiMappings));
  }

  public async createMidiMapping(mapping: MidiMapping): Promise<MidiMapping> {
    const created: MidiMapping = {
      ...mapping,
      id: mapping.id || `midi-${Date.now()}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.midiMappings.push(created);
    return JSON.parse(JSON.stringify(created));
  }

  public async updateMidiMapping(mapping: MidiMapping): Promise<MidiMapping> {
    const idx = this.midiMappings.findIndex((m) => m.id === mapping.id);
    if (idx !== -1) {
      this.midiMappings[idx] = { ...mapping, updatedAt: new Date().toISOString() };
      return JSON.parse(JSON.stringify(this.midiMappings[idx]));
    }
    return mapping;
  }

  public async deleteMidiMapping(id: string): Promise<void> {
    this.midiMappings = this.midiMappings.filter((m) => m.id !== id);
  }

  public async getOscConfig(): Promise<OscConfig> {
    return JSON.parse(JSON.stringify(this.oscConfig));
  }

  public async updateOscConfig(config: OscConfig): Promise<OscConfig> {
    this.oscConfig = { ...config, updatedAt: new Date().toISOString() };
    return JSON.parse(JSON.stringify(this.oscConfig));
  }

  public async getOscStatus(): Promise<OscStatus> {
    return JSON.parse(JSON.stringify(this.oscStatus));
  }

  public async startOscListener(port = 9000): Promise<OscStatus> {
    this.oscStatus.isRunning = true;
    this.oscStatus.port = port;
    return JSON.parse(JSON.stringify(this.oscStatus));
  }

  public async stopOscListener(): Promise<OscStatus> {
    this.oscStatus.isRunning = false;
    return JSON.parse(JSON.stringify(this.oscStatus));
  }

  public async listActionMappings(): Promise<ActionMapping[]> {
    return JSON.parse(JSON.stringify(this.actionMappings));
  }

  public async updateActionMapping(mapping: ActionMapping): Promise<ActionMapping> {
    const idx = this.actionMappings.findIndex((m) => m.id === mapping.id);
    if (idx !== -1) {
      this.actionMappings[idx] = { ...mapping, updatedAt: new Date().toISOString() };
      return JSON.parse(JSON.stringify(this.actionMappings[idx]));
    }
    return mapping;
  }

  public async resetActionMappingsToDefault(): Promise<void> {
    // Reset to initial 10 mappings
  }

  public async dispatchAction(action: string): Promise<PresentationState> {
    switch (action) {
      case 'next_slide':
        return this.nextSlide();
      case 'prev_slide':
        return this.previousSlide();
      case 'toggle_blackout':
        await this.toggleBlackout();
        return this.getPresentationState();
      case 'toggle_logo':
        await this.toggleLogo();
        return this.getPresentationState();
      case 'clear_media':
        return this.clearMedia();
      case 'clear_alert':
        return this.clearAlert();
      case 'clear_props':
        return this.clearProps();
      case 'stop_auto_advance':
        return this.stopAutoAdvance();
      case 'clear_all':
        return this.clearAll();
      case 'toggle_live':
        if (this.state.isLive) {
          return this.clearLive();
        } else {
          this.state.isLive = true;
          this.state.isLogo = false;
          this.notify();
          return this.getPresentationState();
        }
      case 'clear_overlay':
        this.overlayConfig.isCleared = !this.overlayConfig.isCleared;
        return this.getPresentationState();
      default:
        return this.getPresentationState();
    }
  }

  public async getSystemDiagnostics(): Promise<SystemDiagnostics> {
    return {
      outputs: await this.listOutputs(),
      audienceWindowOpen: false,
      stageWindowOpen: this.stageStatus.isOpen,
      overlayWindowOpen: this.overlayStatus.isOpen,
      remoteServer: await this.getRemoteServerStatus(),
      midiStatus: await this.getMidiStatus(),
      oscStatus: await this.getOscStatus(),
      recentErrors: [],
    };
  }

  // ================= Phase 6: Workspace Recovery & Diagnostics Mock Methods =================

  private workspaceState: WorkspaceState = {
    id: 'current_workspace',
    selectedServiceId: 'srv-1',
    selectedPresentationId: null,
    selectedItemId: 'item-1',
    selectedSlideIndex: 0,
    activeTab: 'services',
    lastSavedAt: new Date().toISOString(),
  };

  private diagnosticsLog: AppDiagnosticEntry[] = [
    {
      id: 'diag-init',
      timestamp: new Date().toISOString(),
      level: 'INFO',
      component: 'Application',
      message: 'Church Presenter initialized successfully',
      details: null,
    },
  ];

  public async getWorkspaceState(): Promise<WorkspaceState | null> {
    return { ...this.workspaceState };
  }

  public async saveWorkspaceState(state: WorkspaceState): Promise<void> {
    this.workspaceState = { ...state, lastSavedAt: new Date().toISOString() };
  }

  public async getDiagnosticsLog(filter?: AppDiagnosticFilter): Promise<AppDiagnosticEntry[]> {
    let list = [...this.diagnosticsLog];
    if (filter?.level && filter.level !== 'ALL') {
      list = list.filter((d) => d.level === filter.level);
    }
    if (filter?.component && filter.component !== 'ALL') {
      list = list.filter((d) => d.component === filter.component);
    }
    const limit = filter?.limit ?? 100;
    return list.slice(0, limit);
  }

  public async logClientDiagnostic(
    level: 'INFO' | 'WARN' | 'ERROR' | 'FATAL',
    component: string,
    message: string,
    details?: string | null
  ): Promise<void> {
    this.diagnosticsLog.unshift({
      id: `diag-${Date.now()}`,
      timestamp: new Date().toISOString(),
      level,
      component,
      message,
      details: details ?? null,
    });
  }

  public async clearDiagnosticsLog(beforeTimestamp?: string): Promise<number> {
    const beforeCount = this.diagnosticsLog.length;
    if (beforeTimestamp) {
      this.diagnosticsLog = this.diagnosticsLog.filter((d) => d.timestamp >= beforeTimestamp);
    } else {
      this.diagnosticsLog = [];
    }
    return beforeCount - this.diagnosticsLog.length;
  }

  public async verifyDatabaseIntegrity(): Promise<string[]> {
    return ['ok'];
  }

  public async openDevtools(): Promise<void> {
    console.log('[Devtools] Open devtools requested');
  }

  public async getAppInfo(): Promise<AppInfo> {
    return {
      name: 'Church Presenter',
      version: '1.0.0',
      buildProfile: 'debug',
      targetOs: 'linux',
      databasePath: '/home/user/.local/share/church_presenter/church_presenter.db',
      mediaDir: '/home/user/.local/share/church_presenter/media',
      databaseIntegrity: true,
      totalServices: this.services.length,
      totalSongs: this.songs.length,
      totalMedia: this.mediaAssets.length,
    };
  }

  public async getAppDataDir(): Promise<string> {
    return '';
  }

  public async resolveMediaUrl(relativePath: string): Promise<string> {
    return relativePath.startsWith('/') ? relativePath : `/${relativePath}`;
  }

  public async parseBibleReference(reference: string): Promise<BiblePassageQuery | null> {
    const trimmed = reference.trim();
    if (!trimmed) return null;

    let cleanInput = trimmed;
    let translation = '';

    const parenMatch = trimmed.match(/\(([^)]+)\)\s*$/);
    if (parenMatch) {
      translation = parenMatch[1].trim();
      cleanInput = trimmed.slice(0, parenMatch.index).trim();
    } else {
      const parts = trimmed.split(/\s+/);
      if (parts.length > 1) {
        const last = parts[parts.length - 1].toUpperCase();
        if (['KJV', 'WEB', 'TAMIL', 'ESV', 'NIV', 'NLT', 'NKJV', 'NASB'].includes(last)) {
          translation = parts[parts.length - 1];
          cleanInput = parts.slice(0, -1).join(' ').trim();
        }
      }
    }

    const hasTamil = /[\u0B80-\u0BFF]/.test(cleanInput);
    if (!translation) {
      translation = hasTamil ? 'Tamil' : 'KJV';
    } else if (translation.toLowerCase() === 'tamil' || (hasTamil && translation.toLowerCase() === 'kjv')) {
      translation = 'Tamil';
    }

    let splitPos = -1;
    for (let i = cleanInput.length - 1; i >= 0; i--) {
      const code = cleanInput.charCodeAt(i);
      const ch = cleanInput[i];
      if (/[a-zA-Z]/.test(ch) || (code >= 0x0B80 && code <= 0x0BFF)) {
        splitPos = i + 1;
        break;
      }
    }

    if (splitPos <= 0) return null;

    const bookPart = cleanInput.slice(0, splitPos).trim();
    const chapVersePart = cleanInput.slice(splitPos).trim();

    if (!bookPart || !chapVersePart) return null;

    const chapVerseCleaned = chapVersePart.replace(/\./g, ':').replace(/[–—]/g, '-');
    const parts = chapVerseCleaned.split(':');

    let chapter: number;
    let startVerse: number;
    let endVerse: number | null = null;

    if (parts.length >= 2) {
      chapter = parseInt(parts[0].trim(), 10);
      const verseStr = parts[1].trim();
      if (verseStr.includes('-')) {
        const [sv, ev] = verseStr.split('-').map((s) => parseInt(s.trim(), 10));
        startVerse = sv;
        endVerse = isNaN(ev) ? sv : ev;
      } else {
        startVerse = parseInt(verseStr, 10);
        endVerse = startVerse;
      }
    } else {
      chapter = parseInt(parts[0].trim(), 10);
      startVerse = 1;
      endVerse = null;
    }

    if (isNaN(chapter) || isNaN(startVerse)) return null;

    return {
      translation,
      book: bookPart,
      chapter,
      startVerse,
      endVerse,
    };
  }

  public async importBibleVerses(verses: BibleVerse[]): Promise<number> {
    for (const v of verses) {
      const idx = this.bibleVerses.findIndex((x) => x.id === v.id);
      if (idx >= 0) {
        this.bibleVerses[idx] = v;
      } else {
        this.bibleVerses.push(v);
      }
    }
    return verses.length;
  }

  public async listBibleTranslations(): Promise<BibleTranslationInfo[]> {
    const counts = new Map<string, number>();
    for (const v of this.bibleVerses) {
      counts.set(v.translation, (counts.get(v.translation) || 0) + 1);
    }
    return Array.from(counts, ([translation, verseCount]) => ({ translation, verseCount })).sort(
      (a, b) => a.translation.localeCompare(b.translation)
    );
  }

  public async suggestBibleReferences(input: string, translation: string, limit?: number): Promise<BibleSuggestion[]> {
    return suggestFromVerses(input, translation, this.bibleVerses, limit);
  }

  public async searchBibleVerses(
    query: string,
    translation?: string,
    limit?: number
  ): Promise<BibleVerse[]> {
    const q = query.trim().toLowerCase();
    const max = limit || 50;
    return this.bibleVerses
      .filter((v) => {
        const matchesQuery =
          v.text.toLowerCase().includes(q) || v.book.toLowerCase().includes(q);
        const matchesTranslation =
          !translation ||
          translation === 'all' ||
          v.translation.toLowerCase() === translation.toLowerCase();
        return matchesQuery && matchesTranslation;
      })
      .slice(0, max);
  }

  public async getDatabaseHealth(): Promise<DatabaseHealth> {
    return {
      isHealthy: true,
      isInMemory: false,
      error: null,
      dbPath: '/mock/app_data/church_presenter.db',
      availableBackups: ['/mock/backups/auto-backup-20261025.json'],
    };
  }

  public async setStageMessage(message: string | null): Promise<PresentationState> {
    if (!this.state) {
      this.state = {
        currentPresentationId: null,
        currentSlideId: null,
        currentSlideIndex: 0,
        totalSlides: 0,
        currentSlide: null,
        nextSlide: null,
        isBlackout: false,
        isLive: false,
        stageMessage: null,
      };
    }
    this.state.stageMessage = message;
    return { ...this.state };
  }

  public async getStageMessage(): Promise<string | null> {
    return this.state?.stageMessage || null;
  }

  public async recoverDatabaseFromBackup(_backupFile?: string | null): Promise<boolean> {
    return true;
  }

  public async importPresentationDocument(
    filePath: string,
    title?: string
  ): Promise<Presentation> {
    const presTitle = title || filePath.split('/').pop()?.replace(/\.[^/.]+$/, '') || 'Presentation';
    const presentation: Presentation = {
      id: `pres-${Date.now()}`,
      title: presTitle,
      category: 'Other',
      themeName: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      slideCount: 3,
    };
    this.presentations.push(presentation);
    for (let i = 1; i <= 3; i++) {
      this.slides.push({
        id: `slide-${presentation.id}-${i}`,
        presentationId: presentation.id,
        sortOrder: i - 1,
        title: `Slide ${i}`,
        body: '',
        backgroundColor: '#000000',
        foregroundColor: '#ffffff',
        fontSize: 'medium',
        textAlignment: 'center',
        themeOverride: null,
        backgroundImage: `/mock/media/presentations/${presentation.id}/slide-${i}.png`,
        overlayColor: null,
        lineSpacing: 1.35,
        textShadow: null,
        verticalAlignment: 'center',
        fontFamily: null,
        fontWeight: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }
    return presentation;
  }
}

const mockStore = new MockDataStore();

// Production API Implementation connecting to Tauri Rust backend with Mock Fallback
export const api = {
  listPresentations: async (): Promise<Presentation[]> => {
    if (isTauri()) {
      return await invoke<Presentation[]>('list_presentations');
    }
    return mockStore.listPresentations();
  },

  getPresentation: async (id: string): Promise<Presentation | null> => {
    if (isTauri()) {
      return await invoke<Presentation | null>('get_presentation', { id });
    }
    return mockStore.getPresentation(id);
  },

  createPresentation: async (
    title: string,
    category: Presentation['category'],
    themeName?: string | null
  ): Promise<Presentation> => {
    if (isTauri()) {
      return await invoke<Presentation>('create_presentation', {
        title,
        category,
        themeName,
      });
    }
    return mockStore.createPresentation(title, category, themeName);
  },

  updatePresentation: async (
    id: string,
    title: string,
    category: Presentation['category'],
    themeName?: string | null
  ): Promise<Presentation> => {
    if (isTauri()) {
      return await invoke<Presentation>('update_presentation', {
        id,
        title,
        category,
        themeName,
      });
    }
    return mockStore.updatePresentation(id, title, category, themeName);
  },

  deletePresentation: async (id: string): Promise<void> => {
    if (isTauri()) {
      return await invoke<void>('delete_presentation', { id });
    }
    return mockStore.deletePresentation(id);
  },

  duplicatePresentation: async (id: string): Promise<Presentation> => {
    if (isTauri()) {
      return await invoke<Presentation>('duplicate_presentation', { id });
    }
    return mockStore.duplicatePresentation(id);
  },

  getSlides: async (presentationId: string): Promise<Slide[]> => {
    if (isTauri()) {
      return await invoke<Slide[]>('get_slides', { presentationId });
    }
    return mockStore.getSlides(presentationId);
  },

  createSlide: async (presentationId: string, slide: Partial<Slide>): Promise<Slide> => {
    if (isTauri()) {
      return await invoke<Slide>('create_slide', {
        presentationId,
        title: slide.title ?? '',
        body: slide.body ?? '',
        backgroundColor: slide.backgroundColor ?? '#0a0f1d',
        foregroundColor: slide.foregroundColor ?? '#ffffff',
        fontSize: slide.fontSize ?? 'large',
        textAlignment: slide.textAlignment ?? 'center',
        themeOverride: slide.themeOverride ?? null,
        backgroundImage: slide.backgroundImage ?? null,
        overlayColor: slide.overlayColor ?? null,
        lineSpacing: slide.lineSpacing ?? null,
        textShadow: slide.textShadow ?? null,
        verticalAlignment: slide.verticalAlignment ?? null,
        fontFamily: slide.fontFamily ?? null,
        fontWeight: slide.fontWeight ?? null,
        layout: slide.layout ?? null,
      });
    }
    return mockStore.createSlide(presentationId, slide);
  },

  updateSlide: async (id: string, slide: Partial<Slide>): Promise<Slide> => {
    if (isTauri()) {
      return await invoke<Slide>('update_slide', {
        id,
        title: slide.title,
        body: slide.body,
        backgroundColor: slide.backgroundColor,
        foregroundColor: slide.foregroundColor,
        fontSize: slide.fontSize,
        textAlignment: slide.textAlignment,
        themeOverride: slide.themeOverride,
        backgroundImage: slide.backgroundImage,
        overlayColor: slide.overlayColor,
        lineSpacing: slide.lineSpacing,
        textShadow: slide.textShadow,
        verticalAlignment: slide.verticalAlignment,
        fontFamily: slide.fontFamily,
        fontWeight: slide.fontWeight,
        // omitted = leave unchanged; an empty layout clears it
        layout: slide.layout ?? undefined,
      });
    }
    return mockStore.updateSlide(id, slide);
  },

  deleteSlide: async (id: string): Promise<void> => {
    if (isTauri()) {
      return await invoke<void>('delete_slide', { id });
    }
    return mockStore.deleteSlide(id);
  },

  duplicateSlide: async (id: string): Promise<Slide> => {
    if (isTauri()) {
      return await invoke<Slide>('duplicate_slide', { id });
    }
    return mockStore.duplicateSlide(id);
  },

  reorderSlides: async (presentationId: string, slideIds: string[]): Promise<void> => {
    if (isTauri()) {
      return await invoke<void>('reorder_slides', { presentationId, slideIds });
    }
    return mockStore.reorderSlides(presentationId, slideIds);
  },

  getPresentationState: async (): Promise<PresentationState> => {
    if (isTauri()) {
      return await invoke<PresentationState>('get_presentation_state');
    }
    return mockStore.getPresentationState();
  },

  setLiveSlide: async (presentationId: string, slideId: string): Promise<PresentationState> => {
    if (isTauri()) {
      return await invoke<PresentationState>('set_live_slide', {
        presentationId,
        slideId,
      });
    }
    return mockStore.setLiveSlide(presentationId, slideId);
  },

  listClearGroups: async (): Promise<ClearGroup[]> => {
    if (isTauri()) {
      return await invoke<ClearGroup[]>('list_clear_groups');
    }
    return mockStore.listClearGroups();
  },

  createClearGroup: async (group: ClearGroup): Promise<ClearGroup> => {
    if (isTauri()) {
      return await invoke<ClearGroup>('create_clear_group', { group });
    }
    return mockStore.createClearGroup(group);
  },

  updateClearGroup: async (group: ClearGroup): Promise<ClearGroup> => {
    if (isTauri()) {
      return await invoke<ClearGroup>('update_clear_group', { group });
    }
    return mockStore.updateClearGroup(group);
  },

  deleteClearGroup: async (id: string): Promise<void> => {
    if (isTauri()) {
      await invoke<void>('delete_clear_group', { id });
      return;
    }
    return mockStore.deleteClearGroup(id);
  },

  /** Clears the layers of a saved clear group. Everything else on the output stays as it is. */
  runClearGroup: async (id: string): Promise<PresentationState> => {
    if (isTauri()) {
      return await invoke<PresentationState>('run_clear_group', { id });
    }
    return mockStore.runClearGroup(id);
  },

  listKeyBindings: async (): Promise<KeyBinding[]> => {
    if (isTauri()) {
      return await invoke<KeyBinding[]>('list_key_bindings');
    }
    return mockStore.listKeyBindings();
  },

  createKeyBinding: async (binding: KeyBinding): Promise<KeyBinding> => {
    if (isTauri()) {
      return await invoke<KeyBinding>('create_key_binding', { binding });
    }
    return mockStore.createKeyBinding(binding);
  },

  updateKeyBinding: async (binding: KeyBinding): Promise<KeyBinding> => {
    if (isTauri()) {
      return await invoke<KeyBinding>('update_key_binding', { binding });
    }
    return mockStore.updateKeyBinding(binding);
  },

  deleteKeyBinding: async (id: string): Promise<void> => {
    if (isTauri()) {
      await invoke<void>('delete_key_binding', { id });
      return;
    }
    return mockStore.deleteKeyBinding(id);
  },

  listLooks: async (): Promise<Look[]> => {
    if (isTauri()) {
      return await invoke<Look[]>('list_looks');
    }
    return mockStore.listLooks();
  },

  createLook: async (look: Look): Promise<Look> => {
    if (isTauri()) {
      return await invoke<Look>('create_look', { look });
    }
    return mockStore.createLook(look);
  },

  updateLook: async (look: Look): Promise<Look> => {
    if (isTauri()) {
      return await invoke<Look>('update_look', { look });
    }
    return mockStore.updateLook(look);
  },

  deleteLook: async (id: string): Promise<void> => {
    if (isTauri()) {
      await invoke<void>('delete_look', { id });
      return;
    }
    return mockStore.deleteLook(id);
  },

  /** Sets the logo, blackout and props to match a saved look. The live slide is not changed. */
  applyLook: async (id: string): Promise<PresentationState> => {
    if (isTauri()) {
      return await invoke<PresentationState>('apply_look', { id });
    }
    return mockStore.applyLook(id);
  },

  /** Saves the screen as it is now (logo, blackout, props) as a new look. */
  captureLook: async (name: string): Promise<Look> => {
    if (isTauri()) {
      return await invoke<Look>('capture_look', { name });
    }
    return mockStore.captureLook(name);
  },

  listMacros: async (): Promise<Macro[]> => {
    if (isTauri()) {
      return await invoke<Macro[]>('list_macros');
    }
    return mockStore.listMacros();
  },

  createMacro: async (macro: Macro): Promise<Macro> => {
    if (isTauri()) {
      return await invoke<Macro>('create_macro', { macro });
    }
    return mockStore.createMacro(macro);
  },

  updateMacro: async (macro: Macro): Promise<Macro> => {
    if (isTauri()) {
      return await invoke<Macro>('update_macro', { macro });
    }
    return mockStore.updateMacro(macro);
  },

  deleteMacro: async (id: string): Promise<void> => {
    if (isTauri()) {
      await invoke<void>('delete_macro', { id });
      return;
    }
    return mockStore.deleteMacro(id);
  },

  /** Starts a macro in the background; progress arrives as `runningMacro` in the presentation state. */
  runMacro: async (id: string): Promise<void> => {
    if (isTauri()) {
      await invoke<void>('run_macro', { id });
      return;
    }
    return mockStore.runMacro(id);
  },

  stopMacro: async (): Promise<PresentationState> => {
    if (isTauri()) {
      return await invoke<PresentationState>('stop_macro');
    }
    return mockStore.stopMacro();
  },

  /** Advances the live slide every `intervalSeconds` (1-3600). Something must be live already. */
  startAutoAdvance: async (intervalSeconds: number, loopAtEnd: boolean): Promise<PresentationState> => {
    if (isTauri()) {
      return await invoke<PresentationState>('start_auto_advance', { intervalSeconds, loopAtEnd });
    }
    return mockStore.startAutoAdvance(intervalSeconds, loopAtEnd);
  },

  stopAutoAdvance: async (): Promise<PresentationState> => {
    if (isTauri()) {
      return await invoke<PresentationState>('stop_auto_advance');
    }
    return mockStore.stopAutoAdvance();
  },

  listSlideTemplates: async (): Promise<SlideTemplate[]> => {
    if (isTauri()) {
      return await invoke<SlideTemplate[]>('list_slide_templates');
    }
    return mockStore.listSlideTemplates();
  },

  createSlideTemplate: async (template: SlideTemplate): Promise<SlideTemplate> => {
    if (isTauri()) {
      return await invoke<SlideTemplate>('create_slide_template', { template });
    }
    return mockStore.createSlideTemplate(template);
  },

  updateSlideTemplate: async (template: SlideTemplate): Promise<SlideTemplate> => {
    if (isTauri()) {
      return await invoke<SlideTemplate>('update_slide_template', { template });
    }
    return mockStore.updateSlideTemplate(template);
  },

  deleteSlideTemplate: async (id: string): Promise<void> => {
    if (isTauri()) {
      await invoke<void>('delete_slide_template', { id });
      return;
    }
    return mockStore.deleteSlideTemplate(id);
  },

  listProps: async (): Promise<Prop[]> => {
    if (isTauri()) {
      return await invoke<Prop[]>('list_props');
    }
    return mockStore.listProps();
  },

  createProp: async (prop: Prop): Promise<Prop> => {
    if (isTauri()) {
      return await invoke<Prop>('create_prop', { prop });
    }
    return mockStore.createProp(prop);
  },

  updateProp: async (prop: Prop): Promise<Prop> => {
    if (isTauri()) {
      return await invoke<Prop>('update_prop', { prop });
    }
    return mockStore.updateProp(prop);
  },

  deleteProp: async (id: string): Promise<void> => {
    if (isTauri()) {
      await invoke<void>('delete_prop', { id });
      return;
    }
    return mockStore.deleteProp(id);
  },

  /** Shows the prop over the output, or takes it off if it is already showing. */
  toggleProp: async (id: string): Promise<PresentationState> => {
    if (isTauri()) {
      return await invoke<PresentationState>('toggle_prop', { id });
    }
    return mockStore.toggleProp(id);
  },

  clearProps: async (): Promise<PresentationState> => {
    if (isTauri()) {
      return await invoke<PresentationState>('clear_props');
    }
    return mockStore.clearProps();
  },

  /** Shows a banner on the audience screen. `durationSeconds`: omitted = 30s, 0 = until cleared. */
  sendAlert: async (message: string, durationSeconds?: number): Promise<PresentationState> => {
    if (isTauri()) {
      return await invoke<PresentationState>('send_alert', { message, durationSeconds });
    }
    return mockStore.sendAlert(message, durationSeconds);
  },

  clearAlert: async (): Promise<PresentationState> => {
    if (isTauri()) {
      return await invoke<PresentationState>('clear_alert');
    }
    return mockStore.clearAlert();
  },

  clearMedia: async (): Promise<PresentationState> => {
    if (isTauri()) {
      return await invoke<PresentationState>('clear_media');
    }
    return mockStore.clearMedia();
  },

  clearAll: async (): Promise<PresentationState> => {
    if (isTauri()) {
      return await invoke<PresentationState>('clear_all');
    }
    return mockStore.clearAll();
  },

  toggleLogo: async (): Promise<boolean> => {
    if (isTauri()) {
      return await invoke<boolean>('toggle_logo');
    }
    return mockStore.toggleLogo();
  },

  toggleBlackout: async (): Promise<boolean> => {
    if (isTauri()) {
      return await invoke<boolean>('toggle_blackout');
    }
    return mockStore.toggleBlackout();
  },

  nextSlide: async (): Promise<PresentationState> => {
    if (isTauri()) {
      return await invoke<PresentationState>('next_slide');
    }
    return mockStore.nextSlide();
  },

  previousSlide: async (): Promise<PresentationState> => {
    if (isTauri()) {
      return await invoke<PresentationState>('previous_slide');
    }
    return mockStore.previousSlide();
  },

  getAvailableMonitors: async (): Promise<DisplayMonitor[]> => {
    if (isTauri()) {
      return await invoke<DisplayMonitor[]>('get_available_monitors');
    }
    return mockStore.getAvailableMonitors();
  },

  openAudienceWindow: async (
    monitorId?: string,
    fullscreen: boolean = true
  ): Promise<AudienceWindowStatus> => {
    if (isTauri()) {
      return await invoke<AudienceWindowStatus>('open_audience_window', {
        monitorId,
        fullscreen,
      });
    }
    return {
      isOpen: true,
      monitorName: monitorId ? 'External Display' : 'Preview Window',
      isFullscreen: fullscreen,
    };
  },

  closeAudienceWindow: async (): Promise<AudienceWindowStatus> => {
    if (isTauri()) {
      return await invoke<AudienceWindowStatus>('close_audience_window');
    }
    return {
      isOpen: false,
      monitorName: null,
      isFullscreen: false,
    };
  },

  getAudienceStatus: async (): Promise<AudienceWindowStatus> => {
    if (isTauri()) {
      return await invoke<AudienceWindowStatus>('get_audience_status');
    }
    return mockStore.getAudienceStatus();
  },

  // ================= Phase 2: Songs API =================

  listSongs: async (sortBy?: string, language?: string, category?: string): Promise<Song[]> => {
    if (isTauri()) {
      return await invoke<Song[]>('list_songs', { sortBy, language, category });
    }
    return mockStore.listSongs(sortBy, language, category);
  },

  getSong: async (id: string): Promise<SongWithSections | null> => {
    if (isTauri()) {
      const song = await invoke<Song | null>('get_song', { id });
      if (!song) return null;
      const sections = await invoke<SongSection[]>('get_song_sections', { songId: id });
      return { song, sections };
    }
    return mockStore.getSongWithSections(id);
  },

  createSong: async (
    song: Partial<Song>,
    sections?: SongSection[]
  ): Promise<SongWithSections> => {
    if (isTauri()) {
      // The desktop command takes a complete record, so fill in what callers leave out.
      const now = new Date().toISOString();
      const fullSong: Song = {
        id: song.id || `song-${crypto.randomUUID()}`,
        title: song.title?.trim() || 'Untitled Song',
        alternateTitle: song.alternateTitle ?? null,
        language: song.language || 'English',
        author: song.author ?? null,
        composer: song.composer ?? null,
        copyright: song.copyright ?? null,
        ccliNumber: song.ccliNumber ?? null,
        songKey: song.songKey ?? null,
        tempo: song.tempo ?? null,
        tags: song.tags ?? [],
        category: song.category || 'Worship',
        defaultThemeId: song.defaultThemeId ?? null,
        sectionsCount: song.sectionsCount ?? 0,
        createdAt: song.createdAt || now,
        updatedAt: song.updatedAt || now,
      };
      const createdSong = await invoke<Song>('create_song', { song: fullSong });
      let savedSections: SongSection[] = [];
      if (sections && sections.length > 0) {
        savedSections = await invoke<SongSection[]>('save_song_sections', {
          songId: createdSong.id,
          sections: sections.map((s, idx) => ({
            ...s,
            songId: createdSong.id,
            sortOrder: idx,
            createdAt: s.createdAt || now,
            updatedAt: s.updatedAt || now,
          })),
        });
      }
      return { song: createdSong, sections: savedSections };
    }
    return mockStore.createSongWithSections(song, sections);
  },

  updateSong: async (song: Song): Promise<Song> => {
    if (isTauri()) {
      return await invoke<Song>('update_song', { song });
    }
    return mockStore.updateSong(song);
  },

  deleteSong: async (id: string): Promise<void> => {
    if (isTauri()) {
      return await invoke<void>('delete_song', { id });
    }
    return mockStore.deleteSong(id);
  },

  duplicateSong: async (id: string): Promise<SongWithSections> => {
    if (isTauri()) {
      return await invoke<SongWithSections>('duplicate_song', { id });
    }
    return mockStore.duplicateSong(id);
  },

  searchSongs: async (
    query: string,
    language?: string,
    category?: string
  ): Promise<Song[]> => {
    if (isTauri()) {
      return await invoke<Song[]>('search_songs', { query, language, category });
    }
    return mockStore.searchSongs(query, language, category);
  },

  getSongSections: async (songId: string): Promise<SongSection[]> => {
    if (isTauri()) {
      return await invoke<SongSection[]>('get_song_sections', { songId });
    }
    return mockStore.getSongSections(songId);
  },

  saveSongSections: async (
    songId: string,
    sections: SongSection[]
  ): Promise<SongSection[]> => {
    if (isTauri()) {
      return await invoke<SongSection[]>('save_song_sections', { songId, sections });
    }
    return mockStore.saveSongSections(songId, sections);
  },

  // ================= Phase 2: Themes API =================

  listThemes: async (): Promise<Theme[]> => {
    if (isTauri()) {
      return await invoke<Theme[]>('list_themes');
    }
    return mockStore.listThemes();
  },

  getTheme: async (id: string): Promise<Theme | null> => {
    if (isTauri()) {
      return await invoke<Theme | null>('get_theme', { id });
    }
    return mockStore.getTheme(id);
  },

  createTheme: async (theme: Partial<Theme>): Promise<Theme> => {
    if (isTauri()) {
      // The desktop command takes a complete record, so fill in what callers leave out.
      const now = new Date().toISOString();
      const fullTheme: Theme = {
        id: theme.id || `theme-${crypto.randomUUID()}`,
        name: theme.name?.trim() || 'Custom Theme',
        isBuiltIn: false,
        backgroundColor: theme.backgroundColor || '#0a0f1d',
        backgroundImageId: theme.backgroundImageId ?? null,
        backgroundImagePath: theme.backgroundImagePath ?? null,
        backgroundMode: theme.backgroundMode || 'cover',
        fontFamily: theme.fontFamily || 'system-ui, -apple-system, sans-serif',
        fontSize: theme.fontSize || 'large',
        fontWeight: theme.fontWeight || 'bold',
        textColor: theme.textColor || '#ffffff',
        textAlignment: theme.textAlignment || 'center',
        verticalAlignment: theme.verticalAlignment || 'center',
        lineSpacing: theme.lineSpacing || 1.35,
        textMargin: theme.textMargin || 6,
        textShadow: theme.textShadow ?? null,
        overlayColor: theme.overlayColor ?? null,
        layout: theme.layout ?? null,
        createdAt: theme.createdAt || now,
        updatedAt: theme.updatedAt || now,
      };
      return await invoke<Theme>('create_theme', { theme: fullTheme });
    }
    return mockStore.createTheme(theme);
  },

  updateTheme: async (theme: Theme): Promise<Theme> => {
    if (isTauri()) {
      return await invoke<Theme>('update_theme', { theme });
    }
    return mockStore.updateTheme(theme);
  },

  deleteTheme: async (id: string): Promise<void> => {
    if (isTauri()) {
      return await invoke<void>('delete_theme', { id });
    }
    return mockStore.deleteTheme(id);
  },

  duplicateTheme: async (id: string): Promise<Theme> => {
    if (isTauri()) {
      return await invoke<Theme>('duplicate_theme', { id });
    }
    return mockStore.duplicateTheme(id);
  },

  // ================= Phase 2: Media Assets API =================

  listMediaAssets: async (): Promise<MediaAsset[]> => {
    if (isTauri()) {
      return await invoke<MediaAsset[]>('list_media_assets');
    }
    return mockStore.listMediaAssets();
  },

  importMediaAsset: async (sourcePath: string): Promise<MediaAsset> => {
    if (isTauri()) {
      return await invoke<MediaAsset>('import_media_asset', { sourcePath });
    }
    return mockStore.importMediaAsset(sourcePath);
  },

  deleteMediaAsset: async (id: string): Promise<void> => {
    if (isTauri()) {
      return await invoke<void>('delete_media_asset', { id });
    }
    return mockStore.deleteMediaAsset(id);
  },

  // ================= Phase 2: Slide Generation & Interchange =================

  generateSlidesFromSong: async (
    options: SlideGenerationOptions
  ): Promise<GenerateSlidesResponse> => {
    if (isTauri()) {
      return await invoke<GenerateSlidesResponse>('generate_slides_from_song', {
        options,
      });
    }
    return mockStore.generateSlidesFromSong(options);
  },

  exportSong: async (songId: string): Promise<SongExportData> => {
    if (isTauri()) {
      return await invoke<SongExportData>('export_song', { songId });
    }
    return mockStore.exportSong(songId);
  },

  exportAllSongs: async (songIds?: string[]): Promise<SongExportData> => {
    if (isTauri()) {
      return await invoke<SongExportData>('export_all_songs', { songIds });
    }
    return mockStore.exportAllSongs(songIds);
  },

  importSongs: async (
    data: SongExportData,
    options: SongImportOptions
  ): Promise<SongImportResult> => {
    if (isTauri()) {
      return await invoke<SongImportResult>('import_songs', { data, options });
    }
    return mockStore.importSongs(data, options);
  },

  // ================= Backup & Settings =================

  exportBackup: async (): Promise<BackupData> => {
    if (isTauri()) {
      return await invoke<BackupData>('export_backup');
    }
    return mockStore.exportBackup();
  },

  importBackup: async (
    backup: BackupData,
    mode: 'merge' | 'overwrite' = 'merge'
  ): Promise<ImportResult> => {
    if (isTauri()) {
      return await invoke<ImportResult>('import_backup', { backup, mode });
    }
    return mockStore.importBackup(backup, mode);
  },

  /** Writes themes (with their background images embedded) to a `.cptheme` file. Desktop app only. */
  exportThemesToFile: async (ids: string[], path: string): Promise<ThemeExportResult> => {
    if (!isTauri()) {
      throw new Error('Exporting themes requires the desktop app.');
    }
    return await invoke<ThemeExportResult>('export_themes_to_file', { ids, path });
  },

  /** Imports the themes in a `.cptheme` file as new custom themes. Desktop app only. */
  importThemesFromFile: async (path: string): Promise<ThemeImportResult> => {
    if (!isTauri()) {
      throw new Error('Importing themes requires the desktop app.');
    }
    return await invoke<ThemeImportResult>('import_themes_from_file', { path });
  },

  /** Copies an image into the app data folder and uses it for "clear to logo". */
  setCustomLogo: async (sourcePath: string): Promise<string> => {
    if (isTauri()) {
      return await invoke<string>('set_custom_logo', { sourcePath });
    }
    return mockStore.setCustomLogo(sourcePath);
  },

  /** Goes back to the built-in logo. */
  clearCustomLogo: async (): Promise<void> => {
    if (isTauri()) {
      await invoke<void>('clear_custom_logo');
      return;
    }
    return mockStore.clearCustomLogo();
  },

  getNetworkBindMode: async (): Promise<'local' | 'lan'> => {
    if (isTauri()) {
      return (await invoke<string>('get_network_bind_mode')) === 'local' ? 'local' : 'lan';
    }
    return mockStore.getNetworkBindMode();
  },

  setNetworkBindMode: async (mode: 'local' | 'lan'): Promise<'local' | 'lan'> => {
    if (isTauri()) {
      return (await invoke<string>('set_network_bind_mode', { mode })) === 'local' ? 'local' : 'lan';
    }
    return mockStore.setNetworkBindMode(mode);
  },

  getSetting: async (key: string): Promise<string | null> => {
    if (isTauri()) {
      return await invoke<string | null>('get_setting', { key });
    }
    return mockStore.getSetting(key);
  },

  setSetting: async (key: string, value: string): Promise<void> => {
    if (isTauri()) {
      return await invoke<void>('set_setting', { key, value });
    }
    return mockStore.setSetting(key, value);
  },

  subscribeStateChanges: async (
    callback: (state: PresentationState) => void
  ): Promise<() => void> => {
    if (isTauri()) {
      const unlisten: UnlistenFn = await listen<PresentationState>(
        'presentation:state-changed',
        (event) => {
          callback(event.payload);
        }
      );
      return () => {
        unlisten();
      };
    }
    return mockStore.subscribe(callback);
  },

  /** Called when the stage layout is saved, so an open stage window can refresh itself. */
  subscribeStageConfig: async (callback: (config: StageConfig) => void): Promise<() => void> => {
    if (isTauri()) {
      const unlisten: UnlistenFn = await listen<StageConfig>('stage:config-changed', (event) => callback(event.payload));
      return () => {
        unlisten();
      };
    }
    return mockStore.subscribeStageConfig(callback);
  },

  // ================= Phase 3: Services & Playlists API =================

  listServices: async (): Promise<Service[]> => {
    if (isTauri()) {
      return await invoke<Service[]>('list_services');
    }
    return mockStore.listServices();
  },

  getService: async (id: string): Promise<Service | null> => {
    if (isTauri()) {
      return await invoke<Service | null>('get_service', { id });
    }
    return mockStore.getService(id);
  },

  getServiceWithItems: async (id: string): Promise<ServiceWithItems | null> => {
    if (isTauri()) {
      return await invoke<ServiceWithItems | null>('get_service_with_items', { id });
    }
    return mockStore.getServiceWithItems(id);
  },

  createService: async (service: Partial<Service>): Promise<Service> => {
    if (isTauri()) {
      // The desktop command takes a complete record, so fill in what callers leave out.
      const now = new Date().toISOString();
      const fullService: Service = {
        id: service.id || `service-${crypto.randomUUID()}`,
        title: service.title?.trim() || 'Untitled Service',
        description: service.description ?? null,
        serviceDate: service.serviceDate ?? null,
        category: service.category || 'Sunday Worship',
        notes: service.notes ?? null,
        createdAt: service.createdAt || now,
        updatedAt: service.updatedAt || now,
        itemCount: service.itemCount ?? 0,
      };
      return await invoke<Service>('create_service', { service: fullService });
    }
    return mockStore.createService(service);
  },

  updateService: async (service: Service): Promise<Service> => {
    if (isTauri()) {
      return await invoke<Service>('update_service', { service });
    }
    return mockStore.updateService(service);
  },

  deleteService: async (id: string): Promise<void> => {
    if (isTauri()) {
      return await invoke<void>('delete_service', { id });
    }
    return mockStore.deleteService(id);
  },

  duplicateService: async (id: string, newTitle?: string): Promise<Service> => {
    if (isTauri()) {
      return await invoke<Service>('duplicate_service', { id, newTitle });
    }
    return mockStore.duplicateService(id, newTitle);
  },

  getServiceItems: async (serviceId: string): Promise<PlaylistItem[]> => {
    if (isTauri()) {
      return await invoke<PlaylistItem[]>('get_service_items', { serviceId });
    }
    return mockStore.getServiceItems(serviceId);
  },

  getServiceItem: async (itemId: string): Promise<PlaylistItem | null> => {
    if (isTauri()) {
      return await invoke<PlaylistItem | null>('get_service_item', { itemId });
    }
    return mockStore.getServiceItem(itemId);
  },

  getServiceItemWithSlides: async (
    itemId: string
  ): Promise<PlaylistItemWithSlides | null> => {
    if (isTauri()) {
      return await invoke<PlaylistItemWithSlides | null>('get_service_item_with_slides', {
        itemId,
      });
    }
    return mockStore.getServiceItemWithSlides(itemId);
  },

  addServiceItem: async (
    item: Partial<PlaylistItem>,
    slides?: Slide[]
  ): Promise<PlaylistItem> => {
    if (isTauri()) {
      return await invoke<PlaylistItem>('add_service_item', { item, slides });
    }
    return mockStore.addServiceItem(item, slides);
  },

  updateServiceItem: async (item: PlaylistItem): Promise<PlaylistItem> => {
    if (isTauri()) {
      return await invoke<PlaylistItem>('update_service_item', { item });
    }
    return mockStore.updateServiceItem(item);
  },

  deleteServiceItem: async (itemId: string): Promise<void> => {
    if (isTauri()) {
      return await invoke<void>('delete_service_item', { itemId });
    }
    return mockStore.deleteServiceItem(itemId);
  },

  reorderServiceItems: async (
    serviceId: string,
    itemIds: string[]
  ): Promise<void> => {
    if (isTauri()) {
      return await invoke<void>('reorder_service_items', { serviceId, itemIds });
    }
    return mockStore.reorderServiceItems(serviceId, itemIds);
  },

  duplicateServiceItem: async (itemId: string): Promise<PlaylistItem> => {
    if (isTauri()) {
      return await invoke<PlaylistItem>('duplicate_service_item', { itemId });
    }
    return mockStore.duplicateServiceItem(itemId);
  },

  getServiceItemSlides: async (itemId: string): Promise<Slide[]> => {
    if (isTauri()) {
      return await invoke<Slide[]>('get_service_item_slides', { itemId });
    }
    return mockStore.getServiceItemSlides(itemId);
  },

  saveServiceItemSlides: async (
    itemId: string,
    slides: Slide[]
  ): Promise<Slide[]> => {
    if (isTauri()) {
      return await invoke<Slide[]>('save_service_item_slides', { itemId, slides });
    }
    return mockStore.saveServiceItemSlides(itemId, slides);
  },

  addSongToService: async (
    serviceId: string,
    songId: string,
    themeId?: string,
    linesPerSlide?: number,
    arrangementId?: string
  ): Promise<PlaylistItem> => {
    if (isTauri()) {
      return await invoke<PlaylistItem>('add_song_to_service', {
        serviceId,
        songId,
        themeId,
        linesPerSlide,
        arrangementId,
      });
    }
    return mockStore.addSongToService(serviceId, songId, themeId, linesPerSlide, arrangementId);
  },

  getSongArrangements: async (songId: string): Promise<SongArrangement[]> => {
    if (isTauri()) {
      return await invoke<SongArrangement[]>('get_song_arrangements', { songId });
    }
    return mockStore.getSongArrangements(songId);
  },

  saveSongArrangements: async (
    songId: string,
    arrangements: SongArrangement[]
  ): Promise<SongArrangement[]> => {
    if (isTauri()) {
      return await invoke<SongArrangement[]>('save_song_arrangements', { songId, arrangements });
    }
    return mockStore.saveSongArrangements(songId, arrangements);
  },

  // ================= Phase 3: Bible Passage Lookup =================

  queryBiblePassage: async (query: BiblePassageQuery): Promise<BiblePassageResult> => {
    if (isTauri()) {
      return await invoke<BiblePassageResult>('query_bible_passage', { query });
    }
    return mockStore.queryBiblePassage(query);
  },

  addBiblePassageToService: async (
    serviceId: string,
    query: BiblePassageQuery,
    themeId?: string,
    versesPerSlide?: number
  ): Promise<PlaylistItem> => {
    if (isTauri()) {
      return await invoke<PlaylistItem>('add_bible_passage_to_service', {
        serviceId,
        query,
        themeId,
        versesPerSlide,
      });
    }
    return mockStore.addBiblePassageToService(serviceId, query, themeId, versesPerSlide);
  },

  // ================= Phase 3: Live Service Item & Selection State =================

  setLiveServiceItemSlide: async (
    serviceId: string,
    itemId: string,
    slideId: string
  ): Promise<PresentationState> => {
    if (isTauri()) {
      return await invoke<PresentationState>('set_live_service_item_slide', {
        serviceId,
        itemId,
        slideId,
      });
    }
    return mockStore.setLiveServiceItemSlide(serviceId, itemId, slideId);
  },

  setSelectedServiceItem: async (
    serviceId?: string | null,
    itemId?: string | null
  ): Promise<PresentationState> => {
    if (isTauri()) {
      return await invoke<PresentationState>('set_selected_service_item', {
        serviceId,
        itemId,
      });
    }
    return mockStore.setSelectedServiceItem(serviceId, itemId);
  },

  clearLive: async (): Promise<PresentationState> => {
    if (isTauri()) {
      return await invoke<PresentationState>('clear_live');
    }
    return mockStore.clearLive();
  },

  // ================= Phase 4: Media Assets Extensions =================

  getMediaAsset: async (id: string): Promise<MediaAsset | null> => {
    if (isTauri()) {
      return await invoke<MediaAsset | null>('get_media_asset', { id });
    }
    return mockStore.getMediaAsset(id);
  },

  checkMediaAssetUsage: async (id: string): Promise<number> => {
    if (isTauri()) {
      return await invoke<number>('check_media_asset_usage', { id });
    }
    return mockStore.checkMediaAssetUsage(id);
  },

  // ================= Phase 4: Timers =================

  listTimers: async (serviceId?: string): Promise<Timer[]> => {
    if (isTauri()) {
      return await invoke<Timer[]>('list_timers', { serviceId });
    }
    return mockStore.listTimers(serviceId);
  },

  getTimer: async (id: string): Promise<Timer | null> => {
    if (isTauri()) {
      return await invoke<Timer | null>('get_timer', { id });
    }
    return mockStore.getTimer(id);
  },

  createTimer: async (timer: Timer): Promise<Timer> => {
    if (isTauri()) {
      return await invoke<Timer>('create_timer', { timer });
    }
    return mockStore.createTimer(timer);
  },

  updateTimer: async (timer: Timer): Promise<Timer> => {
    if (isTauri()) {
      return await invoke<Timer>('update_timer', { timer });
    }
    return mockStore.updateTimer(timer);
  },

  deleteTimer: async (id: string): Promise<void> => {
    if (isTauri()) {
      return await invoke<void>('delete_timer', { id });
    }
    return mockStore.deleteTimer(id);
  },

  // ================= Phase 4: Stage Display & Config =================

  getStageConfig: async (id?: string): Promise<StageConfig> => {
    if (isTauri()) {
      return await invoke<StageConfig>('get_stage_config', { id });
    }
    return mockStore.getStageConfig(id);
  },

  updateStageConfig: async (config: StageConfig): Promise<StageConfig> => {
    if (isTauri()) {
      return await invoke<StageConfig>('update_stage_config', { config });
    }
    return mockStore.updateStageConfig(config);
  },

  openStageWindow: async (
    monitorId?: string,
    fullscreen?: boolean
  ): Promise<StageWindowStatus> => {
    if (isTauri()) {
      return await invoke<StageWindowStatus>('open_stage_window', {
        monitorId,
        fullscreen,
      });
    }
    return mockStore.openStageWindow(monitorId, fullscreen);
  },

  closeStageWindow: async (): Promise<StageWindowStatus> => {
    if (isTauri()) {
      return await invoke<StageWindowStatus>('close_stage_window');
    }
    return mockStore.closeStageWindow();
  },

  getStageStatus: async (): Promise<StageWindowStatus> => {
    if (isTauri()) {
      return await invoke<StageWindowStatus>('get_stage_status');
    }
    return mockStore.getStageStatus();
  },

  // ================= Phase 4: Live Media Playback & Timers =================

  setMediaPlayback: async (
    mediaPlayback: MediaPlaybackState | null
  ): Promise<PresentationState> => {
    if (isTauri()) {
      return await invoke<PresentationState>('set_media_playback', {
        mediaPlayback,
      });
    }
    return mockStore.setMediaPlayback(mediaPlayback);
  },

  setTimerState: async (
    timerState: TimerState | null
  ): Promise<PresentationState> => {
    if (isTauri()) {
      return await invoke<PresentationState>('set_timer_state', {
        timerState,
      });
    }
    return mockStore.setTimerState(timerState);
  },

  // ================= Phase 5: Independent Outputs =================

  listOutputs: async (): Promise<OutputConfig[]> => {
    if (isTauri()) {
      return await invoke<OutputConfig[]>('list_outputs');
    }
    return mockStore.listOutputs();
  },

  getOutput: async (id: string): Promise<OutputConfig | null> => {
    if (isTauri()) {
      return await invoke<OutputConfig | null>('get_output', { id });
    }
    return mockStore.getOutput(id);
  },

  createOutput: async (output: OutputConfig): Promise<OutputConfig> => {
    if (isTauri()) {
      return await invoke<OutputConfig>('create_output', { output });
    }
    return mockStore.createOutput(output);
  },

  updateOutput: async (output: OutputConfig): Promise<OutputConfig> => {
    if (isTauri()) {
      return await invoke<OutputConfig>('update_output', { output });
    }
    return mockStore.updateOutput(output);
  },

  deleteOutput: async (id: string): Promise<void> => {
    if (isTauri()) {
      return await invoke<void>('delete_output', { id });
    }
    return mockStore.deleteOutput(id);
  },

  // ================= Phase 5: Livestream Overlay =================

  getOverlayConfig: async (): Promise<LivestreamOverlayConfig> => {
    if (isTauri()) {
      return await invoke<LivestreamOverlayConfig>('get_overlay_config');
    }
    return mockStore.getOverlayConfig();
  },

  updateOverlayConfig: async (
    config: LivestreamOverlayConfig
  ): Promise<LivestreamOverlayConfig> => {
    if (isTauri()) {
      return await invoke<LivestreamOverlayConfig>('update_overlay_config', {
        config,
      });
    }
    return mockStore.updateOverlayConfig(config);
  },

  regenerateOverlayToken: async (): Promise<string> => {
    if (isTauri()) {
      return await invoke<string>('regenerate_overlay_token');
    }
    return mockStore.regenerateOverlayToken();
  },

  toggleOverlayClear: async (): Promise<boolean> => {
    if (isTauri()) {
      return await invoke<boolean>('toggle_overlay_clear');
    }
    return mockStore.toggleOverlayClear();
  },

  openOverlayWindow: async (
    monitorId?: string,
    fullscreen?: boolean
  ): Promise<OverlayWindowStatus> => {
    if (isTauri()) {
      return await invoke<OverlayWindowStatus>('open_overlay_window', {
        monitorId,
        fullscreen,
      });
    }
    return mockStore.openOverlayWindow(monitorId, fullscreen);
  },

  closeOverlayWindow: async (): Promise<OverlayWindowStatus> => {
    if (isTauri()) {
      return await invoke<OverlayWindowStatus>('close_overlay_window');
    }
    return mockStore.closeOverlayWindow();
  },

  getOverlayStatus: async (): Promise<OverlayWindowStatus> => {
    if (isTauri()) {
      return await invoke<OverlayWindowStatus>('get_overlay_status');
    }
    return mockStore.getOverlayStatus();
  },

  getOverlayRenderPayload: async (): Promise<OverlayRenderPayload> => {
    if (isTauri()) {
      return await invoke<OverlayRenderPayload>('get_overlay_render_payload');
    }
    return mockStore.getOverlayRenderPayload();
  },

  // ================= Phase 5: Remote Control =================

  getRemoteServerStatus: async (): Promise<RemoteServerStatus> => {
    if (isTauri()) {
      return await invoke<RemoteServerStatus>('get_remote_server_status');
    }
    return mockStore.getRemoteServerStatus();
  },

  startRemoteServer: async (port?: number): Promise<RemoteServerStatus> => {
    if (isTauri()) {
      return await invoke<RemoteServerStatus>('start_remote_server', { port });
    }
    return mockStore.startRemoteServer(port);
  },

  stopRemoteServer: async (): Promise<RemoteServerStatus> => {
    if (isTauri()) {
      return await invoke<RemoteServerStatus>('stop_remote_server');
    }
    return mockStore.stopRemoteServer();
  },

  listRemoteDevices: async (): Promise<RemoteDevice[]> => {
    if (isTauri()) {
      return await invoke<RemoteDevice[]>('list_remote_devices');
    }
    return mockStore.listRemoteDevices();
  },

  approveRemoteDevice: async (
    id: string,
    isApproved: boolean
  ): Promise<void> => {
    if (isTauri()) {
      return await invoke<void>('approve_remote_device', { id, isApproved });
    }
    return mockStore.approveRemoteDevice(id, isApproved);
  },

  updateRemoteDevicePermissions: async (
    id: string,
    canNavigate: boolean,
    canBlackout: boolean,
    canTakeLive: boolean,
    canControlTimer: boolean,
    canRunMacros: boolean
  ): Promise<void> => {
    if (isTauri()) {
      return await invoke<void>('update_remote_device_permissions', {
        id,
        canNavigate,
        canBlackout,
        canTakeLive,
        canControlTimer,
        canRunMacros,
      });
    }
    return mockStore.updateRemoteDevicePermissions(
      id,
      canNavigate,
      canBlackout,
      canTakeLive,
      canControlTimer,
      canRunMacros
    );
  },

  deleteRemoteDevice: async (id: string): Promise<void> => {
    if (isTauri()) {
      return await invoke<void>('delete_remote_device', { id });
    }
    return mockStore.deleteRemoteDevice(id);
  },

  // ================= Phase 5: MIDI Integration =================

  getMidiStatus: async (): Promise<MidiStatus> => {
    if (isTauri()) {
      return await invoke<MidiStatus>('get_midi_status');
    }
    return mockStore.getMidiStatus();
  },

  listMidiDevices: async (): Promise<string[]> => {
    if (isTauri()) {
      return await invoke<string[]>('list_midi_devices');
    }
    return mockStore.listMidiDevices();
  },

  startMidiListener: async (devicePattern?: string): Promise<MidiStatus> => {
    if (isTauri()) {
      return await invoke<MidiStatus>('start_midi_listener', { devicePattern });
    }
    return mockStore.startMidiListener(devicePattern);
  },

  stopMidiListener: async (): Promise<MidiStatus> => {
    if (isTauri()) {
      return await invoke<MidiStatus>('stop_midi_listener');
    }
    return mockStore.stopMidiListener();
  },

  listMidiMappings: async (): Promise<MidiMapping[]> => {
    if (isTauri()) {
      return await invoke<MidiMapping[]>('list_midi_mappings');
    }
    return mockStore.listMidiMappings();
  },

  createMidiMapping: async (mapping: MidiMapping): Promise<MidiMapping> => {
    if (isTauri()) {
      return await invoke<MidiMapping>('create_midi_mapping', { mapping });
    }
    return mockStore.createMidiMapping(mapping);
  },

  updateMidiMapping: async (mapping: MidiMapping): Promise<MidiMapping> => {
    if (isTauri()) {
      return await invoke<MidiMapping>('update_midi_mapping', { mapping });
    }
    return mockStore.updateMidiMapping(mapping);
  },

  deleteMidiMapping: async (id: string): Promise<void> => {
    if (isTauri()) {
      return await invoke<void>('delete_midi_mapping', { id });
    }
    return mockStore.deleteMidiMapping(id);
  },

  // ================= Phase 5: OSC Integration =================

  getOscConfig: async (): Promise<OscConfig> => {
    if (isTauri()) {
      return await invoke<OscConfig>('get_osc_config');
    }
    return mockStore.getOscConfig();
  },

  updateOscConfig: async (config: OscConfig): Promise<OscConfig> => {
    if (isTauri()) {
      return await invoke<OscConfig>('update_osc_config', { config });
    }
    return mockStore.updateOscConfig(config);
  },

  getOscStatus: async (): Promise<OscStatus> => {
    if (isTauri()) {
      return await invoke<OscStatus>('get_osc_status');
    }
    return mockStore.getOscStatus();
  },

  startOscListener: async (port?: number): Promise<OscStatus> => {
    if (isTauri()) {
      return await invoke<OscStatus>('start_osc_listener', { port });
    }
    return mockStore.startOscListener(port);
  },

  stopOscListener: async (): Promise<OscStatus> => {
    if (isTauri()) {
      return await invoke<OscStatus>('stop_osc_listener');
    }
    return mockStore.stopOscListener();
  },

  // ================= Phase 5: Action Mapping & Unified Dispatch =================

  listActionMappings: async (): Promise<ActionMapping[]> => {
    if (isTauri()) {
      return await invoke<ActionMapping[]>('list_action_mappings');
    }
    return mockStore.listActionMappings();
  },

  updateActionMapping: async (mapping: ActionMapping): Promise<ActionMapping> => {
    if (isTauri()) {
      return await invoke<ActionMapping>('update_action_mapping', { mapping });
    }
    return mockStore.updateActionMapping(mapping);
  },

  resetActionMappingsToDefault: async (): Promise<void> => {
    if (isTauri()) {
      return await invoke<void>('reset_action_mappings_to_default');
    }
    return mockStore.resetActionMappingsToDefault();
  },

  dispatchAction: async (action: string): Promise<PresentationState> => {
    if (isTauri()) {
      return await invoke<PresentationState>('dispatch_action', { action });
    }
    return mockStore.dispatchAction(action);
  },

  // ================= Phase 5: System Diagnostics =================

  getSystemDiagnostics: async (): Promise<SystemDiagnostics> => {
    if (isTauri()) {
      return await invoke<SystemDiagnostics>('get_system_diagnostics');
    }
    return mockStore.getSystemDiagnostics();
  },

  // ================= Phase 6: Reliability, Recovery, Diagnostics & App Info =================

  getWorkspaceState: async (): Promise<WorkspaceState | null> => {
    if (isTauri()) {
      return await invoke<WorkspaceState | null>('get_workspace_state');
    }
    return mockStore.getWorkspaceState();
  },

  saveWorkspaceState: async (state: WorkspaceState): Promise<void> => {
    if (isTauri()) {
      return await invoke<void>('save_workspace_state', { state });
    }
    return mockStore.saveWorkspaceState(state);
  },

  getDiagnosticsLog: async (
    filter?: AppDiagnosticFilter
  ): Promise<AppDiagnosticEntry[]> => {
    if (isTauri()) {
      return await invoke<AppDiagnosticEntry[]>('get_diagnostics_log', { filter });
    }
    return mockStore.getDiagnosticsLog(filter);
  },

  logClientDiagnostic: async (
    level: 'INFO' | 'WARN' | 'ERROR' | 'FATAL',
    component: string,
    message: string,
    details?: string
  ): Promise<void> => {
    if (isTauri()) {
      return await invoke<void>('log_client_diagnostic', {
        level,
        component,
        message,
        details: details ?? null,
      });
    }
    return mockStore.logClientDiagnostic(level, component, message, details);
  },

  clearDiagnosticsLog: async (beforeTimestamp?: string): Promise<number> => {
    if (isTauri()) {
      return await invoke<number>('clear_diagnostics_log', { beforeTimestamp });
    }
    return mockStore.clearDiagnosticsLog(beforeTimestamp);
  },

  verifyDatabaseIntegrity: async (): Promise<string[]> => {
    if (isTauri()) {
      return await invoke<string[]>('verify_database_integrity');
    }
    return mockStore.verifyDatabaseIntegrity();
  },

  getAppInfo: async (): Promise<AppInfo> => {
    if (isTauri()) {
      return await invoke<AppInfo>('get_app_info');
    }
    return mockStore.getAppInfo();
  },

  openDevtools: async (): Promise<void> => {
    if (isTauri()) {
      return await invoke<void>('open_devtools');
    }
    return mockStore.openDevtools();
  },

  getAppDataDir: async (): Promise<string> => {
    if (isTauri()) {
      return await invoke<string>('get_app_data_dir');
    }
    return mockStore.getAppDataDir();
  },

  resolveMediaUrl: async (relativePath: string): Promise<string> => {
    if (isTauri()) {
      return await invoke<string>('resolve_media_url', { relativePath });
    }
    return mockStore.resolveMediaUrl(relativePath);
  },

  parseBibleReference: async (reference: string): Promise<BiblePassageQuery | null> => {
    if (isTauri()) {
      return await invoke<BiblePassageQuery | null>('parse_bible_reference', { reference });
    }
    return mockStore.parseBibleReference(reference);
  },

  importBibleVerses: async (verses: BibleVerse[]): Promise<number> => {
    if (isTauri()) {
      return await invoke<number>('import_bible_verses', { verses });
    }
    return mockStore.importBibleVerses(verses);
  },

  listBibleTranslations: async (): Promise<BibleTranslationInfo[]> => {
    if (isTauri()) {
      return await invoke<BibleTranslationInfo[]>('list_bible_translations');
    }
    return mockStore.listBibleTranslations();
  },

  /** Imports pasted Bible text; in the desktop app the Rust parser handles USFM/OSIS/Zefania/JSON. */
  importBibleText: async (raw: string, translation: string, parsed: BibleVerse[]): Promise<number> => {
    if (isTauri()) {
      return await invoke<number>('import_bible_text', { raw, translation });
    }
    if (parsed.length === 0) {
      throw new Error('Unrecognised Bible format. Supported: USFM, OSIS, Zefania XML, JSON.');
    }
    return mockStore.importBibleVerses(parsed);
  },

  /** Imports Bible files from disk (desktop app only). */
  importBibleFiles: async (paths: string[], translation: string): Promise<number> => {
    if (!isTauri()) {
      throw new Error('Importing Bible files requires the desktop app.');
    }
    return await invoke<number>('import_bible_files', { paths, translation });
  },

  /** Completions for a reference typed so far ("jo", "ps 2", "john 3:1"), from the imported verses. */
  suggestBibleReferences: async (input: string, translation: string, limit?: number): Promise<BibleSuggestion[]> => {
    if (isTauri()) {
      return await invoke<BibleSuggestion[]>('suggest_bible_references', { input, translation, limit });
    }
    return mockStore.suggestBibleReferences(input, translation, limit);
  },

  searchBibleVerses: async (
    query: string,
    translation?: string,
    limit?: number
  ): Promise<BibleVerse[]> => {
    if (isTauri()) {
      return await invoke<BibleVerse[]>('search_bible_verses', { query, translation, limit });
    }
    return mockStore.searchBibleVerses(query, translation, limit);
  },

  getDatabaseHealth: async (): Promise<DatabaseHealth> => {
    if (isTauri()) {
      return await invoke<DatabaseHealth>('get_database_health');
    }
    return mockStore.getDatabaseHealth();
  },

  recoverDatabaseFromBackup: async (backupFile?: string | null): Promise<boolean> => {
    if (isTauri()) {
      return await invoke<boolean>('recover_database_from_backup', { backupFile });
    }
    return mockStore.recoverDatabaseFromBackup(backupFile);
  },

  importPresentationDocument: async (
    filePath: string,
    title?: string
  ): Promise<Presentation> => {
    if (isTauri()) {
      return await invoke<Presentation>('import_presentation_document', { filePath, title });
    }
    return mockStore.importPresentationDocument(filePath, title);
  },

  setStageMessage: async (message: string | null): Promise<PresentationState> => {
    if (isTauri()) {
      return await invoke<PresentationState>('set_stage_message', { message });
    }
    return mockStore.setStageMessage(message);
  },

  getStageMessage: async (): Promise<string | null> => {
    return mockStore.getStageMessage();
  },
};


