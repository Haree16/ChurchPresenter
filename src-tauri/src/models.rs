use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Slide {
    pub id: String,
    pub presentation_id: String,
    pub sort_order: i32,
    pub title: String,
    pub body: String,
    pub background_color: String,
    pub foreground_color: String,
    pub font_size: String,
    pub text_alignment: String,
    pub theme_override: Option<String>,
    #[serde(default)]
    pub background_image: Option<String>,
    #[serde(default)]
    pub overlay_color: Option<String>,
    #[serde(default)]
    pub line_spacing: Option<f64>,
    #[serde(default)]
    pub text_shadow: Option<String>,
    #[serde(default)]
    pub vertical_alignment: Option<String>,
    #[serde(default)]
    pub font_family: Option<String>,
    #[serde(default)]
    pub font_weight: Option<String>,
    /// Song group this slide came from (e.g. "Chorus"); None for ordinary slides.
    #[serde(default)]
    pub group_label: Option<String>,
    /// Hex colour of that group.
    #[serde(default)]
    pub group_color: Option<String>,
    /// Safe margin and text outline; `None` keeps the default look.
    #[serde(default)]
    pub layout: Option<crate::layout::SlideLayout>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Presentation {
    pub id: String,
    pub title: String,
    pub category: String,
    pub theme_name: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    #[serde(default)]
    pub slide_count: i32,
}

/// Slides advancing by themselves every `interval_seconds`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AutoAdvanceStatus {
    pub id: String,
    pub interval_seconds: u32,
    /// Go back to the first slide after the last one instead of stopping.
    pub loop_at_end: bool,
    /// Unix ms of the next automatic advance.
    pub next_at_ms: i64,
    /// The slide the countdown is for. When the operator moves to another slide the countdown restarts
    /// with that slide's own time.
    #[serde(default)]
    pub slide_id: Option<String>,
}

/// A macro that is currently running (for the progress display).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RunningMacro {
    pub id: String,
    pub name: String,
    /// 1-based number of the step being run.
    pub step: usize,
    pub total: usize,
}

/// A short text banner shown over the audience output (e.g. a nursery call).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AudienceAlert {
    pub id: String,
    pub message: String,
    /// Unix time in milliseconds when the alert goes away; `None` keeps it up until cleared.
    pub expires_at_ms: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PresentationState {
    pub current_presentation_id: Option<String>,
    pub current_slide_id: Option<String>,
    pub current_slide_index: usize,
    pub total_slides: usize,
    pub current_slide: Option<Slide>,
    pub next_slide: Option<Slide>,
    pub is_blackout: bool,
    #[serde(default)]
    pub is_logo: bool,
    pub is_live: bool,
    #[serde(default)]
    pub current_service_id: Option<String>,
    #[serde(default)]
    pub current_item_id: Option<String>,
    #[serde(default)]
    pub selected_service_id: Option<String>,
    #[serde(default)]
    pub selected_item_id: Option<String>,
    #[serde(default)]
    pub media_playback: Option<MediaPlaybackState>,
    #[serde(default)]
    pub timer_state: Option<TimerState>,
    #[serde(default)]
    pub stage_message: Option<String>,
    #[serde(default)]
    pub alert: Option<AudienceAlert>,
    /// Props currently shown over the output (snapshots, so every window can draw them).
    #[serde(default)]
    pub active_props: Vec<crate::props::Prop>,
    #[serde(default)]
    pub auto_advance: Option<AutoAdvanceStatus>,
    #[serde(default)]
    pub running_macro: Option<RunningMacro>,
    /// Per-output layer overrides (logo, blackout, props, theme). If an output isn't listed, it uses global layers.
    #[serde(default)]
    pub screen_layers: std::collections::HashMap<String, ScreenLayers>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScreenLayers {
    #[serde(default)]
    pub is_logo: bool,
    #[serde(default)]
    pub is_blackout: bool,
    #[serde(default)]
    pub active_props: Vec<crate::props::Prop>,
    #[serde(default)]
    pub theme_id: Option<String>,
}

impl Default for PresentationState {
    fn default() -> Self {
        Self {
            current_presentation_id: None,
            current_slide_id: None,
            current_slide_index: 0,
            total_slides: 0,
            current_slide: None,
            next_slide: None,
            is_blackout: false,
            is_logo: false,
            is_live: false,
            current_service_id: None,
            current_item_id: None,
            selected_service_id: None,
            selected_item_id: None,
            media_playback: None,
            timer_state: None,
            stage_message: None,
            alert: None,
            active_props: Vec::new(),
            auto_advance: None,
            running_macro: None,
            screen_layers: std::collections::HashMap::new(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DisplayMonitor {
    pub id: String,
    pub name: String,
    pub width: u32,
    pub height: u32,
    pub x: i32,
    pub y: i32,
    pub scale_factor: f64,
    pub is_primary: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AudienceWindowStatus {
    pub is_open: bool,
    pub monitor_name: Option<String>,
    pub is_fullscreen: bool,
    pub error: Option<String>,
}

// ================= Phase 2 Models =================

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Song {
    pub id: String,
    pub title: String,
    pub alternate_title: Option<String>,
    pub language: String,
    pub author: Option<String>,
    pub composer: Option<String>,
    pub copyright: Option<String>,
    pub ccli_number: Option<String>,
    pub song_key: Option<String>,
    pub tempo: Option<i32>,
    pub tags: Vec<String>,
    pub category: String,
    pub default_theme_id: Option<String>,
    #[serde(default)]
    pub sections_count: i32,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SongSection {
    pub id: String,
    pub song_id: String,
    pub section_type: String, // verse, chorus, bridge, pre_chorus, intro, outro, refrain, custom
    pub label: String,
    pub lyrics: String,
    pub sort_order: i32,
    pub notes: Option<String>,
    /// Optional group colour (hex). `None` means "use the default for the section type".
    #[serde(default)]
    pub color: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

/// A named, ordered list of a song's sections (e.g. V1 C V2 C B C). Sections may repeat.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SongArrangement {
    #[serde(default)]
    pub id: String,
    #[serde(default)]
    pub song_id: String,
    pub name: String,
    pub section_ids: Vec<String>,
    #[serde(default)]
    pub is_default: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SongWithSections {
    pub song: Song,
    pub sections: Vec<SongSection>,
    /// Arrangements of the song; they reference `sections` by id.
    #[serde(default)]
    pub arrangements: Vec<SongArrangement>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Theme {
    pub id: String,
    pub name: String,
    pub is_built_in: bool,
    pub background_color: String,
    pub background_image_id: Option<String>,
    pub background_image_path: Option<String>,
    pub background_mode: String, // cover, contain, stretch
    pub font_family: String,
    pub font_size: String, // small, medium, large, xlarge
    pub font_weight: String,
    pub text_color: String,
    pub text_alignment: String, // left, center, right
    pub vertical_alignment: String, // top, center, bottom
    pub line_spacing: f64,
    pub text_margin: i32,
    pub text_shadow: Option<String>,
    pub overlay_color: Option<String>,
    /// Safe margin and outline copied onto slides made with this theme.
    #[serde(default)]
    pub layout: Option<crate::layout::SlideLayout>,
    pub created_at: String,
    pub updated_at: String,
}

fn default_media_type() -> String {
    "image".to_string()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MediaAsset {
    pub id: String,
    pub filename: String,
    pub original_filename: String,
    pub relative_path: String,
    pub mime_type: String,
    pub file_size: u64,
    pub created_at: String,
    #[serde(default = "default_media_type")]
    pub media_type: String, // "image", "video", "audio"
    #[serde(default)]
    pub duration_seconds: Option<f64>,
    #[serde(default)]
    pub width: Option<u32>,
    #[serde(default)]
    pub height: Option<u32>,
    #[serde(default)]
    pub thumbnail_path: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SongExportData {
    pub version: String,
    pub exported_at: String,
    pub app: String,
    pub songs: Vec<SongWithSections>,
    #[serde(default)]
    pub themes: Vec<Theme>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SongImportOptions {
    pub duplicate_mode: String, // skip, copy, update
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SongImportResult {
    pub imported_count: usize,
    pub updated_count: usize,
    pub skipped_count: usize,
    pub error_count: usize,
    pub errors: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SlideGenerationOptions {
    pub song_id: String,
    pub section_ids: Vec<String>,
    #[serde(default)]
    pub arrangement_id: Option<String>,
    pub target_presentation_id: Option<String>,
    pub theme_id: Option<String>,
    pub lines_per_slide: Option<i32>,
    pub custom_delimiter: Option<String>,
    pub create_new_presentation: bool,
    pub new_presentation_title: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupData {
    pub version: String,
    pub exported_at: String,
    pub app: String,
    pub presentations: Vec<Presentation>,
    pub slides: Vec<Slide>,
    #[serde(default)]
    pub songs: Vec<Song>,
    #[serde(default)]
    pub song_sections: Vec<SongSection>,
    #[serde(default)]
    pub song_arrangements: Vec<SongArrangement>,
    #[serde(default)]
    pub props: Vec<crate::props::Prop>,
    #[serde(default)]
    pub slide_templates: Vec<crate::templates::SlideTemplate>,
    #[serde(default)]
    pub macros: Vec<crate::macros::Macro>,
    #[serde(default)]
    pub looks: Vec<crate::looks::Look>,
    #[serde(default)]
    pub key_bindings: Vec<crate::keybindings::KeyBinding>,
    #[serde(default)]
    pub clear_groups: Vec<crate::clear_groups::ClearGroup>,
    #[serde(default)]
    pub song_usage: Vec<crate::ccli::SongUsage>,
    #[serde(default)]
    pub service_templates: Vec<crate::service_templates::StoredTemplate>,
    #[serde(default)]
    pub themes: Vec<Theme>,
    #[serde(default)]
    pub media_assets: Vec<MediaAsset>,
    #[serde(default)]
    pub services: Vec<Service>,
    #[serde(default)]
    pub service_items: Vec<PlaylistItem>,
    #[serde(default)]
    pub service_item_slides: Vec<Slide>,
    #[serde(default)]
    pub timers: Vec<Timer>,
    #[serde(default)]
    pub stage_configs: Vec<StageConfig>,
    #[serde(default)]
    pub output_configs: Vec<OutputConfig>,
    #[serde(default)]
    pub overlay_configs: Vec<LivestreamOverlayConfig>,
    #[serde(default)]
    pub remote_devices: Vec<RemoteDevice>,
    #[serde(default)]
    pub midi_mappings: Vec<MidiMapping>,
    #[serde(default)]
    pub osc_configs: Vec<OscConfig>,
    #[serde(default)]
    pub action_mappings: Vec<ActionMapping>,
    #[serde(default)]
    pub workspace_state: Option<WorkspaceState>,
    pub settings: std::collections::HashMap<String, String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportResult {
    pub presentations_imported: usize,
    pub slides_imported: usize,
    #[serde(default)]
    pub songs_imported: usize,
    #[serde(default)]
    pub themes_imported: usize,
    #[serde(default)]
    pub services_imported: usize,
    #[serde(default)]
    pub service_items_imported: usize,
    #[serde(default)]
    pub outputs_imported: usize,
    #[serde(default)]
    pub mappings_imported: usize,
}

// ================= Phase 3 Models =================

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Service {
    pub id: String,
    pub title: String,
    pub description: Option<String>,
    pub service_date: Option<String>,
    pub category: String,
    pub notes: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    #[serde(default)]
    pub item_count: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlaylistItem {
    pub id: String,
    pub service_id: String,
    pub sort_order: i32,
    pub item_type: String, // "song", "bible", "sermon", "announcement", "text", "image", "divider", "timer"
    pub title: String,
    pub notes: Option<String>,
    pub source_id: Option<String>,
    pub theme_id: Option<String>,
    pub duration_seconds: Option<i32>,
    pub created_at: String,
    pub updated_at: String,
    #[serde(default)]
    pub slide_count: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ServiceWithItems {
    pub service: Service,
    pub items: Vec<PlaylistItem>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlaylistItemWithSlides {
    pub item: PlaylistItem,
    pub slides: Vec<Slide>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BibleVerse {
    pub id: String,
    pub translation: String,
    pub book: String,
    pub book_number: i32,
    pub chapter: i32,
    pub verse: i32,
    pub text: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BibleTranslationInfo {
    pub translation: String,
    pub verse_count: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BiblePassageQuery {
    pub translation: String,
    pub book: String,
    pub chapter: i32,
    pub start_verse: i32,
    pub end_verse: Option<i32>,
    #[serde(default)]
    pub secondary_translation: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BiblePassageResult {
    pub reference: String,
    pub translation: String,
    pub verses: Vec<BibleVerse>,
}

// ================= Phase 4 Models =================

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MediaPlaybackState {
    pub media_id: Option<String>,
    pub media_url: Option<String>,
    pub media_type: Option<String>, // "image", "video", "audio"
    pub is_playing: bool,
    pub is_muted: bool,
    pub volume: f32,
    pub is_looping: bool,
    pub current_time: f64,
    pub duration: f64,
    pub fit_mode: String, // "cover", "contain", "stretch"
    pub error: Option<String>,
}

impl Default for MediaPlaybackState {
    fn default() -> Self {
        Self {
            media_id: None,
            media_url: None,
            media_type: None,
            is_playing: false,
            is_muted: false,
            volume: 1.0,
            is_looping: true,
            current_time: 0.0,
            duration: 0.0,
            fit_mode: "cover".to_string(),
            error: None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Timer {
    pub id: String,
    pub service_id: Option<String>,
    pub name: String,
    pub timer_type: String, // "countdown" or "elapsed"
    pub duration_seconds: i64,
    pub warning_threshold_seconds: i64,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TimerState {
    pub id: Option<String>,
    pub name: String,
    pub timer_type: String, // "countdown" or "elapsed"
    pub duration_seconds: i64,
    pub warning_threshold_seconds: i64,
    pub is_running: bool,
    pub start_time_epoch_ms: Option<i64>,
    pub accumulated_seconds: f64,
    pub is_expired: bool,
}

impl Default for TimerState {
    fn default() -> Self {
        Self {
            id: None,
            name: "Countdown".to_string(),
            timer_type: "countdown".to_string(),
            duration_seconds: 300,
            warning_threshold_seconds: 60,
            is_running: false,
            start_time_epoch_ms: None,
            accumulated_seconds: 0.0,
            is_expired: false,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StageConfig {
    pub id: String,
    pub font_size: String, // "medium", "large", "xlarge"
    pub show_notes: bool,
    pub show_timer: bool,
    pub show_next: bool,
    pub high_contrast: bool,
    /// Custom panel layout; empty means the classic stage layout.
    #[serde(default)]
    pub panels: Vec<crate::stage_layout::StagePanel>,
    pub created_at: String,
    pub updated_at: String,
}

impl Default for StageConfig {
    fn default() -> Self {
        let now = chrono::Utc::now().to_rfc3339();
        Self {
            id: "default-stage".to_string(),
            font_size: "large".to_string(),
            show_notes: true,
            show_timer: true,
            show_next: true,
            high_contrast: true,
            panels: Vec::new(),
            created_at: now.clone(),
            updated_at: now,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StageWindowStatus {
    pub is_open: bool,
    pub monitor_name: Option<String>,
    pub is_fullscreen: bool,
    pub error: Option<String>,
}

pub type OverlayWindowStatus = StageWindowStatus;

// ================= Phase 5 Models =================

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OutputConfig {
    pub id: String,
    pub name: String,
    pub output_type: String, // "audience", "stage", "overlay", "presentation"
    pub target_monitor_id: Option<String>,
    pub resolution_width: Option<u32>,
    pub resolution_height: Option<u32>,
    pub aspect_ratio: String, // "16:9", "4:3", "custom"
    pub safe_margin_percent: f64,
    pub content_source: String, // "live_slide", "next_slide", "lyrics_only", "stage_layout", "custom_theme"
    pub theme_id: Option<String>,
    pub is_enabled: bool,
    pub is_active: bool,
    pub error: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LivestreamOverlayConfig {
    pub id: String,
    pub layout_mode: String, // "lower_third", "full_screen", "pip"
    pub font_family: String,
    pub font_size_px: u32,
    pub text_color: String,
    pub text_shadow: String,
    pub text_alignment: String, // "left", "center", "right"
    pub safe_margin_horizontal_pct: f64,
    pub safe_margin_vertical_pct: f64,
    pub show_speaker_label: bool,
    pub show_reference: bool,
    pub is_cleared: bool,
    pub auth_token: String,
    pub created_at: String,
    pub updated_at: String,
}

impl Default for LivestreamOverlayConfig {
    fn default() -> Self {
        let now = chrono::Utc::now().to_rfc3339();
        Self {
            id: "default-overlay".to_string(),
            layout_mode: "lower_third".to_string(),
            font_family: "Inter, system-ui, sans-serif".to_string(),
            font_size_px: 42,
            text_color: "#ffffff".to_string(),
            text_shadow: "2px 2px 4px rgba(0,0,0,0.85)".to_string(),
            text_alignment: "center".to_string(),
            safe_margin_horizontal_pct: 5.0,
            safe_margin_vertical_pct: 6.0,
            show_speaker_label: true,
            show_reference: true,
            is_cleared: false,
            auth_token: uuid::Uuid::new_v4().to_string(),
            created_at: now.clone(),
            updated_at: now,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteDevice {
    pub id: String,
    pub device_name: String,
    pub ip_address: String,
    pub token_hash: String,
    pub is_approved: bool,
    pub can_navigate: bool,
    pub can_blackout: bool,
    pub can_take_live: bool,
    pub can_control_timer: bool,
    /// Whether this device may run saved macros. Off by default: a macro can do anything the operator can.
    #[serde(default)]
    pub can_run_macros: bool,
    pub paired_at: String,
    pub last_seen_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteServerStatus {
    pub is_running: bool,
    pub port: u16,
    pub lan_ips: Vec<String>,
    pub pairing_pin: Option<String>,
    pub connected_clients_count: usize,
    pub error: Option<String>,
    /// Address the server listens on (127.0.0.1 = this computer only, 0.0.0.0 = local network).
    #[serde(default)]
    pub bind_address: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemotePairRequest {
    pub pin: String,
    pub device_name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemotePairResponse {
    pub success: bool,
    pub requires_approval: bool,
    pub session_token: Option<String>,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[allow(dead_code)]
pub struct RemoteActionRequest {
    pub action: String,
    pub value: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MidiMapping {
    pub id: String,
    pub name: String,
    pub channel: u8, // 0 = any, 1-16
    pub message_type: String, // "note_on", "control_change"
    pub note_or_cc: u8,
    pub action_type: String,
    pub is_enabled: bool,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MidiEventMonitor {
    pub channel: u8,
    pub message_type: String,
    pub note_or_cc: u8,
    pub value: u8,
    pub timestamp: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MidiStatus {
    pub is_running: bool,
    pub current_device_name: Option<String>,
    pub available_devices: Vec<String>,
    pub last_event: Option<MidiEventMonitor>,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OscConfig {
    pub id: String,
    pub is_enabled: bool,
    pub listen_port: u16,
    pub allowlist_actions: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OscStatus {
    pub is_running: bool,
    pub port: u16,
    pub last_received_path: Option<String>,
    pub last_received_time: Option<String>,
    pub error: Option<String>,
    #[serde(default)]
    pub bind_address: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ActionMapping {
    pub id: String,
    pub action_name: String,
    pub display_label: String,
    pub category: String,
    pub keyboard_shortcut: Option<String>,
    pub is_enabled: bool,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemDiagnostics {
    pub outputs: Vec<OutputConfig>,
    pub audience_window_open: bool,
    pub stage_window_open: bool,
    pub overlay_window_open: bool,
    pub remote_server: RemoteServerStatus,
    pub midi_status: MidiStatus,
    pub osc_status: OscStatus,
    pub recent_errors: Vec<String>,
}

// ================= Phase 6 Models =================

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceState {
    pub id: String,
    pub selected_service_id: Option<String>,
    pub selected_presentation_id: Option<String>,
    pub selected_item_id: Option<String>,
    pub selected_slide_index: usize,
    pub active_tab: String,
    pub last_saved_at: String,
}

impl Default for WorkspaceState {
    fn default() -> Self {
        Self {
            id: "current_workspace".to_string(),
            selected_service_id: None,
            selected_presentation_id: None,
            selected_item_id: None,
            selected_slide_index: 0,
            active_tab: "services".to_string(),
            last_saved_at: chrono::Utc::now().to_rfc3339(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppDiagnosticEntry {
    pub id: String,
    pub timestamp: String,
    pub level: String, // "INFO", "WARN", "ERROR", "FATAL"
    pub component: String,
    pub message: String,
    pub details: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppDiagnosticFilter {
    pub level: Option<String>,
    pub component: Option<String>,
    pub limit: Option<usize>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppInfo {
    pub name: String,
    pub version: String,
    pub build_profile: String,
    pub target_os: String,
    pub database_path: String,
    pub media_dir: String,
    pub database_integrity: bool,
    pub total_services: usize,
    pub total_songs: usize,
    pub total_media: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DatabaseHealth {
    pub is_healthy: bool,
    pub is_in_memory: bool,
    pub error: Option<String>,
    pub db_path: Option<String>,
    pub available_backups: Vec<String>,
}


