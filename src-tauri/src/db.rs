use crate::models::{
    ActionMapping, AppDiagnosticEntry, AppDiagnosticFilter, BackupData, BiblePassageQuery, SongArrangement,
    BiblePassageResult, BibleTranslationInfo, BibleVerse, DatabaseHealth, LivestreamOverlayConfig, MediaAsset,
    MidiMapping, OscConfig, OutputConfig, PlaylistItem, PlaylistItemWithSlides, Presentation,
    RemoteDevice, Service, ServiceWithItems, Slide, SlideGenerationOptions, Song, SongExportData,
    SongImportOptions, SongImportResult, SongSection, SongWithSections, StageConfig, Theme,
    Timer, WorkspaceState,
};
use chrono::Utc;
use rusqlite::{params, Connection, Result};
use std::collections::HashMap;
use std::fs;
use std::path::Path;
use std::sync::{Arc, Mutex};
use uuid::Uuid;

#[derive(Clone)]
pub struct DbManager {
    conn: Arc<Mutex<Connection>>,
    db_path: Option<std::path::PathBuf>,
    init_error: Option<String>,
}

impl DbManager {
    pub fn new(db_path: &Path) -> Result<Self> {
        if let Some(parent) = db_path.parent() {
            fs::create_dir_all(parent).ok();
        }

        // Before applying migrations or modifying, take a pre-migration safety copy if database exists
        if db_path.exists() && fs::metadata(db_path).map(|m| m.len() > 0).unwrap_or(false) {
            Self::create_pre_migration_backup(db_path);
        }

        let conn = Connection::open(db_path)?;
        conn.execute_batch(
            "PRAGMA journal_mode = WAL;
             PRAGMA foreign_keys = ON;
             PRAGMA busy_timeout = 5000;",
        )?;

        let manager = Self {
            conn: Arc::new(Mutex::new(conn)),
            db_path: Some(db_path.to_path_buf()),
            init_error: None,
        };
        // Verify database integrity on startup
        let _ = manager.verify_integrity();
        manager.run_migrations()?;
        Ok(manager)
    }

    pub fn new_with_error(db_path: &Path, err: String) -> Result<Self> {
        let conn = Connection::open_in_memory()?;
        conn.execute_batch(
            "PRAGMA foreign_keys = ON;
             PRAGMA busy_timeout = 5000;",
        )?;
        let manager = Self {
            conn: Arc::new(Mutex::new(conn)),
            db_path: Some(db_path.to_path_buf()),
            init_error: Some(err),
        };
        manager.run_migrations().ok();
        Ok(manager)
    }

    pub fn new_in_memory() -> Result<Self> {
        let conn = Connection::open_in_memory()?;
        conn.execute_batch(
            "PRAGMA foreign_keys = ON;
             PRAGMA busy_timeout = 5000;",
        )?;

        let manager = Self {
            conn: Arc::new(Mutex::new(conn)),
            db_path: None,
            init_error: None,
        };
        manager.run_migrations()?;
        Ok(manager)
    }

    pub fn check_health(&self) -> DatabaseHealth {
        let mut available_backups = Vec::new();
        if let Some(ref path) = self.db_path {
            if let Some(parent) = path.parent() {
                let backup_dir = parent.join("backups");
                if let Ok(entries) = fs::read_dir(backup_dir) {
                    for entry in entries.flatten() {
                        if let Some(name) = entry.file_name().to_str() {
                            if name.ends_with(".json") || name.ends_with(".bak") {
                                available_backups.push(entry.path().to_string_lossy().to_string());
                            }
                        }
                    }
                }
                if let Ok(entries) = fs::read_dir(parent) {
                    for entry in entries.flatten() {
                        if let Some(name) = entry.file_name().to_str() {
                            if name.starts_with(".pre-") && name.ends_with(".bak") {
                                available_backups.push(entry.path().to_string_lossy().to_string());
                            }
                        }
                    }
                }
            }
        }
        available_backups.sort();
        available_backups.reverse();

        let is_healthy = self.init_error.is_none()
            && self
                .verify_integrity()
                .map(|v| v.len() == 1 && v[0] == "ok")
                .unwrap_or(false);
        DatabaseHealth {
            is_healthy,
            is_in_memory: self.db_path.is_none(),
            error: self.init_error.clone(),
            db_path: self.db_path.as_ref().map(|p| p.to_string_lossy().to_string()),
            available_backups,
        }
    }

    pub fn recover_from_backup_file(&self, backup_file: Option<&str>) -> Result<bool> {
        let target_file = match backup_file {
            Some(file) => std::path::PathBuf::from(file),
            None => {
                let health = self.check_health();
                if let Some(first) = health.available_backups.first() {
                    std::path::PathBuf::from(first)
                } else {
                    return Err(rusqlite::Error::InvalidQuery);
                }
            }
        };

        if target_file.extension().and_then(|e| e.to_str()) == Some("bak") {
            if let Some(ref db_path) = self.db_path {
                fs::copy(&target_file, db_path).map_err(|_| rusqlite::Error::InvalidQuery)?;
                return Ok(true);
            }
        }

        let content = fs::read_to_string(&target_file).map_err(|_| rusqlite::Error::InvalidQuery)?;
        let backup: BackupData = serde_json::from_str(&content).map_err(|_| rusqlite::Error::InvalidQuery)?;
        self.import_backup(&backup, "overwrite")?;
        Ok(true)
    }

    pub fn create_pre_migration_backup(db_path: &Path) {
        if let Some(parent) = db_path.parent() {
            let timestamp = Utc::now().format("%Y%m%d_%H%M%S").to_string();
            let backup_filename = format!(".pre-migration.{}.bak", timestamp);
            let backup_path = parent.join(backup_filename);
            let _ = fs::copy(db_path, backup_path);

            // Retain at most 5 pre-migration safety snapshots
            if let Ok(entries) = fs::read_dir(parent) {
                let mut baks: Vec<std::path::PathBuf> = entries
                    .filter_map(|e| e.ok())
                    .map(|e| e.path())
                    .filter(|p| {
                        p.file_name()
                            .and_then(|n| n.to_str())
                            .map(|s| s.starts_with(".pre-migration.") && s.ends_with(".bak"))
                            .unwrap_or(false)
                    })
                    .collect();
                baks.sort();
                if baks.len() > 5 {
                    for old_bak in &baks[..baks.len() - 5] {
                        let _ = fs::remove_file(old_bak);
                    }
                }
            }
        }
    }

    pub fn create_pre_restore_backup(&self) {
        if let Some(ref db_path) = self.db_path {
            if db_path.exists() {
                if let Some(parent) = db_path.parent() {
                    let timestamp = Utc::now().format("%Y%m%d_%H%M%S").to_string();
                    let backup_filename = format!(".pre-restore.{}.bak", timestamp);
                    let backup_path = parent.join(backup_filename);
                    let _ = fs::copy(db_path, backup_path);
                }
            }
        }
    }

    pub fn verify_integrity(&self) -> Result<Vec<String>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare("PRAGMA integrity_check;")?;
        let rows = stmt.query_map([], |row| row.get::<_, String>(0))?;
        let mut results = Vec::new();
        for r in rows {
            results.push(r?);
        }
        Ok(results)
    }

    fn run_migrations(&self) -> Result<()> {
        let conn = self.conn.lock().unwrap();

        // Create schema_migrations table
        conn.execute(
            "CREATE TABLE IF NOT EXISTS schema_migrations (
                version INTEGER PRIMARY KEY,
                applied_at TEXT NOT NULL
            );",
            [],
        )?;

        // Check latest version
        let current_version: i32 = conn
            .query_row(
                "SELECT COALESCE(MAX(version), 0) FROM schema_migrations",
                [],
                |row| row.get(0),
            )
            .unwrap_or(0);

        // ================= Migration 1: Phase 1 Base Schema & Seeds =================
        if current_version < 1 {
            let tx = conn.unchecked_transaction()?;

            tx.execute(
                "CREATE TABLE IF NOT EXISTS presentations (
                    id TEXT PRIMARY KEY,
                    title TEXT NOT NULL,
                    category TEXT NOT NULL,
                    theme_name TEXT,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );",
                [],
            )?;

            tx.execute(
                "CREATE TABLE IF NOT EXISTS slides (
                    id TEXT PRIMARY KEY,
                    presentation_id TEXT NOT NULL,
                    sort_order INTEGER NOT NULL,
                    title TEXT NOT NULL,
                    body TEXT NOT NULL,
                    background_color TEXT NOT NULL,
                    foreground_color TEXT NOT NULL,
                    font_size TEXT NOT NULL,
                    text_alignment TEXT NOT NULL,
                    theme_override TEXT,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    FOREIGN KEY (presentation_id) REFERENCES presentations(id) ON DELETE CASCADE
                );",
                [],
            )?;

            tx.execute(
                "CREATE INDEX IF NOT EXISTS idx_slides_pres_order 
                 ON slides (presentation_id, sort_order);",
                [],
            )?;

            tx.execute(
                "CREATE TABLE IF NOT EXISTS settings (
                    key TEXT PRIMARY KEY,
                    value TEXT NOT NULL
                );",
                [],
            )?;

            // Seed initial church presentations
            let now = Utc::now().to_rfc3339();

            // Seed 1: Amazing Grace
            let p1_id = "seed-pres-amazing-grace";
            tx.execute(
                "INSERT INTO presentations (id, title, category, theme_name, created_at, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?5);",
                params![p1_id, "Amazing Grace", "Hymn", "Default Dark", now],
            )?;

            tx.execute(
                "INSERT INTO slides (id, presentation_id, sort_order, title, body, background_color, foreground_color, font_size, text_alignment, created_at, updated_at)
                 VALUES 
                 (?1, ?2, 0, 'Verse 1', 'Amazing grace! How sweet the sound\nThat saved a wretch like me!\nI once was lost, but now am found;\nWas blind, but now I see.', '#0a0f1d', '#ffffff', 'large', 'center', ?3, ?3),
                 (?4, ?2, 1, 'Verse 2', '''Twas grace that taught my heart to fear,\nAnd grace my fears relieved;\nHow precious did that grace appear\nThe hour I first believed.', '#0a0f1d', '#ffffff', 'large', 'center', ?3, ?3),
                 (?5, ?2, 2, 'Verse 3', 'Through many dangers, toils, and snares,\nI have already come;\n’Tis grace hath brought me safe thus far,\nAnd grace will lead me home.', '#0a0f1d', '#ffffff', 'large', 'center', ?3, ?3);",
                params!["seed-slide-ag-1", p1_id, now, "seed-slide-ag-2", "seed-slide-ag-3"],
            )?;

            // Seed 2: Tamil Worship Hymn (Grace and Peace)
            let p2_id = "seed-pres-tamil-grace";
            tx.execute(
                "INSERT INTO presentations (id, title, category, theme_name, created_at, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?5);",
                params![p2_id, "கிருபையும் சமாதானமும் (Grace & Peace)", "Worship", "Default Dark", now],
            )?;

            tx.execute(
                "INSERT INTO slides (id, presentation_id, sort_order, title, body, background_color, foreground_color, font_size, text_alignment, created_at, updated_at)
                 VALUES 
                 (?1, ?2, 0, 'பல்லவி (Chorus)', 'கிருபையும் சமாதானமும்\nநிறைந்த என் இயேசுவே\nஉம்மை என்றென்றும் துதிப்பேன்\nஉம் நாமம் வாழ்கவே!', '#111827', '#fbbf24', 'xlarge', 'center', ?3, ?3),
                 (?4, ?2, 1, 'சரணங்கள் (Verse)', 'காரிருள் சூழ்ந்திடும் வேளையிலும்\nவெளிச்சமாய் என்னைத் தாங்கினீரே\nவழுவாமல் என்னைக் காப்பவரே\nஉமக்கே துதி மகிமை!', '#111827', '#ffffff', 'large', 'center', ?3, ?3);",
                params!["seed-slide-tg-1", p2_id, now, "seed-slide-tg-2"],
            )?;

            // Seed 3: Psalm 23 (English + Tamil)
            let p3_id = "seed-pres-psalm-23";
            tx.execute(
                "INSERT INTO presentations (id, title, category, theme_name, created_at, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?5);",
                params![p3_id, "Psalm 23 / சங்கீதம் 23", "Scripture", "Scripture Gold", now],
            )?;

            tx.execute(
                "INSERT INTO slides (id, presentation_id, sort_order, title, body, background_color, foreground_color, font_size, text_alignment, created_at, updated_at)
                 VALUES 
                 (?1, ?2, 0, 'Psalm 23:1-2', 'The Lord is my shepherd; I shall not want.\nHe makes me lie down in green pastures.\nHe leads me beside still waters.', '#1a1005', '#fef08a', 'large', 'center', ?3, ?3),
                 (?4, ?2, 1, 'சங்கீதம் 23:1-2', 'கர்த்தர் என் மேய்ப்பராயிருக்கிறார்; நான் தாழ்ச்சியடையேன்.\nஅவர் என்னைப் புல்லுள்ள இடங்களில் படுக்கப்பண்ணி,\nஅமர்ந்த தண்ணீர்கள் அண்டையில் என்னைக் கொண்டுபோய் விடுகிறார்.', '#1a1005', '#fef08a', 'large', 'center', ?3, ?3);",
                params!["seed-slide-p23-1", p3_id, now, "seed-slide-p23-2"],
            )?;

            // Default settings
            tx.execute(
                "INSERT INTO settings (key, value) VALUES 
                 ('selectedMonitorId', ''),
                 ('defaultFontSize', 'large'),
                 ('audienceFullscreen', 'true');",
                [],
            )?;

            tx.execute(
                "INSERT INTO schema_migrations (version, applied_at) VALUES (1, ?1);",
                params![now],
            )?;

            tx.commit()?;
        }

        // ================= Migration 2: Phase 2 Worship Songs, Themes, & Media =================
        if current_version < 2 {
            let tx = conn.unchecked_transaction()?;

            // Alter slides table if new theme columns don't exist yet
            let cols: Vec<String> = {
                let mut stmt = tx.prepare("PRAGMA table_info(slides);")?;
                let iter = stmt.query_map([], |row| row.get::<_, String>(1))?;
                let mut c_list = Vec::new();
                for c in iter {
                    c_list.push(c?);
                }
                c_list
            };

            if !cols.contains(&"background_image".to_string()) {
                tx.execute("ALTER TABLE slides ADD COLUMN background_image TEXT;", [])?;
            }
            if !cols.contains(&"overlay_color".to_string()) {
                tx.execute("ALTER TABLE slides ADD COLUMN overlay_color TEXT;", [])?;
            }
            if !cols.contains(&"line_spacing".to_string()) {
                tx.execute("ALTER TABLE slides ADD COLUMN line_spacing REAL;", [])?;
            }
            if !cols.contains(&"text_shadow".to_string()) {
                tx.execute("ALTER TABLE slides ADD COLUMN text_shadow TEXT;", [])?;
            }
            if !cols.contains(&"vertical_alignment".to_string()) {
                tx.execute("ALTER TABLE slides ADD COLUMN vertical_alignment TEXT;", [])?;
            }
            if !cols.contains(&"font_family".to_string()) {
                tx.execute("ALTER TABLE slides ADD COLUMN font_family TEXT;", [])?;
            }
            if !cols.contains(&"font_weight".to_string()) {
                tx.execute("ALTER TABLE slides ADD COLUMN font_weight TEXT;", [])?;
            }

            // 1. Create themes table
            tx.execute(
                "CREATE TABLE IF NOT EXISTS themes (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    is_built_in INTEGER NOT NULL DEFAULT 0,
                    background_color TEXT NOT NULL,
                    background_image_id TEXT,
                    background_image_path TEXT,
                    background_mode TEXT NOT NULL DEFAULT 'cover',
                    font_family TEXT NOT NULL,
                    font_size TEXT NOT NULL,
                    font_weight TEXT NOT NULL DEFAULT 'bold',
                    text_color TEXT NOT NULL,
                    text_alignment TEXT NOT NULL,
                    vertical_alignment TEXT NOT NULL DEFAULT 'center',
                    line_spacing REAL NOT NULL DEFAULT 1.35,
                    text_margin INTEGER NOT NULL DEFAULT 6,
                    text_shadow TEXT,
                    overlay_color TEXT,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );",
                [],
            )?;

            // 2. Create media_assets table
            tx.execute(
                "CREATE TABLE IF NOT EXISTS media_assets (
                    id TEXT PRIMARY KEY,
                    filename TEXT NOT NULL,
                    original_filename TEXT NOT NULL,
                    relative_path TEXT NOT NULL,
                    mime_type TEXT NOT NULL,
                    file_size INTEGER NOT NULL,
                    created_at TEXT NOT NULL
                );",
                [],
            )?;

            // 3. Create songs table
            tx.execute(
                "CREATE TABLE IF NOT EXISTS songs (
                    id TEXT PRIMARY KEY,
                    title TEXT NOT NULL,
                    alternate_title TEXT,
                    language TEXT NOT NULL,
                    author TEXT,
                    composer TEXT,
                    copyright TEXT,
                    ccli_number TEXT,
                    song_key TEXT,
                    tempo INTEGER,
                    tags TEXT NOT NULL DEFAULT '[]',
                    category TEXT NOT NULL DEFAULT 'Worship',
                    default_theme_id TEXT,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );",
                [],
            )?;

            // 4. Create song_sections table
            tx.execute(
                "CREATE TABLE IF NOT EXISTS song_sections (
                    id TEXT PRIMARY KEY,
                    song_id TEXT NOT NULL,
                    section_type TEXT NOT NULL,
                    label TEXT NOT NULL,
                    lyrics TEXT NOT NULL,
                    sort_order INTEGER NOT NULL,
                    notes TEXT,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    FOREIGN KEY (song_id) REFERENCES songs(id) ON DELETE CASCADE
                );",
                [],
            )?;

            tx.execute("CREATE INDEX IF NOT EXISTS idx_songs_title ON songs(title);", [])?;
            tx.execute("CREATE INDEX IF NOT EXISTS idx_songs_language ON songs(language);", [])?;
            tx.execute("CREATE INDEX IF NOT EXISTS idx_song_sections_order ON song_sections(song_id, sort_order);", [])?;

            // Seed default themes
            let now = Utc::now().to_rfc3339();

            tx.execute(
                "INSERT OR IGNORE INTO themes (id, name, is_built_in, background_color, background_image_id, background_image_path, background_mode, font_family, font_size, font_weight, text_color, text_alignment, vertical_alignment, line_spacing, text_margin, text_shadow, overlay_color, created_at, updated_at)
                 VALUES 
                 ('theme-builtin-dark', 'High-Contrast Dark', 1, '#0a0f1d', NULL, NULL, 'cover', 'system-ui, -apple-system, \"Noto Sans Tamil\", sans-serif', 'large', 'bold', '#ffffff', 'center', 'center', 1.35, 6, '0 2px 8px rgba(0,0,0,0.8)', NULL, ?1, ?1),
                 ('theme-builtin-light', 'Minimal Light', 1, '#f8fafc', NULL, NULL, 'cover', 'system-ui, -apple-system, \"Noto Sans Tamil\", sans-serif', 'large', 'bold', '#0f172a', 'center', 'center', 1.35, 6, NULL, NULL, ?1, ?1),
                 ('theme-builtin-overlay', 'Worship Gold Overlay', 1, '#111827', NULL, NULL, 'cover', 'system-ui, -apple-system, \"Noto Sans Tamil\", sans-serif', 'xlarge', 'bold', '#fef08a', 'center', 'center', 1.4, 8, '0 2px 10px rgba(0,0,0,0.9)', 'rgba(0,0,0,0.45)', ?1, ?1);",
                params![now],
            )?;

            // Seed Phase 2 structured worship songs in library
            let s1_id = "song-amazing-grace";
            tx.execute(
                "INSERT OR IGNORE INTO songs (id, title, alternate_title, language, author, composer, copyright, ccli_number, song_key, tempo, tags, category, default_theme_id, created_at, updated_at)
                 VALUES (?1, 'Amazing Grace', 'How Sweet the Sound', 'English', 'John Newton', 'Traditional American Melody', 'Public Domain', '22025', 'G', 72, '[\"hymn\", \"grace\", \"classic\"]', 'Hymn', 'theme-builtin-dark', ?2, ?2);",
                params![s1_id, now],
            )?;

            tx.execute(
                "INSERT OR IGNORE INTO song_sections (id, song_id, section_type, label, lyrics, sort_order, notes, created_at, updated_at)
                 VALUES 
                 ('sec-ag-1', ?1, 'verse', 'Verse 1', 'Amazing grace! How sweet the sound\nThat saved a wretch like me!\nI once was lost, but now am found;\nWas blind, but now I see.', 0, 'Gentle acoustic intro', ?2, ?2),
                 ('sec-ag-2', ?1, 'verse', 'Verse 2', '''Twas grace that taught my heart to fear,\nAnd grace my fears relieved;\nHow precious did that grace appear\nThe hour I first believed.', 1, NULL, ?2, ?2),
                 ('sec-ag-3', ?1, 'verse', 'Verse 3', 'Through many dangers, toils, and snares,\nI have already come;\n’Tis grace hath brought me safe thus far,\nAnd grace will lead me home.', 2, 'Build dynamics', ?2, ?2),
                 ('sec-ag-4', ?1, 'verse', 'Verse 4', 'When we’ve been there ten thousand years,\nBright shining as the sun,\nWe’ve no less days to sing God’s praise\nThan when we’d first begun.', 3, 'Full choir / congregation', ?2, ?2);",
                params![s1_id, now],
            )?;

            // Seed 2: Tamil worship song with Chorus and Verses
            let s2_id = "song-tamil-kirubaiyum";
            tx.execute(
                "INSERT OR IGNORE INTO songs (id, title, alternate_title, language, author, composer, copyright, ccli_number, song_key, tempo, tags, category, default_theme_id, created_at, updated_at)
                 VALUES (?1, 'கிருபையும் சமாதானமும்', 'Kirubaiyum Samadhanamum (Grace & Peace)', 'Tamil', 'Traditional', NULL, 'Public Domain', NULL, 'D', 68, '[\"tamil\", \"worship\", \"kirubai\"]', 'Worship', 'theme-builtin-overlay', ?2, ?2);",
                params![s2_id, now],
            )?;

            tx.execute(
                "INSERT OR IGNORE INTO song_sections (id, song_id, section_type, label, lyrics, sort_order, notes, created_at, updated_at)
                 VALUES 
                 ('sec-tk-1', ?1, 'chorus', 'பல்லவி (Chorus)', 'கிருபையும் சமாதானமும்\nநிறைந்த என் இயேசுவே\nஉம்மை என்றென்றும் துதிப்பேன்\nஉம் நாமம் வாழ்கவே!', 0, 'Chorus with full strings', ?2, ?2),
                 ('sec-tk-2', ?1, 'verse', 'சரணம் 1 (Verse 1)', 'காரிருள் சூழ்ந்திடும் வேளையிலும்\nவெளிச்சமாய் என்னைத் தாங்கினீரே\nவழுவாமல் என்னைக் காப்பவரே\nஉமக்கே துதி மகிமை!', 1, NULL, ?2, ?2),
                 ('sec-tk-3', ?1, 'verse', 'சரணம் 2 (Verse 2)', 'ஆபத்து நாளில் அரணானீரே\nகன்மலை மேல் என்னை நிறுத்தினீரே\nஜீவனுள்ள நாளெல்லாம் நன்மை கிருபை\nஎன்னைத் தொடரச் செய்பவரே!', 2, 'High praise', ?2, ?2);",
                params![s2_id, now],
            )?;

            // Seed 3: Bilingual Tamil & English worship song
            let s3_id = "song-tamil-en-uyirana-yesu";
            tx.execute(
                "INSERT OR IGNORE INTO songs (id, title, alternate_title, language, author, composer, copyright, ccli_number, song_key, tempo, tags, category, default_theme_id, created_at, updated_at)
                 VALUES (?1, 'என் உயிரான இயேசு (En Uyirana Yesu)', 'Jesus, My Soul’s Delight', 'Tamil', 'Fr. Berchmans', NULL, 'Used by Permission', NULL, 'E', 105, '[\"tamil\", \"praise\", \"berchmans\"]', 'Praise', 'theme-builtin-dark', ?2, ?2);",
                params![s3_id, now],
            )?;

            tx.execute(
                "INSERT OR IGNORE INTO song_sections (id, song_id, section_type, label, lyrics, sort_order, notes, created_at, updated_at)
                 VALUES 
                 ('sec-eu-1', ?1, 'chorus', 'பல்லவி (Chorus)', 'என் உயிரான உயிரான இயேசு\nஎன் உயிேரோடு கலந்த என் இயேசு\nஉம்மைத்தானே என் வாழ்நாளெல்லாம்\nஉயிரோடு வாழும் வரை பாடுவேன்', 0, 'Upbeat tempo', ?2, ?2),
                 ('sec-eu-2', ?1, 'verse', 'Verse 1 (English Translation)', 'Jesus, the very life of my soul,\nUnited with my spirit made whole.\nAll the days of my life I will sing,\nPraising Your name, my Lord and King.', 1, 'Bilingual congregation singing', ?2, ?2);",
                params![s3_id, now],
            )?;

            tx.execute(
                "INSERT INTO schema_migrations (version, applied_at) VALUES (2, ?1);",
                params![now],
            )?;

            tx.commit()?;
        }

        // ================= Migration 3: Phase 3 Service Planning & Live Control =================
        if current_version < 3 {
            let tx = conn.unchecked_transaction()?;

            // 1. Create services table
            tx.execute(
                "CREATE TABLE IF NOT EXISTS services (
                    id TEXT PRIMARY KEY,
                    title TEXT NOT NULL,
                    description TEXT,
                    service_date TEXT,
                    category TEXT NOT NULL DEFAULT 'Sunday Worship',
                    notes TEXT,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );",
                [],
            )?;

            // 2. Create service_items table
            tx.execute(
                "CREATE TABLE IF NOT EXISTS service_items (
                    id TEXT PRIMARY KEY,
                    service_id TEXT NOT NULL,
                    sort_order INTEGER NOT NULL,
                    item_type TEXT NOT NULL,
                    title TEXT NOT NULL,
                    notes TEXT,
                    source_id TEXT,
                    theme_id TEXT,
                    duration_seconds INTEGER,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE CASCADE
                );",
                [],
            )?;

            // 3. Create service_item_slides table
            tx.execute(
                "CREATE TABLE IF NOT EXISTS service_item_slides (
                    id TEXT PRIMARY KEY,
                    item_id TEXT NOT NULL,
                    sort_order INTEGER NOT NULL,
                    title TEXT NOT NULL,
                    body TEXT NOT NULL,
                    background_color TEXT NOT NULL,
                    foreground_color TEXT NOT NULL,
                    font_size TEXT NOT NULL,
                    text_alignment TEXT NOT NULL,
                    theme_override TEXT,
                    background_image TEXT,
                    overlay_color TEXT,
                    line_spacing REAL,
                    text_shadow TEXT,
                    vertical_alignment TEXT,
                    font_family TEXT,
                    font_weight TEXT,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    FOREIGN KEY (item_id) REFERENCES service_items(id) ON DELETE CASCADE
                );",
                [],
            )?;

            // 4. Create bible_verses table
            tx.execute(
                "CREATE TABLE IF NOT EXISTS bible_verses (
                    id TEXT PRIMARY KEY,
                    translation TEXT NOT NULL,
                    book TEXT NOT NULL,
                    book_number INTEGER NOT NULL,
                    chapter INTEGER NOT NULL,
                    verse INTEGER NOT NULL,
                    text TEXT NOT NULL
                );",
                [],
            )?;

            tx.execute("CREATE INDEX IF NOT EXISTS idx_services_date ON services(service_date);", [])?;
            tx.execute("CREATE INDEX IF NOT EXISTS idx_service_items_order ON service_items(service_id, sort_order);", [])?;
            tx.execute("CREATE INDEX IF NOT EXISTS idx_service_item_slides_order ON service_item_slides(item_id, sort_order);", [])?;
            tx.execute("CREATE INDEX IF NOT EXISTS idx_bible_lookup ON bible_verses(translation, book, chapter, verse);", [])?;
            tx.execute("CREATE INDEX IF NOT EXISTS idx_bible_book_chap ON bible_verses(translation, book, chapter);", [])?;

            // Seed Offline Bible Verses (KJV, WEB, Tamil)
            let bible_seeds = [
                // John 3:16-18 KJV
                ("bv-kjv-jhn-3-16", "KJV", "John", 43, 3, 16, "For God so loved the world, that he gave his only begotten Son, that whosoever believeth in him should not perish, but have everlasting life."),
                ("bv-kjv-jhn-3-17", "KJV", "John", 43, 3, 17, "For God sent not his Son into the world to condemn the world; but that the world through him might be saved."),
                ("bv-kjv-jhn-3-18", "KJV", "John", 43, 3, 18, "He that believeth on him is not condemned: but he that believeth not is condemned already, because he hath not believed in the name of the only begotten Son of God."),
                // John 3:16-18 WEB
                ("bv-web-jhn-3-16", "WEB", "John", 43, 3, 16, "For God so loved the world, that he gave his one and only Son, that whoever believes in him should not perish, but have eternal life."),
                ("bv-web-jhn-3-17", "WEB", "John", 43, 3, 17, "For God didn't send his Son into the world to judge the world, but that the world should be saved through him."),
                ("bv-web-jhn-3-18", "WEB", "John", 43, 3, 18, "He who believes in him is not judged. He who doesn't believe has been judged already, because he has not believed in the name of the one and only Son of God."),
                // John 3:16-18 Tamil (யோவான்)
                ("bv-tam-jhn-3-16", "Tamil", "யோவான்", 43, 3, 16, "தேவன், தம்முடைய ஒரேபேறான குமாரனை விசுவாசிக்கிற எவனும் கெட்டுப்போகாமல் நித்தியஜீவனை அடையும்படிக்கு, அவரைத் தந்தருளி, இவ்வளவாய் உலகத்தில் அன்புகூர்ந்தார்."),
                ("bv-tam-jhn-3-17", "Tamil", "யோவான்", 43, 3, 17, "உலகத்தை ஆக்கினைக்குள்ளாகத் தீர்க்கும்படி தேவன் தம்முடைய குமாரனை உலகத்தில் அனுப்பாமல், அவராலே உலகம் இரட்சிக்கப்படுவதற்காகவே அவரை அனுப்பினார்."),
                ("bv-tam-jhn-3-18", "Tamil", "யோவான்", 43, 3, 18, "அவரை விசுவாசிக்கிறவன் ஆக்கினைக்குள்ளாகத் தீர்க்கப்படான்; விசுவாசியாதவனோ தேவனுடைய ஒரேபேறான குமாரனின் நாமத்தில் விசுவாசமுள்ளவனாயிராதபடியினால், அவன் ஆக்கினைத்தீர்ப்புக்குட்பட்டாயிற்று."),

                // Psalm 23:1-6 KJV
                ("bv-kjv-psa-23-1", "KJV", "Psalms", 19, 23, 1, "The LORD is my shepherd; I shall not want."),
                ("bv-kjv-psa-23-2", "KJV", "Psalms", 19, 23, 2, "He maketh me to lie down in green pastures: he leadeth me beside the still waters."),
                ("bv-kjv-psa-23-3", "KJV", "Psalms", 19, 23, 3, "He restoreth my soul: he leadeth me in the paths of righteousness for his name's sake."),
                ("bv-kjv-psa-23-4", "KJV", "Psalms", 19, 23, 4, "Yea, though I walk through the valley of the shadow of death, I will fear no evil: for thou art with me; thy rod and thy staff they comfort me."),
                ("bv-kjv-psa-23-5", "KJV", "Psalms", 19, 23, 5, "Thou preparest a table before me in the presence of mine enemies: thou anointest my head with oil; my cup runneth over."),
                ("bv-kjv-psa-23-6", "KJV", "Psalms", 19, 23, 6, "Surely goodness and mercy shall follow me all the days of my life: and I will dwell in the house of the LORD for ever."),
                // Psalm 23:1-6 WEB
                ("bv-web-psa-23-1", "WEB", "Psalms", 19, 23, 1, "Yahweh is my shepherd: I shall lack nothing."),
                ("bv-web-psa-23-2", "WEB", "Psalms", 19, 23, 2, "He makes me lie down in green pastures. He leads me beside still waters."),
                ("bv-web-psa-23-3", "WEB", "Psalms", 19, 23, 3, "He restores my soul. He guides me in the paths of righteousness for his name's sake."),
                ("bv-web-psa-23-4", "WEB", "Psalms", 19, 23, 4, "Even though I walk through the valley of the shadow of death, I will fear no evil, for you are with me. Your rod and your staff, they comfort me."),
                ("bv-web-psa-23-5", "WEB", "Psalms", 19, 23, 5, "You prepare a table before me in the presence of my enemies. You anoint my head with oil. My cup runs over."),
                ("bv-web-psa-23-6", "WEB", "Psalms", 19, 23, 6, "Surely goodness and loving kindness shall follow me all the days of my life, and I will dwell in Yahweh's house forever."),
                // Psalm 23:1-6 Tamil (சங்கீதம்)
                ("bv-tam-psa-23-1", "Tamil", "சங்கீதம்", 19, 23, 1, "கர்த்தர் என் மேய்ப்பராயிருக்கிறார், நான் தாழ்ச்சியடையேன்."),
                ("bv-tam-psa-23-2", "Tamil", "சங்கீதம்", 19, 23, 2, "அவர் என்னைப் பசும்புல்லுள்ள இடங்களில் படுக்கப்பண்ணி, அமர்ந்த தண்ணீர்கள் அண்டையில் என்னைக் கொண்டுபோய் விடுகிறார்."),
                ("bv-tam-psa-23-3", "Tamil", "சங்கீதம்", 19, 23, 3, "அவர் என் ஆத்துமாவைத் தேற்றி, தம்முடைய நாமத்தினிமித்தம் என்னை நீதியின் பாதைகளில் நடத்துகிறார்."),
                ("bv-tam-psa-23-4", "Tamil", "சங்கீதம்", 19, 23, 4, "நான் மரண இருளின் பள்ளத்தாக்கிலே நடந்தாலும் பொல்லாப்புக்குப் பயப்படேன்; தேவரீர் என்னோடேகூட இருக்கிறீர்; உமது கோலும் உமது தடியும் என்னைத் தேற்றும்."),
                ("bv-tam-psa-23-5", "Tamil", "சங்கீதம்", 19, 23, 5, "என் சத்துருக்களுக்கு முன்பாக நீர் எனக்கு ஒரு பந்தியை ஆயத்தப்படுத்தி, என் தலையை எண்ணெயினால் அபிஷேகம் பண்ணுகிறீர்; என் பாத்திரம் நிரம்பி வழிகிறது."),
                ("bv-tam-psa-23-6", "Tamil", "சங்கீதம்", 19, 23, 6, "என் ஜீவனுள்ள நாளெல்லாம் நன்மையும் கிருபையும் என்னைத் தொடரும்; நான் கர்த்தருடைய வீட்டிலே நீடித்த நாட்களாய் நிலைத்திருப்பேன்."),

                // Psalm 100:1-5 KJV
                ("bv-kjv-psa-100-1", "KJV", "Psalms", 19, 100, 1, "Make a joyful noise unto the LORD, all ye lands."),
                ("bv-kjv-psa-100-2", "KJV", "Psalms", 19, 100, 2, "Serve the LORD with gladness: come before his presence with singing."),
                ("bv-kjv-psa-100-3", "KJV", "Psalms", 19, 100, 3, "Know ye that the LORD he is God: it is he that hath made us, and not we ourselves; we are his people, and the sheep of his pasture."),
                ("bv-kjv-psa-100-4", "KJV", "Psalms", 19, 100, 4, "Enter into his gates with thanksgiving, and into his courts with praise: be thankful unto him, and bless his name."),
                ("bv-kjv-psa-100-5", "KJV", "Psalms", 19, 100, 5, "For the LORD is good; his mercy is everlasting; and his truth endureth to all generations."),
                // Psalm 100:1-5 Tamil (சங்கீதம்)
                ("bv-tam-psa-100-1", "Tamil", "சங்கீதம்", 19, 100, 1, "பூமியின் குடிகளே, எல்லாரும் கர்த்தரைக் கெம்பீரமாய்ப் பாடுங்கள்."),
                ("bv-tam-psa-100-2", "Tamil", "சங்கீதம்", 19, 100, 2, "மகிழ்ச்சியோடே கர்த்தருக்கு ஆராதனை செய்து, ஆனந்தசத்தத்தோடே அவர் சந்நிதிமுன் வாருங்கள்."),
                ("bv-tam-psa-100-3", "Tamil", "சங்கீதம்", 19, 100, 3, "கர்த்தரே தேவனென்று அறியுங்கள்; நாமல்ல, அவரே நம்மை உண்டாக்கினார்; நாம் அவர் ஜனங்களும், அவர் மேய்ச்சலின் ஆடுகளுமாயிருக்கிறோம்."),
                ("bv-tam-psa-100-4", "Tamil", "சங்கீதம்", 19, 100, 4, "அவர் வாசல்களில் துதியோடும், அவர் பிராகாரங்களில் புகழ்ச்சியோடும் பிரவேசித்து, அவரைத் துதித்து, அவருடைய நாமத்தை ஸ்தோத்தரியுங்கள்."),
                ("bv-tam-psa-100-5", "Tamil", "சங்கீதம்", 19, 100, 5, "கர்த்தர் நல்லவர், அவருடைய கிருபை என்றென்றைக்கும், அவருடைய உண்மை தலைமுறை தலைமுறைக்கும் உள்ளது."),

                // Romans 8:38-39 KJV
                ("bv-kjv-rom-8-38", "KJV", "Romans", 45, 8, 38, "For I am persuaded, that neither death, nor life, nor angels, nor principalities, nor powers, nor things present, nor things to come,"),
                ("bv-kjv-rom-8-39", "KJV", "Romans", 45, 8, 39, "Nor height, nor depth, nor any other creature, shall be able to separate us from the love of God, which is in Christ Jesus our Lord."),
                // Romans 8:38-39 Tamil (ரோமர்)
                ("bv-tam-rom-8-38", "Tamil", "ரோமர்", 45, 8, 38, "மரணமானாலும், ஜீவனானாலும், தேவதூதரானாலும், அதிகாரங்களானாலும், வல்லமைகளானாலும், நிகழ்காரியங்களானாலும், வருங்காரியங்களானாலும்,"),
                ("bv-tam-rom-8-39", "Tamil", "ரோமர்", 45, 8, 39, "உயர்வானாலும், தாழ்வானாலும், வேறெந்தச் சிருஷ்டியானாலும், நம்முடைய கர்த்தராகிய கிறிஸ்து இயேசுவிலுள்ள தேவனுடைய அன்பைவிட்டு நம்மைப் பிரிக்கமாட்டாதென்று நிச்சயித்திருக்கிறேன்."),

                // Matthew 6:9-13 KJV
                ("bv-kjv-mat-6-9", "KJV", "Matthew", 40, 6, 9, "After this manner therefore pray ye: Our Father which art in heaven, Hallowed be thy name."),
                ("bv-kjv-mat-6-10", "KJV", "Matthew", 40, 6, 10, "Thy kingdom come. Thy will be done in earth, as it is in heaven."),
                ("bv-kjv-mat-6-11", "KJV", "Matthew", 40, 6, 11, "Give us this day our daily bread."),
                ("bv-kjv-mat-6-12", "KJV", "Matthew", 40, 6, 12, "And forgive us our debts, as we forgive our debtors."),
                ("bv-kjv-mat-6-13", "KJV", "Matthew", 40, 6, 13, "And lead us not into temptation, but deliver us from evil: For thine is the kingdom, and the power, and the glory, for ever. Amen."),
                // Matthew 6:9-13 Tamil (மத்தேயு)
                ("bv-tam-mat-6-9", "Tamil", "மத்தேயு", 40, 6, 9, "நீங்கள் ஜெபம்பண்ணவேண்டிய விதமாவது: பரமண்டலங்களிலிருக்கிற எங்கள் பிதாவே, உம்முடைய நாமம் பரிசுத்தப்படுவதாக;"),
                ("bv-tam-mat-6-10", "Tamil", "மத்தேயு", 40, 6, 10, "உம்முடைய ராஜ்யம் வருவதாக; உம்முடைய சித்தம் பரமண்டலத்திலே செய்யப்படுகிறதுபோல பூமியிலேயும் செய்யப்படுவதாக."),
                ("bv-tam-mat-6-11", "Tamil", "மத்தேயு", 40, 6, 11, "எங்களுக்கு வேண்டிய ஆகாரத்தை இன்று எங்களுக்குத் தாரும்."),
                ("bv-tam-mat-6-12", "Tamil", "மத்தேயு", 40, 6, 12, "எங்கள் கடனாளிகளுக்கு நாங்கள் மன்னிக்கிறதுபோல எங்கள் கடன்களை எங்களுக்கு மன்னியும்."),
                ("bv-tam-mat-6-13", "Tamil", "மத்தேயு", 40, 6, 13, "எங்களைச் சோதனைக்குட்படப்பண்ணாமல், தீமையினின்று எங்களை இரட்சித்துக்கொள்ளும், ராஜ்யமும், வல்லமையும், மகிமையும் என்றென்றைக்கும் உம்முடையவைகளே, ஆமென்.")
            ];

            for (id, trans, book, book_num, chap, verse, text) in bible_seeds {
                tx.execute(
                    "INSERT OR IGNORE INTO bible_verses (id, translation, book, book_number, chapter, verse, text)
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7);",
                    params![id, trans, book, book_num, chap, verse, text],
                )?;
            }

            // Seed Phase 3 initial Sunday Service
            let now = Utc::now().to_rfc3339();
            let srv_id = "service-sunday-morning";
            tx.execute(
                "INSERT OR IGNORE INTO services (id, title, description, service_date, category, notes, created_at, updated_at)
                 VALUES (?1, 'Sunday Morning Worship & Word', 'Full Sunday service order with praise lyrics, scripture reading, sermon, and announcements', '2026-10-18', 'Sunday Worship', 'Band sound check at 8:45 AM. Pastor will reference John 3:16-17 during sermon.', ?2, ?2);",
                params![srv_id, now],
            )?;

            // 1. Divider: Opening
            tx.execute(
                "INSERT OR IGNORE INTO service_items (id, service_id, sort_order, item_type, title, notes, source_id, theme_id, duration_seconds, created_at, updated_at)
                 VALUES ('item-srv-01', ?1, 0, 'divider', '— Prelude & Call to Worship —', 'Gentle instrumental prelude', NULL, NULL, NULL, ?2, ?2);",
                params![srv_id, now],
            )?;

            // 2. Song: Amazing Grace (Snapshot from library)
            tx.execute(
                "INSERT OR IGNORE INTO service_items (id, service_id, sort_order, item_type, title, notes, source_id, theme_id, duration_seconds, created_at, updated_at)
                 VALUES ('item-srv-02', ?1, 1, 'song', 'Amazing Grace', 'Congregation stands for worship', 'song-amazing-grace', 'theme-builtin-dark', NULL, ?2, ?2);",
                params![srv_id, now],
            )?;
            tx.execute(
                "INSERT OR IGNORE INTO service_item_slides (id, item_id, sort_order, title, body, background_color, foreground_color, font_size, text_alignment, theme_override, background_image, overlay_color, line_spacing, text_shadow, vertical_alignment, font_family, font_weight, created_at, updated_at)
                 VALUES
                 ('slide-srv-02-1', 'item-srv-02', 0, 'Amazing Grace - Verse 1', 'Amazing grace! How sweet the sound\nThat saved a wretch like me!\nI once was lost, but now am found;\nWas blind, but now I see.', '#0a0f1d', '#ffffff', 'large', 'center', 'theme-builtin-dark', NULL, NULL, 1.35, '0 2px 8px rgba(0,0,0,0.8)', 'center', 'system-ui, sans-serif', 'bold', ?1, ?1),
                 ('slide-srv-02-2', 'item-srv-02', 1, 'Amazing Grace - Verse 2', '''Twas grace that taught my heart to fear,\nAnd grace my fears relieved;\nHow precious did that grace appear\nThe hour I first believed.', '#0a0f1d', '#ffffff', 'large', 'center', 'theme-builtin-dark', NULL, NULL, 1.35, '0 2px 8px rgba(0,0,0,0.8)', 'center', 'system-ui, sans-serif', 'bold', ?1, ?1),
                 ('slide-srv-02-3', 'item-srv-02', 2, 'Amazing Grace - Verse 3', 'Through many dangers, toils, and snares,\nI have already come;\n’Tis grace hath brought me safe thus far,\nAnd grace will lead me home.', '#0a0f1d', '#ffffff', 'large', 'center', 'theme-builtin-dark', NULL, NULL, 1.35, '0 2px 8px rgba(0,0,0,0.8)', 'center', 'system-ui, sans-serif', 'bold', ?1, ?1),
                 ('slide-srv-02-4', 'item-srv-02', 3, 'Amazing Grace - Verse 4', 'When we’ve been there ten thousand years,\nBright shining as the sun,\nWe’ve no less days to sing God’s praise\nThan when we’d first begun.', '#0a0f1d', '#ffffff', 'large', 'center', 'theme-builtin-dark', NULL, NULL, 1.35, '0 2px 8px rgba(0,0,0,0.8)', 'center', 'system-ui, sans-serif', 'bold', ?1, ?1);",
                params![now],
            )?;

            // 3. Song: Tamil Worship (Snapshot from library)
            tx.execute(
                "INSERT OR IGNORE INTO service_items (id, service_id, sort_order, item_type, title, notes, source_id, theme_id, duration_seconds, created_at, updated_at)
                 VALUES ('item-srv-03', ?1, 2, 'song', 'கிருபையும் சமாதானமும்', 'Tamil worship chorus and verse', 'song-tamil-kirubaiyum', 'theme-builtin-overlay', NULL, ?2, ?2);",
                params![srv_id, now],
            )?;
            tx.execute(
                "INSERT OR IGNORE INTO service_item_slides (id, item_id, sort_order, title, body, background_color, foreground_color, font_size, text_alignment, theme_override, background_image, overlay_color, line_spacing, text_shadow, vertical_alignment, font_family, font_weight, created_at, updated_at)
                 VALUES
                 ('slide-srv-03-1', 'item-srv-03', 0, 'கிருபையும் சமாதானமும் - Chorus', 'கிருபையும் சமாதானமும்\nநிறைந்த என் இயேசுவே\nஉம்மை என்றென்றும் துதிப்பேன்\nஉம் நாமம் வாழ்கவே!', '#111827', '#fef08a', 'xlarge', 'center', 'theme-builtin-overlay', NULL, 'rgba(0,0,0,0.45)', 1.4, '0 2px 10px rgba(0,0,0,0.9)', 'center', 'system-ui, \"Noto Sans Tamil\", sans-serif', 'bold', ?1, ?1),
                 ('slide-srv-03-2', 'item-srv-03', 1, 'கிருபையும் சமாதானமும் - Verse 1', 'காரிருள் சூழ்ந்திடும் வேளையிலும்\nவெளிச்சமாய் என்னைத் தாங்கினீரே\nவழுவாமல் என்னைக் காப்பவரே\nஉமக்கே துதி மகிமை!', '#111827', '#fef08a', 'xlarge', 'center', 'theme-builtin-overlay', NULL, 'rgba(0,0,0,0.45)', 1.4, '0 2px 10px rgba(0,0,0,0.9)', 'center', 'system-ui, \"Noto Sans Tamil\", sans-serif', 'bold', ?1, ?1);",
                params![now],
            )?;

            // 4. Divider: Scripture Reading
            tx.execute(
                "INSERT OR IGNORE INTO service_items (id, service_id, sort_order, item_type, title, notes, source_id, theme_id, duration_seconds, created_at, updated_at)
                 VALUES ('item-srv-04', ?1, 3, 'divider', '— Scripture Reading —', 'Deacon leads scripture reading', NULL, NULL, NULL, ?2, ?2);",
                params![srv_id, now],
            )?;

            // 5. Bible: John 3:16-17 KJV
            tx.execute(
                "INSERT OR IGNORE INTO service_items (id, service_id, sort_order, item_type, title, notes, source_id, theme_id, duration_seconds, created_at, updated_at)
                 VALUES ('item-srv-05', ?1, 4, 'bible', 'Scripture: John 3:16-17 (KJV)', 'Responsive reading', 'John 3:16-17', 'theme-builtin-dark', NULL, ?2, ?2);",
                params![srv_id, now],
            )?;
            tx.execute(
                "INSERT OR IGNORE INTO service_item_slides (id, item_id, sort_order, title, body, background_color, foreground_color, font_size, text_alignment, theme_override, background_image, overlay_color, line_spacing, text_shadow, vertical_alignment, font_family, font_weight, created_at, updated_at)
                 VALUES
                 ('slide-srv-05-1', 'item-srv-05', 0, 'John 3:16 (KJV)', 'For God so loved the world, that he gave his only begotten Son, that whosoever believeth in him should not perish, but have everlasting life.', '#0a0f1d', '#ffffff', 'large', 'center', 'theme-builtin-dark', NULL, NULL, 1.4, '0 2px 8px rgba(0,0,0,0.8)', 'center', 'system-ui, sans-serif', 'normal', ?1, ?1),
                 ('slide-srv-05-2', 'item-srv-05', 1, 'John 3:17 (KJV)', 'For God sent not his Son into the world to condemn the world; but that the world through him might be saved.', '#0a0f1d', '#ffffff', 'large', 'center', 'theme-builtin-dark', NULL, NULL, 1.4, '0 2px 8px rgba(0,0,0,0.8)', 'center', 'system-ui, sans-serif', 'normal', ?1, ?1);",
                params![now],
            )?;

            // 6. Sermon Presentation
            tx.execute(
                "INSERT OR IGNORE INTO service_items (id, service_id, sort_order, item_type, title, notes, source_id, theme_id, duration_seconds, created_at, updated_at)
                 VALUES ('item-srv-06', ?1, 5, 'sermon', 'Sermon: Walking in Unshakable Grace', 'Pastor David sermon deck', NULL, 'theme-builtin-dark', NULL, ?2, ?2);",
                params![srv_id, now],
            )?;
            tx.execute(
                "INSERT OR IGNORE INTO service_item_slides (id, item_id, sort_order, title, body, background_color, foreground_color, font_size, text_alignment, theme_override, background_image, overlay_color, line_spacing, text_shadow, vertical_alignment, font_family, font_weight, created_at, updated_at)
                 VALUES
                 ('slide-srv-06-1', 'item-srv-06', 0, 'Walking in Unshakable Grace', 'Sunday Sermon Series\n\nPastor David', '#0a0f1d', '#38bdf8', 'xlarge', 'center', 'theme-builtin-dark', NULL, NULL, 1.4, '0 2px 10px rgba(0,0,0,0.9)', 'center', 'system-ui, sans-serif', 'bold', ?1, ?1),
                 ('slide-srv-06-2', 'item-srv-06', 1, '1. Grace Founded on Truth', 'God''s grace does not ignore our reality;\nit redeems our future through Christ.', '#0a0f1d', '#ffffff', 'large', 'center', 'theme-builtin-dark', NULL, NULL, 1.4, '0 2px 8px rgba(0,0,0,0.8)', 'center', 'system-ui, sans-serif', 'normal', ?1, ?1),
                 ('slide-srv-06-3', 'item-srv-06', 2, '2. Grace Empowering Daily Walk', 'We are not just saved by grace;\nwe are sustained and sanctified by grace every day.', '#0a0f1d', '#ffffff', 'large', 'center', 'theme-builtin-dark', NULL, NULL, 1.4, '0 2px 8px rgba(0,0,0,0.8)', 'center', 'system-ui, sans-serif', 'normal', ?1, ?1);",
                params![now],
            )?;

            // 7. Announcement Deck
            tx.execute(
                "INSERT OR IGNORE INTO service_items (id, service_id, sort_order, item_type, title, notes, source_id, theme_id, duration_seconds, created_at, updated_at)
                 VALUES ('item-srv-07', ?1, 6, 'announcement', 'Weekly Church Announcements', 'Projected during pastoral welcome', NULL, 'theme-builtin-overlay', NULL, ?2, ?2);",
                params![srv_id, now],
            )?;
            tx.execute(
                "INSERT OR IGNORE INTO service_item_slides (id, item_id, sort_order, title, body, background_color, foreground_color, font_size, text_alignment, theme_override, background_image, overlay_color, line_spacing, text_shadow, vertical_alignment, font_family, font_weight, created_at, updated_at)
                 VALUES
                 ('slide-srv-07-1', 'item-srv-07', 0, 'Youth Fellowship', 'Friday 6:30 PM in the Fellowship Hall\nFood, games, and Bible study for teens and young adults.', '#111827', '#fef08a', 'large', 'center', 'theme-builtin-overlay', NULL, 'rgba(0,0,0,0.45)', 1.35, '0 2px 8px rgba(0,0,0,0.9)', 'center', 'system-ui, sans-serif', 'bold', ?1, ?1),
                 ('slide-srv-07-2', 'item-srv-07', 1, 'Wednesday Midweek Prayer', 'Wednesday 7:00 PM in the Main Sanctuary\nJoin us as we intercede for our community and families.', '#111827', '#fef08a', 'large', 'center', 'theme-builtin-overlay', NULL, 'rgba(0,0,0,0.45)', 1.35, '0 2px 8px rgba(0,0,0,0.9)', 'center', 'system-ui, sans-serif', 'bold', ?1, ?1);",
                params![now],
            )?;

            // 8. Countdown Timer Placeholder
            tx.execute(
                "INSERT OR IGNORE INTO service_items (id, service_id, sort_order, item_type, title, notes, source_id, theme_id, duration_seconds, created_at, updated_at)
                 VALUES ('item-srv-08', ?1, 7, 'timer', 'Benediction & 5-Min Fellowship Countdown', 'Display timer for fellowship time', NULL, 'theme-builtin-dark', 300, ?2, ?2);",
                params![srv_id, now],
            )?;
            tx.execute(
                "INSERT OR IGNORE INTO service_item_slides (id, item_id, sort_order, title, body, background_color, foreground_color, font_size, text_alignment, theme_override, background_image, overlay_color, line_spacing, text_shadow, vertical_alignment, font_family, font_weight, created_at, updated_at)
                 VALUES
                 ('slide-srv-08-1', 'item-srv-08', 0, 'Fellowship & Tea', 'May the grace of our Lord Jesus Christ be with you all.\n\nEnjoy fellowship in the courtyard!', '#0a0f1d', '#38bdf8', 'large', 'center', 'theme-builtin-dark', NULL, NULL, 1.4, '0 2px 8px rgba(0,0,0,0.8)', 'center', 'system-ui, sans-serif', 'bold', ?1, ?1);",
                params![now],
            )?;

            tx.execute(
                "INSERT INTO schema_migrations (version, applied_at) VALUES (3, ?1);",
                params![now],
            )?;

            tx.commit()?;
        }

        // ================= Migration 4: Media Subsystem, Timers & Stage Display =================
        if current_version < 4 {
            let tx = conn.unchecked_transaction()?;

            // 1. Extend media_assets table with Phase 4 metadata
            let mut has_media_type = false;
            let mut has_duration = false;
            let mut has_width = false;
            let mut has_height = false;
            let mut has_thumbnail = false;

            {
                let mut pragma = tx.prepare("PRAGMA table_info(media_assets);")?;
                let mut rows = pragma.query([])?;
                while let Some(row) = rows.next()? {
                    let col_name: String = row.get(1)?;
                    if col_name == "media_type" { has_media_type = true; }
                    if col_name == "duration_seconds" { has_duration = true; }
                    if col_name == "width" { has_width = true; }
                    if col_name == "height" { has_height = true; }
                    if col_name == "thumbnail_path" { has_thumbnail = true; }
                }
            }

            if !has_media_type {
                tx.execute("ALTER TABLE media_assets ADD COLUMN media_type TEXT NOT NULL DEFAULT 'image';", [])?;
            }
            if !has_duration {
                tx.execute("ALTER TABLE media_assets ADD COLUMN duration_seconds REAL;", [])?;
            }
            if !has_width {
                tx.execute("ALTER TABLE media_assets ADD COLUMN width INTEGER;", [])?;
            }
            if !has_height {
                tx.execute("ALTER TABLE media_assets ADD COLUMN height INTEGER;", [])?;
            }
            if !has_thumbnail {
                tx.execute("ALTER TABLE media_assets ADD COLUMN thumbnail_path TEXT;", [])?;
            }

            // 2. Create timers table
            tx.execute(
                "CREATE TABLE IF NOT EXISTS timers (
                    id TEXT PRIMARY KEY,
                    service_id TEXT,
                    name TEXT NOT NULL,
                    timer_type TEXT NOT NULL,
                    duration_seconds INTEGER NOT NULL DEFAULT 300,
                    warning_threshold_seconds INTEGER NOT NULL DEFAULT 60,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE CASCADE
                );",
                [],
            )?;
            tx.execute("CREATE INDEX IF NOT EXISTS idx_timers_service ON timers(service_id);", [])?;

            // 3. Create stage_configs table
            tx.execute(
                "CREATE TABLE IF NOT EXISTS stage_configs (
                    id TEXT PRIMARY KEY,
                    font_size TEXT NOT NULL DEFAULT 'large',
                    show_notes INTEGER NOT NULL DEFAULT 1,
                    show_timer INTEGER NOT NULL DEFAULT 1,
                    show_next INTEGER NOT NULL DEFAULT 1,
                    high_contrast INTEGER NOT NULL DEFAULT 1,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );",
                [],
            )?;

            // Seed default stage configuration and sample timers
            let now = Utc::now().to_rfc3339();
            tx.execute(
                "INSERT OR IGNORE INTO stage_configs (id, font_size, show_notes, show_timer, show_next, high_contrast, created_at, updated_at)
                 VALUES ('default-stage', 'large', 1, 1, 1, 1, ?1, ?1);",
                params![now],
            )?;

            tx.execute(
                "INSERT OR IGNORE INTO timers (id, service_id, name, timer_type, duration_seconds, warning_threshold_seconds, created_at, updated_at)
                 VALUES 
                 ('timer-preservice-5min', 'service-sunday-morning', 'Pre-Service Countdown', 'countdown', 300, 60, ?1, ?1),
                 ('timer-sermon-elapsed', 'service-sunday-morning', 'Sermon Elapsed Timer', 'elapsed', 0, 1800, ?1, ?1);",
                params![now],
            )?;

            tx.execute(
                "INSERT INTO schema_migrations (version, applied_at) VALUES (4, ?1);",
                params![now],
            )?;

            tx.commit()?;
        }

        // ================= Migration 5: Phase 5 Advanced Production, Independent Outputs, Overlay, Remote, MIDI & OSC =================
        if current_version < 5 {
            let tx = conn.unchecked_transaction()?;

            // 1. Independent outputs table
            tx.execute(
                "CREATE TABLE IF NOT EXISTS output_configs (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    output_type TEXT NOT NULL,
                    target_monitor_id TEXT,
                    resolution_width INTEGER,
                    resolution_height INTEGER,
                    aspect_ratio TEXT NOT NULL DEFAULT '16:9',
                    safe_margin_percent REAL NOT NULL DEFAULT 5.0,
                    content_source TEXT NOT NULL DEFAULT 'live_slide',
                    theme_id TEXT,
                    is_enabled INTEGER NOT NULL DEFAULT 1,
                    is_active INTEGER NOT NULL DEFAULT 0,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );",
                [],
            )?;

            // 2. Livestream overlay configs table
            tx.execute(
                "CREATE TABLE IF NOT EXISTS overlay_configs (
                    id TEXT PRIMARY KEY,
                    layout_mode TEXT NOT NULL DEFAULT 'lower_third',
                    font_family TEXT NOT NULL DEFAULT 'Inter, system-ui, sans-serif',
                    font_size_px INTEGER NOT NULL DEFAULT 42,
                    text_color TEXT NOT NULL DEFAULT '#ffffff',
                    text_shadow TEXT NOT NULL DEFAULT '2px 2px 4px rgba(0,0,0,0.85)',
                    text_alignment TEXT NOT NULL DEFAULT 'center',
                    safe_margin_horizontal_pct REAL NOT NULL DEFAULT 5.0,
                    safe_margin_vertical_pct REAL NOT NULL DEFAULT 6.0,
                    show_speaker_label INTEGER NOT NULL DEFAULT 1,
                    show_reference INTEGER NOT NULL DEFAULT 1,
                    is_cleared INTEGER NOT NULL DEFAULT 0,
                    auth_token TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );",
                [],
            )?;

            // 3. Remote devices table
            tx.execute(
                "CREATE TABLE IF NOT EXISTS remote_devices (
                    id TEXT PRIMARY KEY,
                    device_name TEXT NOT NULL,
                    ip_address TEXT NOT NULL,
                    token_hash TEXT NOT NULL,
                    is_approved INTEGER NOT NULL DEFAULT 0,
                    can_navigate INTEGER NOT NULL DEFAULT 1,
                    can_blackout INTEGER NOT NULL DEFAULT 1,
                    can_take_live INTEGER NOT NULL DEFAULT 0,
                    can_control_timer INTEGER NOT NULL DEFAULT 1,
                    paired_at TEXT NOT NULL,
                    last_seen_at TEXT NOT NULL
                );",
                [],
            )?;

            // 4. MIDI mappings table
            tx.execute(
                "CREATE TABLE IF NOT EXISTS midi_mappings (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    channel INTEGER NOT NULL DEFAULT 0,
                    message_type TEXT NOT NULL DEFAULT 'note_on',
                    note_or_cc INTEGER NOT NULL,
                    action_type TEXT NOT NULL,
                    is_enabled INTEGER NOT NULL DEFAULT 1,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );",
                [],
            )?;

            // 5. OSC configurations table
            tx.execute(
                "CREATE TABLE IF NOT EXISTS osc_configs (
                    id TEXT PRIMARY KEY,
                    is_enabled INTEGER NOT NULL DEFAULT 0,
                    listen_port INTEGER NOT NULL DEFAULT 9000,
                    allowlist_actions TEXT NOT NULL DEFAULT 'next_slide,prev_slide,next_item,prev_item,toggle_blackout,toggle_live,start_timer,stop_timer,reset_timer,clear_overlay',
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );",
                [],
            )?;

            // 6. Action mappings table
            tx.execute(
                "CREATE TABLE IF NOT EXISTS action_mappings (
                    id TEXT PRIMARY KEY,
                    action_name TEXT NOT NULL UNIQUE,
                    display_label TEXT NOT NULL,
                    category TEXT NOT NULL,
                    keyboard_shortcut TEXT,
                    is_enabled INTEGER NOT NULL DEFAULT 1,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );",
                [],
            )?;

            // Seeds
            let now = Utc::now().to_rfc3339();

            // Default outputs
            tx.execute(
                "INSERT OR IGNORE INTO output_configs (id, name, output_type, target_monitor_id, resolution_width, resolution_height, aspect_ratio, safe_margin_percent, content_source, theme_id, is_enabled, is_active, created_at, updated_at)
                 VALUES 
                 ('output-audience', 'Main Projector / Audience', 'audience', NULL, 1920, 1080, '16:9', 5.0, 'live_slide', NULL, 1, 0, ?1, ?1),
                 ('output-stage', 'Confidence Stage Display', 'stage', NULL, 1920, 1080, '16:9', 4.0, 'stage_layout', NULL, 1, 0, ?1, ?1),
                 ('output-overlay', 'Livestream Lower-Thirds Overlay', 'overlay', NULL, 1920, 1080, '16:9', 5.0, 'lyrics_only', NULL, 1, 0, ?1, ?1);",
                params![now],
            )?;

            // Default overlay config
            let default_token = Uuid::new_v4().to_string();
            tx.execute(
                "INSERT OR IGNORE INTO overlay_configs (id, layout_mode, font_family, font_size_px, text_color, text_shadow, text_alignment, safe_margin_horizontal_pct, safe_margin_vertical_pct, show_speaker_label, show_reference, is_cleared, auth_token, created_at, updated_at)
                 VALUES ('default-overlay', 'lower_third', 'Inter, system-ui, sans-serif', 42, '#ffffff', '2px 2px 4px rgba(0,0,0,0.85)', 'center', 5.0, 6.0, 1, 1, 0, ?1, ?2, ?2);",
                params![default_token, now],
            )?;

            // Default MIDI mappings
            tx.execute(
                "INSERT OR IGNORE INTO midi_mappings (id, name, channel, message_type, note_or_cc, action_type, is_enabled, created_at, updated_at)
                 VALUES 
                 ('midi-next-slide', 'Next Slide (Note C4 / 60)', 0, 'note_on', 60, 'next_slide', 1, ?1, ?1),
                 ('midi-prev-slide', 'Previous Slide (Note B3 / 59)', 0, 'note_on', 59, 'prev_slide', 1, ?1, ?1),
                 ('midi-blackout', 'Toggle Blackout (Note D4 / 62)', 0, 'note_on', 62, 'toggle_blackout', 1, ?1, ?1);",
                params![now],
            )?;

            // Default OSC config
            tx.execute(
                "INSERT OR IGNORE INTO osc_configs (id, is_enabled, listen_port, allowlist_actions, created_at, updated_at)
                 VALUES ('default-osc', 0, 9000, 'next_slide,prev_slide,next_item,prev_item,toggle_blackout,toggle_live,start_timer,stop_timer,reset_timer,clear_overlay', ?1, ?1);",
                params![now],
            )?;

            // Default action mappings
            tx.execute(
                "INSERT OR IGNORE INTO action_mappings (id, action_name, display_label, category, keyboard_shortcut, is_enabled, created_at, updated_at)
                 VALUES 
                 ('act-next-slide', 'next_slide', 'Next Slide', 'presentation', 'Right / Space / PageDown', 1, ?1, ?1),
                 ('act-prev-slide', 'prev_slide', 'Previous Slide', 'presentation', 'Left / PageUp', 1, ?1, ?1),
                 ('act-next-item', 'next_item', 'Next Playlist Item', 'service', 'Ctrl+Right', 1, ?1, ?1),
                 ('act-prev-item', 'prev_item', 'Previous Playlist Item', 'service', 'Ctrl+Left', 1, ?1, ?1),
                 ('act-toggle-blackout', 'toggle_blackout', 'Toggle Blackout / Blank', 'display', 'B / F7', 1, ?1, ?1),
                 ('act-toggle-live', 'toggle_live', 'Toggle Live Output', 'presentation', 'F5', 1, ?1, ?1),
                 ('act-start-timer', 'start_timer', 'Start Timer', 'timer', 'Alt+S', 1, ?1, ?1),
                 ('act-stop-timer', 'stop_timer', 'Stop / Pause Timer', 'timer', 'Alt+P', 1, ?1, ?1),
                 ('act-reset-timer', 'reset_timer', 'Reset Timer', 'timer', 'Alt+R', 1, ?1, ?1),
                 ('act-clear-overlay', 'clear_overlay', 'Clear Livestream Overlay', 'display', 'F8', 1, ?1, ?1);",
                params![now],
            )?;

            tx.execute(
                "INSERT INTO schema_migrations (version, applied_at) VALUES (5, ?1);",
                params![now],
            )?;

            tx.commit()?;
        }

        // ================= Migration 6: Production Reliability, Workspace State, Diagnostics & Indexes =================
        if current_version < 6 {
            let tx = conn.unchecked_transaction()?;

            // 1. Workspace / session recovery table
            tx.execute(
                "CREATE TABLE IF NOT EXISTS workspace_state (
                    id TEXT PRIMARY KEY,
                    selected_service_id TEXT,
                    selected_presentation_id TEXT,
                    selected_item_id TEXT,
                    selected_slide_index INTEGER NOT NULL DEFAULT 0,
                    active_tab TEXT NOT NULL DEFAULT 'services',
                    last_saved_at TEXT NOT NULL
                );",
                [],
            )?;

            // 2. Application diagnostics log table
            tx.execute(
                "CREATE TABLE IF NOT EXISTS app_diagnostics_log (
                    id TEXT PRIMARY KEY,
                    timestamp TEXT NOT NULL,
                    level TEXT NOT NULL,
                    component TEXT NOT NULL,
                    message TEXT NOT NULL,
                    details TEXT
                );",
                [],
            )?;

            tx.execute("CREATE INDEX IF NOT EXISTS idx_diagnostics_time ON app_diagnostics_log(timestamp DESC);", [])?;
            tx.execute("CREATE INDEX IF NOT EXISTS idx_diagnostics_level ON app_diagnostics_log(level);", [])?;
            tx.execute("CREATE INDEX IF NOT EXISTS idx_diagnostics_comp ON app_diagnostics_log(component);", [])?;

            // 3. Performance indexes on existing tables
            tx.execute("CREATE INDEX IF NOT EXISTS idx_services_updated ON services(updated_at DESC);", [])?;
            tx.execute("CREATE INDEX IF NOT EXISTS idx_songs_title ON songs(title);", [])?;
            tx.execute("CREATE INDEX IF NOT EXISTS idx_songs_category ON songs(category);", [])?;
            tx.execute("CREATE INDEX IF NOT EXISTS idx_songs_updated ON songs(updated_at DESC);", [])?;
            tx.execute("CREATE INDEX IF NOT EXISTS idx_media_type ON media_assets(media_type);", [])?;
            tx.execute("CREATE INDEX IF NOT EXISTS idx_media_created ON media_assets(created_at DESC);", [])?;
            tx.execute("CREATE INDEX IF NOT EXISTS idx_song_sections_order ON song_sections(song_id, sort_order);", [])?;

            // Seed default workspace state
            let now = Utc::now().to_rfc3339();
            tx.execute(
                "INSERT OR IGNORE INTO workspace_state (id, selected_service_id, selected_presentation_id, selected_item_id, selected_slide_index, active_tab, last_saved_at)
                 VALUES ('current_workspace', 'service-sunday-morning', NULL, 'item-srv-01', 0, 'services', ?1);",
                params![now],
            )?;

            // Log diagnostic entry for migration
            let log_id = format!("diag-{}", Uuid::new_v4().simple());
            tx.execute(
                "INSERT INTO app_diagnostics_log (id, timestamp, level, component, message, details)
                 VALUES (?1, ?2, 'INFO', 'Database', 'Schema migration 6 applied successfully (workspace recovery, diagnostics, performance indexes)', NULL);",
                params![log_id, now],
            )?;

            tx.execute(
                "INSERT INTO schema_migrations (version, applied_at) VALUES (6, ?1);",
                params![now],
            )?;

            tx.commit()?;
        }

        // ================= Migration 7: Bible lookup index + FTS5 keyword search =================
        if current_version < 7 {
            let tx = conn.unchecked_transaction()?;

            tx.execute(
                "CREATE INDEX IF NOT EXISTS idx_bible_book_number ON bible_verses(translation, book_number, chapter, verse);",
                [],
            )?;
            tx.execute(
                "CREATE VIRTUAL TABLE IF NOT EXISTS bible_verses_fts USING fts5(
                    text, content='bible_verses', content_rowid='rowid'
                );",
                [],
            )?;
            tx.execute("INSERT INTO bible_verses_fts(bible_verses_fts) VALUES('rebuild');", [])?;

            tx.execute(
                "INSERT INTO schema_migrations (version, applied_at) VALUES (7, ?1);",
                params![Utc::now().to_rfc3339()],
            )?;

            tx.commit()?;
        }

        // ================= Migration 8: Song section colours + arrangements =================
        if current_version < 8 {
            let tx = conn.unchecked_transaction()?;

            tx.execute("ALTER TABLE song_sections ADD COLUMN color TEXT;", [])?;
            tx.execute(
                "CREATE TABLE IF NOT EXISTS song_arrangements (
                    id TEXT PRIMARY KEY,
                    song_id TEXT NOT NULL,
                    name TEXT NOT NULL,
                    section_ids TEXT NOT NULL DEFAULT '[]',
                    is_default INTEGER NOT NULL DEFAULT 0,
                    sort_order INTEGER NOT NULL DEFAULT 0,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    FOREIGN KEY (song_id) REFERENCES songs(id) ON DELETE CASCADE
                );",
                [],
            )?;
            tx.execute(
                "CREATE INDEX IF NOT EXISTS idx_song_arrangements_song ON song_arrangements(song_id, sort_order);",
                [],
            )?;

            tx.execute(
                "INSERT INTO schema_migrations (version, applied_at) VALUES (8, ?1);",
                params![Utc::now().to_rfc3339()],
            )?;

            tx.commit()?;
        }

        Ok(())
    }

    // ================= Presentations CRUD =================

    pub fn list_presentations(&self) -> Result<Vec<Presentation>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT p.id, p.title, p.category, p.theme_name, p.created_at, p.updated_at,
                    COUNT(s.id) as slide_count
             FROM presentations p
             LEFT JOIN slides s ON p.id = s.presentation_id
             GROUP BY p.id
             ORDER BY p.updated_at DESC;",
        )?;

        let iter = stmt.query_map([], |row| {
            Ok(Presentation {
                id: row.get(0)?,
                title: row.get(1)?,
                category: row.get(2)?,
                theme_name: row.get(3)?,
                created_at: row.get(4)?,
                updated_at: row.get(5)?,
                slide_count: row.get(6)?,
            })
        })?;

        let mut list = Vec::new();
        for item in iter {
            list.push(item?);
        }
        Ok(list)
    }

    pub fn get_presentation(&self, id: &str) -> Result<Option<Presentation>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT p.id, p.title, p.category, p.theme_name, p.created_at, p.updated_at,
                    COUNT(s.id) as slide_count
             FROM presentations p
             LEFT JOIN slides s ON p.id = s.presentation_id
             WHERE p.id = ?1
             GROUP BY p.id;",
        )?;

        let mut iter = stmt.query_map(params![id], |row| {
            Ok(Presentation {
                id: row.get(0)?,
                title: row.get(1)?,
                category: row.get(2)?,
                theme_name: row.get(3)?,
                created_at: row.get(4)?,
                updated_at: row.get(5)?,
                slide_count: row.get(6)?,
            })
        })?;

        if let Some(res) = iter.next() {
            Ok(Some(res?))
        } else {
            Ok(None)
        }
    }

    pub fn create_presentation(
        &self,
        title: &str,
        category: &str,
        theme_name: Option<&str>,
    ) -> Result<Presentation> {
        let conn = self.conn.lock().unwrap();
        let id = Uuid::new_v4().to_string();
        let now = Utc::now().to_rfc3339();

        conn.execute(
            "INSERT INTO presentations (id, title, category, theme_name, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?5);",
            params![id, title, category, theme_name, now],
        )?;

        Ok(Presentation {
            id,
            title: title.to_string(),
            category: category.to_string(),
            theme_name: theme_name.map(|s| s.to_string()),
            created_at: now.clone(),
            updated_at: now,
            slide_count: 0,
        })
    }

    pub fn update_presentation(
        &self,
        id: &str,
        title: &str,
        category: &str,
        theme_name: Option<&str>,
    ) -> Result<Presentation> {
        let conn = self.conn.lock().unwrap();
        let now = Utc::now().to_rfc3339();

        conn.execute(
            "UPDATE presentations
             SET title = ?1, category = ?2, theme_name = ?3, updated_at = ?4
             WHERE id = ?5;",
            params![title, category, theme_name, now, id],
        )?;

        let count: i32 = conn.query_row(
            "SELECT COUNT(*) FROM slides WHERE presentation_id = ?1;",
            params![id],
            |row| row.get(0),
        )?;

        let created_at: String = conn.query_row(
            "SELECT created_at FROM presentations WHERE id = ?1;",
            params![id],
            |row| row.get(0),
        )?;

        Ok(Presentation {
            id: id.to_string(),
            title: title.to_string(),
            category: category.to_string(),
            theme_name: theme_name.map(|s| s.to_string()),
            created_at,
            updated_at: now,
            slide_count: count,
        })
    }

    pub fn delete_presentation(&self, id: &str) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute("DELETE FROM presentations WHERE id = ?1;", params![id])?;
        Ok(())
    }

    pub fn duplicate_presentation(&self, id: &str) -> Result<Presentation> {
        let original = self
            .get_presentation(id)?
            .ok_or_else(|| rusqlite::Error::QueryReturnedNoRows)?;
        let slides = self.get_slides(id)?;

        let new_id = Uuid::new_v4().to_string();
        let new_title = format!("{} (Copy)", original.title);
        let now = Utc::now().to_rfc3339();

        let conn = self.conn.lock().unwrap();
        let tx = conn.unchecked_transaction()?;

        tx.execute(
            "INSERT INTO presentations (id, title, category, theme_name, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?5);",
            params![
                new_id,
                new_title,
                original.category,
                original.theme_name,
                now
            ],
        )?;

        for slide in slides {
            let new_slide_id = Uuid::new_v4().to_string();
            tx.execute(
                "INSERT INTO slides (id, presentation_id, sort_order, title, body, background_color, foreground_color, font_size, text_alignment, theme_override, background_image, overlay_color, line_spacing, text_shadow, vertical_alignment, font_family, font_weight, created_at, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?18);",
                params![
                    new_slide_id,
                    new_id,
                    slide.sort_order,
                    slide.title,
                    slide.body,
                    slide.background_color,
                    slide.foreground_color,
                    slide.font_size,
                    slide.text_alignment,
                    slide.theme_override,
                    slide.background_image,
                    slide.overlay_color,
                    slide.line_spacing,
                    slide.text_shadow,
                    slide.vertical_alignment,
                    slide.font_family,
                    slide.font_weight,
                    now
                ],
            )?;
        }

        tx.commit()?;

        Ok(Presentation {
            id: new_id,
            title: new_title,
            category: original.category,
            theme_name: original.theme_name,
            created_at: now.clone(),
            updated_at: now,
            slide_count: original.slide_count,
        })
    }

    // ================= Slides CRUD =================

    pub fn get_slides(&self, presentation_id: &str) -> Result<Vec<Slide>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, presentation_id, sort_order, title, body, background_color, foreground_color, font_size, text_alignment, theme_override,
                    background_image, overlay_color, line_spacing, text_shadow, vertical_alignment, font_family, font_weight,
                    created_at, updated_at
             FROM slides
             WHERE presentation_id = ?1
             ORDER BY sort_order ASC;",
        )?;

        let iter = stmt.query_map(params![presentation_id], |row| {
            Ok(Slide {
                id: row.get(0)?,
                presentation_id: row.get(1)?,
                sort_order: row.get(2)?,
                title: row.get(3)?,
                body: row.get(4)?,
                background_color: row.get(5)?,
                foreground_color: row.get(6)?,
                font_size: row.get(7)?,
                text_alignment: row.get(8)?,
                theme_override: row.get(9)?,
                background_image: row.get(10)?,
                overlay_color: row.get(11)?,
                line_spacing: row.get(12)?,
                text_shadow: row.get(13)?,
                vertical_alignment: row.get(14)?,
                font_family: row.get(15)?,
                font_weight: row.get(16)?,
                created_at: row.get(17)?,
                updated_at: row.get(18)?,
            })
        })?;

        let mut list = Vec::new();
        for item in iter {
            list.push(item?);
        }
        Ok(list)
    }

    pub fn get_slide(&self, id: &str) -> Result<Option<Slide>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, presentation_id, sort_order, title, body, background_color, foreground_color, font_size, text_alignment, theme_override,
                    background_image, overlay_color, line_spacing, text_shadow, vertical_alignment, font_family, font_weight,
                    created_at, updated_at
             FROM slides
             WHERE id = ?1;",
        )?;

        let mut iter = stmt.query_map(params![id], |row| {
            Ok(Slide {
                id: row.get(0)?,
                presentation_id: row.get(1)?,
                sort_order: row.get(2)?,
                title: row.get(3)?,
                body: row.get(4)?,
                background_color: row.get(5)?,
                foreground_color: row.get(6)?,
                font_size: row.get(7)?,
                text_alignment: row.get(8)?,
                theme_override: row.get(9)?,
                background_image: row.get(10)?,
                overlay_color: row.get(11)?,
                line_spacing: row.get(12)?,
                text_shadow: row.get(13)?,
                vertical_alignment: row.get(14)?,
                font_family: row.get(15)?,
                font_weight: row.get(16)?,
                created_at: row.get(17)?,
                updated_at: row.get(18)?,
            })
        })?;

        if let Some(res) = iter.next() {
            Ok(Some(res?))
        } else {
            Ok(None)
        }
    }

    pub fn create_slide(&self, slide: &Slide) -> Result<Slide> {
        let conn = self.conn.lock().unwrap();
        let max_order: i32 = conn
            .query_row(
                "SELECT COALESCE(MAX(sort_order), -1) FROM slides WHERE presentation_id = ?1;",
                params![slide.presentation_id],
                |row| row.get(0),
            )
            .unwrap_or(-1);

        let sort_order = if slide.sort_order >= 0 {
            slide.sort_order
        } else {
            max_order + 1
        };
        let id = if slide.id.is_empty() {
            Uuid::new_v4().to_string()
        } else {
            slide.id.clone()
        };
        let now = Utc::now().to_rfc3339();

        conn.execute(
            "INSERT INTO slides (id, presentation_id, sort_order, title, body, background_color, foreground_color, font_size, text_alignment, theme_override, background_image, overlay_color, line_spacing, text_shadow, vertical_alignment, font_family, font_weight, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?18);",
            params![
                id,
                slide.presentation_id,
                sort_order,
                slide.title,
                slide.body,
                slide.background_color,
                slide.foreground_color,
                slide.font_size,
                slide.text_alignment,
                slide.theme_override,
                slide.background_image,
                slide.overlay_color,
                slide.line_spacing,
                slide.text_shadow,
                slide.vertical_alignment,
                slide.font_family,
                slide.font_weight,
                now
            ],
        )?;

        Ok(Slide {
            id,
            presentation_id: slide.presentation_id.clone(),
            sort_order,
            title: slide.title.clone(),
            body: slide.body.clone(),
            background_color: slide.background_color.clone(),
            foreground_color: slide.foreground_color.clone(),
            font_size: slide.font_size.clone(),
            text_alignment: slide.text_alignment.clone(),
            theme_override: slide.theme_override.clone(),
            background_image: slide.background_image.clone(),
            overlay_color: slide.overlay_color.clone(),
            line_spacing: slide.line_spacing,
            text_shadow: slide.text_shadow.clone(),
            vertical_alignment: slide.vertical_alignment.clone(),
            font_family: slide.font_family.clone(),
            font_weight: slide.font_weight.clone(),
            created_at: now.clone(),
            updated_at: now,
        })
    }

    pub fn update_slide(&self, slide: &Slide) -> Result<Slide> {
        let conn = self.conn.lock().unwrap();
        let now = Utc::now().to_rfc3339();

        conn.execute(
            "UPDATE slides
             SET title = ?1, body = ?2, background_color = ?3, foreground_color = ?4,
                 font_size = ?5, text_alignment = ?6, theme_override = ?7,
                 background_image = ?8, overlay_color = ?9, line_spacing = ?10, text_shadow = ?11,
                 vertical_alignment = ?12, font_family = ?13, font_weight = ?14, updated_at = ?15
             WHERE id = ?16;",
            params![
                slide.title,
                slide.body,
                slide.background_color,
                slide.foreground_color,
                slide.font_size,
                slide.text_alignment,
                slide.theme_override,
                slide.background_image,
                slide.overlay_color,
                slide.line_spacing,
                slide.text_shadow,
                slide.vertical_alignment,
                slide.font_family,
                slide.font_weight,
                now,
                slide.id
            ],
        )?;

        let (pres_id, sort_order, created_at): (String, i32, String) = conn.query_row(
            "SELECT presentation_id, sort_order, created_at FROM slides WHERE id = ?1;",
            params![slide.id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )?;

        Ok(Slide {
            id: slide.id.clone(),
            presentation_id: pres_id,
            sort_order,
            title: slide.title.clone(),
            body: slide.body.clone(),
            background_color: slide.background_color.clone(),
            foreground_color: slide.foreground_color.clone(),
            font_size: slide.font_size.clone(),
            text_alignment: slide.text_alignment.clone(),
            theme_override: slide.theme_override.clone(),
            background_image: slide.background_image.clone(),
            overlay_color: slide.overlay_color.clone(),
            line_spacing: slide.line_spacing,
            text_shadow: slide.text_shadow.clone(),
            vertical_alignment: slide.vertical_alignment.clone(),
            font_family: slide.font_family.clone(),
            font_weight: slide.font_weight.clone(),
            created_at,
            updated_at: now,
        })
    }

    pub fn delete_slide(&self, id: &str) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        let tx = conn.unchecked_transaction()?;

        let pres_id: Option<String> = tx
            .query_row(
                "SELECT presentation_id FROM slides WHERE id = ?1;",
                params![id],
                |row| row.get(0),
            )
            .ok();

        tx.execute("DELETE FROM slides WHERE id = ?1;", params![id])?;

        if let Some(pres_id) = pres_id {
            let mut stmt = tx.prepare(
                "SELECT id FROM slides WHERE presentation_id = ?1 ORDER BY sort_order ASC;",
            )?;
            let ids: Vec<String> = stmt
                .query_map(params![pres_id], |row| row.get(0))?
                .filter_map(|r| r.ok())
                .collect();

            for (idx, slide_id) in ids.iter().enumerate() {
                tx.execute(
                    "UPDATE slides SET sort_order = ?1 WHERE id = ?2;",
                    params![idx as i32, slide_id],
                )?;
            }
        }

        tx.commit()?;
        Ok(())
    }

    pub fn duplicate_slide(&self, id: &str) -> Result<Slide> {
        let orig = self
            .get_slide(id)?
            .ok_or_else(|| rusqlite::Error::QueryReturnedNoRows)?;
        let conn = self.conn.lock().unwrap();
        let tx = conn.unchecked_transaction()?;

        tx.execute(
            "UPDATE slides 
             SET sort_order = sort_order + 1 
             WHERE presentation_id = ?1 AND sort_order > ?2;",
            params![orig.presentation_id, orig.sort_order],
        )?;

        let new_id = Uuid::new_v4().to_string();
        let new_sort_order = orig.sort_order + 1;
        let new_title = format!("{} (Copy)", orig.title);
        let now = Utc::now().to_rfc3339();

        tx.execute(
            "INSERT INTO slides (id, presentation_id, sort_order, title, body, background_color, foreground_color, font_size, text_alignment, theme_override, background_image, overlay_color, line_spacing, text_shadow, vertical_alignment, font_family, font_weight, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?18);",
            params![
                new_id,
                orig.presentation_id,
                new_sort_order,
                new_title,
                orig.body,
                orig.background_color,
                orig.foreground_color,
                orig.font_size,
                orig.text_alignment,
                orig.theme_override,
                orig.background_image,
                orig.overlay_color,
                orig.line_spacing,
                orig.text_shadow,
                orig.vertical_alignment,
                orig.font_family,
                orig.font_weight,
                now
            ],
        )?;

        tx.commit()?;

        Ok(Slide {
            id: new_id,
            presentation_id: orig.presentation_id,
            sort_order: new_sort_order,
            title: new_title,
            body: orig.body,
            background_color: orig.background_color,
            foreground_color: orig.foreground_color,
            font_size: orig.font_size,
            text_alignment: orig.text_alignment,
            theme_override: orig.theme_override,
            background_image: orig.background_image,
            overlay_color: orig.overlay_color,
            line_spacing: orig.line_spacing,
            text_shadow: orig.text_shadow,
            vertical_alignment: orig.vertical_alignment,
            font_family: orig.font_family,
            font_weight: orig.font_weight,
            created_at: now.clone(),
            updated_at: now,
        })
    }

    pub fn reorder_slides(&self, presentation_id: &str, slide_ids: &[String]) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        let tx = conn.unchecked_transaction()?;

        for (idx, slide_id) in slide_ids.iter().enumerate() {
            tx.execute(
                "UPDATE slides SET sort_order = ?1 WHERE id = ?2 AND presentation_id = ?3;",
                params![idx as i32, slide_id, presentation_id],
            )?;
        }

        tx.commit()?;
        Ok(())
    }

    // ================= Phase 2: Songs CRUD & Search =================

    pub fn list_songs(
        &self,
        sort_by: Option<&str>,
        language: Option<&str>,
        category: Option<&str>,
    ) -> Result<Vec<Song>> {
        let conn = self.conn.lock().unwrap();
        let order_clause = match sort_by.unwrap_or("title") {
            "recently_modified" => "s.updated_at DESC",
            "language" => "s.language ASC, s.title ASC",
            _ => "s.title COLLATE NOCASE ASC",
        };

        let query = format!(
            "SELECT s.id, s.title, s.alternate_title, s.language, s.author, s.composer,
                    s.copyright, s.ccli_number, s.song_key, s.tempo, s.tags, s.category,
                    s.default_theme_id, s.created_at, s.updated_at,
                    COUNT(sec.id) as sections_count
             FROM songs s
             LEFT JOIN song_sections sec ON s.id = sec.song_id
             WHERE (?1 IS NULL OR s.language = ?1)
               AND (?2 IS NULL OR s.category = ?2)
             GROUP BY s.id
             ORDER BY {};",
            order_clause
        );

        let mut stmt = conn.prepare(&query)?;
        let iter = stmt.query_map(params![language, category], |row| {
            let tags_str: String = row.get(10)?;
            let tags: Vec<String> = serde_json::from_str(&tags_str).unwrap_or_else(|_| {
                tags_str
                    .split(',')
                    .map(|s| s.trim().to_string())
                    .filter(|s| !s.is_empty())
                    .collect()
            });

            Ok(Song {
                id: row.get(0)?,
                title: row.get(1)?,
                alternate_title: row.get(2)?,
                language: row.get(3)?,
                author: row.get(4)?,
                composer: row.get(5)?,
                copyright: row.get(6)?,
                ccli_number: row.get(7)?,
                song_key: row.get(8)?,
                tempo: row.get(9)?,
                tags,
                category: row.get(11)?,
                default_theme_id: row.get(12)?,
                created_at: row.get(13)?,
                updated_at: row.get(14)?,
                sections_count: row.get(15)?,
            })
        })?;

        let mut list = Vec::new();
        for item in iter {
            list.push(item?);
        }
        Ok(list)
    }

    pub fn get_song(&self, id: &str) -> Result<Option<Song>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT s.id, s.title, s.alternate_title, s.language, s.author, s.composer,
                    s.copyright, s.ccli_number, s.song_key, s.tempo, s.tags, s.category,
                    s.default_theme_id, s.created_at, s.updated_at,
                    COUNT(sec.id) as sections_count
             FROM songs s
             LEFT JOIN song_sections sec ON s.id = sec.song_id
             WHERE s.id = ?1
             GROUP BY s.id;",
        )?;

        let mut iter = stmt.query_map(params![id], |row| {
            let tags_str: String = row.get(10)?;
            let tags: Vec<String> = serde_json::from_str(&tags_str).unwrap_or_else(|_| {
                tags_str
                    .split(',')
                    .map(|s| s.trim().to_string())
                    .filter(|s| !s.is_empty())
                    .collect()
            });

            Ok(Song {
                id: row.get(0)?,
                title: row.get(1)?,
                alternate_title: row.get(2)?,
                language: row.get(3)?,
                author: row.get(4)?,
                composer: row.get(5)?,
                copyright: row.get(6)?,
                ccli_number: row.get(7)?,
                song_key: row.get(8)?,
                tempo: row.get(9)?,
                tags,
                category: row.get(11)?,
                default_theme_id: row.get(12)?,
                created_at: row.get(13)?,
                updated_at: row.get(14)?,
                sections_count: row.get(15)?,
            })
        })?;

        if let Some(res) = iter.next() {
            Ok(Some(res?))
        } else {
            Ok(None)
        }
    }

    pub fn create_song(&self, song: &Song) -> Result<Song> {
        let conn = self.conn.lock().unwrap();
        let id = if song.id.is_empty() {
            Uuid::new_v4().to_string()
        } else {
            song.id.clone()
        };
        let now = Utc::now().to_rfc3339();
        let tags_json = serde_json::to_string(&song.tags).unwrap_or_else(|_| "[]".to_string());

        conn.execute(
            "INSERT INTO songs (id, title, alternate_title, language, author, composer, copyright, ccli_number, song_key, tempo, tags, category, default_theme_id, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?14);",
            params![
                id,
                song.title,
                song.alternate_title,
                song.language,
                song.author,
                song.composer,
                song.copyright,
                song.ccli_number,
                song.song_key,
                song.tempo,
                tags_json,
                song.category,
                song.default_theme_id,
                now
            ],
        )?;

        Ok(Song {
            id,
            title: song.title.clone(),
            alternate_title: song.alternate_title.clone(),
            language: song.language.clone(),
            author: song.author.clone(),
            composer: song.composer.clone(),
            copyright: song.copyright.clone(),
            ccli_number: song.ccli_number.clone(),
            song_key: song.song_key.clone(),
            tempo: song.tempo,
            tags: song.tags.clone(),
            category: song.category.clone(),
            default_theme_id: song.default_theme_id.clone(),
            sections_count: 0,
            created_at: now.clone(),
            updated_at: now,
        })
    }

    pub fn update_song(&self, song: &Song) -> Result<Song> {
        let conn = self.conn.lock().unwrap();
        let now = Utc::now().to_rfc3339();
        let tags_json = serde_json::to_string(&song.tags).unwrap_or_else(|_| "[]".to_string());

        conn.execute(
            "UPDATE songs
             SET title = ?1, alternate_title = ?2, language = ?3, author = ?4, composer = ?5,
                 copyright = ?6, ccli_number = ?7, song_key = ?8, tempo = ?9, tags = ?10,
                 category = ?11, default_theme_id = ?12, updated_at = ?13
             WHERE id = ?14;",
            params![
                song.title,
                song.alternate_title,
                song.language,
                song.author,
                song.composer,
                song.copyright,
                song.ccli_number,
                song.song_key,
                song.tempo,
                tags_json,
                song.category,
                song.default_theme_id,
                now,
                song.id
            ],
        )?;

        let (created_at, sections_count): (String, i32) = conn.query_row(
            "SELECT s.created_at, COUNT(sec.id) 
             FROM songs s 
             LEFT JOIN song_sections sec ON s.id = sec.song_id 
             WHERE s.id = ?1 
             GROUP BY s.id;",
            params![song.id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )?;

        Ok(Song {
            id: song.id.clone(),
            title: song.title.clone(),
            alternate_title: song.alternate_title.clone(),
            language: song.language.clone(),
            author: song.author.clone(),
            composer: song.composer.clone(),
            copyright: song.copyright.clone(),
            ccli_number: song.ccli_number.clone(),
            song_key: song.song_key.clone(),
            tempo: song.tempo,
            tags: song.tags.clone(),
            category: song.category.clone(),
            default_theme_id: song.default_theme_id.clone(),
            sections_count,
            created_at,
            updated_at: now,
        })
    }

    pub fn delete_song(&self, id: &str) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute("DELETE FROM songs WHERE id = ?1;", params![id])?;
        Ok(())
    }

    pub fn duplicate_song(&self, id: &str) -> Result<SongWithSections> {
        let original_song = self
            .get_song(id)?
            .ok_or_else(|| rusqlite::Error::QueryReturnedNoRows)?;
        let sections = self.get_song_sections(id)?;

        let new_id = Uuid::new_v4().to_string();
        let new_title = format!("{} (Copy)", original_song.title);
        let now = Utc::now().to_rfc3339();
        let tags_json =
            serde_json::to_string(&original_song.tags).unwrap_or_else(|_| "[]".to_string());

        let conn = self.conn.lock().unwrap();
        let tx = conn.unchecked_transaction()?;

        tx.execute(
            "INSERT INTO songs (id, title, alternate_title, language, author, composer, copyright, ccli_number, song_key, tempo, tags, category, default_theme_id, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?14);",
            params![
                new_id,
                new_title,
                original_song.alternate_title,
                original_song.language,
                original_song.author,
                original_song.composer,
                original_song.copyright,
                original_song.ccli_number,
                original_song.song_key,
                original_song.tempo,
                tags_json,
                original_song.category,
                original_song.default_theme_id,
                now
            ],
        )?;

        let mut duplicated_sections = Vec::new();
        for sec in sections {
            let new_sec_id = Uuid::new_v4().to_string();
            tx.execute(
                "INSERT INTO song_sections (id, song_id, section_type, label, lyrics, sort_order, notes, created_at, updated_at, color)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?8, ?9);",
                params![
                    new_sec_id,
                    new_id,
                    sec.section_type,
                    sec.label,
                    sec.lyrics,
                    sec.sort_order,
                    sec.notes,
                    now,
                    sec.color.clone()
                ],
            )?;

            duplicated_sections.push(SongSection {
                id: new_sec_id,
                song_id: new_id.clone(),
                section_type: sec.section_type,
                label: sec.label,
                lyrics: sec.lyrics,
                sort_order: sec.sort_order,
                notes: sec.notes,
                color: sec.color,
                created_at: now.clone(),
                updated_at: now.clone(),
            });
        }

        tx.commit()?;

        Ok(SongWithSections {
            song: Song {
                id: new_id,
                title: new_title,
                alternate_title: original_song.alternate_title,
                language: original_song.language,
                author: original_song.author,
                composer: original_song.composer,
                copyright: original_song.copyright,
                ccli_number: original_song.ccli_number,
                song_key: original_song.song_key,
                tempo: original_song.tempo,
                tags: original_song.tags,
                category: original_song.category,
                default_theme_id: original_song.default_theme_id,
                sections_count: duplicated_sections.len() as i32,
                created_at: now.clone(),
                updated_at: now,
            },
            sections: duplicated_sections,
        })
    }

    pub fn search_songs(
        &self,
        query: &str,
        language: Option<&str>,
        category: Option<&str>,
    ) -> Result<Vec<Song>> {
        let conn = self.conn.lock().unwrap();
        let pattern = format!("%{}%", query.trim().to_lowercase());

        let mut stmt = conn.prepare(
            "SELECT DISTINCT s.id, s.title, s.alternate_title, s.language, s.author, s.composer,
                    s.copyright, s.ccli_number, s.song_key, s.tempo, s.tags, s.category,
                    s.default_theme_id, s.created_at, s.updated_at,
                    (SELECT COUNT(*) FROM song_sections WHERE song_id = s.id) as sections_count
             FROM songs s
             LEFT JOIN song_sections sec ON s.id = sec.song_id
             WHERE (
                 LOWER(s.title) LIKE ?1 OR
                 LOWER(COALESCE(s.alternate_title, '')) LIKE ?1 OR
                 LOWER(COALESCE(s.author, '')) LIKE ?1 OR
                 LOWER(COALESCE(s.composer, '')) LIKE ?1 OR
                 LOWER(s.tags) LIKE ?1 OR
                 LOWER(COALESCE(sec.lyrics, '')) LIKE ?1
             )
             AND (?2 IS NULL OR s.language = ?2)
             AND (?3 IS NULL OR s.category = ?3)
             ORDER BY s.title COLLATE NOCASE ASC;",
        )?;

        let iter = stmt.query_map(params![pattern, language, category], |row| {
            let tags_str: String = row.get(10)?;
            let tags: Vec<String> = serde_json::from_str(&tags_str).unwrap_or_else(|_| {
                tags_str
                    .split(',')
                    .map(|s| s.trim().to_string())
                    .filter(|s| !s.is_empty())
                    .collect()
            });

            Ok(Song {
                id: row.get(0)?,
                title: row.get(1)?,
                alternate_title: row.get(2)?,
                language: row.get(3)?,
                author: row.get(4)?,
                composer: row.get(5)?,
                copyright: row.get(6)?,
                ccli_number: row.get(7)?,
                song_key: row.get(8)?,
                tempo: row.get(9)?,
                tags,
                category: row.get(11)?,
                default_theme_id: row.get(12)?,
                created_at: row.get(13)?,
                updated_at: row.get(14)?,
                sections_count: row.get(15)?,
            })
        })?;

        let mut list = Vec::new();
        for item in iter {
            list.push(item?);
        }
        Ok(list)
    }

    // ================= Song Sections CRUD =================

    pub fn get_song_sections(&self, song_id: &str) -> Result<Vec<SongSection>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, song_id, section_type, label, lyrics, sort_order, notes, created_at, updated_at, color
             FROM song_sections
             WHERE song_id = ?1
             ORDER BY sort_order ASC;",
        )?;

        let iter = stmt.query_map(params![song_id], |row| {
            Ok(SongSection {
                id: row.get(0)?,
                song_id: row.get(1)?,
                section_type: row.get(2)?,
                label: row.get(3)?,
                lyrics: row.get(4)?,
                sort_order: row.get(5)?,
                notes: row.get(6)?,
                created_at: row.get(7)?,
                updated_at: row.get(8)?,
                color: row.get(9)?,
            })
        })?;

        let mut list = Vec::new();
        for item in iter {
            list.push(item?);
        }
        Ok(list)
    }

    pub fn save_song_sections(
        &self,
        song_id: &str,
        sections: &[SongSection],
    ) -> Result<Vec<SongSection>> {
        let conn = self.conn.lock().unwrap();
        let tx = conn.unchecked_transaction()?;
        let now = Utc::now().to_rfc3339();

        tx.execute("DELETE FROM song_sections WHERE song_id = ?1;", params![song_id])?;

        let mut saved = Vec::new();
        for (idx, sec) in sections.iter().enumerate() {
            let sec_id = if sec.id.is_empty() {
                Uuid::new_v4().to_string()
            } else {
                sec.id.clone()
            };

            tx.execute(
                "INSERT INTO song_sections (id, song_id, section_type, label, lyrics, sort_order, notes, created_at, updated_at, color)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?8, ?9);",
                params![
                    sec_id,
                    song_id,
                    sec.section_type,
                    sec.label,
                    sec.lyrics,
                    idx as i32,
                    sec.notes,
                    now,
                    sec.color.clone()
                ],
            )?;

            saved.push(SongSection {
                id: sec_id,
                song_id: song_id.to_string(),
                section_type: sec.section_type.clone(),
                label: sec.label.clone(),
                lyrics: sec.lyrics.clone(),
                sort_order: idx as i32,
                notes: sec.notes.clone(),
                color: sec.color.clone(),
                created_at: now.clone(),
                updated_at: now.clone(),
            });
        }

        // Touch song's updated_at timestamp
        tx.execute(
            "UPDATE songs SET updated_at = ?1 WHERE id = ?2;",
            params![now, song_id],
        )?;

        tx.commit()?;
        Ok(saved)
    }

    pub fn list_song_arrangements(&self, song_id: &str) -> Result<Vec<SongArrangement>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, song_id, name, section_ids, is_default
             FROM song_arrangements WHERE song_id = ?1 ORDER BY sort_order ASC, created_at ASC;",
        )?;
        let rows = stmt.query_map(params![song_id], |row| {
            let ids_json: String = row.get(3)?;
            Ok(SongArrangement {
                id: row.get(0)?,
                song_id: row.get(1)?,
                name: row.get(2)?,
                section_ids: serde_json::from_str(&ids_json).unwrap_or_default(),
                is_default: row.get::<_, i32>(4)? != 0,
            })
        })?;
        rows.collect()
    }

    /// Replaces all arrangements of a song. Unknown section ids are dropped, blank
    /// names get a default, and at most one arrangement stays marked as default.
    pub fn save_song_arrangements(
        &self,
        song_id: &str,
        arrangements: &[SongArrangement],
    ) -> Result<Vec<SongArrangement>> {
        let valid: std::collections::HashSet<String> = self
            .get_song_sections(song_id)?
            .into_iter()
            .map(|s| s.id)
            .collect();

        let conn = self.conn.lock().unwrap();
        let tx = conn.unchecked_transaction()?;
        let now = Utc::now().to_rfc3339();
        tx.execute("DELETE FROM song_arrangements WHERE song_id = ?1;", params![song_id])?;

        let mut saved = Vec::new();
        let mut default_taken = false;
        for (idx, arr) in arrangements.iter().enumerate() {
            let id = if arr.id.is_empty() { Uuid::new_v4().to_string() } else { arr.id.clone() };
            let name = if arr.name.trim().is_empty() {
                format!("Arrangement {}", idx + 1)
            } else {
                arr.name.trim().to_string()
            };
            let section_ids: Vec<String> =
                arr.section_ids.iter().filter(|s| valid.contains(*s)).cloned().collect();
            let is_default = arr.is_default && !default_taken;
            default_taken |= is_default;

            tx.execute(
                "INSERT INTO song_arrangements (id, song_id, name, section_ids, is_default, sort_order, created_at, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?7);",
                params![
                    id,
                    song_id,
                    name,
                    serde_json::to_string(&section_ids).unwrap_or_else(|_| "[]".to_string()),
                    is_default as i32,
                    idx as i32,
                    now
                ],
            )?;
            saved.push(SongArrangement {
                id,
                song_id: song_id.to_string(),
                name,
                section_ids,
                is_default,
            });
        }
        tx.commit()?;
        Ok(saved)
    }

    /// The sections of a song in playing order. Uses `arrangement_id` if given, else the
    /// song's default arrangement, else every section in editor order. Sections can repeat.
    pub fn ordered_song_sections(
        &self,
        song_id: &str,
        arrangement_id: Option<&str>,
    ) -> Result<Vec<SongSection>> {
        let all = self.get_song_sections(song_id)?;
        let arrangements = self.list_song_arrangements(song_id)?;
        let chosen = match arrangement_id {
            Some(id) => arrangements.iter().find(|a| a.id == id),
            None => arrangements.iter().find(|a| a.is_default),
        };
        if let Some(arr) = chosen {
            let ordered: Vec<SongSection> = arr
                .section_ids
                .iter()
                .filter_map(|id| all.iter().find(|s| &s.id == id).cloned())
                .collect();
            if !ordered.is_empty() {
                return Ok(ordered);
            }
        }
        Ok(all)
    }

    // ================= Themes CRUD =================

    pub fn list_themes(&self) -> Result<Vec<Theme>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, name, is_built_in, background_color, background_image_id, background_image_path,
                    background_mode, font_family, font_size, font_weight, text_color, text_alignment,
                    vertical_alignment, line_spacing, text_margin, text_shadow, overlay_color, created_at, updated_at
             FROM themes
             ORDER BY is_built_in DESC, name ASC;",
        )?;

        let iter = stmt.query_map([], |row| {
            Ok(Theme {
                id: row.get(0)?,
                name: row.get(1)?,
                is_built_in: row.get::<_, i32>(2)? != 0,
                background_color: row.get(3)?,
                background_image_id: row.get(4)?,
                background_image_path: row.get(5)?,
                background_mode: row.get(6)?,
                font_family: row.get(7)?,
                font_size: row.get(8)?,
                font_weight: row.get(9)?,
                text_color: row.get(10)?,
                text_alignment: row.get(11)?,
                vertical_alignment: row.get(12)?,
                line_spacing: row.get(13)?,
                text_margin: row.get(14)?,
                text_shadow: row.get(15)?,
                overlay_color: row.get(16)?,
                created_at: row.get(17)?,
                updated_at: row.get(18)?,
            })
        })?;

        let mut list = Vec::new();
        for item in iter {
            list.push(item?);
        }
        Ok(list)
    }

    pub fn get_theme(&self, id: &str) -> Result<Option<Theme>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, name, is_built_in, background_color, background_image_id, background_image_path,
                    background_mode, font_family, font_size, font_weight, text_color, text_alignment,
                    vertical_alignment, line_spacing, text_margin, text_shadow, overlay_color, created_at, updated_at
             FROM themes
             WHERE id = ?1;",
        )?;

        let mut iter = stmt.query_map(params![id], |row| {
            Ok(Theme {
                id: row.get(0)?,
                name: row.get(1)?,
                is_built_in: row.get::<_, i32>(2)? != 0,
                background_color: row.get(3)?,
                background_image_id: row.get(4)?,
                background_image_path: row.get(5)?,
                background_mode: row.get(6)?,
                font_family: row.get(7)?,
                font_size: row.get(8)?,
                font_weight: row.get(9)?,
                text_color: row.get(10)?,
                text_alignment: row.get(11)?,
                vertical_alignment: row.get(12)?,
                line_spacing: row.get(13)?,
                text_margin: row.get(14)?,
                text_shadow: row.get(15)?,
                overlay_color: row.get(16)?,
                created_at: row.get(17)?,
                updated_at: row.get(18)?,
            })
        })?;

        if let Some(res) = iter.next() {
            Ok(Some(res?))
        } else {
            Ok(None)
        }
    }

    pub fn create_theme(&self, theme: &Theme) -> Result<Theme> {
        let conn = self.conn.lock().unwrap();
        let id = if theme.id.is_empty() {
            Uuid::new_v4().to_string()
        } else {
            theme.id.clone()
        };
        let now = Utc::now().to_rfc3339();

        conn.execute(
            "INSERT INTO themes (id, name, is_built_in, background_color, background_image_id, background_image_path, background_mode, font_family, font_size, font_weight, text_color, text_alignment, vertical_alignment, line_spacing, text_margin, text_shadow, overlay_color, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?18);",
            params![
                id,
                theme.name,
                if theme.is_built_in { 1 } else { 0 },
                theme.background_color,
                theme.background_image_id,
                theme.background_image_path,
                theme.background_mode,
                theme.font_family,
                theme.font_size,
                theme.font_weight,
                theme.text_color,
                theme.text_alignment,
                theme.vertical_alignment,
                theme.line_spacing,
                theme.text_margin,
                theme.text_shadow,
                theme.overlay_color,
                now
            ],
        )?;

        Ok(Theme {
            id,
            name: theme.name.clone(),
            is_built_in: theme.is_built_in,
            background_color: theme.background_color.clone(),
            background_image_id: theme.background_image_id.clone(),
            background_image_path: theme.background_image_path.clone(),
            background_mode: theme.background_mode.clone(),
            font_family: theme.font_family.clone(),
            font_size: theme.font_size.clone(),
            font_weight: theme.font_weight.clone(),
            text_color: theme.text_color.clone(),
            text_alignment: theme.text_alignment.clone(),
            vertical_alignment: theme.vertical_alignment.clone(),
            line_spacing: theme.line_spacing,
            text_margin: theme.text_margin,
            text_shadow: theme.text_shadow.clone(),
            overlay_color: theme.overlay_color.clone(),
            created_at: now.clone(),
            updated_at: now,
        })
    }

    pub fn update_theme(&self, theme: &Theme) -> Result<Theme> {
        let conn = self.conn.lock().unwrap();
        let now = Utc::now().to_rfc3339();

        conn.execute(
            "UPDATE themes
             SET name = ?1, background_color = ?2, background_image_id = ?3, background_image_path = ?4,
                 background_mode = ?5, font_family = ?6, font_size = ?7, font_weight = ?8,
                 text_color = ?9, text_alignment = ?10, vertical_alignment = ?11, line_spacing = ?12,
                 text_margin = ?13, text_shadow = ?14, overlay_color = ?15, updated_at = ?16
             WHERE id = ?17;",
            params![
                theme.name,
                theme.background_color,
                theme.background_image_id,
                theme.background_image_path,
                theme.background_mode,
                theme.font_family,
                theme.font_size,
                theme.font_weight,
                theme.text_color,
                theme.text_alignment,
                theme.vertical_alignment,
                theme.line_spacing,
                theme.text_margin,
                theme.text_shadow,
                theme.overlay_color,
                now,
                theme.id
            ],
        )?;

        let created_at: String = conn.query_row(
            "SELECT created_at FROM themes WHERE id = ?1;",
            params![theme.id],
            |row| row.get(0),
        )?;

        Ok(Theme {
            id: theme.id.clone(),
            name: theme.name.clone(),
            is_built_in: theme.is_built_in,
            background_color: theme.background_color.clone(),
            background_image_id: theme.background_image_id.clone(),
            background_image_path: theme.background_image_path.clone(),
            background_mode: theme.background_mode.clone(),
            font_family: theme.font_family.clone(),
            font_size: theme.font_size.clone(),
            font_weight: theme.font_weight.clone(),
            text_color: theme.text_color.clone(),
            text_alignment: theme.text_alignment.clone(),
            vertical_alignment: theme.vertical_alignment.clone(),
            line_spacing: theme.line_spacing,
            text_margin: theme.text_margin,
            text_shadow: theme.text_shadow.clone(),
            overlay_color: theme.overlay_color.clone(),
            created_at,
            updated_at: now,
        })
    }

    pub fn delete_theme(&self, id: &str) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        // Protect built-in themes from deletion
        let is_built_in: i32 = conn
            .query_row(
                "SELECT is_built_in FROM themes WHERE id = ?1;",
                params![id],
                |row| row.get(0),
            )
            .unwrap_or(0);

        if is_built_in != 0 {
            return Err(rusqlite::Error::QueryReturnedNoRows); // Protection rejection
        }

        conn.execute("DELETE FROM themes WHERE id = ?1;", params![id])?;
        Ok(())
    }

    pub fn duplicate_theme(&self, id: &str) -> Result<Theme> {
        let orig = self
            .get_theme(id)?
            .ok_or_else(|| rusqlite::Error::QueryReturnedNoRows)?;
        let mut copy = orig.clone();
        copy.id = Uuid::new_v4().to_string();
        copy.name = format!("{} (Copy)", orig.name);
        copy.is_built_in = false;
        self.create_theme(&copy)
    }

    // ================= Media Assets CRUD =================

    pub fn list_media_assets(&self) -> Result<Vec<MediaAsset>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, filename, original_filename, relative_path, mime_type, file_size, created_at,
                    COALESCE(media_type, 'image'), duration_seconds, width, height, thumbnail_path
             FROM media_assets
             ORDER BY created_at DESC;",
        )?;

        let iter = stmt.query_map([], |row| {
            Ok(MediaAsset {
                id: row.get(0)?,
                filename: row.get(1)?,
                original_filename: row.get(2)?,
                relative_path: row.get(3)?,
                mime_type: row.get(4)?,
                file_size: row.get::<_, i64>(5)? as u64,
                created_at: row.get(6)?,
                media_type: row.get(7)?,
                duration_seconds: row.get(8)?,
                width: row.get(9)?,
                height: row.get(10)?,
                thumbnail_path: row.get(11)?,
            })
        })?;

        let mut list = Vec::new();
        for item in iter {
            list.push(item?);
        }
        Ok(list)
    }

    pub fn get_media_asset(&self, id: &str) -> Result<Option<MediaAsset>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, filename, original_filename, relative_path, mime_type, file_size, created_at,
                    COALESCE(media_type, 'image'), duration_seconds, width, height, thumbnail_path
             FROM media_assets
             WHERE id = ?1;",
        )?;

        let mut iter = stmt.query_map(params![id], |row| {
            Ok(MediaAsset {
                id: row.get(0)?,
                filename: row.get(1)?,
                original_filename: row.get(2)?,
                relative_path: row.get(3)?,
                mime_type: row.get(4)?,
                file_size: row.get::<_, i64>(5)? as u64,
                created_at: row.get(6)?,
                media_type: row.get(7)?,
                duration_seconds: row.get(8)?,
                width: row.get(9)?,
                height: row.get(10)?,
                thumbnail_path: row.get(11)?,
            })
        })?;

        if let Some(res) = iter.next() {
            Ok(Some(res?))
        } else {
            Ok(None)
        }
    }

    pub fn check_media_asset_usage(&self, id: &str) -> Result<usize> {
        let conn = self.conn.lock().unwrap();
        let theme_uses: i64 = conn.query_row(
            "SELECT COUNT(*) FROM themes WHERE background_image_id = ?1;",
            params![id],
            |r| r.get(0),
        ).unwrap_or(0);

        let slide_uses: i64 = conn.query_row(
            "SELECT COUNT(*) FROM slides WHERE background_image LIKE ?1;",
            params![format!("%{}%", id)],
            |r| r.get(0),
        ).unwrap_or(0);

        let service_slide_uses: i64 = conn.query_row(
            "SELECT COUNT(*) FROM service_item_slides WHERE background_image LIKE ?1;",
            params![format!("%{}%", id)],
            |r| r.get(0),
        ).unwrap_or(0);

        let service_item_uses: i64 = conn.query_row(
            "SELECT COUNT(*) FROM service_items WHERE source_id = ?1;",
            params![id],
            |r| r.get(0),
        ).unwrap_or(0);

        Ok((theme_uses + slide_uses + service_slide_uses + service_item_uses) as usize)
    }

    pub fn create_media_asset(&self, asset: &MediaAsset) -> Result<MediaAsset> {
        let conn = self.conn.lock().unwrap();
        let id = if asset.id.is_empty() {
            Uuid::new_v4().to_string()
        } else {
            asset.id.clone()
        };
        let now = Utc::now().to_rfc3339();
        let m_type = if asset.media_type.is_empty() { "image" } else { &asset.media_type };

        conn.execute(
            "INSERT INTO media_assets (id, filename, original_filename, relative_path, mime_type, file_size, created_at, media_type, duration_seconds, width, height, thumbnail_path)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12);",
            params![
                id,
                asset.filename,
                asset.original_filename,
                asset.relative_path,
                asset.mime_type,
                asset.file_size as i64,
                now,
                m_type,
                asset.duration_seconds,
                asset.width,
                asset.height,
                asset.thumbnail_path
            ],
        )?;

        Ok(MediaAsset {
            id,
            filename: asset.filename.clone(),
            original_filename: asset.original_filename.clone(),
            relative_path: asset.relative_path.clone(),
            mime_type: asset.mime_type.clone(),
            file_size: asset.file_size,
            created_at: now,
            media_type: m_type.to_string(),
            duration_seconds: asset.duration_seconds,
            width: asset.width,
            height: asset.height,
            thumbnail_path: asset.thumbnail_path.clone(),
        })
    }

    pub fn delete_media_asset(&self, id: &str) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute("DELETE FROM media_assets WHERE id = ?1;", params![id])?;
        Ok(())
    }

    // ================= Phase 4: Timers CRUD =================

    pub fn list_timers(&self, service_id: Option<&str>) -> Result<Vec<Timer>> {
        let conn = self.conn.lock().unwrap();
        let mut list = Vec::new();

        if let Some(sid) = service_id {
            let mut stmt = conn.prepare(
                "SELECT id, service_id, name, timer_type, duration_seconds, warning_threshold_seconds, created_at, updated_at
                 FROM timers
                 WHERE service_id = ?1 OR service_id IS NULL
                 ORDER BY created_at ASC;",
            )?;
            let rows = stmt.query_map(params![sid], |row| {
                Ok(Timer {
                    id: row.get(0)?,
                    service_id: row.get(1)?,
                    name: row.get(2)?,
                    timer_type: row.get(3)?,
                    duration_seconds: row.get(4)?,
                    warning_threshold_seconds: row.get(5)?,
                    created_at: row.get(6)?,
                    updated_at: row.get(7)?,
                })
            })?;
            for item in rows {
                list.push(item?);
            }
        } else {
            let mut stmt = conn.prepare(
                "SELECT id, service_id, name, timer_type, duration_seconds, warning_threshold_seconds, created_at, updated_at
                 FROM timers
                 ORDER BY created_at ASC;",
            )?;
            let rows = stmt.query_map([], |row| {
                Ok(Timer {
                    id: row.get(0)?,
                    service_id: row.get(1)?,
                    name: row.get(2)?,
                    timer_type: row.get(3)?,
                    duration_seconds: row.get(4)?,
                    warning_threshold_seconds: row.get(5)?,
                    created_at: row.get(6)?,
                    updated_at: row.get(7)?,
                })
            })?;
            for item in rows {
                list.push(item?);
            }
        }

        Ok(list)
    }

    pub fn get_timer(&self, id: &str) -> Result<Option<Timer>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, service_id, name, timer_type, duration_seconds, warning_threshold_seconds, created_at, updated_at
             FROM timers
             WHERE id = ?1;",
        )?;

        let mut rows = stmt.query_map(params![id], |row| {
            Ok(Timer {
                id: row.get(0)?,
                service_id: row.get(1)?,
                name: row.get(2)?,
                timer_type: row.get(3)?,
                duration_seconds: row.get(4)?,
                warning_threshold_seconds: row.get(5)?,
                created_at: row.get(6)?,
                updated_at: row.get(7)?,
            })
        })?;

        if let Some(row) = rows.next() {
            Ok(Some(row?))
        } else {
            Ok(None)
        }
    }

    pub fn create_timer(&self, timer: &Timer) -> Result<Timer> {
        let conn = self.conn.lock().unwrap();
        let id = if timer.id.is_empty() {
            Uuid::new_v4().to_string()
        } else {
            timer.id.clone()
        };
        let now = Utc::now().to_rfc3339();

        conn.execute(
            "INSERT INTO timers (id, service_id, name, timer_type, duration_seconds, warning_threshold_seconds, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8);",
            params![
                id,
                timer.service_id,
                timer.name,
                timer.timer_type,
                timer.duration_seconds,
                timer.warning_threshold_seconds,
                now,
                now
            ],
        )?;

        Ok(Timer {
            id,
            service_id: timer.service_id.clone(),
            name: timer.name.clone(),
            timer_type: timer.timer_type.clone(),
            duration_seconds: timer.duration_seconds,
            warning_threshold_seconds: timer.warning_threshold_seconds,
            created_at: now.clone(),
            updated_at: now,
        })
    }

    pub fn update_timer(&self, timer: &Timer) -> Result<Timer> {
        let conn = self.conn.lock().unwrap();
        let now = Utc::now().to_rfc3339();

        conn.execute(
            "UPDATE timers
             SET service_id = ?1, name = ?2, timer_type = ?3, duration_seconds = ?4, warning_threshold_seconds = ?5, updated_at = ?6
             WHERE id = ?7;",
            params![
                timer.service_id,
                timer.name,
                timer.timer_type,
                timer.duration_seconds,
                timer.warning_threshold_seconds,
                now,
                timer.id
            ],
        )?;

        Ok(Timer {
            id: timer.id.clone(),
            service_id: timer.service_id.clone(),
            name: timer.name.clone(),
            timer_type: timer.timer_type.clone(),
            duration_seconds: timer.duration_seconds,
            warning_threshold_seconds: timer.warning_threshold_seconds,
            created_at: timer.created_at.clone(),
            updated_at: now,
        })
    }

    pub fn delete_timer(&self, id: &str) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute("DELETE FROM timers WHERE id = ?1;", params![id])?;
        Ok(())
    }

    // ================= Phase 4: Stage Display Config =================

    pub fn get_stage_config(&self, id: &str) -> Result<StageConfig> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, font_size, show_notes, show_timer, show_next, high_contrast, created_at, updated_at
             FROM stage_configs
             WHERE id = ?1;",
        )?;

        let mut rows = stmt.query_map(params![id], |row| {
            Ok(StageConfig {
                id: row.get(0)?,
                font_size: row.get(1)?,
                show_notes: row.get::<_, i32>(2)? != 0,
                show_timer: row.get::<_, i32>(3)? != 0,
                show_next: row.get::<_, i32>(4)? != 0,
                high_contrast: row.get::<_, i32>(5)? != 0,
                created_at: row.get(6)?,
                updated_at: row.get(7)?,
            })
        })?;

        if let Some(row) = rows.next() {
            Ok(row?)
        } else {
            Ok(StageConfig::default())
        }
    }

    pub fn update_stage_config(&self, config: &StageConfig) -> Result<StageConfig> {
        let conn = self.conn.lock().unwrap();
        let now = Utc::now().to_rfc3339();

        conn.execute(
            "INSERT INTO stage_configs (id, font_size, show_notes, show_timer, show_next, high_contrast, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
             ON CONFLICT(id) DO UPDATE SET
                font_size = excluded.font_size,
                show_notes = excluded.show_notes,
                show_timer = excluded.show_timer,
                show_next = excluded.show_next,
                high_contrast = excluded.high_contrast,
                updated_at = excluded.updated_at;",
            params![
                config.id,
                config.font_size,
                if config.show_notes { 1 } else { 0 },
                if config.show_timer { 1 } else { 0 },
                if config.show_next { 1 } else { 0 },
                if config.high_contrast { 1 } else { 0 },
                now,
                now
            ],
        )?;

        Ok(StageConfig {
            id: config.id.clone(),
            font_size: config.font_size.clone(),
            show_notes: config.show_notes,
            show_timer: config.show_timer,
            show_next: config.show_next,
            high_contrast: config.high_contrast,
            created_at: config.created_at.clone(),
            updated_at: now,
        })
    }

    pub fn list_stage_configs(&self) -> Result<Vec<StageConfig>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, font_size, show_notes, show_timer, show_next, high_contrast, created_at, updated_at
             FROM stage_configs
             ORDER BY id ASC;",
        )?;

        let rows = stmt.query_map([], |row| {
            Ok(StageConfig {
                id: row.get(0)?,
                font_size: row.get(1)?,
                show_notes: row.get::<_, i32>(2)? != 0,
                show_timer: row.get::<_, i32>(3)? != 0,
                show_next: row.get::<_, i32>(4)? != 0,
                high_contrast: row.get::<_, i32>(5)? != 0,
                created_at: row.get(6)?,
                updated_at: row.get(7)?,
            })
        })?;

        let mut list = Vec::new();
        for r in rows {
            list.push(r?);
        }
        Ok(list)
    }

    // ================= Slide Generation from Song =================

    pub fn generate_slides_from_song(
        &self,
        options: &SlideGenerationOptions,
    ) -> Result<(String, Vec<Slide>)> {
        let song = self
            .get_song(&options.song_id)?
            .ok_or_else(|| rusqlite::Error::QueryReturnedNoRows)?;
        let all_sections = self.get_song_sections(&options.song_id)?;

        // Explicit section_ids win; otherwise use the chosen/default arrangement, else all in order
        let sections_to_use: Vec<SongSection> = if options.section_ids.is_empty() {
            self.ordered_song_sections(&options.song_id, options.arrangement_id.as_deref())?
        } else {
            let mut filtered = Vec::new();
            for sec_id in &options.section_ids {
                if let Some(found) = all_sections.iter().find(|s| &s.id == sec_id) {
                    filtered.push(found.clone());
                }
            }
            filtered
        };

        // Resolve theme
        let theme_id = options
            .theme_id
            .as_deref()
            .or_else(|| song.default_theme_id.as_deref())
            .unwrap_or("theme-builtin-dark");

        let theme = self
            .get_theme(theme_id)?
            .or_else(|| self.get_theme("theme-builtin-dark").ok().flatten())
            .unwrap_or(Theme {
                id: "theme-fallback".to_string(),
                name: "Fallback Dark".to_string(),
                is_built_in: true,
                background_color: "#0a0f1d".to_string(),
                background_image_id: None,
                background_image_path: None,
                background_mode: "cover".to_string(),
                font_family: "system-ui, -apple-system, sans-serif".to_string(),
                font_size: "large".to_string(),
                font_weight: "bold".to_string(),
                text_color: "#ffffff".to_string(),
                text_alignment: "center".to_string(),
                vertical_alignment: "center".to_string(),
                line_spacing: 1.35,
                text_margin: 6,
                text_shadow: Some("0 2px 8px rgba(0,0,0,0.8)".to_string()),
                overlay_color: None,
                created_at: "".to_string(),
                updated_at: "".to_string(),
            });

        // Determine or create presentation
        let presentation_id = if options.create_new_presentation
            || options.target_presentation_id.is_none()
        {
            let title = options
                .new_presentation_title
                .clone()
                .filter(|s| !s.trim().is_empty())
                .unwrap_or_else(|| song.title.clone());
            let pres = self.create_presentation(&title, &song.category, Some(&theme.name))?;
            pres.id
        } else {
            options.target_presentation_id.clone().unwrap()
        };

        // Determine starting sort order (append to existing slides)
        let existing_slides = self.get_slides(&presentation_id)?;
        let mut current_order = existing_slides.len() as i32;
        let mut generated_slides = Vec::new();

        for section in sections_to_use {
            // Split section into slide lyric blocks
            let blocks = self.split_section_lyrics(
                &section.lyrics,
                options.lines_per_slide,
                options.custom_delimiter.as_deref(),
            );

            for (block_idx, block_text) in blocks.iter().enumerate() {
                let slide_title = if blocks.len() > 1 {
                    format!("{} ({}/{})", section.label, block_idx + 1, blocks.len())
                } else {
                    section.label.clone()
                };

                let new_slide = Slide {
                    id: Uuid::new_v4().to_string(),
                    presentation_id: presentation_id.clone(),
                    sort_order: current_order,
                    title: slide_title,
                    body: block_text.clone(),
                    background_color: theme.background_color.clone(),
                    foreground_color: theme.text_color.clone(),
                    font_size: theme.font_size.clone(),
                    text_alignment: theme.text_alignment.clone(),
                    theme_override: Some(theme.name.clone()),
                    background_image: theme.background_image_path.clone(),
                    overlay_color: theme.overlay_color.clone(),
                    line_spacing: Some(theme.line_spacing),
                    text_shadow: theme.text_shadow.clone(),
                    vertical_alignment: Some(theme.vertical_alignment.clone()),
                    font_family: Some(theme.font_family.clone()),
                    font_weight: Some(theme.font_weight.clone()),
                    created_at: Utc::now().to_rfc3339(),
                    updated_at: Utc::now().to_rfc3339(),
                };

                let saved = self.create_slide(&new_slide)?;
                generated_slides.push(saved);
                current_order += 1;
            }
        }

        Ok((presentation_id, generated_slides))
    }

    fn split_section_lyrics(
        &self,
        lyrics: &str,
        lines_per_slide: Option<i32>,
        custom_delimiter: Option<&str>,
    ) -> Vec<String> {
        let cleaned = lyrics.trim();
        if cleaned.is_empty() {
            return vec![String::new()];
        }

        // 1. If custom delimiter specified (e.g. "---" or "\n\n")
        if let Some(delim) = custom_delimiter {
            if !delim.is_empty() && cleaned.contains(delim) {
                let parts: Vec<String> = cleaned
                    .split(delim)
                    .map(|s| s.trim().to_string())
                    .filter(|s| !s.is_empty())
                    .collect();
                if !parts.is_empty() {
                    return parts;
                }
            }
        }

        // 2. If lines_per_slide specified (e.g. 2, 4)
        if let Some(lps) = lines_per_slide {
            if lps > 0 {
                let lines: Vec<&str> = cleaned.lines().collect();
                let mut blocks = Vec::new();
                for chunk in lines.chunks(lps as usize) {
                    let block = chunk.join("\n").trim().to_string();
                    if !block.is_empty() {
                        blocks.push(block);
                    }
                }
                if !blocks.is_empty() {
                    return blocks;
                }
            }
        }

        // 3. Default: keep section together as 1 slide block
        vec![cleaned.to_string()]
    }

    // ================= Phase 2: Song Import & Export =================

    pub fn export_song(&self, song_id: &str) -> Result<SongExportData> {
        let song = self
            .get_song(song_id)?
            .ok_or_else(|| rusqlite::Error::QueryReturnedNoRows)?;
        let sections = self.get_song_sections(song_id)?;

        let mut themes = Vec::new();
        if let Some(ref tid) = song.default_theme_id {
            if let Ok(Some(theme)) = self.get_theme(tid) {
                themes.push(theme);
            }
        }

        Ok(SongExportData {
            version: "1.0.0".to_string(),
            exported_at: Utc::now().to_rfc3339(),
            app: "ChurchPresenter".to_string(),
            songs: vec![SongWithSections { song, sections }],
            themes,
        })
    }

    pub fn export_all_songs(&self, song_ids: Option<Vec<String>>) -> Result<SongExportData> {
        let all_songs = self.list_songs(None, None, None)?;
        let selected: Vec<Song> = if let Some(ids) = song_ids {
            all_songs.into_iter().filter(|s| ids.contains(&s.id)).collect()
        } else {
            all_songs
        };

        let mut songs_with_sec = Vec::new();
        for song in selected {
            let sections = self.get_song_sections(&song.id)?;
            songs_with_sec.push(SongWithSections { song, sections });
        }

        let themes = self.list_themes()?;

        Ok(SongExportData {
            version: "1.0.0".to_string(),
            exported_at: Utc::now().to_rfc3339(),
            app: "ChurchPresenter".to_string(),
            songs: songs_with_sec,
            themes,
        })
    }

    pub fn import_songs(
        &self,
        data: &SongExportData,
        options: &SongImportOptions,
    ) -> Result<SongImportResult> {
        if data.version.is_empty() || data.songs.is_empty() {
            return Ok(SongImportResult {
                imported_count: 0,
                updated_count: 0,
                skipped_count: 0,
                error_count: 0,
                errors: vec!["Empty or invalid song export file".to_string()],
            });
        }

        let conn = self.conn.lock().unwrap();
        let tx = conn.unchecked_transaction()?;
        let now = Utc::now().to_rfc3339();

        let mut imported = 0;
        let mut updated = 0;
        let mut skipped = 0;
        let mut errors = Vec::new();

        // Import themes if provided
        for theme in &data.themes {
            let exists: bool = tx
                .query_row(
                    "SELECT 1 FROM themes WHERE id = ?1;",
                    params![theme.id],
                    |_| Ok(true),
                )
                .unwrap_or(false);

            if !exists {
                tx.execute(
                    "INSERT INTO themes (id, name, is_built_in, background_color, background_image_id, background_image_path, background_mode, font_family, font_size, font_weight, text_color, text_alignment, vertical_alignment, line_spacing, text_margin, text_shadow, overlay_color, created_at, updated_at)
                     VALUES (?1, ?2, 0, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?17);",
                    params![
                        theme.id,
                        theme.name,
                        theme.background_color,
                        theme.background_image_id,
                        theme.background_image_path,
                        theme.background_mode,
                        theme.font_family,
                        theme.font_size,
                        theme.font_weight,
                        theme.text_color,
                        theme.text_alignment,
                        theme.vertical_alignment,
                        theme.line_spacing,
                        theme.text_margin,
                        theme.text_shadow,
                        theme.overlay_color,
                        now
                    ],
                )?;
            }
        }

        for item in &data.songs {
            let song = &item.song;
            if song.title.trim().is_empty() {
                errors.push("Skipped song with missing title".to_string());
                continue;
            }

            // Check if song exists by ID or title
            let existing_id: Option<String> = tx
                .query_row(
                    "SELECT id FROM songs WHERE id = ?1 OR LOWER(title) = LOWER(?2);",
                    params![song.id, song.title],
                    |row| row.get(0),
                )
                .ok();

            let tags_json = serde_json::to_string(&song.tags).unwrap_or_else(|_| "[]".to_string());

            if let Some(existing) = existing_id {
                match options.duplicate_mode.as_str() {
                    "skip" => {
                        skipped += 1;
                        continue;
                    }
                    "copy" => {
                        let new_id = Uuid::new_v4().to_string();
                        let new_title = format!("{} (Imported Copy)", song.title);

                        tx.execute(
                            "INSERT INTO songs (id, title, alternate_title, language, author, composer, copyright, ccli_number, song_key, tempo, tags, category, default_theme_id, created_at, updated_at)
                             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?14);",
                            params![
                                new_id,
                                new_title,
                                song.alternate_title,
                                song.language,
                                song.author,
                                song.composer,
                                song.copyright,
                                song.ccli_number,
                                song.song_key,
                                song.tempo,
                                tags_json,
                                song.category,
                                song.default_theme_id,
                                now
                            ],
                        )?;

                        for (idx, sec) in item.sections.iter().enumerate() {
                            let sec_id = Uuid::new_v4().to_string();
                            tx.execute(
                                "INSERT INTO song_sections (id, song_id, section_type, label, lyrics, sort_order, notes, created_at, updated_at, color)
                                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?8, ?9);",
                                params![
                                    sec_id,
                                    new_id,
                                    sec.section_type,
                                    sec.label,
                                    sec.lyrics,
                                    idx as i32,
                                    sec.notes,
                                    now,
                                    sec.color.clone()
                                ],
                            )?;
                        }
                        imported += 1;
                    }
                    _ => {
                        // "update"
                        tx.execute(
                            "UPDATE songs
                             SET title = ?1, alternate_title = ?2, language = ?3, author = ?4, composer = ?5,
                                 copyright = ?6, ccli_number = ?7, song_key = ?8, tempo = ?9, tags = ?10,
                                 category = ?11, default_theme_id = ?12, updated_at = ?13
                             WHERE id = ?14;",
                            params![
                                song.title,
                                song.alternate_title,
                                song.language,
                                song.author,
                                song.composer,
                                song.copyright,
                                song.ccli_number,
                                song.song_key,
                                song.tempo,
                                tags_json,
                                song.category,
                                song.default_theme_id,
                                now,
                                existing
                            ],
                        )?;

                        tx.execute(
                            "DELETE FROM song_sections WHERE song_id = ?1;",
                            params![existing],
                        )?;

                        for (idx, sec) in item.sections.iter().enumerate() {
                            let sec_id = Uuid::new_v4().to_string();
                            tx.execute(
                                "INSERT INTO song_sections (id, song_id, section_type, label, lyrics, sort_order, notes, created_at, updated_at, color)
                                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?8, ?9);",
                                params![
                                    sec_id,
                                    existing,
                                    sec.section_type,
                                    sec.label,
                                    sec.lyrics,
                                    idx as i32,
                                    sec.notes,
                                    now,
                                    sec.color.clone()
                                ],
                            )?;
                        }
                        updated += 1;
                    }
                }
            } else {
                // New song insert
                let song_id = if song.id.is_empty() {
                    Uuid::new_v4().to_string()
                } else {
                    song.id.clone()
                };

                tx.execute(
                    "INSERT INTO songs (id, title, alternate_title, language, author, composer, copyright, ccli_number, song_key, tempo, tags, category, default_theme_id, created_at, updated_at)
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?14);",
                    params![
                        song_id,
                        song.title,
                        song.alternate_title,
                        song.language,
                        song.author,
                        song.composer,
                        song.copyright,
                        song.ccli_number,
                        song.song_key,
                        song.tempo,
                        tags_json,
                        song.category,
                        song.default_theme_id,
                        now
                    ],
                )?;

                for (idx, sec) in item.sections.iter().enumerate() {
                    let sec_id = if sec.id.is_empty() {
                        Uuid::new_v4().to_string()
                    } else {
                        sec.id.clone()
                    };
                    tx.execute(
                        "INSERT INTO song_sections (id, song_id, section_type, label, lyrics, sort_order, notes, created_at, updated_at, color)
                         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?8, ?9);",
                        params![
                            sec_id,
                            song_id,
                            sec.section_type,
                            sec.label,
                            sec.lyrics,
                            idx as i32,
                            sec.notes,
                            now,
                            sec.color.clone()
                        ],
                    )?;
                }
                imported += 1;
            }
        }

        tx.commit()?;

        Ok(SongImportResult {
            imported_count: imported,
            updated_count: updated,
            skipped_count: skipped,
            error_count: errors.len(),
            errors,
        })
    }

    // ================= Settings =================

    pub fn get_setting(&self, key: &str) -> Result<Option<String>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare("SELECT value FROM settings WHERE key = ?1;")?;
        let mut iter = stmt.query_map(params![key], |row| row.get(0))?;
        if let Some(val) = iter.next() {
            Ok(Some(val?))
        } else {
            Ok(None)
        }
    }

    pub fn set_setting(&self, key: &str, value: &str) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT INTO settings (key, value) VALUES (?1, ?2)
             ON CONFLICT(key) DO UPDATE SET value = ?2;",
            params![key, value],
        )?;
        Ok(())
    }

    // ================= Phase 3 Services & Service Items CRUD =================

    pub fn list_services(&self) -> Result<Vec<Service>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT s.id, s.title, s.description, s.service_date, s.category, s.notes, s.created_at, s.updated_at,
                    COUNT(si.id) as item_count
             FROM services s
             LEFT JOIN service_items si ON s.id = si.service_id
             GROUP BY s.id
             ORDER BY s.updated_at DESC;",
        )?;

        let iter = stmt.query_map([], |row| {
            Ok(Service {
                id: row.get(0)?,
                title: row.get(1)?,
                description: row.get(2)?,
                service_date: row.get(3)?,
                category: row.get(4)?,
                notes: row.get(5)?,
                created_at: row.get(6)?,
                updated_at: row.get(7)?,
                item_count: row.get(8)?,
            })
        })?;

        let mut list = Vec::new();
        for item in iter {
            list.push(item?);
        }
        Ok(list)
    }

    pub fn get_service(&self, id: &str) -> Result<Option<Service>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT s.id, s.title, s.description, s.service_date, s.category, s.notes, s.created_at, s.updated_at,
                    COUNT(si.id) as item_count
             FROM services s
             LEFT JOIN service_items si ON s.id = si.service_id
             WHERE s.id = ?1
             GROUP BY s.id;",
        )?;

        let mut iter = stmt.query_map(params![id], |row| {
            Ok(Service {
                id: row.get(0)?,
                title: row.get(1)?,
                description: row.get(2)?,
                service_date: row.get(3)?,
                category: row.get(4)?,
                notes: row.get(5)?,
                created_at: row.get(6)?,
                updated_at: row.get(7)?,
                item_count: row.get(8)?,
            })
        })?;

        if let Some(res) = iter.next() {
            Ok(Some(res?))
        } else {
            Ok(None)
        }
    }

    pub fn get_service_with_items(&self, id: &str) -> Result<Option<ServiceWithItems>> {
        let service = self.get_service(id)?;
        if let Some(srv) = service {
            let items = self.get_service_items(id)?;
            Ok(Some(ServiceWithItems { service: srv, items }))
        } else {
            Ok(None)
        }
    }

    pub fn create_service(&self, service: &Service) -> Result<Service> {
        let conn = self.conn.lock().unwrap();
        let id = if service.id.is_empty() {
            format!("srv-{}", Uuid::new_v4().simple())
        } else {
            service.id.clone()
        };
        let now = Utc::now().to_rfc3339();

        conn.execute(
            "INSERT INTO services (id, title, description, service_date, category, notes, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8);",
            params![
                id,
                service.title,
                service.description,
                service.service_date,
                service.category,
                service.notes,
                now,
                now
            ],
        )?;

        Ok(Service {
            id,
            title: service.title.clone(),
            description: service.description.clone(),
            service_date: service.service_date.clone(),
            category: service.category.clone(),
            notes: service.notes.clone(),
            created_at: now.clone(),
            updated_at: now,
            item_count: 0,
        })
    }

    pub fn update_service(&self, service: &Service) -> Result<Service> {
        let conn = self.conn.lock().unwrap();
        let now = Utc::now().to_rfc3339();

        conn.execute(
            "UPDATE services
             SET title = ?1, description = ?2, service_date = ?3, category = ?4, notes = ?5, updated_at = ?6
             WHERE id = ?7;",
            params![
                service.title,
                service.description,
                service.service_date,
                service.category,
                service.notes,
                now,
                service.id
            ],
        )?;

        let mut res = service.clone();
        res.updated_at = now;
        Ok(res)
    }

    pub fn delete_service(&self, id: &str) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute("DELETE FROM services WHERE id = ?1;", params![id])?;
        Ok(())
    }

    pub fn duplicate_service(&self, id: &str, new_title: Option<String>) -> Result<Service> {
        let orig = self
            .get_service(id)?
            .ok_or(rusqlite::Error::QueryReturnedNoRows)?;
        let items = self.get_service_items(id)?;

        let new_id = format!("srv-{}", Uuid::new_v4().simple());
        let now = Utc::now().to_rfc3339();
        let title = new_title.unwrap_or_else(|| format!("{} (Copy)", orig.title));

        let conn = self.conn.lock().unwrap();
        let tx = conn.unchecked_transaction()?;

        tx.execute(
            "INSERT INTO services (id, title, description, service_date, category, notes, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8);",
            params![
                new_id,
                title,
                orig.description,
                orig.service_date,
                orig.category,
                orig.notes,
                now,
                now
            ],
        )?;

        for item in &items {
            let new_item_id = format!("item-{}", Uuid::new_v4().simple());
            tx.execute(
                "INSERT INTO service_items (id, service_id, sort_order, item_type, title, notes, source_id, theme_id, duration_seconds, created_at, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?10);",
                params![
                    new_item_id,
                    new_id,
                    item.sort_order,
                    item.item_type,
                    item.title,
                    item.notes,
                    item.source_id,
                    item.theme_id,
                    item.duration_seconds,
                    now
                ],
            )?;

            // Copy item slides
            let mut slide_stmt = tx.prepare(
                "SELECT sort_order, title, body, background_color, foreground_color, font_size, text_alignment, theme_override, background_image, overlay_color, line_spacing, text_shadow, vertical_alignment, font_family, font_weight
                 FROM service_item_slides WHERE item_id = ?1 ORDER BY sort_order ASC;",
            )?;

            let slides = slide_stmt
                .query_map(params![item.id], |r| {
                    Ok((
                        r.get::<_, i32>(0)?,
                        r.get::<_, String>(1)?,
                        r.get::<_, String>(2)?,
                        r.get::<_, String>(3)?,
                        r.get::<_, String>(4)?,
                        r.get::<_, String>(5)?,
                        r.get::<_, String>(6)?,
                        r.get::<_, Option<String>>(7)?,
                        r.get::<_, Option<String>>(8)?,
                        r.get::<_, Option<String>>(9)?,
                        r.get::<_, Option<f64>>(10)?,
                        r.get::<_, Option<String>>(11)?,
                        r.get::<_, Option<String>>(12)?,
                        r.get::<_, Option<String>>(13)?,
                        r.get::<_, Option<String>>(14)?,
                    ))
                })?
                .collect::<std::result::Result<Vec<_>, _>>()?;

            for s in slides {
                let new_slide_id = format!("slide-{}", Uuid::new_v4().simple());
                tx.execute(
                    "INSERT INTO service_item_slides (id, item_id, sort_order, title, body, background_color, foreground_color, font_size, text_alignment, theme_override, background_image, overlay_color, line_spacing, text_shadow, vertical_alignment, font_family, font_weight, created_at, updated_at)
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?18);",
                    params![
                        new_slide_id,
                        new_item_id,
                        s.0,
                        s.1,
                        s.2,
                        s.3,
                        s.4,
                        s.5,
                        s.6,
                        s.7,
                        s.8,
                        s.9,
                        s.10,
                        s.11,
                        s.12,
                        s.13,
                        s.14,
                        now
                    ],
                )?;
            }
        }

        tx.commit()?;

        Ok(Service {
            id: new_id,
            title,
            description: orig.description,
            service_date: orig.service_date,
            category: orig.category,
            notes: orig.notes,
            created_at: now.clone(),
            updated_at: now,
            item_count: items.len() as i32,
        })
    }

    pub fn get_service_items(&self, service_id: &str) -> Result<Vec<PlaylistItem>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT si.id, si.service_id, si.sort_order, si.item_type, si.title, si.notes, si.source_id, si.theme_id, si.duration_seconds, si.created_at, si.updated_at,
                    COUNT(sis.id) as slide_count
             FROM service_items si
             LEFT JOIN service_item_slides sis ON si.id = sis.item_id
             WHERE si.service_id = ?1
             GROUP BY si.id
             ORDER BY si.sort_order ASC;",
        )?;

        let iter = stmt.query_map(params![service_id], |row| {
            Ok(PlaylistItem {
                id: row.get(0)?,
                service_id: row.get(1)?,
                sort_order: row.get(2)?,
                item_type: row.get(3)?,
                title: row.get(4)?,
                notes: row.get(5)?,
                source_id: row.get(6)?,
                theme_id: row.get(7)?,
                duration_seconds: row.get(8)?,
                created_at: row.get(9)?,
                updated_at: row.get(10)?,
                slide_count: row.get(11)?,
            })
        })?;

        let mut list = Vec::new();
        for item in iter {
            list.push(item?);
        }
        Ok(list)
    }

    pub fn get_service_item(&self, item_id: &str) -> Result<Option<PlaylistItem>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT si.id, si.service_id, si.sort_order, si.item_type, si.title, si.notes, si.source_id, si.theme_id, si.duration_seconds, si.created_at, si.updated_at,
                    COUNT(sis.id) as slide_count
             FROM service_items si
             LEFT JOIN service_item_slides sis ON si.id = sis.item_id
             WHERE si.id = ?1
             GROUP BY si.id;",
        )?;

        let mut iter = stmt.query_map(params![item_id], |row| {
            Ok(PlaylistItem {
                id: row.get(0)?,
                service_id: row.get(1)?,
                sort_order: row.get(2)?,
                item_type: row.get(3)?,
                title: row.get(4)?,
                notes: row.get(5)?,
                source_id: row.get(6)?,
                theme_id: row.get(7)?,
                duration_seconds: row.get(8)?,
                created_at: row.get(9)?,
                updated_at: row.get(10)?,
                slide_count: row.get(11)?,
            })
        })?;

        if let Some(res) = iter.next() {
            Ok(Some(res?))
        } else {
            Ok(None)
        }
    }

    pub fn get_service_item_with_slides(
        &self,
        item_id: &str,
    ) -> Result<Option<PlaylistItemWithSlides>> {
        let item = self.get_service_item(item_id)?;
        if let Some(it) = item {
            let slides = self.get_service_item_slides(item_id)?;
            Ok(Some(PlaylistItemWithSlides { item: it, slides }))
        } else {
            Ok(None)
        }
    }

    pub fn add_service_item(
        &self,
        item: &PlaylistItem,
        slides: Option<Vec<Slide>>,
    ) -> Result<PlaylistItem> {
        let conn = self.conn.lock().unwrap();
        let id = if item.id.is_empty() {
            format!("item-{}", Uuid::new_v4().simple())
        } else {
            item.id.clone()
        };
        let now = Utc::now().to_rfc3339();

        let sort_order = if item.sort_order < 0 {
            let next_order: i32 = conn
                .query_row(
                    "SELECT COALESCE(MAX(sort_order), -1) + 1 FROM service_items WHERE service_id = ?1;",
                    params![item.service_id],
                    |r| r.get(0),
                )
                .unwrap_or(0);
            next_order
        } else {
            item.sort_order
        };

        conn.execute(
            "INSERT INTO service_items (id, service_id, sort_order, item_type, title, notes, source_id, theme_id, duration_seconds, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?10);",
            params![
                id,
                item.service_id,
                sort_order,
                item.item_type,
                item.title,
                item.notes,
                item.source_id,
                item.theme_id,
                item.duration_seconds,
                now
            ],
        )?;

        // Update service updated_at
        conn.execute(
            "UPDATE services SET updated_at = ?1 WHERE id = ?2;",
            params![now, item.service_id],
        )?;

        let mut slide_count = 0;
        if let Some(slides_vec) = slides {
            slide_count = slides_vec.len() as i32;
            for (idx, s) in slides_vec.into_iter().enumerate() {
                let slide_id = if s.id.is_empty() {
                    format!("slide-{}", Uuid::new_v4().simple())
                } else {
                    s.id
                };
                conn.execute(
                    "INSERT INTO service_item_slides (id, item_id, sort_order, title, body, background_color, foreground_color, font_size, text_alignment, theme_override, background_image, overlay_color, line_spacing, text_shadow, vertical_alignment, font_family, font_weight, created_at, updated_at)
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?18);",
                    params![
                        slide_id,
                        id,
                        idx as i32,
                        s.title,
                        s.body,
                        s.background_color,
                        s.foreground_color,
                        s.font_size,
                        s.text_alignment,
                        s.theme_override,
                        s.background_image,
                        s.overlay_color,
                        s.line_spacing,
                        s.text_shadow,
                        s.vertical_alignment,
                        s.font_family,
                        s.font_weight,
                        now
                    ],
                )?;
            }
        }

        Ok(PlaylistItem {
            id,
            service_id: item.service_id.clone(),
            sort_order,
            item_type: item.item_type.clone(),
            title: item.title.clone(),
            notes: item.notes.clone(),
            source_id: item.source_id.clone(),
            theme_id: item.theme_id.clone(),
            duration_seconds: item.duration_seconds,
            created_at: now.clone(),
            updated_at: now,
            slide_count,
        })
    }

    pub fn update_service_item(&self, item: &PlaylistItem) -> Result<PlaylistItem> {
        let conn = self.conn.lock().unwrap();
        let now = Utc::now().to_rfc3339();

        conn.execute(
            "UPDATE service_items
             SET title = ?1, notes = ?2, source_id = ?3, theme_id = ?4, duration_seconds = ?5, updated_at = ?6
             WHERE id = ?7;",
            params![
                item.title,
                item.notes,
                item.source_id,
                item.theme_id,
                item.duration_seconds,
                now,
                item.id
            ],
        )?;

        // Update service updated_at
        conn.execute(
            "UPDATE services SET updated_at = ?1 WHERE id = ?2;",
            params![now, item.service_id],
        )?;

        let mut res = item.clone();
        res.updated_at = now;
        Ok(res)
    }

    pub fn delete_service_item(&self, item_id: &str) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        let srv_id: Option<String> = conn
            .query_row(
                "SELECT service_id FROM service_items WHERE id = ?1;",
                params![item_id],
                |r| r.get(0),
            )
            .ok();

        conn.execute("DELETE FROM service_items WHERE id = ?1;", params![item_id])?;

        if let Some(sid) = srv_id {
            let now = Utc::now().to_rfc3339();
            conn.execute(
                "UPDATE services SET updated_at = ?1 WHERE id = ?2;",
                params![now, sid],
            )?;
        }
        Ok(())
    }

    pub fn reorder_service_items(&self, service_id: &str, item_ids: &[String]) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        let tx = conn.unchecked_transaction()?;
        let now = Utc::now().to_rfc3339();

        for (idx, id) in item_ids.iter().enumerate() {
            tx.execute(
                "UPDATE service_items SET sort_order = ?1, updated_at = ?2 WHERE id = ?3 AND service_id = ?4;",
                params![idx as i32, now, id, service_id],
            )?;
        }

        tx.execute(
            "UPDATE services SET updated_at = ?1 WHERE id = ?2;",
            params![now, service_id],
        )?;

        tx.commit()?;
        Ok(())
    }

    pub fn duplicate_service_item(&self, item_id: &str) -> Result<PlaylistItem> {
        let orig = self
            .get_service_item(item_id)?
            .ok_or(rusqlite::Error::QueryReturnedNoRows)?;
        let slides = self.get_service_item_slides(item_id)?;

        let new_item = PlaylistItem {
            id: "".to_string(),
            service_id: orig.service_id.clone(),
            sort_order: orig.sort_order + 1,
            item_type: orig.item_type.clone(),
            title: format!("{} (Copy)", orig.title),
            notes: orig.notes.clone(),
            source_id: orig.source_id.clone(),
            theme_id: orig.theme_id.clone(),
            duration_seconds: orig.duration_seconds,
            created_at: "".to_string(),
            updated_at: "".to_string(),
            slide_count: slides.len() as i32,
        };

        // Shift later items order
        {
            let conn = self.conn.lock().unwrap();
            conn.execute(
                "UPDATE service_items SET sort_order = sort_order + 1 WHERE service_id = ?1 AND sort_order > ?2;",
                params![orig.service_id, orig.sort_order],
            )?;
        }

        let new_slides = slides
            .into_iter()
            .map(|s| {
                let mut copy = s;
                copy.id = format!("slide-{}", Uuid::new_v4().simple());
                copy
            })
            .collect();

        self.add_service_item(&new_item, Some(new_slides))
    }

    pub fn get_service_item_slides(&self, item_id: &str) -> Result<Vec<Slide>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, item_id, sort_order, title, body, background_color, foreground_color, font_size, text_alignment, theme_override,
                    background_image, overlay_color, line_spacing, text_shadow, vertical_alignment, font_family, font_weight,
                    created_at, updated_at
             FROM service_item_slides
             WHERE item_id = ?1
             ORDER BY sort_order ASC;",
        )?;

        let iter = stmt.query_map(params![item_id], |row| {
            Ok(Slide {
                id: row.get(0)?,
                presentation_id: row.get(1)?,
                sort_order: row.get(2)?,
                title: row.get(3)?,
                body: row.get(4)?,
                background_color: row.get(5)?,
                foreground_color: row.get(6)?,
                font_size: row.get(7)?,
                text_alignment: row.get(8)?,
                theme_override: row.get(9)?,
                background_image: row.get(10)?,
                overlay_color: row.get(11)?,
                line_spacing: row.get(12)?,
                text_shadow: row.get(13)?,
                vertical_alignment: row.get(14)?,
                font_family: row.get(15)?,
                font_weight: row.get(16)?,
                created_at: row.get(17)?,
                updated_at: row.get(18)?,
            })
        })?;

        let mut list = Vec::new();
        for item in iter {
            list.push(item?);
        }
        Ok(list)
    }

    pub fn save_service_item_slides(&self, item_id: &str, slides: &[Slide]) -> Result<Vec<Slide>> {
        let conn = self.conn.lock().unwrap();
        let tx = conn.unchecked_transaction()?;
        let now = Utc::now().to_rfc3339();

        tx.execute(
            "DELETE FROM service_item_slides WHERE item_id = ?1;",
            params![item_id],
        )?;

        let mut saved = Vec::new();
        for (idx, s) in slides.iter().enumerate() {
            let slide_id = if s.id.is_empty() {
                format!("slide-{}", Uuid::new_v4().simple())
            } else {
                s.id.clone()
            };

            tx.execute(
                "INSERT INTO service_item_slides (id, item_id, sort_order, title, body, background_color, foreground_color, font_size, text_alignment, theme_override, background_image, overlay_color, line_spacing, text_shadow, vertical_alignment, font_family, font_weight, created_at, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?18);",
                params![
                    slide_id,
                    item_id,
                    idx as i32,
                    s.title,
                    s.body,
                    s.background_color,
                    s.foreground_color,
                    s.font_size,
                    s.text_alignment,
                    s.theme_override,
                    s.background_image,
                    s.overlay_color,
                    s.line_spacing,
                    s.text_shadow,
                    s.vertical_alignment,
                    s.font_family,
                    s.font_weight,
                    now
                ],
            )?;

            let mut slide_copy = s.clone();
            slide_copy.id = slide_id;
            slide_copy.presentation_id = item_id.to_string();
            slide_copy.sort_order = idx as i32;
            slide_copy.created_at = now.clone();
            slide_copy.updated_at = now.clone();
            saved.push(slide_copy);
        }

        tx.execute(
            "UPDATE service_items SET updated_at = ?1 WHERE id = ?2;",
            params![now, item_id],
        )?;

        tx.commit()?;
        Ok(saved)
    }

    pub fn add_song_to_service(
        &self,
        service_id: &str,
        song_id: &str,
        theme_id: Option<&str>,
        lines_per_slide: Option<i32>,
        arrangement_id: Option<&str>,
    ) -> Result<PlaylistItem> {
        let song_opt = self.get_song(song_id)?;
        let song = song_opt.ok_or(rusqlite::Error::QueryReturnedNoRows)?;
        let sections = self.ordered_song_sections(song_id, arrangement_id)?;

        let effective_theme_id = theme_id
            .map(|t| t.to_string())
            .or_else(|| song.default_theme_id.clone())
            .unwrap_or_else(|| "theme-builtin-dark".to_string());

        let theme = self.get_theme(&effective_theme_id)?.unwrap_or_else(|| {
            Theme {
                id: "theme-builtin-dark".to_string(),
                name: "High-Contrast Dark".to_string(),
                is_built_in: true,
                background_color: "#0a0f1d".to_string(),
                background_image_id: None,
                background_image_path: None,
                background_mode: "cover".to_string(),
                font_family: "system-ui, sans-serif".to_string(),
                font_size: "large".to_string(),
                font_weight: "bold".to_string(),
                text_color: "#ffffff".to_string(),
                text_alignment: "center".to_string(),
                vertical_alignment: "center".to_string(),
                line_spacing: 1.35,
                text_margin: 6,
                text_shadow: Some("0 2px 8px rgba(0,0,0,0.8)".to_string()),
                overlay_color: None,
                created_at: "".to_string(),
                updated_at: "".to_string(),
            }
        });

        let l_per_slide = lines_per_slide.unwrap_or(4).max(1) as usize;
        let mut slides = Vec::new();

        for sec in &sections {
            let lines: Vec<&str> = sec
                .lyrics
                .lines()
                .map(|l| l.trim())
                .filter(|l| !l.is_empty())
                .collect();

            if lines.is_empty() {
                continue;
            }

            for chunk in lines.chunks(l_per_slide) {
                let body = chunk.join("\n");
                let slide = Slide {
                    id: "".to_string(),
                    presentation_id: "".to_string(),
                    sort_order: slides.len() as i32,
                    title: format!("{} - {}", song.title, sec.label),
                    body,
                    background_color: theme.background_color.clone(),
                    foreground_color: theme.text_color.clone(),
                    font_size: theme.font_size.clone(),
                    text_alignment: theme.text_alignment.clone(),
                    theme_override: Some(effective_theme_id.clone()),
                    background_image: theme.background_image_path.clone(),
                    overlay_color: theme.overlay_color.clone(),
                    line_spacing: Some(theme.line_spacing),
                    text_shadow: theme.text_shadow.clone(),
                    vertical_alignment: Some(theme.vertical_alignment.clone()),
                    font_family: Some(theme.font_family.clone()),
                    font_weight: Some(theme.font_weight.clone()),
                    created_at: "".to_string(),
                    updated_at: "".to_string(),
                };
                slides.push(slide);
            }
        }

        let item = PlaylistItem {
            id: "".to_string(),
            service_id: service_id.to_string(),
            sort_order: -1,
            item_type: "song".to_string(),
            title: song.title.clone(),
            notes: Some(format!(
                "Language: {} | Key: {}",
                song.language,
                song.song_key.unwrap_or_else(|| "N/A".to_string())
            )),
            source_id: Some(song.id.clone()),
            theme_id: Some(effective_theme_id),
            duration_seconds: None,
            created_at: "".to_string(),
            updated_at: "".to_string(),
            slide_count: slides.len() as i32,
        };

        self.add_service_item(&item, Some(slides))
    }
}

pub fn resolve_book_number(input: &str) -> Option<u32> {
    let lower = input.trim().to_lowercase();
    if let Some(n) = resolve_book_alias(&lower) {
        return Some(n);
    }

    // Normalise: "Jn." -> "jn", "1John" -> "1 john", "First John" / "1st John" -> "1 john"
    let cleaned: String = lower.replace('.', " ").split_whitespace().collect::<Vec<_>>().join(" ");
    let mut parts: Vec<String> = cleaned.splitn(2, ' ').map(|p| p.to_string()).collect();
    if parts.len() == 2 {
        let ordinal = match parts[0].as_str() {
            "first" | "1st" | "i" => Some("1"),
            "second" | "2nd" | "ii" => Some("2"),
            "third" | "3rd" | "iii" => Some("3"),
            _ => None,
        };
        if let Some(d) = ordinal {
            parts[0] = d.to_string();
        }
    }
    let mut candidate = parts.join(" ");
    if let Some(first) = candidate.chars().next() {
        if first.is_ascii_digit() && candidate.chars().nth(1).map_or(false, |c| c != ' ') {
            candidate = format!("{} {}", first, candidate[1..].trim_start());
        }
    }
    resolve_book_alias(&candidate)
}

fn resolve_book_alias(lower: &str) -> Option<u32> {
    match lower {
        // Old Testament (1..=39)
        "genesis" | "gen" | "ge" | "gn" | "ஆதியாகமம்" | "ஆதி" => Some(1),
        "exodus" | "exod" | "ex" | "exo" | "யாத்திராகமம்" | "யாத்" => Some(2),
        "leviticus" | "lev" | "le" | "lv" | "லேவியராகமம்" | "லேவி" => Some(3),
        "numbers" | "num" | "nu" | "nm" | "எண்ணாகமம்" | "எண்" => Some(4),
        "deuteronomy" | "deut" | "dt" | "உபாகமம்" | "உபா" => Some(5),
        "joshua" | "josh" | "jos" | "யோசுவா" | "யோசு" => Some(6),
        "judges" | "judg" | "jdg" | "jg" | "நியாயாதிபதிகள்" | "நியா" => Some(7),
        "ruth" | "rth" | "ru" | "ரூத்" => Some(8),
        "1 samuel" | "1 sam" | "1sa" | "1sam" | "1 சாமுவேல்" | "1 சாமு" => Some(9),
        "2 samuel" | "2 sam" | "2sa" | "2sam" | "2 சாமுவேல்" | "2 சாமு" => Some(10),
        "1 kings" | "1 kgs" | "1ki" | "1kgs" | "1 இராஜாக்கள்" | "1 இரா" => Some(11),
        "2 kings" | "2 kgs" | "2ki" | "2kgs" | "2 இராஜாக்கள்" | "2 இரா" => Some(12),
        "1 chronicles" | "1 chron" | "1ch" | "1chr" | "1 நாளாகமம்" | "1 நாளா" => Some(13),
        "2 chronicles" | "2 chron" | "2ch" | "2chr" | "2 நாளாகமம்" | "2 நாளா" => Some(14),
        "ezra" | "ezr" | "எஸ்றா" => Some(15),
        "nehemiah" | "neh" | "ne" | "நெகேமியா" | "நெகே" => Some(16),
        "esther" | "esth" | "es" | "எஸ்தர்" => Some(17),
        "job" | "jb" | "யோபு" => Some(18),
        "psalms" | "psalm" | "ps" | "psa" | "psm" | "சங்கீதம்" | "சங்" => Some(19),
        "proverbs" | "prov" | "pro" | "pr" | "prv" | "நீதிமொழிகள்" | "நீதி" => Some(20),
        "ecclesiastes" | "eccles" | "ecc" | "ec" | "பிரசங்கி" | "பிர" => Some(21),
        "song of solomon" | "song of songs" | "song" | "உன்னதப்பாட்டு" | "உன்" => Some(22),
        "isaiah" | "isa" | "is" | "ஏசாயா" | "ஏசா" => Some(23),
        "jeremiah" | "jer" | "je" | "jr" | "எரேமியா" | "எரே" => Some(24),
        "lamentations" | "lam" | "la" | "புலம்பல்" | "புலம்" => Some(25),
        "ezekiel" | "ezek" | "eze" | "ezk" | "எசேக்கியேல்" | "எசேக்" => Some(26),
        "daniel" | "dan" | "da" | "dn" | "தானியேல்" | "தானி" => Some(27),
        "hosea" | "hos" | "ho" | "ஓசியா" | "ஓசி" => Some(28),
        "joel" | "joe" | "jl" | "யோவேல்" | "யோவே" => Some(29),
        "amos" | "amo" | "am" | "ஆமோஸ்" | "ஆமோ" => Some(30),
        "obadiah" | "obad" | "ob" | "ஒபதியா" | "ஒப" => Some(31),
        "jonah" | "jon" | "jnh" | "யோனா" => Some(32),
        "micah" | "mic" | "mc" | "மீகா" => Some(33),
        "nahum" | "nah" | "na" | "நாகூம்" => Some(34),
        "habakkuk" | "hab" | "hb" | "ஆபகூக்" | "ஆப" => Some(35),
        "zephaniah" | "zeph" | "zep" | "zp" | "செப்பனியா" | "செப்" => Some(36),
        "haggai" | "hag" | "hg" | "ஆகாய்" | "ஆகா" => Some(37),
        "zechariah" | "zech" | "zec" | "zc" | "சகரியா" | "சக" => Some(38),
        "malachi" | "mal" | "ml" | "மல்கியா" | "மல்" => Some(39),

        // New Testament (40..=66)
        "matthew" | "matt" | "mt" | "மத்தேயு" | "மத்" => Some(40),
        "mark" | "mk" | "mrk" | "மாற்கு" | "மாற்" => Some(41),
        "luke" | "lk" | "luk" | "லூக்கா" | "லூக்" => Some(42),
        "john" | "jn" | "jhn" | "st john" | "யோவான்" | "யோவா" => Some(43),
        "acts" | "act" | "ac" | "அப்போஸ்தலர்" | "அப்" => Some(44),
        "romans" | "roman" | "rom" | "ro" | "rm" | "ரோமர்" | "ரோம" => Some(45),
        "1 corinthians" | "1 cor" | "1co" | "1cor" | "1 கொரிந்தியர்" | "1 கொரி" => Some(46),
        "2 corinthians" | "2 cor" | "2co" | "2cor" | "2 கொரிந்தியர்" | "2 கொரி" => Some(47),
        "galatians" | "gal" | "ga" | "கலாத்தியர்" | "கலா" => Some(48),
        "ephesians" | "eph" | "ep" | "எபேசியர்" | "எபே" => Some(49),
        "philippians" | "phil" | "php" | "pp" | "பிலிப்பியர்" | "பிலி" => Some(50),
        "colossians" | "col" | "co" | "கொலோசெயர்" | "கொலோ" => Some(51),
        "1 thessalonians" | "1 thess" | "1th" | "1thess" | "1 தெசலோனிக்கேயர்" | "1 தெச" => Some(52),
        "2 thessalonians" | "2 thess" | "2th" | "2thess" | "2 தெசலோனிக்கேயர்" | "2 தெச" => Some(53),
        "1 timothy" | "1 tim" | "1ti" | "1tim" | "1 தீமோத்தேயு" | "1 தீமோ" => Some(54),
        "2 timothy" | "2 tim" | "2ti" | "2tim" | "2 தீமோத்தேயு" | "2 தீமோ" => Some(55),
        "titus" | "tit" | "ti" | "தீத்து" => Some(56),
        "philemon" | "philem" | "phm" | "pm" | "பிலேமோன்" | "பிலே" => Some(57),
        "hebrews" | "heb" | "he" | "எபிரெயர்" | "எபி" => Some(58),
        "james" | "jas" | "jm" | "யாக்கோபு" | "யாக்" => Some(59),
        "1 peter" | "1 pet" | "1pe" | "1pt" | "1pet" | "1 பேதுரு" | "1 பேது" => Some(60),
        "2 peter" | "2 pet" | "2pe" | "2pt" | "2pet" | "2 பேதுரு" | "2 பேது" => Some(61),
        "1 john" | "1 jn" | "1jn" | "1 jhn" | "1 யோவான்" | "1 யோவா" => Some(62),
        "2 john" | "2 jn" | "2jn" | "2 jhn" | "2 யோவான்" | "2 யோவா" => Some(63),
        "3 john" | "3 jn" | "3jn" | "3 jhn" | "3 யோவான்" | "3 யோவா" => Some(64),
        "jude" | "jud" | "jd" | "யூதா" => Some(65),
        "revelation" | "rev" | "re" | "rv" | "வெளிப்படுத்தின விசேஷம்" | "வெளி" => Some(66),
        _ => None,
    }
}

/// Builds an FTS5 MATCH expression (every word, prefix-matched) from user input.
/// Returns None when the input is not plain ASCII words, so callers can fall back.
fn build_fts_query(input: &str) -> Option<String> {
    if !input.is_ascii() {
        return None;
    }
    let tokens: Vec<String> = input
        .split(|c: char| !c.is_ascii_alphanumeric())
        .filter(|t| !t.is_empty())
        .map(|t| format!("\"{}\"*", t))
        .collect();
    if tokens.is_empty() {
        None
    } else {
        Some(tokens.join(" "))
    }
}

pub fn parse_bible_reference(input: &str) -> Option<BiblePassageQuery> {
    let trimmed = input.trim();
    if trimmed.is_empty() {
        return None;
    }

    let (clean_input, translation) = if let Some(idx) = trimmed.rfind('(') {
        if let Some(end_idx) = trimmed[idx..].find(')') {
            let tr = trimmed[idx + 1..idx + end_idx].trim().to_string();
            (trimmed[..idx].trim(), tr)
        } else {
            (trimmed, "KJV".to_string())
        }
    } else {
        let parts: Vec<&str> = trimmed.split_whitespace().collect();
        if parts.len() > 1 && matches!(parts.last().copied().unwrap_or("").to_uppercase().as_str(), "KJV" | "WEB" | "TAMIL" | "ESV" | "NIV") {
            let tr = parts.last().unwrap().to_string();
            let rest = parts[..parts.len() - 1].join(" ");
            let has_tamil = rest.chars().any(|c| ('\u{0B80}'..='\u{0BFF}').contains(&c));
            let resolved_tr = if tr.eq_ignore_ascii_case("tamil") || (has_tamil && tr.eq_ignore_ascii_case("kjv")) {
                "Tamil".to_string()
            } else {
                tr
            };
            return parse_bible_reference_core(&rest, &resolved_tr);
        }
        (trimmed, if trimmed.chars().any(|c| ('\u{0B80}'..='\u{0BFF}').contains(&c)) { "Tamil".to_string() } else { "KJV".to_string() })
    };

    parse_bible_reference_core(clean_input, &translation)
}

fn parse_bible_reference_core(input: &str, translation: &str) -> Option<BiblePassageQuery> {
    let s = input.trim();
    let chars: Vec<(usize, char)> = s.char_indices().collect();
    let mut split_pos = None;

    for i in (0..chars.len()).rev() {
        if chars[i].1.is_alphabetic() || ('\u{0B80}'..='\u{0BFF}').contains(&chars[i].1) {
            split_pos = Some(chars[i].0 + chars[i].1.len_utf8());
            break;
        }
    }

    let (book_part, chap_verse_part) = match split_pos {
        // a dot right after the book ("Jn. 3:16") is an abbreviation mark, not a separator
        Some(pos) => (s[..pos].trim(), s[pos..].trim_start_matches(|c: char| c == '.' || c.is_whitespace())),
        None => return None,
    };

    if book_part.is_empty() || chap_verse_part.is_empty() {
        return None;
    }

    let chap_verse_cleaned = chap_verse_part.replace('.', ":").replace('–', "-").replace('—', "-");
    let parts: Vec<&str> = chap_verse_cleaned.split(':').collect();

    let (chapter, start_verse, end_verse) = if parts.len() >= 2 {
        let ch: i32 = parts[0].trim().parse().ok()?;
        let verse_str = parts[1].trim();
        if let Some(dash_idx) = verse_str.find('-') {
            let sv: i32 = verse_str[..dash_idx].trim().parse().ok()?;
            let ev: i32 = verse_str[dash_idx + 1..].trim().parse().ok()?;
            (ch, sv, Some(ev))
        } else {
            let sv: i32 = verse_str.parse().ok()?;
            (ch, sv, Some(sv))
        }
    } else {
        let ch: i32 = parts[0].trim().parse().ok()?;
        (ch, 1, None)
    };

    Some(BiblePassageQuery {
        translation: translation.to_string(),
        book: book_part.to_string(),
        chapter,
        start_verse,
        end_verse,
        secondary_translation: None,
    })
}

impl DbManager {
    pub fn import_bible_verses(&self, verses: &[BibleVerse]) -> Result<usize> {
        let count = {
            let conn = self.conn.lock().unwrap();
            let tx = conn.unchecked_transaction()?;
            let mut count = 0;
            for v in verses {
                tx.execute(
                    "INSERT OR REPLACE INTO bible_verses (id, translation, book, book_number, chapter, verse, text)
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7);",
                    params![v.id, v.translation, v.book, v.book_number, v.chapter, v.verse, v.text],
                )?;
                count += 1;
            }
            tx.commit()?;
            count
        };
        self.rebuild_bible_index()?;
        Ok(count)
    }

    /// Rebuilds the FTS5 index from `bible_verses`. Call after bulk changes.
    pub fn rebuild_bible_index(&self) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute("INSERT INTO bible_verses_fts(bible_verses_fts) VALUES('rebuild');", [])?;
        Ok(())
    }

    /// Imports parsed verses, replacing any existing rows for the same
    /// (translation, book) so re-importing a translation never duplicates verses.
    pub fn import_bible_books(&self, verses: &[BibleVerse]) -> Result<usize> {
        {
            let conn = self.conn.lock().unwrap();
            let tx = conn.unchecked_transaction()?;
            let mut seen = std::collections::HashSet::new();
            for v in verses {
                if seen.insert((v.translation.to_lowercase(), v.book_number)) {
                    tx.execute(
                        "DELETE FROM bible_verses WHERE LOWER(translation) = LOWER(?1) AND book_number = ?2;",
                        params![v.translation, v.book_number],
                    )?;
                }
            }
            {
                let mut stmt = tx.prepare(
                    "INSERT OR REPLACE INTO bible_verses (id, translation, book, book_number, chapter, verse, text)
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7);",
                )?;
                for v in verses {
                    stmt.execute(params![v.id, v.translation, v.book, v.book_number, v.chapter, v.verse, v.text])?;
                }
            }
            tx.commit()?;
        }
        self.rebuild_bible_index()?;
        Ok(verses.len())
    }

    pub fn list_bible_translations(&self) -> Result<Vec<BibleTranslationInfo>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT translation, COUNT(*) FROM bible_verses GROUP BY translation ORDER BY translation COLLATE NOCASE;",
        )?;
        let rows = stmt.query_map([], |row| {
            Ok(BibleTranslationInfo {
                translation: row.get(0)?,
                verse_count: row.get(1)?,
            })
        })?;
        rows.collect()
    }

    pub fn search_bible_verses(
        &self,
        query: &str,
        translation: Option<&str>,
        limit: Option<usize>,
    ) -> Result<Vec<BibleVerse>> {
        let conn = self.conn.lock().unwrap();
        let max_results = limit.unwrap_or(50).min(200) as i64;
        let tr_filter = translation.filter(|t| !t.is_empty() && !t.eq_ignore_ascii_case("all"));

        let map_row = |row: &rusqlite::Row| -> rusqlite::Result<BibleVerse> {
            Ok(BibleVerse {
                id: row.get(0)?,
                translation: row.get(1)?,
                book: row.get(2)?,
                book_number: row.get(3)?,
                chapter: row.get(4)?,
                verse: row.get(5)?,
                text: row.get(6)?,
            })
        };

        // FTS5's default tokenizer splits Tamil vowel signs, so only plain
        // ASCII queries use the index; everything else falls back to LIKE.
        if let Some(fts_query) = build_fts_query(query) {
            let sql = format!(
                "SELECT v.id, v.translation, v.book, v.book_number, v.chapter, v.verse, v.text
                 FROM bible_verses_fts f JOIN bible_verses v ON v.rowid = f.rowid
                 WHERE bible_verses_fts MATCH ?1 {}
                 ORDER BY v.book_number ASC, v.chapter ASC, v.verse ASC LIMIT ?2;",
                if tr_filter.is_some() { "AND LOWER(v.translation) = LOWER(?3)" } else { "" }
            );
            let mut stmt = conn.prepare(&sql)?;
            let rows = match tr_filter {
                Some(tr) => stmt.query_map(params![fts_query, max_results, tr], map_row)?,
                None => stmt.query_map(params![fts_query, max_results], map_row)?,
            };
            return rows.collect();
        }

        let like = format!("%{}%", query.trim());
        let sql = format!(
            "SELECT id, translation, book, book_number, chapter, verse, text
             FROM bible_verses WHERE text LIKE ?1 {}
             ORDER BY book_number ASC, chapter ASC, verse ASC LIMIT ?2;",
            if tr_filter.is_some() { "AND LOWER(translation) = LOWER(?3)" } else { "" }
        );
        let mut stmt = conn.prepare(&sql)?;
        let rows = match tr_filter {
            Some(tr) => stmt.query_map(params![like, max_results, tr], map_row)?,
            None => stmt.query_map(params![like, max_results], map_row)?,
        };
        rows.collect()
    }

    pub fn query_bible_passage(&self, query: &BiblePassageQuery) -> Result<BiblePassageResult> {
        let conn = self.conn.lock().unwrap();
        let end_v = query.end_verse.unwrap_or(query.start_verse);

        let book_num = resolve_book_number(&query.book);

        let mut verses = Vec::new();

        if let Some(num) = book_num {
            let mut stmt = conn.prepare(
                "SELECT id, translation, book, book_number, chapter, verse, text
                 FROM bible_verses
                 WHERE LOWER(translation) = LOWER(?1)
                   AND chapter = ?2
                   AND verse >= ?3
                   AND verse <= ?4
                   AND (book_number = ?5 OR LOWER(book) = LOWER(?6))
                 ORDER BY verse ASC;",
            )?;
            let iter = stmt.query_map(
                params![
                    query.translation,
                    query.chapter,
                    query.start_verse,
                    end_v,
                    num,
                    query.book
                ],
                |row| {
                    Ok(BibleVerse {
                        id: row.get(0)?,
                        translation: row.get(1)?,
                        book: row.get(2)?,
                        book_number: row.get(3)?,
                        chapter: row.get(4)?,
                        verse: row.get(5)?,
                        text: row.get(6)?,
                    })
                },
            )?;
            for v in iter {
                verses.push(v?);
            }
        } else {
            let mut stmt = conn.prepare(
                "SELECT id, translation, book, book_number, chapter, verse, text
                 FROM bible_verses
                 WHERE LOWER(translation) = LOWER(?1)
                   AND chapter = ?2
                   AND verse >= ?3
                   AND verse <= ?4
                   AND (LOWER(book) LIKE LOWER(?5) OR LOWER(book) = LOWER(?6))
                 ORDER BY verse ASC;",
            )?;
            let iter = stmt.query_map(
                params![
                    query.translation,
                    query.chapter,
                    query.start_verse,
                    end_v,
                    format!("%{}%", query.book),
                    query.book
                ],
                |row| {
                    Ok(BibleVerse {
                        id: row.get(0)?,
                        translation: row.get(1)?,
                        book: row.get(2)?,
                        book_number: row.get(3)?,
                        chapter: row.get(4)?,
                        verse: row.get(5)?,
                        text: row.get(6)?,
                    })
                },
            )?;
            for v in iter {
                verses.push(v?);
            }
        }

        let ref_str = if query.start_verse == end_v {
            format!(
                "{} {}:{} ({})",
                query.book, query.chapter, query.start_verse, query.translation
            )
        } else {
            format!(
                "{} {}:{}-{} ({})",
                query.book, query.chapter, query.start_verse, end_v, query.translation
            )
        };

        Ok(BiblePassageResult {
            reference: ref_str,
            translation: query.translation.clone(),
            verses,
        })
    }

    pub fn add_bible_passage_to_service(
        &self,
        service_id: &str,
        query: &BiblePassageQuery,
        theme_id: Option<&str>,
        verses_per_slide: Option<i32>,
    ) -> Result<PlaylistItem> {
        let result = self.query_bible_passage(query)?;
        if result.verses.is_empty() {
            return Err(rusqlite::Error::QueryReturnedNoRows);
        }

        let effective_theme_id = theme_id.unwrap_or("theme-builtin-dark");
        let theme = self.get_theme(effective_theme_id)?.unwrap_or_else(|| {
            Theme {
                id: "theme-builtin-dark".to_string(),
                name: "High-Contrast Dark".to_string(),
                is_built_in: true,
                background_color: "#0a0f1d".to_string(),
                background_image_id: None,
                background_image_path: None,
                background_mode: "cover".to_string(),
                font_family: "system-ui, sans-serif".to_string(),
                font_size: "large".to_string(),
                font_weight: "normal".to_string(),
                text_color: "#ffffff".to_string(),
                text_alignment: "center".to_string(),
                vertical_alignment: "center".to_string(),
                line_spacing: 1.4,
                text_margin: 6,
                text_shadow: Some("0 2px 8px rgba(0,0,0,0.8)".to_string()),
                overlay_color: None,
                created_at: "".to_string(),
                updated_at: "".to_string(),
            }
        });

        let chunk_size = verses_per_slide.unwrap_or(1).max(1) as usize;
        let mut slides = Vec::new();

        let sec_result = if let Some(ref sec_tr) = query.secondary_translation {
            let mut sec_q = query.clone();
            sec_q.translation = sec_tr.clone();
            sec_q.secondary_translation = None;
            self.query_bible_passage(&sec_q).ok()
        } else {
            None
        };

        for chunk in result.verses.chunks(chunk_size) {
            let title = if chunk.len() == 1 {
                if let Some(ref sec_tr) = query.secondary_translation {
                    format!(
                        "{} {}:{} ({} / {})",
                        chunk[0].book, chunk[0].chapter, chunk[0].verse, chunk[0].translation, sec_tr
                    )
                } else {
                    format!(
                        "{} {}:{} ({})",
                        chunk[0].book, chunk[0].chapter, chunk[0].verse, chunk[0].translation
                    )
                }
            } else {
                if let Some(ref sec_tr) = query.secondary_translation {
                    format!(
                        "{} {}:{}-{} ({} / {})",
                        chunk[0].book,
                        chunk[0].chapter,
                        chunk[0].verse,
                        chunk[chunk.len() - 1].verse,
                        chunk[0].translation,
                        sec_tr
                    )
                } else {
                    format!(
                        "{} {}:{}-{} ({})",
                        chunk[0].book,
                        chunk[0].chapter,
                        chunk[0].verse,
                        chunk[chunk.len() - 1].verse,
                        chunk[0].translation
                    )
                }
            };

            let mut body = chunk
                .iter()
                .map(|v| {
                    if chunk_size > 1 {
                        format!("{}. {}", v.verse, v.text)
                    } else {
                        v.text.clone()
                    }
                })
                .collect::<Vec<_>>()
                .join("\n\n");

            if let Some(ref sec_res) = sec_result {
                let sec_chunk: Vec<String> = chunk
                    .iter()
                    .filter_map(|v| {
                        sec_res
                            .verses
                            .iter()
                            .find(|sv| sv.chapter == v.chapter && sv.verse == v.verse)
                            .map(|sv| {
                                if chunk_size > 1 {
                                    format!("{}. {}", sv.verse, sv.text)
                                } else {
                                    sv.text.clone()
                                }
                            })
                    })
                    .collect();
                if !sec_chunk.is_empty() {
                    body = format!("{}\n\n{}", body, sec_chunk.join("\n\n"));
                }
            }

            let slide = Slide {
                id: "".to_string(),
                presentation_id: "".to_string(),
                sort_order: slides.len() as i32,
                title,
                body,
                background_color: theme.background_color.clone(),
                foreground_color: theme.text_color.clone(),
                font_size: theme.font_size.clone(),
                text_alignment: theme.text_alignment.clone(),
                theme_override: Some(effective_theme_id.to_string()),
                background_image: theme.background_image_path.clone(),
                overlay_color: theme.overlay_color.clone(),
                line_spacing: Some(theme.line_spacing),
                text_shadow: theme.text_shadow.clone(),
                vertical_alignment: Some(theme.vertical_alignment.clone()),
                font_family: Some(theme.font_family.clone()),
                font_weight: Some(theme.font_weight.clone()),
                created_at: "".to_string(),
                updated_at: "".to_string(),
            };
            slides.push(slide);
        }

        let item = PlaylistItem {
            id: "".to_string(),
            service_id: service_id.to_string(),
            sort_order: -1,
            item_type: "bible".to_string(),
            title: format!("Scripture: {}", result.reference),
            notes: Some(format!("Offline Scripture lookup: {}", result.reference)),
            source_id: Some(result.reference.clone()),
            theme_id: Some(effective_theme_id.to_string()),
            duration_seconds: None,
            created_at: "".to_string(),
            updated_at: "".to_string(),
            slide_count: slides.len() as i32,
        };

        self.add_service_item(&item, Some(slides))
    }

    // ================= Extended Full Backup & Restore =================

    pub fn export_backup(&self) -> Result<BackupData> {
        let presentations = self.list_presentations()?;
        let conn = self.conn.lock().unwrap();

        // Get all slides
        let slides = {
            let mut stmt = conn.prepare(
                "SELECT id, presentation_id, sort_order, title, body, background_color, foreground_color, font_size, text_alignment, theme_override,
                        background_image, overlay_color, line_spacing, text_shadow, vertical_alignment, font_family, font_weight,
                        created_at, updated_at
                 FROM slides
                 ORDER BY presentation_id, sort_order ASC;",
            )?;

            let slide_iter = stmt.query_map([], |row| {
                Ok(Slide {
                    id: row.get(0)?,
                    presentation_id: row.get(1)?,
                    sort_order: row.get(2)?,
                    title: row.get(3)?,
                    body: row.get(4)?,
                    background_color: row.get(5)?,
                    foreground_color: row.get(6)?,
                    font_size: row.get(7)?,
                    text_alignment: row.get(8)?,
                    theme_override: row.get(9)?,
                    background_image: row.get(10)?,
                    overlay_color: row.get(11)?,
                    line_spacing: row.get(12)?,
                    text_shadow: row.get(13)?,
                    vertical_alignment: row.get(14)?,
                    font_family: row.get(15)?,
                    font_weight: row.get(16)?,
                    created_at: row.get(17)?,
                    updated_at: row.get(18)?,
                })
            })?;

            let mut list = Vec::new();
            for s in slide_iter {
                list.push(s?);
            }
            list
        };

        // Drop lock before calling methods that acquire lock
        drop(conn);

        let songs = self.list_songs(None, None, None)?;
        let themes = self.list_themes()?;
        let media_assets = self.list_media_assets()?;

        let mut song_sections = Vec::new();
        let mut song_arrangements = Vec::new();
        for song in &songs {
            let sections = self.get_song_sections(&song.id)?;
            song_sections.extend(sections);
            song_arrangements.extend(self.list_song_arrangements(&song.id)?);
        }

        let services = self.list_services()?;
        let mut service_items = Vec::new();
        let mut service_item_slides = Vec::new();

        for s in &services {
            let items = self.get_service_items(&s.id)?;
            for item in &items {
                let item_slides = self.get_service_item_slides(&item.id)?;
                service_item_slides.extend(item_slides);
            }
            service_items.extend(items);
        }

        let timers = self.list_timers(None)?;
        let stage_configs = self.list_stage_configs()?;
        let output_configs = self.list_outputs()?;
        let overlay_config = self.get_overlay_config()?;
        let overlay_configs = vec![overlay_config];

        let mut remote_devices = self.list_remote_devices()?;
        for dev in &mut remote_devices {
            dev.token_hash = "[SANITIZED]".to_string();
        }

        let midi_mappings = self.list_midi_mappings()?;
        let osc_config = self.get_osc_config()?;
        let osc_configs = vec![osc_config];
        let action_mappings = self.list_action_mappings()?;

        let settings = {
            let conn = self.conn.lock().unwrap();
            let mut settings_stmt = conn.prepare("SELECT key, value FROM settings;")?;
            let setting_iter = settings_stmt.query_map([], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
            })?;

            let mut settings = HashMap::new();
            for item in setting_iter {
                let (k, v) = item?;
                settings.insert(k, v);
            }
            settings
        };

        let workspace_state = self.get_workspace_state().ok().flatten();

        Ok(BackupData {
            version: "6.0.0".to_string(),
            exported_at: Utc::now().to_rfc3339(),
            app: "ChurchPresenter".to_string(),
            presentations,
            slides,
            songs,
            song_sections,
            song_arrangements,
            themes,
            media_assets,
            services,
            service_items,
            service_item_slides,
            timers,
            stage_configs,
            output_configs,
            overlay_configs,
            remote_devices,
            midi_mappings,
            osc_configs,
            action_mappings,
            workspace_state,
            settings,
        })
    }

    pub fn import_backup(&self, backup: &BackupData, mode: &str) -> Result<crate::models::ImportResult> {
        if mode == "overwrite" {
            self.create_pre_restore_backup();
        }

        let conn = self.conn.lock().unwrap();
        let tx = conn.unchecked_transaction()?;

        if mode == "overwrite" {
            tx.execute("DELETE FROM action_mappings;", [])?;
            tx.execute("DELETE FROM midi_mappings;", [])?;
            tx.execute("DELETE FROM remote_devices;", [])?;
            tx.execute("DELETE FROM output_configs WHERE id NOT IN ('output-audience', 'output-stage', 'output-overlay');", [])?;
            tx.execute("DELETE FROM stage_configs WHERE id != 'default-stage';", [])?;
            tx.execute("DELETE FROM timers;", [])?;
            tx.execute("DELETE FROM service_item_slides;", [])?;
            tx.execute("DELETE FROM service_items;", [])?;
            tx.execute("DELETE FROM services;", [])?;
            tx.execute("DELETE FROM slides;", [])?;
            tx.execute("DELETE FROM presentations;", [])?;
            tx.execute("DELETE FROM song_arrangements;", [])?;
            tx.execute("DELETE FROM song_sections;", [])?;
            tx.execute("DELETE FROM songs;", [])?;
            tx.execute("DELETE FROM themes WHERE is_built_in = 0;", [])?;
            tx.execute("DELETE FROM media_assets;", [])?;
        }

        let mut p_count = 0;
        let mut s_count = 0;
        let mut songs_count = 0;
        let mut themes_count = 0;

        for p in &backup.presentations {
            let exists: bool = tx
                .query_row(
                    "SELECT 1 FROM presentations WHERE id = ?1;",
                    params![p.id],
                    |_| Ok(true),
                )
                .unwrap_or(false);

            if !exists {
                tx.execute(
                    "INSERT INTO presentations (id, title, category, theme_name, created_at, updated_at)
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6);",
                    params![p.id, p.title, p.category, p.theme_name, p.created_at, p.updated_at],
                )?;
                p_count += 1;
            }
        }

        for s in &backup.slides {
            let exists: bool = tx
                .query_row("SELECT 1 FROM slides WHERE id = ?1;", params![s.id], |_| {
                    Ok(true)
                })
                .unwrap_or(false);

            if !exists {
                tx.execute(
                    "INSERT INTO slides (id, presentation_id, sort_order, title, body, background_color, foreground_color, font_size, text_alignment, theme_override, background_image, overlay_color, line_spacing, text_shadow, vertical_alignment, font_family, font_weight, created_at, updated_at)
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19);",
                    params![
                        s.id,
                        s.presentation_id,
                        s.sort_order,
                        s.title,
                        s.body,
                        s.background_color,
                        s.foreground_color,
                        s.font_size,
                        s.text_alignment,
                        s.theme_override,
                        s.background_image,
                        s.overlay_color,
                        s.line_spacing,
                        s.text_shadow,
                        s.vertical_alignment,
                        s.font_family,
                        s.font_weight,
                        s.created_at,
                        s.updated_at
                    ],
                )?;
                s_count += 1;
            }
        }

        // Restore themes
        for t in &backup.themes {
            let exists: bool = tx
                .query_row("SELECT 1 FROM themes WHERE id = ?1;", params![t.id], |_| {
                    Ok(true)
                })
                .unwrap_or(false);

            if !exists {
                tx.execute(
                    "INSERT INTO themes (id, name, is_built_in, background_color, background_image_id, background_image_path, background_mode, font_family, font_size, font_weight, text_color, text_alignment, vertical_alignment, line_spacing, text_margin, text_shadow, overlay_color, created_at, updated_at)
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19);",
                    params![
                        t.id,
                        t.name,
                        if t.is_built_in { 1 } else { 0 },
                        t.background_color,
                        t.background_image_id,
                        t.background_image_path,
                        t.background_mode,
                        t.font_family,
                        t.font_size,
                        t.font_weight,
                        t.text_color,
                        t.text_alignment,
                        t.vertical_alignment,
                        t.line_spacing,
                        t.text_margin,
                        t.text_shadow,
                        t.overlay_color,
                        t.created_at,
                        t.updated_at
                    ],
                )?;
                themes_count += 1;
            }
        }

        // Restore songs
        for song in &backup.songs {
            let exists: bool = tx
                .query_row("SELECT 1 FROM songs WHERE id = ?1;", params![song.id], |_| {
                    Ok(true)
                })
                .unwrap_or(false);

            if !exists {
                let tags_json =
                    serde_json::to_string(&song.tags).unwrap_or_else(|_| "[]".to_string());
                tx.execute(
                    "INSERT INTO songs (id, title, alternate_title, language, author, composer, copyright, ccli_number, song_key, tempo, tags, category, default_theme_id, created_at, updated_at)
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15);",
                    params![
                        song.id,
                        song.title,
                        song.alternate_title,
                        song.language,
                        song.author,
                        song.composer,
                        song.copyright,
                        song.ccli_number,
                        song.song_key,
                        song.tempo,
                        tags_json,
                        song.category,
                        song.default_theme_id,
                        song.created_at,
                        song.updated_at
                    ],
                )?;
                songs_count += 1;
            }
        }

        // Restore song sections
        for sec in &backup.song_sections {
            let exists: bool = tx
                .query_row(
                    "SELECT 1 FROM song_sections WHERE id = ?1;",
                    params![sec.id],
                    |_| Ok(true),
                )
                .unwrap_or(false);

            if !exists {
                tx.execute(
                    "INSERT INTO song_sections (id, song_id, section_type, label, lyrics, sort_order, notes, created_at, updated_at, color)
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10);",
                    params![
                        sec.id,
                        sec.song_id,
                        sec.section_type,
                        sec.label,
                        sec.lyrics,
                        sec.sort_order,
                        sec.notes,
                        sec.created_at,
                        sec.updated_at,
                        sec.color
                    ],
                )?;
            }
        }

        // Restore song arrangements
        for a in &backup.song_arrangements {
            tx.execute(
                "INSERT OR IGNORE INTO song_arrangements (id, song_id, name, section_ids, is_default, sort_order, created_at, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, 0, ?6, ?6);",
                params![
                    a.id,
                    a.song_id,
                    a.name,
                    serde_json::to_string(&a.section_ids).unwrap_or_else(|_| "[]".to_string()),
                    a.is_default as i32,
                    Utc::now().to_rfc3339()
                ],
            )?;
        }

        // Restore media assets
        for m in &backup.media_assets {
            let exists: bool = tx
                .query_row(
                    "SELECT 1 FROM media_assets WHERE id = ?1;",
                    params![m.id],
                    |_| Ok(true),
                )
                .unwrap_or(false);

            if !exists {
                tx.execute(
                    "INSERT INTO media_assets (id, filename, original_filename, relative_path, mime_type, file_size, media_type, duration_seconds, width, height, thumbnail_path, created_at)
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12);",
                    params![
                        m.id,
                        m.filename,
                        m.original_filename,
                        m.relative_path,
                        m.mime_type,
                        m.file_size as i64,
                        m.media_type,
                        m.duration_seconds,
                        m.width,
                        m.height,
                        m.thumbnail_path,
                        m.created_at
                    ],
                )?;
            }
        }

        // Restore services
        let mut services_count = 0;
        for s in &backup.services {
            let exists: bool = tx
                .query_row(
                    "SELECT 1 FROM services WHERE id = ?1;",
                    params![s.id],
                    |_| Ok(true),
                )
                .unwrap_or(false);

            if !exists {
                tx.execute(
                    "INSERT INTO services (id, title, description, service_date, category, notes, created_at, updated_at)
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8);",
                    params![
                        s.id,
                        s.title,
                        s.description,
                        s.service_date,
                        s.category,
                        s.notes,
                        s.created_at,
                        s.updated_at
                    ],
                )?;
                services_count += 1;
            }
        }

        // Restore service items
        let mut service_items_count = 0;
        for it in &backup.service_items {
            let exists: bool = tx
                .query_row(
                    "SELECT 1 FROM service_items WHERE id = ?1;",
                    params![it.id],
                    |_| Ok(true),
                )
                .unwrap_or(false);

            if !exists {
                tx.execute(
                    "INSERT INTO service_items (id, service_id, sort_order, item_type, title, notes, source_id, theme_id, duration_seconds, created_at, updated_at)
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11);",
                    params![
                        it.id,
                        it.service_id,
                        it.sort_order,
                        it.item_type,
                        it.title,
                        it.notes,
                        it.source_id,
                        it.theme_id,
                        it.duration_seconds,
                        it.created_at,
                        it.updated_at
                    ],
                )?;
                service_items_count += 1;
            }
        }

        // Restore service item slides
        for sl in &backup.service_item_slides {
            let exists: bool = tx
                .query_row(
                    "SELECT 1 FROM service_item_slides WHERE id = ?1;",
                    params![sl.id],
                    |_| Ok(true),
                )
                .unwrap_or(false);

            if !exists {
                tx.execute(
                    "INSERT INTO service_item_slides (id, item_id, sort_order, title, body, background_color, foreground_color, font_size, text_alignment, theme_override, background_image, overlay_color, line_spacing, text_shadow, vertical_alignment, font_family, font_weight, created_at, updated_at)
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19);",
                    params![
                        sl.id,
                        sl.presentation_id,
                        sl.sort_order,
                        sl.title,
                        sl.body,
                        sl.background_color,
                        sl.foreground_color,
                        sl.font_size,
                        sl.text_alignment,
                        sl.theme_override,
                        sl.background_image,
                        sl.overlay_color,
                        sl.line_spacing,
                        sl.text_shadow,
                        sl.vertical_alignment,
                        sl.font_family,
                        sl.font_weight,
                        sl.created_at,
                        sl.updated_at
                    ],
                )?;
            }
        }

        // Restore timers
        for t in &backup.timers {
            let exists: bool = tx
                .query_row("SELECT 1 FROM timers WHERE id = ?1;", params![t.id], |_| Ok(true))
                .unwrap_or(false);
            if !exists {
                tx.execute(
                    "INSERT INTO timers (id, service_id, name, timer_type, duration_seconds, warning_threshold_seconds, created_at, updated_at)
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8);",
                    params![
                        t.id,
                        t.service_id,
                        t.name,
                        t.timer_type,
                        t.duration_seconds,
                        t.warning_threshold_seconds,
                        t.created_at,
                        t.updated_at
                    ],
                )?;
            }
        }

        // Restore stage configs
        for sc in &backup.stage_configs {
            tx.execute(
                "INSERT INTO stage_configs (id, font_size, show_notes, show_timer, show_next, high_contrast, created_at, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
                 ON CONFLICT(id) DO UPDATE SET
                    font_size = excluded.font_size,
                    show_notes = excluded.show_notes,
                    show_timer = excluded.show_timer,
                    show_next = excluded.show_next,
                    high_contrast = excluded.high_contrast,
                    updated_at = excluded.updated_at;",
                params![
                    sc.id,
                    sc.font_size,
                    if sc.show_notes { 1 } else { 0 },
                    if sc.show_timer { 1 } else { 0 },
                    if sc.show_next { 1 } else { 0 },
                    if sc.high_contrast { 1 } else { 0 },
                    sc.created_at,
                    sc.updated_at
                ],
            )?;
        }

        // Restore output configs
        let mut outputs_count = 0;
        for out in &backup.output_configs {
            tx.execute(
                "INSERT INTO output_configs (id, name, output_type, target_monitor_id, resolution_width, resolution_height, aspect_ratio, safe_margin_percent, content_source, theme_id, is_enabled, is_active, created_at, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)
                 ON CONFLICT(id) DO UPDATE SET
                    name = excluded.name,
                    output_type = excluded.output_type,
                    target_monitor_id = excluded.target_monitor_id,
                    resolution_width = excluded.resolution_width,
                    resolution_height = excluded.resolution_height,
                    aspect_ratio = excluded.aspect_ratio,
                    safe_margin_percent = excluded.safe_margin_percent,
                    content_source = excluded.content_source,
                    theme_id = excluded.theme_id,
                    is_enabled = excluded.is_enabled,
                    updated_at = excluded.updated_at;",
                params![
                    out.id,
                    out.name,
                    out.output_type,
                    out.target_monitor_id,
                    out.resolution_width,
                    out.resolution_height,
                    out.aspect_ratio,
                    out.safe_margin_percent,
                    out.content_source,
                    out.theme_id,
                    if out.is_enabled { 1 } else { 0 },
                    if out.is_active { 1 } else { 0 },
                    out.created_at,
                    out.updated_at
                ],
            )?;
            outputs_count += 1;
        }

        // Restore overlay configs
        for ov in &backup.overlay_configs {
            tx.execute(
                "INSERT INTO overlay_configs (id, layout_mode, font_family, font_size_px, text_color, text_shadow, text_alignment, safe_margin_horizontal_pct, safe_margin_vertical_pct, show_speaker_label, show_reference, is_cleared, auth_token, created_at, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15)
                 ON CONFLICT(id) DO UPDATE SET
                    layout_mode = excluded.layout_mode,
                    font_family = excluded.font_family,
                    font_size_px = excluded.font_size_px,
                    text_color = excluded.text_color,
                    text_shadow = excluded.text_shadow,
                    text_alignment = excluded.text_alignment,
                    safe_margin_horizontal_pct = excluded.safe_margin_horizontal_pct,
                    safe_margin_vertical_pct = excluded.safe_margin_vertical_pct,
                    show_speaker_label = excluded.show_speaker_label,
                    show_reference = excluded.show_reference,
                    is_cleared = excluded.is_cleared,
                    updated_at = excluded.updated_at;",
                params![
                    ov.id,
                    ov.layout_mode,
                    ov.font_family,
                    ov.font_size_px,
                    ov.text_color,
                    ov.text_shadow,
                    ov.text_alignment,
                    ov.safe_margin_horizontal_pct,
                    ov.safe_margin_vertical_pct,
                    if ov.show_speaker_label { 1 } else { 0 },
                    if ov.show_reference { 1 } else { 0 },
                    if ov.is_cleared { 1 } else { 0 },
                    ov.auth_token,
                    ov.created_at,
                    ov.updated_at
                ],
            )?;
        }

        // Restore MIDI mappings
        let mut mappings_count = 0;
        for mm in &backup.midi_mappings {
            tx.execute(
                "INSERT INTO midi_mappings (id, name, channel, message_type, note_or_cc, action_type, is_enabled, created_at, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
                 ON CONFLICT(id) DO UPDATE SET
                    name = excluded.name,
                    channel = excluded.channel,
                    message_type = excluded.message_type,
                    note_or_cc = excluded.note_or_cc,
                    action_type = excluded.action_type,
                    is_enabled = excluded.is_enabled,
                    updated_at = excluded.updated_at;",
                params![
                    mm.id,
                    mm.name,
                    mm.channel as i32,
                    mm.message_type,
                    mm.note_or_cc as i32,
                    mm.action_type,
                    if mm.is_enabled { 1 } else { 0 },
                    mm.created_at,
                    mm.updated_at
                ],
            )?;
            mappings_count += 1;
        }

        // Restore OSC configs
        for osc in &backup.osc_configs {
            tx.execute(
                "INSERT INTO osc_configs (id, is_enabled, listen_port, allowlist_actions, created_at, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6)
                 ON CONFLICT(id) DO UPDATE SET
                    is_enabled = excluded.is_enabled,
                    listen_port = excluded.listen_port,
                    allowlist_actions = excluded.allowlist_actions,
                    updated_at = excluded.updated_at;",
                params![
                    osc.id,
                    if osc.is_enabled { 1 } else { 0 },
                    osc.listen_port as i32,
                    osc.allowlist_actions,
                    osc.created_at,
                    osc.updated_at
                ],
            )?;
        }

        // Restore action mappings
        for act in &backup.action_mappings {
            tx.execute(
                "INSERT INTO action_mappings (id, action_name, display_label, category, keyboard_shortcut, is_enabled, created_at, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
                 ON CONFLICT(id) DO UPDATE SET
                    display_label = excluded.display_label,
                    category = excluded.category,
                    keyboard_shortcut = excluded.keyboard_shortcut,
                    is_enabled = excluded.is_enabled,
                    updated_at = excluded.updated_at;",
                params![
                    act.id,
                    act.action_name,
                    act.display_label,
                    act.category,
                    act.keyboard_shortcut,
                    if act.is_enabled { 1 } else { 0 },
                    act.created_at,
                    act.updated_at
                ],
            )?;
            mappings_count += 1;
        }

        for (k, v) in &backup.settings {
            tx.execute(
                "INSERT INTO settings (key, value) VALUES (?1, ?2)
                 ON CONFLICT(key) DO UPDATE SET value = ?2;",
                params![k, v],
            )?;
        }

        if let Some(ref ws) = backup.workspace_state {
            let now = Utc::now().to_rfc3339();
            tx.execute(
                "INSERT INTO workspace_state (id, selected_service_id, selected_presentation_id, selected_item_id, selected_slide_index, active_tab, last_saved_at)
                 VALUES ('current_workspace', ?1, ?2, ?3, ?4, ?5, ?6)
                 ON CONFLICT(id) DO UPDATE SET
                    selected_service_id = excluded.selected_service_id,
                    selected_presentation_id = excluded.selected_presentation_id,
                    selected_item_id = excluded.selected_item_id,
                    selected_slide_index = excluded.selected_slide_index,
                    active_tab = excluded.active_tab,
                    last_saved_at = excluded.last_saved_at;",
                params![
                    ws.selected_service_id,
                    ws.selected_presentation_id,
                    ws.selected_item_id,
                    ws.selected_slide_index as i32,
                    ws.active_tab,
                    now
                ],
            )?;
        }

        tx.commit()?;
        Ok(crate::models::ImportResult {
            presentations_imported: p_count,
            slides_imported: s_count,
            songs_imported: songs_count,
            themes_imported: themes_count,
            services_imported: services_count,
            service_items_imported: service_items_count,
            outputs_imported: outputs_count,
            mappings_imported: mappings_count,
        })
    }

    // ================= Phase 5: Independent Outputs =================

    pub fn list_outputs(&self) -> Result<Vec<OutputConfig>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, name, output_type, target_monitor_id, resolution_width, resolution_height,
                    aspect_ratio, safe_margin_percent, content_source, theme_id, is_enabled, is_active,
                    created_at, updated_at
             FROM output_configs
             ORDER BY created_at ASC;",
        )?;

        let iter = stmt.query_map([], |row| {
            Ok(OutputConfig {
                id: row.get(0)?,
                name: row.get(1)?,
                output_type: row.get(2)?,
                target_monitor_id: row.get(3)?,
                resolution_width: row.get(4)?,
                resolution_height: row.get(5)?,
                aspect_ratio: row.get(6)?,
                safe_margin_percent: row.get(7)?,
                content_source: row.get(8)?,
                theme_id: row.get(9)?,
                is_enabled: row.get::<_, i32>(10)? != 0,
                is_active: row.get::<_, i32>(11)? != 0,
                error: None,
                created_at: row.get(12)?,
                updated_at: row.get(13)?,
            })
        })?;

        let mut list = Vec::new();
        for item in iter {
            list.push(item?);
        }
        Ok(list)
    }

    pub fn get_output(&self, id: &str) -> Result<Option<OutputConfig>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, name, output_type, target_monitor_id, resolution_width, resolution_height,
                    aspect_ratio, safe_margin_percent, content_source, theme_id, is_enabled, is_active,
                    created_at, updated_at
             FROM output_configs
             WHERE id = ?1;",
        )?;

        let mut iter = stmt.query_map(params![id], |row| {
            Ok(OutputConfig {
                id: row.get(0)?,
                name: row.get(1)?,
                output_type: row.get(2)?,
                target_monitor_id: row.get(3)?,
                resolution_width: row.get(4)?,
                resolution_height: row.get(5)?,
                aspect_ratio: row.get(6)?,
                safe_margin_percent: row.get(7)?,
                content_source: row.get(8)?,
                theme_id: row.get(9)?,
                is_enabled: row.get::<_, i32>(10)? != 0,
                is_active: row.get::<_, i32>(11)? != 0,
                error: None,
                created_at: row.get(12)?,
                updated_at: row.get(13)?,
            })
        })?;

        if let Some(item) = iter.next() {
            Ok(Some(item?))
        } else {
            Ok(None)
        }
    }

    pub fn create_output(&self, output: &OutputConfig) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        let now = Utc::now().to_rfc3339();
        conn.execute(
            "INSERT INTO output_configs (id, name, output_type, target_monitor_id, resolution_width, resolution_height, aspect_ratio, safe_margin_percent, content_source, theme_id, is_enabled, is_active, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?13);",
            params![
                output.id,
                output.name,
                output.output_type,
                output.target_monitor_id,
                output.resolution_width,
                output.resolution_height,
                output.aspect_ratio,
                output.safe_margin_percent,
                output.content_source,
                output.theme_id,
                if output.is_enabled { 1 } else { 0 },
                if output.is_active { 1 } else { 0 },
                now
            ],
        )?;
        Ok(())
    }

    pub fn update_output(&self, output: &OutputConfig) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        let now = Utc::now().to_rfc3339();
        conn.execute(
            "UPDATE output_configs
             SET name = ?2, output_type = ?3, target_monitor_id = ?4, resolution_width = ?5,
                 resolution_height = ?6, aspect_ratio = ?7, safe_margin_percent = ?8,
                 content_source = ?9, theme_id = ?10, is_enabled = ?11, updated_at = ?12
             WHERE id = ?1;",
            params![
                output.id,
                output.name,
                output.output_type,
                output.target_monitor_id,
                output.resolution_width,
                output.resolution_height,
                output.aspect_ratio,
                output.safe_margin_percent,
                output.content_source,
                output.theme_id,
                if output.is_enabled { 1 } else { 0 },
                now
            ],
        )?;
        Ok(())
    }

    pub fn delete_output(&self, id: &str) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute("DELETE FROM output_configs WHERE id = ?1;", params![id])?;
        Ok(())
    }

    #[allow(dead_code)]
    pub fn set_output_active(&self, id: &str, is_active: bool) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        let now = Utc::now().to_rfc3339();
        conn.execute(
            "UPDATE output_configs SET is_active = ?2, updated_at = ?3 WHERE id = ?1;",
            params![id, if is_active { 1 } else { 0 }, now],
        )?;
        Ok(())
    }

    // ================= Phase 5: Livestream Overlay =================

    pub fn get_overlay_config(&self) -> Result<LivestreamOverlayConfig> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, layout_mode, font_family, font_size_px, text_color, text_shadow,
                    text_alignment, safe_margin_horizontal_pct, safe_margin_vertical_pct,
                    show_speaker_label, show_reference, is_cleared, auth_token, created_at, updated_at
             FROM overlay_configs
             WHERE id = 'default-overlay';",
        )?;

        let mut iter = stmt.query_map([], |row| {
            Ok(LivestreamOverlayConfig {
                id: row.get(0)?,
                layout_mode: row.get(1)?,
                font_family: row.get(2)?,
                font_size_px: row.get(3)?,
                text_color: row.get(4)?,
                text_shadow: row.get(5)?,
                text_alignment: row.get(6)?,
                safe_margin_horizontal_pct: row.get(7)?,
                safe_margin_vertical_pct: row.get(8)?,
                show_speaker_label: row.get::<_, i32>(9)? != 0,
                show_reference: row.get::<_, i32>(10)? != 0,
                is_cleared: row.get::<_, i32>(11)? != 0,
                auth_token: row.get(12)?,
                created_at: row.get(13)?,
                updated_at: row.get(14)?,
            })
        })?;

        if let Some(config) = iter.next() {
            Ok(config?)
        } else {
            Ok(LivestreamOverlayConfig::default())
        }
    }

    pub fn update_overlay_config(&self, config: &LivestreamOverlayConfig) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        let now = Utc::now().to_rfc3339();
        conn.execute(
            "UPDATE overlay_configs
             SET layout_mode = ?2, font_family = ?3, font_size_px = ?4, text_color = ?5,
                 text_shadow = ?6, text_alignment = ?7, safe_margin_horizontal_pct = ?8,
                 safe_margin_vertical_pct = ?9, show_speaker_label = ?10, show_reference = ?11,
                 is_cleared = ?12, updated_at = ?13
             WHERE id = ?1;",
            params![
                config.id,
                config.layout_mode,
                config.font_family,
                config.font_size_px,
                config.text_color,
                config.text_shadow,
                config.text_alignment,
                config.safe_margin_horizontal_pct,
                config.safe_margin_vertical_pct,
                if config.show_speaker_label { 1 } else { 0 },
                if config.show_reference { 1 } else { 0 },
                if config.is_cleared { 1 } else { 0 },
                now
            ],
        )?;
        Ok(())
    }

    pub fn regenerate_overlay_token(&self) -> Result<String> {
        let conn = self.conn.lock().unwrap();
        let new_token = Uuid::new_v4().to_string();
        let now = Utc::now().to_rfc3339();
        conn.execute(
            "UPDATE overlay_configs SET auth_token = ?1, updated_at = ?2 WHERE id = 'default-overlay';",
            params![new_token, now],
        )?;
        Ok(new_token)
    }

    pub fn set_overlay_cleared(&self, is_cleared: bool) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        let now = Utc::now().to_rfc3339();
        conn.execute(
            "UPDATE overlay_configs SET is_cleared = ?1, updated_at = ?2 WHERE id = 'default-overlay';",
            params![if is_cleared { 1 } else { 0 }, now],
        )?;
        Ok(())
    }

    // ================= Phase 5: Remote Devices =================

    pub fn list_remote_devices(&self) -> Result<Vec<RemoteDevice>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, device_name, ip_address, token_hash, is_approved,
                    can_navigate, can_blackout, can_take_live, can_control_timer,
                    paired_at, last_seen_at
             FROM remote_devices
             ORDER BY paired_at DESC;",
        )?;

        let iter = stmt.query_map([], |row| {
            Ok(RemoteDevice {
                id: row.get(0)?,
                device_name: row.get(1)?,
                ip_address: row.get(2)?,
                token_hash: row.get(3)?,
                is_approved: row.get::<_, i32>(4)? != 0,
                can_navigate: row.get::<_, i32>(5)? != 0,
                can_blackout: row.get::<_, i32>(6)? != 0,
                can_take_live: row.get::<_, i32>(7)? != 0,
                can_control_timer: row.get::<_, i32>(8)? != 0,
                paired_at: row.get(9)?,
                last_seen_at: row.get(10)?,
            })
        })?;

        let mut list = Vec::new();
        for item in iter {
            list.push(item?);
        }
        Ok(list)
    }

    pub fn get_remote_device_by_token(&self, token_hash: &str) -> Result<Option<RemoteDevice>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, device_name, ip_address, token_hash, is_approved,
                    can_navigate, can_blackout, can_take_live, can_control_timer,
                    paired_at, last_seen_at
             FROM remote_devices
             WHERE token_hash = ?1;",
        )?;

        let mut iter = stmt.query_map(params![token_hash], |row| {
            Ok(RemoteDevice {
                id: row.get(0)?,
                device_name: row.get(1)?,
                ip_address: row.get(2)?,
                token_hash: row.get(3)?,
                is_approved: row.get::<_, i32>(4)? != 0,
                can_navigate: row.get::<_, i32>(5)? != 0,
                can_blackout: row.get::<_, i32>(6)? != 0,
                can_take_live: row.get::<_, i32>(7)? != 0,
                can_control_timer: row.get::<_, i32>(8)? != 0,
                paired_at: row.get(9)?,
                last_seen_at: row.get(10)?,
            })
        })?;

        if let Some(item) = iter.next() {
            Ok(Some(item?))
        } else {
            Ok(None)
        }
    }

    pub fn create_or_update_remote_device(&self, device: &RemoteDevice) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT INTO remote_devices (id, device_name, ip_address, token_hash, is_approved, can_navigate, can_blackout, can_take_live, can_control_timer, paired_at, last_seen_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)
             ON CONFLICT(id) DO UPDATE SET
                device_name = excluded.device_name,
                ip_address = excluded.ip_address,
                token_hash = excluded.token_hash,
                is_approved = excluded.is_approved,
                can_navigate = excluded.can_navigate,
                can_blackout = excluded.can_blackout,
                can_take_live = excluded.can_take_live,
                can_control_timer = excluded.can_control_timer,
                last_seen_at = excluded.last_seen_at;",
            params![
                device.id,
                device.device_name,
                device.ip_address,
                device.token_hash,
                if device.is_approved { 1 } else { 0 },
                if device.can_navigate { 1 } else { 0 },
                if device.can_blackout { 1 } else { 0 },
                if device.can_take_live { 1 } else { 0 },
                if device.can_control_timer { 1 } else { 0 },
                device.paired_at,
                device.last_seen_at
            ],
        )?;
        Ok(())
    }

    pub fn approve_remote_device(&self, id: &str, is_approved: bool) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "UPDATE remote_devices SET is_approved = ?2 WHERE id = ?1;",
            params![id, if is_approved { 1 } else { 0 }],
        )?;
        Ok(())
    }

    pub fn update_remote_device_permissions(
        &self,
        id: &str,
        can_navigate: bool,
        can_blackout: bool,
        can_take_live: bool,
        can_control_timer: bool,
    ) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "UPDATE remote_devices
             SET can_navigate = ?2, can_blackout = ?3, can_take_live = ?4, can_control_timer = ?5
             WHERE id = ?1;",
            params![
                id,
                if can_navigate { 1 } else { 0 },
                if can_blackout { 1 } else { 0 },
                if can_take_live { 1 } else { 0 },
                if can_control_timer { 1 } else { 0 }
            ],
        )?;
        Ok(())
    }

    pub fn touch_remote_device(&self, token_hash: &str) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        let now = Utc::now().to_rfc3339();
        conn.execute(
            "UPDATE remote_devices SET last_seen_at = ?2 WHERE token_hash = ?1;",
            params![token_hash, now],
        )?;
        Ok(())
    }

    pub fn delete_remote_device(&self, id: &str) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute("DELETE FROM remote_devices WHERE id = ?1;", params![id])?;
        Ok(())
    }

    // ================= Phase 5: MIDI Mappings =================

    pub fn list_midi_mappings(&self) -> Result<Vec<MidiMapping>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, name, channel, message_type, note_or_cc, action_type, is_enabled, created_at, updated_at
             FROM midi_mappings
             ORDER BY created_at ASC;",
        )?;

        let iter = stmt.query_map([], |row| {
            Ok(MidiMapping {
                id: row.get(0)?,
                name: row.get(1)?,
                channel: row.get::<_, i32>(2)? as u8,
                message_type: row.get(3)?,
                note_or_cc: row.get::<_, i32>(4)? as u8,
                action_type: row.get(5)?,
                is_enabled: row.get::<_, i32>(6)? != 0,
                created_at: row.get(7)?,
                updated_at: row.get(8)?,
            })
        })?;

        let mut list = Vec::new();
        for item in iter {
            list.push(item?);
        }
        Ok(list)
    }

    pub fn create_midi_mapping(&self, mapping: &MidiMapping) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        let now = Utc::now().to_rfc3339();
        conn.execute(
            "INSERT INTO midi_mappings (id, name, channel, message_type, note_or_cc, action_type, is_enabled, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?8);",
            params![
                mapping.id,
                mapping.name,
                mapping.channel as i32,
                mapping.message_type,
                mapping.note_or_cc as i32,
                mapping.action_type,
                if mapping.is_enabled { 1 } else { 0 },
                now
            ],
        )?;
        Ok(())
    }

    pub fn update_midi_mapping(&self, mapping: &MidiMapping) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        let now = Utc::now().to_rfc3339();
        conn.execute(
            "UPDATE midi_mappings
             SET name = ?2, channel = ?3, message_type = ?4, note_or_cc = ?5, action_type = ?6, is_enabled = ?7, updated_at = ?8
             WHERE id = ?1;",
            params![
                mapping.id,
                mapping.name,
                mapping.channel as i32,
                mapping.message_type,
                mapping.note_or_cc as i32,
                mapping.action_type,
                if mapping.is_enabled { 1 } else { 0 },
                now
            ],
        )?;
        Ok(())
    }

    pub fn delete_midi_mapping(&self, id: &str) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute("DELETE FROM midi_mappings WHERE id = ?1;", params![id])?;
        Ok(())
    }

    // ================= Phase 5: OSC Config =================

    pub fn get_osc_config(&self) -> Result<OscConfig> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, is_enabled, listen_port, allowlist_actions, created_at, updated_at
             FROM osc_configs
             WHERE id = 'default-osc';",
        )?;

        let mut iter = stmt.query_map([], |row| {
            Ok(OscConfig {
                id: row.get(0)?,
                is_enabled: row.get::<_, i32>(1)? != 0,
                listen_port: row.get::<_, i32>(2)? as u16,
                allowlist_actions: row.get(3)?,
                created_at: row.get(4)?,
                updated_at: row.get(5)?,
            })
        })?;

        if let Some(cfg) = iter.next() {
            Ok(cfg?)
        } else {
            let now = Utc::now().to_rfc3339();
            Ok(OscConfig {
                id: "default-osc".to_string(),
                is_enabled: false,
                listen_port: 9000,
                allowlist_actions: "next_slide,prev_slide,next_item,prev_item,toggle_blackout,toggle_live,start_timer,stop_timer,reset_timer,clear_overlay".to_string(),
                created_at: now.clone(),
                updated_at: now,
            })
        }
    }

    pub fn update_osc_config(&self, config: &OscConfig) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        let now = Utc::now().to_rfc3339();
        conn.execute(
            "UPDATE osc_configs
             SET is_enabled = ?2, listen_port = ?3, allowlist_actions = ?4, updated_at = ?5
             WHERE id = ?1;",
            params![
                config.id,
                if config.is_enabled { 1 } else { 0 },
                config.listen_port as i32,
                config.allowlist_actions,
                now
            ],
        )?;
        Ok(())
    }

    // ================= Phase 5: Action Mappings =================

    pub fn list_action_mappings(&self) -> Result<Vec<ActionMapping>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, action_name, display_label, category, keyboard_shortcut, is_enabled, created_at, updated_at
             FROM action_mappings
             ORDER BY category, action_name ASC;",
        )?;

        let iter = stmt.query_map([], |row| {
            Ok(ActionMapping {
                id: row.get(0)?,
                action_name: row.get(1)?,
                display_label: row.get(2)?,
                category: row.get(3)?,
                keyboard_shortcut: row.get(4)?,
                is_enabled: row.get::<_, i32>(5)? != 0,
                created_at: row.get(6)?,
                updated_at: row.get(7)?,
            })
        })?;

        let mut list = Vec::new();
        for item in iter {
            list.push(item?);
        }
        Ok(list)
    }

    pub fn update_action_mapping(&self, mapping: &ActionMapping) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        let now = Utc::now().to_rfc3339();
        conn.execute(
            "UPDATE action_mappings
             SET display_label = ?2, category = ?3, keyboard_shortcut = ?4, is_enabled = ?5, updated_at = ?6
             WHERE id = ?1;",
            params![
                mapping.id,
                mapping.display_label,
                mapping.category,
                mapping.keyboard_shortcut,
                if mapping.is_enabled { 1 } else { 0 },
                now
            ],
        )?;
        Ok(())
    }

    pub fn reset_action_mappings_to_default(&self) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        let now = Utc::now().to_rfc3339();
        conn.execute("DELETE FROM action_mappings;", [])?;
        conn.execute(
            "INSERT INTO action_mappings (id, action_name, display_label, category, keyboard_shortcut, is_enabled, created_at, updated_at)
             VALUES 
             ('act-next-slide', 'next_slide', 'Next Slide', 'presentation', 'Right / Space / PageDown', 1, ?1, ?1),
             ('act-prev-slide', 'prev_slide', 'Previous Slide', 'presentation', 'Left / PageUp', 1, ?1, ?1),
             ('act-next-item', 'next_item', 'Next Playlist Item', 'service', 'Ctrl+Right', 1, ?1, ?1),
             ('act-prev-item', 'prev_item', 'Previous Playlist Item', 'service', 'Ctrl+Left', 1, ?1, ?1),
             ('act-toggle-blackout', 'toggle_blackout', 'Toggle Blackout / Blank', 'display', 'B / F7', 1, ?1, ?1),
             ('act-toggle-live', 'toggle_live', 'Toggle Live Output', 'presentation', 'F5', 1, ?1, ?1),
             ('act-start-timer', 'start_timer', 'Start Timer', 'timer', 'Alt+S', 1, ?1, ?1),
             ('act-stop-timer', 'stop_timer', 'Stop / Pause Timer', 'timer', 'Alt+P', 1, ?1, ?1),
             ('act-reset-timer', 'reset_timer', 'Reset Timer', 'timer', 'Alt+R', 1, ?1, ?1),
             ('act-clear-overlay', 'clear_overlay', 'Clear Livestream Overlay', 'display', 'F8', 1, ?1, ?1);",
            params![now],
        )?;
        Ok(())
    }

    // ================= Phase 6: Workspace Recovery & Diagnostics =================

    pub fn get_workspace_state(&self) -> Result<Option<WorkspaceState>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, selected_service_id, selected_presentation_id, selected_item_id, selected_slide_index, active_tab, last_saved_at
             FROM workspace_state
             WHERE id = 'current_workspace';",
        )?;
        let mut iter = stmt.query_map([], |row| {
            Ok(WorkspaceState {
                id: row.get(0)?,
                selected_service_id: row.get(1)?,
                selected_presentation_id: row.get(2)?,
                selected_item_id: row.get(3)?,
                selected_slide_index: row.get::<_, i32>(4)? as usize,
                active_tab: row.get(5)?,
                last_saved_at: row.get(6)?,
            })
        })?;

        if let Some(res) = iter.next() {
            Ok(Some(res?))
        } else {
            Ok(None)
        }
    }

    pub fn save_workspace_state(&self, state: &WorkspaceState) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        let now = Utc::now().to_rfc3339();
        conn.execute(
            "INSERT INTO workspace_state (id, selected_service_id, selected_presentation_id, selected_item_id, selected_slide_index, active_tab, last_saved_at)
             VALUES ('current_workspace', ?1, ?2, ?3, ?4, ?5, ?6)
             ON CONFLICT(id) DO UPDATE SET
                selected_service_id = excluded.selected_service_id,
                selected_presentation_id = excluded.selected_presentation_id,
                selected_item_id = excluded.selected_item_id,
                selected_slide_index = excluded.selected_slide_index,
                active_tab = excluded.active_tab,
                last_saved_at = excluded.last_saved_at;",
            params![
                state.selected_service_id,
                state.selected_presentation_id,
                state.selected_item_id,
                state.selected_slide_index as i32,
                state.active_tab,
                now
            ],
        )?;
        Ok(())
    }

    pub fn log_diagnostic(&self, level: &str, component: &str, message: &str, details: Option<&str>) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        let id = format!("diag-{}", Uuid::new_v4().simple());
        let now = Utc::now().to_rfc3339();
        conn.execute(
            "INSERT INTO app_diagnostics_log (id, timestamp, level, component, message, details)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6);",
            params![id, now, level, component, message, details],
        )?;
        Ok(())
    }

    pub fn list_diagnostics(&self, filter: &AppDiagnosticFilter) -> Result<Vec<AppDiagnosticEntry>> {
        let conn = self.conn.lock().unwrap();
        let limit = filter.limit.unwrap_or(100).min(500);

        let mut query = String::from(
            "SELECT id, timestamp, level, component, message, details
             FROM app_diagnostics_log
             WHERE 1=1"
        );
        let mut params_vec: Vec<rusqlite::types::Value> = Vec::new();

        if let Some(ref lvl) = filter.level {
            if !lvl.is_empty() && lvl != "ALL" {
                query.push_str(" AND level = ?");
                params_vec.push(rusqlite::types::Value::Text(lvl.clone()));
            }
        }
        if let Some(ref comp) = filter.component {
            if !comp.is_empty() && comp != "ALL" {
                query.push_str(" AND component = ?");
                params_vec.push(rusqlite::types::Value::Text(comp.clone()));
            }
        }

        query.push_str(" ORDER BY timestamp DESC LIMIT ?;");
        params_vec.push(rusqlite::types::Value::Integer(limit as i64));

        let mut stmt = conn.prepare(&query)?;
        let rows = stmt.query_map(rusqlite::params_from_iter(params_vec), |row| {
            Ok(AppDiagnosticEntry {
                id: row.get(0)?,
                timestamp: row.get(1)?,
                level: row.get(2)?,
                component: row.get(3)?,
                message: row.get(4)?,
                details: row.get(5)?,
            })
        })?;

        let mut list = Vec::new();
        for r in rows {
            list.push(r?);
        }
        Ok(list)
    }

    pub fn clear_diagnostics(&self, before_timestamp: Option<&str>) -> Result<usize> {
        let conn = self.conn.lock().unwrap();
        let affected = if let Some(ts) = before_timestamp {
            conn.execute("DELETE FROM app_diagnostics_log WHERE timestamp < ?1;", params![ts])?
        } else {
            conn.execute("DELETE FROM app_diagnostics_log;", [])?
        };
        Ok(affected)
    }

    pub fn get_counts(&self) -> Result<(usize, usize, usize)> {
        let conn = self.conn.lock().unwrap();
        let services_count: usize = conn.query_row("SELECT COUNT(*) FROM services;", [], |r| r.get(0)).unwrap_or(0);
        let songs_count: usize = conn.query_row("SELECT COUNT(*) FROM songs;", [], |r| r.get(0)).unwrap_or(0);
        let media_count: usize = conn.query_row("SELECT COUNT(*) FROM media_assets;", [], |r| r.get(0)).unwrap_or(0);
        Ok((services_count, songs_count, media_count))
    }

    pub fn get_db_path(&self) -> Option<std::path::PathBuf> {
        self.db_path.clone()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_migrations_and_initial_seeds() {
        let db = DbManager::new_in_memory().expect("Failed to create in-memory db");
        let presentations = db.list_presentations().expect("Failed to list presentations");

        assert_eq!(presentations.len(), 3);
        assert!(presentations.iter().any(|p| p.title.contains("Amazing Grace")));
        assert!(presentations.iter().any(|p| p.title.contains("கிருபையும்")));

        let p_tamil = presentations
            .iter()
            .find(|p| p.title.contains("கிருபையும்"))
            .unwrap();
        let slides = db.get_slides(&p_tamil.id).unwrap();
        assert_eq!(slides.len(), 2);
        assert!(slides[0].body.contains("கிருபையும் சமாதானமும்"));

        // Phase 2 check: Songs seeds & Themes
        let songs = db.list_songs(None, None, None).unwrap();
        assert_eq!(songs.len(), 3);

        let themes = db.list_themes().unwrap();
        assert!(themes.len() >= 3);
        assert!(themes.iter().any(|t| t.name == "High-Contrast Dark"));
    }

    #[test]
    fn test_song_crud_and_sections() {
        let db = DbManager::new_in_memory().unwrap();
        let new_song = Song {
            id: "".to_string(),
            title: "Way Maker".to_string(),
            alternate_title: Some("Miracle Worker".to_string()),
            language: "English".to_string(),
            author: Some("Sinach".to_string()),
            composer: None,
            copyright: Some("2016 Sinach".to_string()),
            ccli_number: Some("7115744".to_string()),
            song_key: Some("E".to_string()),
            tempo: Some(68),
            tags: vec!["praise".to_string(), "modern".to_string()],
            category: "Worship".to_string(),
            default_theme_id: Some("theme-builtin-dark".to_string()),
            sections_count: 0,
            created_at: "".to_string(),
            updated_at: "".to_string(),
        };

        let created = db.create_song(&new_song).unwrap();
        assert_eq!(created.title, "Way Maker");

        let sections = vec![
            SongSection {
                color: None,
                id: "".to_string(),
                song_id: created.id.clone(),
                section_type: "verse".to_string(),
                label: "Verse 1".to_string(),
                lyrics: "You are here, moving in our midst".to_string(),
                sort_order: 0,
                notes: Some("Soft drums".to_string()),
                created_at: "".to_string(),
                updated_at: "".to_string(),
            },
            SongSection {
                color: None,
                id: "".to_string(),
                song_id: created.id.clone(),
                section_type: "chorus".to_string(),
                label: "Chorus".to_string(),
                lyrics: "Way maker, miracle worker, promise keeper".to_string(),
                sort_order: 1,
                notes: None,
                created_at: "".to_string(),
                updated_at: "".to_string(),
            },
        ];

        let saved_secs = db.save_song_sections(&created.id, &sections).unwrap();
        assert_eq!(saved_secs.len(), 2);
        assert_eq!(saved_secs[1].label, "Chorus");

        // Search test
        let search_res = db.search_songs("miracle worker", None, None).unwrap();
        assert_eq!(search_res.len(), 1);
        assert_eq!(search_res[0].id, created.id);

        // Duplication test
        let duplicated = db.duplicate_song(&created.id).unwrap();
        assert_eq!(duplicated.song.title, "Way Maker (Copy)");
        assert_eq!(duplicated.sections.len(), 2);
    }

    #[test]
    fn test_slide_generation_from_song() {
        let db = DbManager::new_in_memory().unwrap();
        let options = SlideGenerationOptions {
            arrangement_id: None,
            song_id: "song-amazing-grace".to_string(),
            section_ids: vec!["sec-ag-1".to_string(), "sec-ag-2".to_string()],
            target_presentation_id: None,
            theme_id: Some("theme-builtin-dark".to_string()),
            lines_per_slide: Some(2),
            custom_delimiter: None,
            create_new_presentation: true,
            new_presentation_title: Some("Sunday Amazing Grace Service".to_string()),
        };

        let (pres_id, slides) = db.generate_slides_from_song(&options).unwrap();
        let pres = db.get_presentation(&pres_id).unwrap().unwrap();
        assert_eq!(pres.title, "Sunday Amazing Grace Service");
        assert_eq!(slides.len(), 4); // 2 verses * 2 slides per verse (4 lines / 2 = 2 slides each)
        assert!(slides[0].body.contains("Amazing grace! How sweet the sound"));
    }

    #[test]
    fn test_theme_crud_and_built_in_protection() {
        let db = DbManager::new_in_memory().unwrap();
        let custom = Theme {
            id: "".to_string(),
            name: "Youth Night Neon".to_string(),
            is_built_in: false,
            background_color: "#050515".to_string(),
            background_image_id: None,
            background_image_path: None,
            background_mode: "cover".to_string(),
            font_family: "Roboto, sans-serif".to_string(),
            font_size: "xlarge".to_string(),
            font_weight: "800".to_string(),
            text_color: "#38bdf8".to_string(),
            text_alignment: "center".to_string(),
            vertical_alignment: "center".to_string(),
            line_spacing: 1.4,
            text_margin: 8,
            text_shadow: Some("0 0 12px rgba(56, 189, 248, 0.6)".to_string()),
            overlay_color: None,
            created_at: "".to_string(),
            updated_at: "".to_string(),
        };

        let created = db.create_theme(&custom).unwrap();
        assert_eq!(created.name, "Youth Night Neon");

        // Built-in deletion must fail
        let del_builtin_err = db.delete_theme("theme-builtin-dark");
        assert!(del_builtin_err.is_err());

        // Custom deletion succeeds
        let del_custom = db.delete_theme(&created.id);
        assert!(del_custom.is_ok());
    }

    #[test]
    fn test_song_import_and_export_modes() {
        let db = DbManager::new_in_memory().unwrap();
        let export = db.export_song("song-amazing-grace").unwrap();
        assert_eq!(export.songs.len(), 1);
        assert_eq!(export.songs[0].song.title, "Amazing Grace");
        assert_eq!(export.songs[0].sections.len(), 4);

        // Import with 'copy' duplicate mode
        let copy_opts = SongImportOptions {
            duplicate_mode: "copy".to_string(),
        };
        let res = db.import_songs(&export, &copy_opts).unwrap();
        assert_eq!(res.imported_count, 1);

        let songs = db.list_songs(None, None, None).unwrap();
        assert!(songs.iter().any(|s| s.title == "Amazing Grace (Imported Copy)"));
    }

    #[test]
    fn test_slide_reordering_and_delete() {
        let db = DbManager::new_in_memory().unwrap();
        let pres = db.create_presentation("Songs", "Worship", None).unwrap();
        let s1 = Slide {
            id: "".to_string(),
            presentation_id: pres.id.clone(),
            sort_order: 0,
            title: "1".to_string(),
            body: "Slide 1".to_string(),
            background_color: "#000".to_string(),
            foreground_color: "#fff".to_string(),
            font_size: "large".to_string(),
            text_alignment: "center".to_string(),
            theme_override: None,
            background_image: None,
            overlay_color: None,
            line_spacing: None,
            text_shadow: None,
            vertical_alignment: None,
            font_family: None,
            font_weight: None,
            created_at: "".to_string(),
            updated_at: "".to_string(),
        };
        let s2 = Slide {
            id: "".to_string(),
            presentation_id: pres.id.clone(),
            sort_order: 1,
            title: "2".to_string(),
            body: "Slide 2".to_string(),
            background_color: "#000".to_string(),
            foreground_color: "#fff".to_string(),
            font_size: "large".to_string(),
            text_alignment: "center".to_string(),
            theme_override: None,
            background_image: None,
            overlay_color: None,
            line_spacing: None,
            text_shadow: None,
            vertical_alignment: None,
            font_family: None,
            font_weight: None,
            created_at: "".to_string(),
            updated_at: "".to_string(),
        };
        let s3 = Slide {
            id: "".to_string(),
            presentation_id: pres.id.clone(),
            sort_order: 2,
            title: "3".to_string(),
            body: "Slide 3".to_string(),
            background_color: "#000".to_string(),
            foreground_color: "#fff".to_string(),
            font_size: "large".to_string(),
            text_alignment: "center".to_string(),
            theme_override: None,
            background_image: None,
            overlay_color: None,
            line_spacing: None,
            text_shadow: None,
            vertical_alignment: None,
            font_family: None,
            font_weight: None,
            created_at: "".to_string(),
            updated_at: "".to_string(),
        };

        let saved_s1 = db.create_slide(&s1).unwrap();
        let saved_s2 = db.create_slide(&s2).unwrap();
        let saved_s3 = db.create_slide(&s3).unwrap();

        // Reorder
        db.reorder_slides(
            &pres.id,
            &[saved_s3.id.clone(), saved_s1.id.clone(), saved_s2.id.clone()],
        )
        .unwrap();
        let reordered = db.get_slides(&pres.id).unwrap();
        assert_eq!(reordered[0].id, saved_s3.id);
        assert_eq!(reordered[1].id, saved_s1.id);
        assert_eq!(reordered[2].id, saved_s2.id);

        // Delete
        db.delete_slide(&saved_s1.id).unwrap();
        let remaining = db.get_slides(&pres.id).unwrap();
        assert_eq!(remaining.len(), 2);
        assert_eq!(remaining[0].sort_order, 0);
        assert_eq!(remaining[1].sort_order, 1);
    }

    #[test]
    fn test_backup_and_restore() {
        let db = DbManager::new_in_memory().unwrap();
        let backup = db.export_backup().unwrap();
        assert_eq!(backup.presentations.len(), 3);
        assert_eq!(backup.songs.len(), 3);
        assert!(backup.themes.len() >= 3);
        assert_eq!(backup.services.len(), 1);
        assert_eq!(backup.version, "6.0.0");
        assert!(backup.timers.len() >= 2);
        assert!(backup.stage_configs.len() >= 1);
        assert!(backup.output_configs.len() >= 3);
        assert!(backup.overlay_configs.len() >= 1);
        assert!(backup.midi_mappings.len() >= 3);
        assert!(backup.osc_configs.len() >= 1);
        assert!(backup.action_mappings.len() >= 10);

        // Overwrite restore
        let res = db.import_backup(&backup, "overwrite").unwrap();
        assert_eq!(res.presentations_imported, 3);
        assert!(res.slides_imported >= 7);
        assert_eq!(res.songs_imported, 3);
        assert_eq!(res.services_imported, 1);
        assert!(res.service_items_imported >= 8);
        assert!(res.outputs_imported >= 3);
        assert!(res.mappings_imported >= 13);
    }

    #[test]
    fn test_phase5_advanced_production() {
        let db = DbManager::new_in_memory().unwrap();

        // 1. Output configurations
        let outputs = db.list_outputs().unwrap();
        assert_eq!(outputs.len(), 3);
        let audience_out = outputs.iter().find(|o| o.id == "output-audience").unwrap();
        assert_eq!(audience_out.output_type, "audience");
        assert_eq!(audience_out.content_source, "live_slide");

        // Create new output
        let custom_out = OutputConfig {
            id: "output-aux-foyer".to_string(),
            name: "Foyer Screen".to_string(),
            output_type: "presentation".to_string(),
            target_monitor_id: None,
            resolution_width: Some(1920),
            resolution_height: Some(1080),
            aspect_ratio: "16:9".to_string(),
            safe_margin_percent: 5.0,
            content_source: "live_slide".to_string(),
            theme_id: None,
            is_enabled: true,
            is_active: false,
            error: None,
            created_at: Utc::now().to_rfc3339(),
            updated_at: Utc::now().to_rfc3339(),
        };
        db.create_output(&custom_out).unwrap();
        let fetched = db.get_output("output-aux-foyer").unwrap().unwrap();
        assert_eq!(fetched.name, "Foyer Screen");

        // 2. Livestream overlay
        let overlay = db.get_overlay_config().unwrap();
        assert_eq!(overlay.layout_mode, "lower_third");
        assert!(!overlay.auth_token.is_empty());
        let new_token = db.regenerate_overlay_token().unwrap();
        assert_ne!(new_token, overlay.auth_token);

        // 3. Remote devices
        let dev = RemoteDevice {
            id: "dev-iphone-1".to_string(),
            device_name: "John's iPhone (Safari)".to_string(),
            ip_address: "192.168.1.105".to_string(),
            token_hash: "test-token-hash-123".to_string(),
            is_approved: false,
            can_navigate: true,
            can_blackout: false,
            can_take_live: false,
            can_control_timer: true,
            paired_at: Utc::now().to_rfc3339(),
            last_seen_at: Utc::now().to_rfc3339(),
        };
        db.create_or_update_remote_device(&dev).unwrap();
        let fetched_dev = db.get_remote_device_by_token("test-token-hash-123").unwrap().unwrap();
        assert!(!fetched_dev.is_approved);

        // Approve and verify
        db.approve_remote_device(&fetched_dev.id, true).unwrap();
        let approved_dev = db.get_remote_device_by_token("test-token-hash-123").unwrap().unwrap();
        assert!(approved_dev.is_approved);

        // 4. MIDI mappings
        let midi_maps = db.list_midi_mappings().unwrap();
        assert!(midi_maps.len() >= 3);
        let next_slide_midi = midi_maps.iter().find(|m| m.action_type == "next_slide").unwrap();
        assert_eq!(next_slide_midi.note_or_cc, 60);

        // 5. OSC configuration
        let osc = db.get_osc_config().unwrap();
        assert_eq!(osc.listen_port, 9000);
        assert!(!osc.is_enabled); // disabled by default per constraint

        // 6. Action mappings
        let actions = db.list_action_mappings().unwrap();
        assert!(actions.len() >= 10);
        let blackout_action = actions.iter().find(|a| a.action_name == "toggle_blackout").unwrap();
        assert!(blackout_action.is_enabled);
    }

    #[test]
    fn test_service_crud_and_playlist_operations() {
        let db = DbManager::new_in_memory().unwrap();

        // 1. Check pre-seeded Sunday service
        let services = db.list_services().unwrap();
        assert_eq!(services.len(), 1);
        assert_eq!(services[0].title, "Sunday Morning Worship & Word");
        let initial_items = db.get_service_items(&services[0].id).unwrap();
        assert_eq!(initial_items.len(), 8);

        // 2. Create custom youth service
        let youth_srv = Service {
            id: "".to_string(),
            title: "Friday Youth Encounter".to_string(),
            description: Some("Worship and message for youth".to_string()),
            service_date: Some("2026-10-23".to_string()),
            category: "Youth Meeting".to_string(),
            notes: Some("Band rehearsal at 5 PM".to_string()),
            created_at: "".to_string(),
            updated_at: "".to_string(),
            item_count: 0,
        };
        let created = db.create_service(&youth_srv).unwrap();
        assert_eq!(created.title, "Friday Youth Encounter");

        // 3. Add song snapshot to youth service
        let song_item = db
            .add_song_to_service(&created.id, "song-amazing-grace", None, Some(2), None)
            .unwrap();
        assert_eq!(song_item.title, "Amazing Grace");
        assert_eq!(song_item.item_type, "song");
        let song_slides = db.get_service_item_slides(&song_item.id).unwrap();
        assert_eq!(song_slides.len(), 8); // 4 verses * 2 slides per verse = 8 slides

        // 4. Add bible passage to youth service
        let bible_q = BiblePassageQuery {
            translation: "KJV".to_string(),
            book: "John".to_string(),
            chapter: 3,
            start_verse: 16,
            end_verse: Some(17),
            secondary_translation: None,
        };
        let bible_item = db
            .add_bible_passage_to_service(&created.id, &bible_q, None, Some(1))
            .unwrap();
        assert_eq!(bible_item.item_type, "bible");
        let bible_slides = db.get_service_item_slides(&bible_item.id).unwrap();
        assert_eq!(bible_slides.len(), 2);
        assert!(bible_slides[0].body.contains("For God so loved the world"));

        // 5. Duplicate service
        let duplicated = db
            .duplicate_service(&created.id, Some("Friday Youth Encounter - W2".to_string()))
            .unwrap();
        assert_eq!(duplicated.title, "Friday Youth Encounter - W2");
        let dup_items = db.get_service_items(&duplicated.id).unwrap();
        assert_eq!(dup_items.len(), 2);

        // 6. Delete service
        db.delete_service(&created.id).unwrap();
        let remaining = db.list_services().unwrap();
        assert_eq!(remaining.len(), 2); // Seeded + Duplicated
    }

    #[test]
    fn test_bible_passage_lookup_and_offline_query() {
        let db = DbManager::new_in_memory().unwrap();

        // 1. KJV Lookup with alias "jn"
        let q_kjv = BiblePassageQuery {
            translation: "KJV".to_string(),
            book: "jn".to_string(),
            chapter: 3,
            start_verse: 16,
            end_verse: Some(17),
            secondary_translation: None,
        };
        let res_kjv = db.query_bible_passage(&q_kjv).unwrap();
        assert_eq!(res_kjv.verses.len(), 2);
        assert_eq!(res_kjv.verses[0].verse, 16);
        assert!(res_kjv.verses[0].text.contains("whosoever believeth"));

        // 2. Tamil Lookup for Psalm 23
        let q_tam = BiblePassageQuery {
            translation: "Tamil".to_string(),
            book: "சங்கீதம்".to_string(),
            chapter: 23,
            start_verse: 1,
            end_verse: Some(3),
            secondary_translation: None,
        };
        let res_tam = db.query_bible_passage(&q_tam).unwrap();
        assert_eq!(res_tam.verses.len(), 3);
        assert!(res_tam.verses[0].text.contains("கர்த்தர் என் மேய்ப்பராயிருக்கிறார்"));

        // 3. WEB Lookup for Psalm 100
        let q_web = BiblePassageQuery {
            translation: "KJV".to_string(),
            book: "Psalms".to_string(),
            chapter: 100,
            start_verse: 1,
            end_verse: Some(5),
            secondary_translation: None,
        };
        let res_web = db.query_bible_passage(&q_web).unwrap();
        assert_eq!(res_web.verses.len(), 5);

        // 4. Test parse_bible_reference
        let parsed1 = parse_bible_reference("John 3:16-18").unwrap();
        assert_eq!(parsed1.book, "John");
        assert_eq!(parsed1.chapter, 3);
        assert_eq!(parsed1.start_verse, 16);
        assert_eq!(parsed1.end_verse, Some(18));

        let parsed2 = parse_bible_reference("Psalm 23").unwrap();
        assert_eq!(parsed2.book, "Psalm");
        assert_eq!(parsed2.chapter, 23);
        assert_eq!(parsed2.start_verse, 1);
        assert_eq!(parsed2.end_verse, None);

        let parsed3 = parse_bible_reference("மத்தேயு 6:9-13").unwrap();
        assert_eq!(parsed3.book, "மத்தேயு");
        assert_eq!(parsed3.chapter, 6);
        assert_eq!(parsed3.start_verse, 9);
        assert_eq!(parsed3.end_verse, Some(13));
        assert_eq!(parsed3.translation, "Tamil");

        // 5. Test resolve_book_number across 66 books
        assert_eq!(resolve_book_number("Genesis"), Some(1));
        assert_eq!(resolve_book_number("gen"), Some(1));
        assert_eq!(resolve_book_number("ஆதியாகமம்"), Some(1));
        assert_eq!(resolve_book_number("Rev"), Some(66));
        assert_eq!(resolve_book_number("வெளிப்படுத்தின விசேஷம்"), Some(66));

        // 6. Test import_bible_verses
        let custom_verse = BibleVerse {
            id: "bv-custom-gen-1-1".to_string(),
            translation: "WEB".to_string(),
            book: "Genesis".to_string(),
            book_number: 1,
            chapter: 1,
            verse: 1,
            text: "In the beginning, God created the heavens and the earth.".to_string(),
        };
        let imported = db.import_bible_verses(&[custom_verse]).unwrap();
        assert_eq!(imported, 1);
        let q_custom = BiblePassageQuery {
            translation: "WEB".to_string(),
            book: "Genesis".to_string(),
            chapter: 1,
            start_verse: 1,
            end_verse: Some(1),
            secondary_translation: None,
        };
        let res_custom = db.query_bible_passage(&q_custom).unwrap();
        assert_eq!(res_custom.verses.len(), 1);
        assert!(res_custom.verses[0].text.contains("In the beginning"));
    }

    #[test]
    fn test_song_snapshot_isolation_from_library() {
        let db = DbManager::new_in_memory().unwrap();

        // Add song to Sunday service
        let services = db.list_services().unwrap();
        let srv = &services[0];
        let item = db
            .add_song_to_service(&srv.id, "song-amazing-grace", None, Some(4), None)
            .unwrap();
        let snapshot_slides = db.get_service_item_slides(&item.id).unwrap();
        assert_eq!(snapshot_slides.len(), 4);
        assert!(snapshot_slides[0].body.contains("Amazing grace! How sweet the sound"));

        // Now modify the song in the worship library
        let mut song = db.get_song("song-amazing-grace").unwrap().unwrap();
        song.title = "Amazing Grace (Updated Title)".to_string();
        db.update_song(&song).unwrap();

        // Also modify sections in the library (remove first section)
        let mut sections = db.get_song_sections("song-amazing-grace").unwrap();
        sections.remove(0);
        db.save_song_sections("song-amazing-grace", &sections).unwrap();

        // Verify the service item snapshot slides are COMPLETELY INTACT and unaffected!
        let verify_slides = db.get_service_item_slides(&item.id).unwrap();
        assert_eq!(verify_slides.len(), 4);
        assert!(verify_slides[0].body.contains("Amazing grace! How sweet the sound"));
    }

    #[test]
    fn test_phase4_media_timers_and_stage() {
        let db = DbManager::new_in_memory().unwrap();

        // 1. Verify default pre-seeded timers
        let timers = db.list_timers(None).unwrap();
        assert!(timers.len() >= 2);
        assert!(timers.iter().any(|t| t.name == "Pre-Service Countdown"));

        // 2. Create custom timer
        let new_timer = Timer {
            id: "".to_string(),
            service_id: None,
            name: "Sermon Timer".to_string(),
            timer_type: "elapsed".to_string(),
            duration_seconds: 1800,
            warning_threshold_seconds: 300,
            created_at: "".to_string(),
            updated_at: "".to_string(),
        };
        let created = db.create_timer(&new_timer).unwrap();
        assert!(!created.id.is_empty());
        assert_eq!(created.name, "Sermon Timer");

        // 3. Update timer
        let mut to_update = created.clone();
        to_update.name = "Sermon Timer (Extended)".to_string();
        to_update.duration_seconds = 2400;
        let updated = db.update_timer(&to_update).unwrap();
        assert_eq!(updated.name, "Sermon Timer (Extended)");
        assert_eq!(updated.duration_seconds, 2400);

        // 4. Delete timer
        db.delete_timer(&created.id).unwrap();
        let fetched = db.get_timer(&created.id).unwrap();
        assert!(fetched.is_none());

        // 5. Stage config
        let stage_cfg = db.get_stage_config("default-stage").unwrap();
        assert_eq!(stage_cfg.id, "default-stage");
        assert!(stage_cfg.show_notes);
        assert!(stage_cfg.show_timer);

        // Update stage config
        let mut modified_cfg = stage_cfg.clone();
        modified_cfg.font_size = "large".to_string();
        modified_cfg.high_contrast = true;
        let saved_cfg = db.update_stage_config(&modified_cfg).unwrap();
        assert_eq!(saved_cfg.font_size, "large");
        assert!(saved_cfg.high_contrast);

        // 6. Media asset creation and usage check
        let media = MediaAsset {
            id: "test-bg-1".to_string(),
            filename: "test-bg-1.mp4".to_string(),
            original_filename: "motion_bg.mp4".to_string(),
            relative_path: "media/test-bg-1.mp4".to_string(),
            mime_type: "video/mp4".to_string(),
            file_size: 1048576,
            created_at: Utc::now().to_rfc3339(),
            media_type: "video".to_string(),
            duration_seconds: Some(30.0),
            width: Some(1920),
            height: Some(1080),
            thumbnail_path: None,
        };
        db.create_media_asset(&media).unwrap();

        // Initially usage is 0
        let usage = db.check_media_asset_usage("test-bg-1").unwrap();
        assert_eq!(usage, 0);

        // Fetch media asset
        let fetched_media = db.get_media_asset("test-bg-1").unwrap();
        assert!(fetched_media.is_some());
        let fm = fetched_media.unwrap();
        assert_eq!(fm.media_type, "video");
        assert_eq!(fm.duration_seconds, Some(30.0));
    }

    #[test]
    fn test_phase6_database_safety_and_workspace_state() {
        let db = DbManager::new_in_memory().unwrap();

        // 1. Verify integrity check
        let integrity = db.verify_integrity().unwrap();
        assert_eq!(integrity, vec!["ok".to_string()]);

        // 2. Default workspace state from migration 6
        let initial_ws = db.get_workspace_state().unwrap().unwrap();
        assert_eq!(initial_ws.id, "current_workspace");
        assert_eq!(initial_ws.selected_service_id.as_deref(), Some("service-sunday-morning"));
        assert_eq!(initial_ws.active_tab, "services");

        // 3. Save modified workspace state
        let updated_ws = WorkspaceState {
            id: "current_workspace".to_string(),
            selected_service_id: Some("srv-custom-youth".to_string()),
            selected_presentation_id: Some("seed-pres-amazing-grace".to_string()),
            selected_item_id: Some("item-custom-01".to_string()),
            selected_slide_index: 2,
            active_tab: "stage".to_string(),
            last_saved_at: "".to_string(),
        };
        db.save_workspace_state(&updated_ws).unwrap();

        let loaded_ws = db.get_workspace_state().unwrap().unwrap();
        assert_eq!(loaded_ws.selected_service_id.as_deref(), Some("srv-custom-youth"));
        assert_eq!(loaded_ws.selected_slide_index, 2);
        assert_eq!(loaded_ws.active_tab, "stage");

        // 4. Diagnostic logging
        db.log_diagnostic("WARN", "MediaEngine", "Decoded video frame dropped", Some(r#"{"dropped": 1}"#)).unwrap();
        db.log_diagnostic("ERROR", "DisplayManager", "Projector monitor disconnected", None).unwrap();

        let all_diag = db.list_diagnostics(&AppDiagnosticFilter {
            level: None,
            component: None,
            limit: Some(10),
        }).unwrap();
        assert!(all_diag.len() >= 3); // 1 from migration 6 + 2 above

        let err_diag = db.list_diagnostics(&AppDiagnosticFilter {
            level: Some("ERROR".to_string()),
            component: None,
            limit: None,
        }).unwrap();
        assert_eq!(err_diag.len(), 1);
        assert_eq!(err_diag[0].component, "DisplayManager");

        // 5. App counts
        let (services, songs, media) = db.get_counts().unwrap();
        assert_eq!(services, 1);
        assert_eq!(songs, 3);
        assert_eq!(media, 0);

        // 6. Clear diagnostics
        let cleared = db.clear_diagnostics(None).unwrap();
        assert!(cleared >= 3);
        let empty_diag = db.list_diagnostics(&AppDiagnosticFilter {
            level: None,
            component: None,
            limit: None,
        }).unwrap();
        assert_eq!(empty_diag.len(), 0);
    }

    fn test_verse(tr: &str, book: &str, num: i32, ch: i32, v: i32, text: &str) -> BibleVerse {
        BibleVerse {
            id: format!("{}-{}-{}-{}", tr, num, ch, v),
            translation: tr.to_string(),
            book: book.to_string(),
            book_number: num,
            chapter: ch,
            verse: v,
            text: text.to_string(),
        }
    }

    #[test]
    fn test_bible_fts_search_matches_words_prefixes_and_translation_filter() {
        let db = DbManager::new_in_memory().unwrap();
        let all = db.search_bible_verses("loved", None, None).unwrap();
        assert!(all.iter().any(|v| v.book == "John" && v.chapter == 3 && v.verse == 16));

        // prefix + multiple words are ANDed
        let multi = db.search_bible_verses("god lov", Some("KJV"), None).unwrap();
        assert!(multi.iter().all(|v| v.translation == "KJV"));
        assert!(multi.iter().any(|v| v.verse == 16));

        // FTS operators typed by the user are treated as plain words, not syntax
        assert!(db.search_bible_verses("\"loved\" OR NEAR(", None, None).is_ok());
        assert!(db.search_bible_verses("*", None, None).is_ok());

        assert!(db.search_bible_verses("zzzzqqq", None, None).unwrap().is_empty());
    }

    #[test]
    fn test_bible_search_falls_back_to_like_for_tamil() {
        let db = DbManager::new_in_memory().unwrap();
        let tamil_verse = db
            .search_bible_verses("", Some("Tamil"), Some(1))
            .unwrap();
        // empty query falls back to LIKE '%%' and still returns rows
        assert_eq!(tamil_verse.len(), 1);
        let word: String = tamil_verse[0].text.split_whitespace().next().unwrap().to_string();
        let found = db.search_bible_verses(&word, Some("Tamil"), None).unwrap();
        assert!(found.iter().any(|v| v.id == tamil_verse[0].id));
    }

    #[test]
    fn test_import_bible_books_replaces_instead_of_duplicating_and_updates_search() {
        let db = DbManager::new_in_memory().unwrap();
        let first = vec![
            test_verse("ESV", "Ruth", 8, 1, 1, "In the days when the judges ruled"),
            test_verse("ESV", "Ruth", 8, 1, 2, "The name of the man was Elimelech"),
        ];
        assert_eq!(db.import_bible_books(&first).unwrap(), 2);

        // Re-import with a corrected id scheme and fewer verses
        let second = vec![test_verse("ESV", "Ruth", 8, 1, 1, "Corrected opening words")];
        db.import_bible_books(&second).unwrap();

        let q = BiblePassageQuery {
            translation: "ESV".into(),
            book: "Ruth".into(),
            chapter: 1,
            start_verse: 1,
            end_verse: Some(5),
            secondary_translation: None,
        };
        let res = db.query_bible_passage(&q).unwrap();
        assert_eq!(res.verses.len(), 1);
        assert_eq!(res.verses[0].text, "Corrected opening words");

        // stale text is gone from the index, new text is searchable
        assert!(db.search_bible_verses("judges ruled", Some("ESV"), None).unwrap().is_empty());
        assert_eq!(db.search_bible_verses("corrected", Some("ESV"), None).unwrap().len(), 1);

        // other translations of the same book are untouched
        let kjv = BiblePassageQuery { translation: "KJV".into(), ..q.clone() };
        let _ = db.query_bible_passage(&kjv).unwrap();
    }

    #[test]
    fn test_list_bible_translations_includes_imported() {
        let db = DbManager::new_in_memory().unwrap();
        db.import_bible_books(&[test_verse("ESV", "John", 43, 3, 16, "For God so loved")]).unwrap();
        let list = db.list_bible_translations().unwrap();
        let names: Vec<&str> = list.iter().map(|t| t.translation.as_str()).collect();
        assert!(names.contains(&"KJV") && names.contains(&"WEB") && names.contains(&"Tamil"));
        let esv = list.iter().find(|t| t.translation == "ESV").unwrap();
        assert_eq!(esv.verse_count, 1);
    }

    #[test]
    fn test_full_bible_import_and_search_performance() {
        let db = DbManager::new_in_memory().unwrap();
        // 31,102 verses is the size of a full Protestant Bible
        let mut verses = Vec::with_capacity(31_102);
        'outer: for book in 1..=66 {
            for ch in 1..=50 {
                for v in 1..=10 {
                    verses.push(test_verse("BIG", "Genesis", book, ch, v, &format!("verse {} {} {} grace and truth", book, ch, v)));
                    if verses.len() == 31_102 {
                        break 'outer;
                    }
                }
            }
        }
        let t = std::time::Instant::now();
        db.import_bible_books(&verses).unwrap();
        assert!(t.elapsed().as_secs() < 30, "import took {:?}", t.elapsed());

        let t = std::time::Instant::now();
        let hits = db.search_bible_verses("grace truth", Some("BIG"), Some(50)).unwrap();
        assert_eq!(hits.len(), 50);
        assert!(t.elapsed().as_millis() < 500, "search took {:?}", t.elapsed());
    }

    #[test]
    fn test_reference_parser_abbreviations_and_forms() {
        let cases: Vec<(&str, &str, i32, i32, Option<i32>)> = vec![
            ("ps 23", "ps", 23, 1, None),
            ("Jn 3:16-18", "Jn", 3, 16, Some(18)),
            ("1 John 3:16", "1 John", 3, 16, Some(16)),
            ("1John 4:8", "1John", 4, 8, Some(8)),
            ("  Romans   8:28  ", "Romans", 8, 28, Some(28)),
            ("Psalms 23:1–3", "Psalms", 23, 1, Some(3)),
            ("john 3.16", "john", 3, 16, Some(16)),
            ("Jn. 3:16", "Jn", 3, 16, Some(16)),
            ("First John 1:9", "First John", 1, 9, Some(9)),
            ("2nd Timothy 3:16", "2nd Timothy", 3, 16, Some(16)),
        ];
        for (input, book, ch, sv, ev) in cases {
            let q = parse_bible_reference(input).unwrap_or_else(|| panic!("{input:?} should parse"));
            assert_eq!(q.book, book, "{input:?}");
            assert_eq!((q.chapter, q.start_verse, q.end_verse), (ch, sv, ev), "{input:?}");
            assert!(resolve_book_number(&q.book).is_some(), "{input:?} book must resolve");
        }
    }

    #[test]
    fn test_reference_parser_rejects_garbage() {
        for input in ["", "   ", "John", "3:16", "John x:y", "John 3:"] {
            assert!(parse_bible_reference(input).is_none(), "{input:?} should not parse");
        }
    }

    fn arrangement(name: &str, ids: &[&str], default: bool) -> SongArrangement {
        SongArrangement {
            id: String::new(),
            song_id: String::new(),
            name: name.to_string(),
            section_ids: ids.iter().map(|s| s.to_string()).collect(),
            is_default: default,
        }
    }

    #[test]
    fn test_section_color_round_trips_and_survives_duplicate() {
        let db = DbManager::new_in_memory().unwrap();
        let mut sections = db.get_song_sections("song-amazing-grace").unwrap();
        assert!(sections.len() >= 2);
        assert_eq!(sections[0].color, None);
        sections[0].color = Some("#ff8800".to_string());
        db.save_song_sections("song-amazing-grace", &sections).unwrap();

        let reloaded = db.get_song_sections("song-amazing-grace").unwrap();
        assert_eq!(reloaded[0].color.as_deref(), Some("#ff8800"));
        assert_eq!(reloaded[1].color, None);

        let dup = db.duplicate_song("song-amazing-grace").unwrap();
        assert_eq!(dup.sections[0].color.as_deref(), Some("#ff8800"));
        let dup_db = db.get_song_sections(&dup.song.id).unwrap();
        assert_eq!(dup_db[0].color.as_deref(), Some("#ff8800"));
    }

    #[test]
    fn test_arrangements_save_validates_and_keeps_one_default() {
        let db = DbManager::new_in_memory().unwrap();
        let secs = db.get_song_sections("song-amazing-grace").unwrap();
        let (a, b) = (secs[0].id.as_str(), secs[1].id.as_str());

        let saved = db
            .save_song_arrangements(
                "song-amazing-grace",
                &[
                    arrangement("  Full  ", &[a, b, "ghost-section", a], true),
                    arrangement("", &[b], true), // second default must be demoted
                ],
            )
            .unwrap();

        assert_eq!(saved[0].name, "Full");
        assert_eq!(saved[0].section_ids, vec![a, b, a]); // unknown id dropped, repeat kept
        assert!(saved[0].is_default && !saved[1].is_default);
        assert_eq!(saved[1].name, "Arrangement 2");

        let listed = db.list_song_arrangements("song-amazing-grace").unwrap();
        assert_eq!(listed.len(), 2);
        assert_eq!(listed[0].id, saved[0].id);

        // saving an empty list clears them
        db.save_song_arrangements("song-amazing-grace", &[]).unwrap();
        assert!(db.list_song_arrangements("song-amazing-grace").unwrap().is_empty());
    }

    #[test]
    fn test_ordered_sections_use_requested_then_default_then_all() {
        let db = DbManager::new_in_memory().unwrap();
        let secs = db.get_song_sections("song-amazing-grace").unwrap();
        let (a, b) = (secs[0].id.clone(), secs[1].id.clone());

        // no arrangements: every section in editor order
        let all = db.ordered_song_sections("song-amazing-grace", None).unwrap();
        assert_eq!(all.len(), secs.len());

        let saved = db
            .save_song_arrangements(
                "song-amazing-grace",
                &[arrangement("Default", &[b.as_str(), a.as_str(), b.as_str()], true), arrangement("Short", &[a.as_str()], false)],
            )
            .unwrap();

        let def: Vec<String> = db.ordered_song_sections("song-amazing-grace", None).unwrap().into_iter().map(|s| s.id).collect();
        assert_eq!(def, vec![b.clone(), a.clone(), b.clone()]);

        let short: Vec<String> = db.ordered_song_sections("song-amazing-grace", Some(&saved[1].id)).unwrap().into_iter().map(|s| s.id).collect();
        assert_eq!(short, vec![a.clone()]);

        // unknown arrangement id falls back to all sections, never to nothing
        assert_eq!(db.ordered_song_sections("song-amazing-grace", Some("nope")).unwrap().len(), secs.len());
    }

    #[test]
    fn test_add_song_to_service_follows_default_arrangement_with_repeats() {
        let db = DbManager::new_in_memory().unwrap();
        let svc = db.create_service(&Service {
            id: String::new(),
            title: "Arr test".into(),
            service_date: Some("2026-11-01".into()),
            description: None,
            category: "Sunday".into(),
            notes: None,
            created_at: String::new(),
            updated_at: String::new(),
            item_count: 0,
        }).unwrap();
        let secs = db.get_song_sections("song-amazing-grace").unwrap();
        let first = secs[0].id.clone();

        // first section played three times
        db.save_song_arrangements("song-amazing-grace", &[arrangement("Thrice", &[first.as_str(), first.as_str(), first.as_str()], true)]).unwrap();
        let with = db.add_song_to_service(&svc.id, "song-amazing-grace", None, Some(50), None).unwrap();
        let slides = db.get_service_item_slides(&with.id).unwrap();
        assert_eq!(slides.len(), 3);
        assert_eq!(slides[0].body, slides[1].body);
    }
}

