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

/**
 * An extra box on a slide: a text box, an image or a plain shape. Positions and sizes are
 * percentages of the slide, so a slide looks the same on any screen. Later elements draw on top.
 */
export interface SlideElement {
  id: string;
  kind: 'text' | 'image' | 'shape';
  x: number;
  y: number;
  w: number;
  h: number;
  /** Text boxes. */
  text?: string | null;
  /** Text size as % of the slide height (1-30). */
  fontSizePct?: number | null;
  /** `#rrggbb` */
  color?: string | null;
  align?: 'left' | 'center' | 'right' | null;
  weight?: 'normal' | 'bold' | null;
  /** Images: a media-library path such as `media/logo.png`. */
  imagePath?: string | null;
  /** Shapes. */
  shape?: 'rect' | 'ellipse' | null;
  /** Shape colour, `#rrggbb`. */
  fill?: string | null;
  /** 0 (invisible) to 1 (solid). */
  opacity?: number | null;
  /** Rotation in degrees (-360 to 360). */
  rotation?: number | null;
}

/** Safe margin, text outline and extra elements for a slide or theme. Empty = default look. */
export interface SlideLayout {
  /** Keep text this far inside every edge, % of the screen (0-25). */
  marginPct?: number | null;
  /** Outline thickness in points at 1080p (0-20). */
  outlineWidth?: number | null;
  /** `#rrggbb`; used when outlineWidth is above 0. */
  outlineColor?: string | null;
  /** Extra text boxes, images and shapes, drawn in order (the last one on top). */
  elements?: SlideElement[];
  /** How long auto-advance keeps this slide up, in seconds (1-3600); unset uses the run's own interval. */
  advanceSeconds?: number | null;
}

/** A saved slide look that can be applied to any slide. */
export interface SlideTemplate {
  id: string;
  name: string;
  backgroundColor: string;
  foregroundColor: string;
  fontSize: FontSize;
  textAlignment: TextAlignment;
  /** Media-library path, or null for a plain colour background. */
  backgroundImage?: string | null;
  layout?: SlideLayout | null;
  sortOrder?: number;
  createdAt?: string;
  updatedAt?: string;
}

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
  layout?: SlideLayout | null;
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

export type PropScrollMode = 'none' | 'left' | 'right' | 'up';

/** Planning Center Services integration models. */
export interface PlanningCenterStatus {
  isConnected: boolean;
  organizationName?: string | null;
  appIdMasked?: string | null;
  lastSyncedAt?: string | null;
}

export interface PcoServiceType {
  id: string;
  name: string;
}

export interface PcoPlan {
  id: string;
  serviceTypeId: string;
  dates: string;
  title?: string | null;
  seriesTitle?: string | null;
  sortDate: string;
}

export interface PcoItem {
  id: string;
  title: string;
  itemType: 'song' | 'header' | 'regular' | string;
  servicePosition: 'pre' | 'during' | 'post' | string;
  sequence: number;
  length?: number | null;
  description?: string | null;
  songId?: string | null;
  songTitle?: string | null;
  ccliNumber?: string | null;
  author?: string | null;
}

export interface PcoPlanDetail {
  plan: PcoPlan;
  items: PcoItem[];
}

export interface PcoImportResult {
  serviceId: string;
  serviceTitle: string;
  matchedSongsCount: number;
  placeholderSongsCount: number;
  totalItemsCount: number;
}

/** Phase 10.2: DMX512 Lighting Control (Art-Net). */
export interface DmxConfig {
  id: string;
  isEnabled: boolean;
  targetIp: string;
  targetPort: number;
  universe: number;
  triggerOnSlideChange: boolean;
  slideCueChannel: number;
  createdAt: string;
  updatedAt: string;
}

/** Phase 10.2: Stream Deck Button layout model. */
export interface StreamDeckButton {
  row: number;
  col: number;
  title: string;
  oscPath: string;
  action: string;
  color: string;
  icon: string;
  description: string;
}

/** Phase 10.2: Stream Deck & Companion profile export package. */
export interface StreamDeckProfileExport {
  application: string;
  defaultOscPort: number;
  buttons: StreamDeckButton[];
  companionOscSummary: string;
}

/** A saved overlay (text lower-third, logo bug, ...) toggled over the audience output. */
export interface Prop {
  id: string;
  name: string;
  kind: 'text' | 'image';
  text?: string | null;
  imagePath?: string | null;
  position:
    | 'lower-third'
    | 'top-bar'
    | 'top-left'
    | 'top-right'
    | 'bottom-left'
    | 'bottom-right'
    | 'bottom-bar'
    | 'center';
  /** Text: font size as % of screen height. Image: width as % of screen width. */
  sizePct: number;
  textColor: string;
  backgroundColor?: string | null;
  /** Scrolling marquee / ticker mode ('none' | 'left' | 'right' | 'up'). */
  scrollMode?: PropScrollMode | null;
  /** Scroll speed from 1 (slow) to 10 (fast). Default 3. */
  scrollSpeed?: number | null;
  sortOrder?: number;
  createdAt?: string;
  updatedAt?: string;
}

/** Slides advancing by themselves every `intervalSeconds`. */
export interface AutoAdvanceStatus {
  id: string;
  intervalSeconds: number;
  /** Go back to the first slide after the last one instead of stopping. */
  loopAtEnd: boolean;
  /** Unix ms of the next automatic advance. */
  nextAtMs: number;
  /** The slide the countdown is for; it restarts when the operator moves to another slide. */
  slideId?: string | null;
}

/** A macro that is running right now. */
export interface RunningMacro {
  id: string;
  name: string;
  /** 1-based number of the step being run. */
  step: number;
  total: number;
}

export type MacroStep =
  | { type: 'action'; action: string }
  | { type: 'alert'; message: string; seconds?: number | null }
  | { type: 'prop'; propId: string; mode: 'show' | 'hide' | 'toggle' }
  | { type: 'wait'; seconds: number }
  | { type: 'autoAdvance'; intervalSeconds: number; loopAtEnd?: boolean }
  | { type: 'look'; lookId: string }
  | { type: 'clearGroup'; groupId: string }
  | {
      type: 'obs';
      command: 'set_scene' | 'start_stream' | 'stop_stream' | 'start_record' | 'stop_record';
      sceneName?: string;
    }
  | {
      type: 'camera';
      command: 'enable' | 'disable' | 'toggle' | 'select_device';
      deviceId?: string;
    };

export type KeyBindingTargetType = 'action' | 'prop' | 'macro' | 'look' | 'clearGroup';

export type ClearLayer = 'slide' | 'media' | 'logo' | 'blackout' | 'alert' | 'props' | 'autoAdvance' | 'announcements';

/** A named choice of output layers that are cleared together with one click. */
export interface ClearGroup {
  id: string;
  name: string;
  layers: ClearLayer[];
  sortOrder?: number;
  createdAt?: string;
  updatedAt?: string;
}

/** A keyboard shortcut chosen by the operator, for example `Ctrl+Shift+F5` toggling a prop. */
export interface KeyBinding {
  id: string;
  /** Canonical form: modifiers in the order Ctrl, Alt, Shift, Meta, then the key. */
  combo: string;
  targetType: KeyBindingTargetType;
  /** The action name, or the id of the prop / macro / look. */
  targetId: string;
  createdAt?: string;
  updatedAt?: string;
}

/** Configuration of layers and theme override for a specific target screen output. */
export interface ScreenLookConfig {
  outputId: string;
  logo: boolean;
  blackout: boolean;
  propIds: string[];
  themeId?: string | null;
}

/** A saved arrangement of the output layers: logo, blackout and which props are showing. */
export interface Look {
  id: string;
  name: string;
  logo: boolean;
  blackout: boolean;
  /** Props to show, in drawing order. */
  propIds: string[];
  /** Optional per-screen overrides. If empty, the global logo/blackout/propIds apply to all outputs. */
  screenConfigs?: ScreenLookConfig[];
  sortOrder?: number;
  createdAt?: string;
  updatedAt?: string;
}

/** A saved list of steps run with one click. */
export interface Macro {
  id: string;
  name: string;
  steps: MacroStep[];
  sortOrder?: number;
  createdAt?: string;
  updatedAt?: string;
}

/** Short banner over the audience output (e.g. a nursery call). */
export interface AudienceAlert {
  id: string;
  message: string;
  /** Unix ms when it disappears; null/absent keeps it up until cleared. */
  expiresAtMs?: number | null;
}

export interface ScreenLayers {
  isLogo: boolean;
  isBlackout: boolean;
  activeProps: Prop[];
  themeId?: string | null;
}

export interface AnnouncementsState {
  presentationId?: string | null;
  serviceId?: string | null;
  itemId?: string | null;
  slideId?: string | null;
  slideIndex: number;
  totalSlides: number;
  currentSlide: Slide | null;
  nextSlide: Slide | null;
  isLive: boolean;
  isLooping?: boolean;
  autoAdvanceSeconds?: number | null;
  nextAdvanceAtMs?: number | null;
  targetOutputIds?: string[];
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
  screenLayers?: Record<string, ScreenLayers>;
  announcements?: AnnouncementsState | null;
  alert?: AudienceAlert | null;
  activeProps?: Prop[];
  autoAdvance?: AutoAdvanceStatus | null;
  runningMacro?: RunningMacro | null;
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

export interface ThemeExportResult {
  count: number;
  warnings: string[];
}

export interface ThemeImportResult {
  imported: Theme[];
  warnings: string[];
  /** Font families the imported themes use (generic ones excluded). */
  fonts: string[];
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
  /** Safe margin and outline copied onto slides made with this theme. */
  layout?: SlideLayout | null;
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
  // Phase 10.3: Media Inspector Settings
  cropTop?: number;
  cropBottom?: number;
  cropLeft?: number;
  cropRight?: number;
  rotation?: number; // 0, 90, 180, 270
  volume?: number; // 0.0 to 1.0
  trimIn?: number; // seconds
  trimOut?: number | null; // seconds
  isLooping?: boolean;
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
  obsConfigs?: ObsConfig[];
  liveVideoConfigs?: LiveVideoConfig[];
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

/** A reference completion offered while typing in the Bible lookup box. */
export interface BibleSuggestion {
  /** What goes in the box when chosen, e.g. `John 3:16-17`. */
  label: string;
  book: string;
  bookNumber: number;
  chapter: number | null;
  startVerse: number | null;
  endVerse: number | null;
}

/** What a PowerPoint import gives back. */
export interface PptxImportResult {
  presentation: Presentation;
  slideCount: number;
  /** What could not be imported, in plain words. */
  warnings: string[];
}

/** A saved service layout that new services can start from. */
export interface ServiceTemplateSummary {
  id: string;
  name: string;
  itemCount: number;
  /** Songs and scripture: the items that can be left as empty slots. */
  slotCount: number;
  createdAt: string;
}

/** Found words with a little text around them, for showing where a search matched. */
export interface SearchPreview {
  before: string;
  matched: string;
  after: string;
}

/** A song whose lyrics contain the searched words (its best section). */
export interface LyricHit extends SearchPreview {
  songId: string;
  sectionId: string;
  sectionLabel: string;
  /** 0: the whole phrase; 1: every word, but not together. */
  rank: number;
}

/** A presentation with a slide containing the searched words (its best slide). */
export interface SlideHit extends SearchPreview {
  presentationId: string;
  slideId: string;
  /** Position of the slide in its presentation, starting at 1. */
  slideNumber: number;
  rank: number;
}

/** One time a song went live in a service (counted once per song per service per day). */
export interface SongUsage {
  id: string;
  songId: string;
  serviceId: string;
  songTitle: string;
  ccliNumber?: string | null;
  author?: string | null;
  copyright?: string | null;
  serviceTitle: string;
  /** Local date, YYYY-MM-DD. */
  usedOn: string;
  usedAt: string;
}

export interface CcliReportRow {
  songId: string;
  songTitle: string;
  ccliNumber?: string | null;
  author?: string | null;
  copyright?: string | null;
  timesUsed: number;
  dates: string[];
}

export interface CcliReport {
  from: string;
  to: string;
  licenceNumber?: string | null;
  /** Most used first, then by title. */
  rows: CcliReportRow[];
  /** Songs in the range that have no CCLI number, so they cannot be reported to CCLI. */
  songsWithoutNumber: number;
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

/** The things a stage panel can show. Each may appear once per layout. */
export type StagePanelKind = 'current' | 'next' | 'clock' | 'timer' | 'message' | 'status' | 'notes' | 'multiviewer';

/** A panel on the stage display, positioned in percent of the stage screen. */
export interface StagePanel {
  id: string;
  kind: StagePanelKind;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Text size as % of the stage height (1-30); omitted uses the panel's default. */
  fontSizePct?: number | null;
}

export interface StageConfig {
  id: string;
  fontSize: 'small' | 'medium' | 'large' | 'xlarge' | string;
  showNotes: boolean;
  showTimer: boolean;
  showNext: boolean;
  highContrast: boolean;
  /** Custom panel layout; empty or absent means the classic stage layout. */
  panels?: StagePanel[];
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
  /** May run saved macros from the phone page. Off until the operator allows it. */
  canRunMacros: boolean;
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
  tlsEnabled?: boolean;
  tlsFingerprint?: string | null;
  remoteUrl?: string;
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
  tlsFingerprint?: string | null;
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
  sharedSecret?: string | null;
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
  hasSharedSecret?: boolean;
}

export interface ActionMapping {
  id: string;
  actionName: string;
  displayLabel: string;
  category: 'presentation' | 'service' | 'display' | 'timer' | 'recording';
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

// Phase 10.4: Auto-updater
export interface UpdaterConfig {
  checkOnStartup: boolean;
  feedUrl: string;
  lastCheckedAt?: string | null;
}

export interface UpdateCheckResult {
  isAvailable: boolean;
  currentVersion: string;
  latestVersion: string;
  releaseNotes?: string | null;
  publishedAt?: string | null;
  downloadUrl?: string | null;
  isLiveBlocked: boolean;
  error?: string | null;
}

export interface UpdateInstallResult {
  success: boolean;
  message: string;
  restarted: boolean;
}

// Phase 11.1: Audience Output Recording
export interface RecordingConfig {
  outputDirectory?: string | null;
  containerFormat: 'webm' | 'mp4';
  resolution: '1080p' | '720p' | '4k' | 'native';
  videoBitrate: number;
  frameRate: number;
  includeAudio: boolean;
}

export interface RecordingStatus {
  isRecording: boolean;
  isPaused: boolean;
  sessionId?: string | null;
  startedAt?: string | null;
  elapsedSeconds: number;
  currentFilePath?: string | null;
  currentFileSizeBytes: number;
  totalFramesRecorded: number;
  outputDirectory: string;
}

export interface RecordedFile {
  filename: string;
  fullPath: string;
  fileSizeBytes: number;
  durationSeconds: number;
  createdAt: string;
  containerFormat: string;
}

// Phase 11.2: OBS Studio WebSocket v5
export interface ObsConfig {
  id: string;
  isEnabled: boolean;
  host: string;
  port: number;
  password?: string | null;
  autoConnect: boolean;
  switchSceneOnServiceItem: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ObsStatus {
  isConnected: boolean;
  isAuthenticated: boolean;
  currentScene?: string | null;
  scenes: string[];
  isStreaming: boolean;
  isRecording: boolean;
  isVirtualCamActive: boolean;
  error?: string | null;
  obsVersion?: string | null;
}

// Phase 11.3: Live Video Input (Capture Devices & IMAG)
export interface CameraDeviceInfo {
  deviceId: string;
  label: string;
  isDefault: boolean;
}

export interface LiveVideoConfig {
  id: string;
  isEnabled: boolean;
  isActive: boolean;
  selectedDeviceId?: string | null;
  resolution: '1080p' | '720p' | '4k' | 'default';
  frameRate: number;
  aspectRatio: string;
  fitMode: 'cover' | 'contain' | 'fill';
  flipHorizontal: boolean;
  opacity: number;
  displayMode: 'background_imag' | 'standalone_slide' | 'pip';
  pipPosition: 'bottom_right' | 'bottom_left' | 'top_right' | 'top_left';
  pipSizePercent: number;
  createdAt: string;
  updatedAt: string;
}

export interface LiveVideoStatus {
  isCapturing: boolean;
  activeDeviceId?: string | null;
  activeDeviceLabel?: string | null;
  displayMode: string;
  availableDevices: CameraDeviceInfo[];
  error?: string | null;
}


