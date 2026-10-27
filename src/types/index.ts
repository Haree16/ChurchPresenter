export type TextAlignment = 'left' | 'center' | 'right';
export type FontSize = 'small' | 'medium' | 'large' | 'xlarge';
export type SectionType =
  | 'verse'
  | 'chorus'
  | 'bridge'
  | 'pre_chorus'
  | 'intro'
  | 'outro'
  | 'refrain'
  | 'custom';

export interface Slide {
  id: string;
  presentationId: string;
  sortOrder: number;
  title: string;
  body: string;
  backgroundColor: string;
  foregroundColor: string;
  fontSize: FontSize;
  textAlignment: TextAlignment;
  themeOverride?: string | null;
  backgroundImage?: string | null;
  overlayColor?: string | null;
  lineSpacing?: number | null;
  textShadow?: string | null;
  verticalAlignment?: 'top' | 'center' | 'bottom' | null;
  fontFamily?: string | null;
  fontWeight?: string | null;
  /** Song group this slide came from (e.g. "Chorus"), shown as a coloured tag on the card. */
  groupLabel?: string | null;
  groupColor?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Presentation {
  id: string;
  title: string;
  category: 'Worship' | 'Hymn' | 'Scripture' | 'Sermon' | 'Announcements' | 'Other';
  themeName?: string | null;
  createdAt: string;
  updatedAt: string;
  slideCount?: number;
}

export interface PresentationState {
  currentPresentationId: string | null;
  currentSlideId: string | null;
  currentSlideIndex: number;
  totalSlides: number;
  currentSlide: Slide | null;
  nextSlide: Slide | null;
  isBlackout: boolean;
  isLogo?: boolean;
  isLive: boolean;
  currentServiceId?: string | null;
  currentItemId?: string | null;
  selectedServiceId?: string | null;
  selectedItemId?: string | null;
  mediaPlayback?: MediaPlaybackState | null;
  timerState?: TimerState | null;
  stageMessage?: string | null;
}

export interface DisplayMonitor {
  id: string;
  name: string;
  width: number;
  height: number;
  x: number;
  y: number;
  scaleFactor: number;
  isPrimary: boolean;
}

export interface AudienceWindowStatus {
  isOpen: boolean;
  monitorName: string | null;
  isFullscreen: boolean;
  error?: string | null;
}

// ================= Phase 2 Types =================

export interface Song {
  id: string;
  title: string;
  alternateTitle?: string | null;
  language: string;
  author?: string | null;
  composer?: string | null;
  copyright?: string | null;
  ccliNumber?: string | null;
  songKey?: string | null;
  tempo?: number | null;
  tags: string[];
  category: string;
  defaultThemeId?: string | null;
  sectionsCount?: number;
  createdAt: string;
  updatedAt: string;
}

export interface SongSection {
  id: string;
  songId: string;
  sectionType: SectionType;
  label: string;
  lyrics: string;
  sortOrder: number;
  notes?: string | null;
  /** Custom group colour (hex); falls back to the section type's default colour. */
  color?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

/** A named, ordered list of section ids; sections may repeat. */
export interface SongArrangement {
  id: string;
  songId: string;
  name: string;
  sectionIds: string[];
  isDefault: boolean;
}

export interface SongWithSections {
  song: Song;
  sections: SongSection[];
  /** Arrangements reference `sections` by id. Absent in files exported by older versions. */
  arrangements?: SongArrangement[];
}

export interface Theme {
  id: string;
  name: string;
  isBuiltIn: boolean;
  backgroundColor: string;
  backgroundImageId?: string | null;
  backgroundImagePath?: string | null;
  backgroundMode: 'cover' | 'contain' | 'stretch';
  fontFamily: string;
  fontSize: FontSize;
  fontWeight: string;
  textColor: string;
  textAlignment: TextAlignment;
  verticalAlignment: 'top' | 'center' | 'bottom';
  lineSpacing: number;
  textMargin: number;
  textShadow?: string | null;
  overlayColor?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface MediaAsset {
  id: string;
  filename: string;
  originalFilename: string;
  relativePath: string;
  mimeType: string;
  fileSize: number;
  mediaType: 'image' | 'video' | 'audio';
  durationSeconds?: number | null;
  width?: number | null;
  height?: number | null;
  thumbnailPath?: string | null;
  createdAt: string;
}

export interface SongExportData {
  version: string;
  exportedAt: string;
  app: string;
  songs: SongWithSections[];
  themes?: Theme[];
}

export interface SongImportOptions {
  duplicateMode: 'skip' | 'copy' | 'update';
}

export interface SongImportResult {
  importedCount: number;
  updatedCount: number;
  skippedCount: number;
  errorCount: number;
  errors: string[];
}

export interface SlideGenerationOptions {
  songId: string;
  sectionIds: string[];
  arrangementId?: string | null;
  targetPresentationId?: string | null;
  themeId?: string | null;
  linesPerSlide?: number | null;
  customDelimiter?: string | null;
  createNewPresentation: boolean;
  newPresentationTitle?: string | null;
}

export interface GenerateSlidesResponse {
  presentationId: string;
  slides: Slide[];
}

export interface BackupData {
  version: string;
  exportedAt: string;
  app: string;
  presentations: Presentation[];
  slides: Slide[];
  songs?: Song[];
  songSections?: SongSection[];
  themes?: Theme[];
  mediaAssets?: MediaAsset[];
  services?: Service[];
  serviceItems?: PlaylistItem[];
  serviceItemSlides?: Slide[];
  timers?: Timer[];
  stageConfigs?: StageConfig[];
  outputConfigs?: OutputConfig[];
  overlayConfigs?: LivestreamOverlayConfig[];
  remoteDevices?: RemoteDevice[];
  midiMappings?: MidiMapping[];
  oscConfigs?: OscConfig[];
  actionMappings?: ActionMapping[];
  workspaceState?: WorkspaceState | null;
  settings: Record<string, string>;
}

export interface ImportResult {
  presentationsImported: number;
  slidesImported: number;
  songsImported?: number;
  themesImported?: number;
  servicesImported?: number;
  serviceItemsImported?: number;
}

// ================= Phase 3 Types =================

export type PlaylistItemType =
  | 'song'
  | 'bible'
  | 'sermon'
  | 'announcement'
  | 'text'
  | 'image'
  | 'divider'
  | 'timer';

export interface Service {
  id: string;
  title: string;
  description?: string | null;
  serviceDate?: string | null;
  category: string;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
  itemCount?: number;
}

export interface PlaylistItem {
  id: string;
  serviceId: string;
  sortOrder: number;
  itemType: PlaylistItemType;
  title: string;
  notes?: string | null;
  sourceId?: string | null;
  themeId?: string | null;
  durationSeconds?: number | null;
  createdAt: string;
  updatedAt: string;
  slideCount?: number;
}

export interface ServiceWithItems {
  service: Service;
  items: PlaylistItem[];
}

export interface PlaylistItemWithSlides {
  item: PlaylistItem;
  slides: Slide[];
}

export interface BibleVerse {
  id: string;
  translation: string;
  book: string;
  bookNumber: number;
  chapter: number;
  verse: number;
  text: string;
}

export interface BibleTranslationInfo {
  translation: string;
  verseCount: number;
}

export interface BiblePassageQuery {
  translation: string;
  book: string;
  chapter: number;
  startVerse: number;
  endVerse?: number | null;
  secondaryTranslation?: string | null;
}

export interface BiblePassageResult {
  reference: string;
  translation: string;
  verses: BibleVerse[];
}

// ================= Phase 4 Types: Media Engine, Timers & Stage Display =================

export interface MediaPlaybackState {
  mediaId?: string | null;
  mediaUrl?: string | null;
  mediaType?: 'image' | 'video' | 'audio' | null;
  isPlaying: boolean;
  isMuted: boolean;
  volume: number; // 0.0 to 1.0
  isLooping: boolean;
  currentTime: number;
  duration: number;
  fitMode: 'cover' | 'contain' | 'stretch';
  error?: string | null;
}

export interface Timer {
  id: string;
  serviceId?: string | null;
  name: string;
  timerType: 'countdown' | 'elapsed';
  durationSeconds: number;
  warningThresholdSeconds: number;
  createdAt: string;
  updatedAt: string;
}

export interface TimerState {
  id?: string | null;
  name: string;
  timerType: 'countdown' | 'elapsed';
  durationSeconds: number;
  warningThresholdSeconds: number;
  isRunning: boolean;
  startTimeEpochMs?: number | null;
  accumulatedSeconds: number;
  isExpired: boolean;
}

export interface StageConfig {
  id: string;
  fontSize: 'small' | 'medium' | 'large' | 'xlarge' | string;
  showNotes: boolean;
  showTimer: boolean;
  showNext: boolean;
  highContrast: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface StageWindowStatus {
  isOpen: boolean;
  monitorName: string | null;
  isFullscreen: boolean;
  error?: string | null;
}

// ================= Phase 5 Types: Independent Outputs, Livestreaming, Remote, MIDI & OSC =================

export type OutputType = 'audience' | 'stage' | 'overlay' | 'presentation';
export type ContentSource = 'live_slide' | 'next_slide' | 'lyrics_only' | 'stage_layout' | 'custom_theme';
export type OverlayLayoutMode = 'lower_third' | 'full_screen' | 'pip';

export interface OutputConfig {
  id: string;
  name: string;
  outputType: OutputType;
  targetMonitorId?: string | null;
  resolutionWidth?: number | null;
  resolutionHeight?: number | null;
  aspectRatio: string;
  safeMarginPercent: number;
  contentSource: ContentSource;
  themeId?: string | null;
  isEnabled: boolean;
  isActive: boolean;
  error?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface LivestreamOverlayConfig {
  id: string;
  layoutMode: OverlayLayoutMode;
  fontFamily: string;
  fontSizePx: number;
  textColor: string;
  textShadow: string;
  textAlignment: TextAlignment;
  safeMarginHorizontalPct: number;
  safeMarginVerticalPct: number;
  showSpeakerLabel: boolean;
  showReference: boolean;
  isCleared: boolean;
  authToken: string;
  createdAt: string;
  updatedAt: string;
}

export interface OverlayWindowStatus {
  isOpen: boolean;
  monitorName: string | null;
  isFullscreen: boolean;
  error?: string | null;
}

export interface OverlayRenderPayload {
  isLive: boolean;
  isBlackout: boolean;
  isCleared: boolean;
  slide: Slide | null;
  itemTitle?: string | null;
  serviceTitle?: string | null;
  layoutMode: OverlayLayoutMode;
  fontFamily: string;
  fontSizePx: number;
  textColor: string;
  textShadow: string;
  textAlignment: TextAlignment;
  safeMarginHorizontalPct: number;
  safeMarginVerticalPct: number;
  showSpeakerLabel: boolean;
  showReference: boolean;
}

export interface RemoteDevice {
  id: string;
  deviceName: string;
  ipAddress: string;
  tokenHash: string;
  isApproved: boolean;
  canNavigate: boolean;
  canBlackout: boolean;
  canTakeLive: boolean;
  canControlTimer: boolean;
  pairedAt: string;
  lastSeenAt: string;
}

export interface RemoteServerStatus {
  isRunning: boolean;
  port: number;
  lanIps: string[];
  pairingPin?: string | null;
  connectedClientsCount: number;
  error?: string | null;
  /** 127.0.0.1 = this computer only, 0.0.0.0 = local network. */
  bindAddress?: string;
}

export interface RemotePairRequest {
  pin: string;
  deviceName: string;
}

export interface RemotePairResponse {
  success: boolean;
  requiresApproval: boolean;
  sessionToken?: string | null;
  message: string;
}

export interface MidiMapping {
  id: string;
  name: string;
  channel: number; // 0 = any, 1-16
  messageType: 'note_on' | 'control_change';
  noteOrCc: number;
  actionType: string;
  isEnabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface MidiEventMonitor {
  channel: number;
  messageType: string;
  noteOrCc: number;
  value: number;
  timestamp: string;
}

export interface MidiStatus {
  isRunning: boolean;
  currentDeviceName?: string | null;
  availableDevices: string[];
  lastEvent?: MidiEventMonitor | null;
  error?: string | null;
}

export interface OscConfig {
  id: string;
  isEnabled: boolean;
  listenPort: number;
  allowlistActions: string;
  createdAt: string;
  updatedAt: string;
}

export interface OscStatus {
  isRunning: boolean;
  port: number;
  lastReceivedPath?: string | null;
  lastReceivedTime?: string | null;
  error?: string | null;
  bindAddress?: string;
}

export interface ActionMapping {
  id: string;
  actionName: string;
  displayLabel: string;
  category: 'presentation' | 'service' | 'display' | 'timer';
  keyboardShortcut?: string | null;
  isEnabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SystemDiagnostics {
  outputs: OutputConfig[];
  audienceWindowOpen: boolean;
  stageWindowOpen: boolean;
  overlayWindowOpen: boolean;
  remoteServer: RemoteServerStatus;
  midiStatus: MidiStatus;
  oscStatus: OscStatus;
  recentErrors: string[];
}

// ================= Phase 6 Types =================

export interface WorkspaceState {
  id: string;
  selectedServiceId: string | null;
  selectedPresentationId: string | null;
  selectedItemId: string | null;
  selectedSlideIndex: number;
  activeTab: 'services' | 'presentations' | 'songs' | 'themes' | 'media' | 'stage' | 'outputs' | 'settings';
  lastSavedAt: string;
}

export interface AppDiagnosticEntry {
  id: string;
  timestamp: string;
  level: 'INFO' | 'WARN' | 'ERROR' | 'FATAL';
  component: string;
  message: string;
  details?: string | null;
}

export interface AppDiagnosticFilter {
  level?: string | null;
  component?: string | null;
  limit?: number | null;
}

export interface AppInfo {
  name: string;
  version: string;
  buildProfile: string;
  targetOs: string;
  databasePath: string;
  mediaDir: string;
  databaseIntegrity: boolean;
  totalServices: number;
  totalSongs: number;
  totalMedia: number;
}

export interface DatabaseHealth {
  isHealthy: boolean;
  isInMemory: boolean;
  error?: string | null;
  dbPath?: string | null;
  availableBackups: string[];
}


