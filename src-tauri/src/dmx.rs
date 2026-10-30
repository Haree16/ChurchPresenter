//! DMX lighting and hardware control service.
//! Supports standard Art-Net (DMX512 over UDP on port 6454) for controlling stage fixtures,
//! dimmers, moving heads, and lighting consoles (GrandMA, QLC+, Obsidian, etc.).
//! Also provides pre-packaged Stream Deck profiles and OSC presets.
//!
//! Off by default per requirement.

use crate::db::DbManager;
pub use crate::models::DmxConfig;
use serde::{Deserialize, Serialize};
use std::net::UdpSocket;
use std::sync::{Arc, Mutex};

pub const ARTNET_PORT: u16 = 6454;
pub const DMX_CHANNELS: usize = 512;

/// Builds a standard 530-byte Art-Net (ArtDmx) UDP datagram.
///
/// Format:
/// - 0..8: "Art-Net\0"
/// - 8..10: OpCode 0x5000 (ArtDmx, little endian: [0x00, 0x50])
/// - 10..12: Protocol Version 14 (big endian: [0x00, 0x0e])
/// - 12: Sequence number (0-255)
/// - 13: Physical input port (0)
/// - 14..16: Sub-Net / Universe (15 bits, little endian)
/// - 16..18: Length of DMX data (512, big endian: [0x02, 0x00])
/// - 18..530: 512 DMX channel values (0-255)
pub fn build_artnet_packet(universe: u16, sequence: u8, channels: &[u8; DMX_CHANNELS]) -> [u8; 530] {
    let mut packet = [0u8; 530];
    packet[0..8].copy_from_slice(b"Art-Net\0");
    packet[8] = 0x00;
    packet[9] = 0x50;
    packet[10] = 0x00;
    packet[11] = 0x0e;
    packet[12] = sequence;
    packet[13] = 0x00;
    packet[14] = (universe & 0xff) as u8;
    packet[15] = ((universe >> 8) & 0x7f) as u8;
    packet[16] = 0x02;
    packet[17] = 0x00;
    packet[18..530].copy_from_slice(channels);
    packet
}

pub fn send_artnet_dmx(
    target_ip: &str,
    target_port: u16,
    universe: u16,
    sequence: u8,
    channels: &[u8; DMX_CHANNELS],
) -> Result<(), String> {
    let packet = build_artnet_packet(universe, sequence, channels);
    let socket = UdpSocket::bind("0.0.0.0:0")
        .map_err(|e| format!("Failed to bind local UDP socket for DMX: {}", e))?;

    if target_ip.ends_with(".255") || target_ip == "255.255.255.255" {
        socket.set_broadcast(true).map_err(|e| e.to_string())?;
    }

    let dest = format!("{}:{}", target_ip.trim(), target_port);
    socket
        .send_to(&packet, &dest)
        .map_err(|e| format!("Failed to send Art-Net packet to {}: {}", dest, e))?;
    Ok(())
}

pub struct DmxService {
    channels: Arc<Mutex<[u8; DMX_CHANNELS]>>,
    sequence: Arc<Mutex<u8>>,
}

impl DmxService {
    pub fn new() -> Self {
        Self {
            channels: Arc::new(Mutex::new([0u8; DMX_CHANNELS])),
            sequence: Arc::new(Mutex::new(0)),
        }
    }

    pub fn set_channel_and_send(
        &self,
        db: &DbManager,
        channel: u16,
        value: u8,
    ) -> Result<(), String> {
        let cfg = db.get_dmx_config().map_err(|e| e.to_string())?;
        if !cfg.is_enabled {
            return Ok(());
        }

        if channel == 0 || channel > DMX_CHANNELS as u16 {
            return Err(format!("DMX channel must be between 1 and {}.", DMX_CHANNELS));
        }

        let mut ch = self.channels.lock().unwrap();
        ch[(channel - 1) as usize] = value;

        let mut seq = self.sequence.lock().unwrap();
        *seq = seq.wrapping_add(1);

        send_artnet_dmx(&cfg.target_ip, cfg.target_port, cfg.universe, *seq, &ch)
    }

    pub fn on_slide_change(&self, db: &DbManager, slide_index: usize) -> Result<(), String> {
        let cfg = db.get_dmx_config().map_err(|e| e.to_string())?;
        if !cfg.is_enabled || !cfg.trigger_on_slide_change {
            return Ok(());
        }

        // Clamp slide index to 1..=255 as DMX channel cue value
        let cue_val = (slide_index.min(254) + 1) as u8;
        self.set_channel_and_send(db, cfg.slide_cue_channel, cue_val)
    }

    pub fn test_flash(&self, db: &DbManager, channel: u16, value: u8) -> Result<(), String> {
        let cfg = db.get_dmx_config().map_err(|e| e.to_string())?;
        if channel == 0 || channel > DMX_CHANNELS as u16 {
            return Err(format!("DMX channel must be between 1 and {}.", DMX_CHANNELS));
        }

        let mut test_ch = [0u8; DMX_CHANNELS];
        test_ch[(channel - 1) as usize] = value;

        send_artnet_dmx(&cfg.target_ip, cfg.target_port, cfg.universe, 1, &test_ch)
    }
}

// ================= Stream Deck & OSC Presets =================

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StreamDeckButton {
    pub row: u8,
    pub col: u8,
    pub title: String,
    pub osc_path: String,
    pub action: String,
    pub color: String,
    pub icon: String,
    pub description: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StreamDeckProfileExport {
    pub application: String,
    pub default_osc_port: u16,
    pub buttons: Vec<StreamDeckButton>,
    pub companion_osc_summary: String,
}

pub fn get_stream_deck_profile(osc_port: u16) -> StreamDeckProfileExport {
    let buttons = vec![
        // Row 1: Presentation Navigation
        StreamDeckButton {
            row: 0,
            col: 0,
            title: "PREV\nSLIDE".into(),
            osc_path: "/slide/prev".into(),
            action: "prev_slide".into(),
            color: "#0284c7".into(),
            icon: "arrow-left".into(),
            description: "Go to previous slide".into(),
        },
        StreamDeckButton {
            row: 0,
            col: 1,
            title: "NEXT\nSLIDE".into(),
            osc_path: "/slide/next".into(),
            action: "next_slide".into(),
            color: "#0284c7".into(),
            icon: "arrow-right".into(),
            description: "Advance to next slide".into(),
        },
        StreamDeckButton {
            row: 0,
            col: 2,
            title: "PREV\nITEM".into(),
            osc_path: "/item/prev".into(),
            action: "prev_item".into(),
            color: "#475569".into(),
            icon: "skip-back".into(),
            description: "Jump to previous service item".into(),
        },
        StreamDeckButton {
            row: 0,
            col: 3,
            title: "NEXT\nITEM".into(),
            osc_path: "/item/next".into(),
            action: "next_item".into(),
            color: "#475569".into(),
            icon: "skip-forward".into(),
            description: "Jump to next service item".into(),
        },
        StreamDeckButton {
            row: 0,
            col: 4,
            title: "LIVE".into(),
            osc_path: "/live".into(),
            action: "toggle_live".into(),
            color: "#16a34a".into(),
            icon: "radio".into(),
            description: "Toggle presentation live output".into(),
        },
        // Row 2: Overlays & Clear Groups
        StreamDeckButton {
            row: 1,
            col: 0,
            title: "BLACK\nOUT".into(),
            osc_path: "/blackout".into(),
            action: "toggle_blackout".into(),
            color: "#0f172a".into(),
            icon: "moon".into(),
            description: "Blackout audience screen".into(),
        },
        StreamDeckButton {
            row: 1,
            col: 1,
            title: "LOGO".into(),
            osc_path: "/logo".into(),
            action: "toggle_logo".into(),
            color: "#0369a1".into(),
            icon: "shield".into(),
            description: "Toggle church logo screen".into(),
        },
        StreamDeckButton {
            row: 1,
            col: 2,
            title: "CLEAR\nMEDIA".into(),
            osc_path: "/clear/media".into(),
            action: "clear_media".into(),
            color: "#b45309".into(),
            icon: "film".into(),
            description: "Clear active background video/audio".into(),
        },
        StreamDeckButton {
            row: 1,
            col: 3,
            title: "CLEAR\nPROPS".into(),
            osc_path: "/clear/props".into(),
            action: "clear_props".into(),
            color: "#d97706".into(),
            icon: "layers".into(),
            description: "Clear active props / overlays".into(),
        },
        StreamDeckButton {
            row: 1,
            col: 4,
            title: "CLEAR\nALL".into(),
            osc_path: "/clear/all".into(),
            action: "clear_all".into(),
            color: "#dc2626".into(),
            icon: "x-octagon".into(),
            description: "Clear all visual output layers".into(),
        },
        // Row 3: Timers & Utilities
        StreamDeckButton {
            row: 2,
            col: 0,
            title: "TIMER\nSTART".into(),
            osc_path: "/timer/start".into(),
            action: "start_timer".into(),
            color: "#059669".into(),
            icon: "play".into(),
            description: "Start service timer".into(),
        },
        StreamDeckButton {
            row: 2,
            col: 1,
            title: "TIMER\nSTOP".into(),
            osc_path: "/timer/stop".into(),
            action: "stop_timer".into(),
            color: "#d97706".into(),
            icon: "pause".into(),
            description: "Pause / stop service timer".into(),
        },
        StreamDeckButton {
            row: 2,
            col: 2,
            title: "TIMER\nRESET".into(),
            osc_path: "/timer/reset".into(),
            action: "reset_timer".into(),
            color: "#4b5563".into(),
            icon: "rotate-ccw".into(),
            description: "Reset service timer to duration".into(),
        },
        StreamDeckButton {
            row: 2,
            col: 3,
            title: "CLEAR\nALERT".into(),
            osc_path: "/alert/clear".into(),
            action: "clear_alert".into(),
            color: "#e11d48".into(),
            icon: "bell-off".into(),
            description: "Clear nursery or broadcast alert".into(),
        },
        StreamDeckButton {
            row: 2,
            col: 4,
            title: "STOP\nAUTO".into(),
            osc_path: "/autoadvance/stop".into(),
            action: "stop_auto_advance".into(),
            color: "#6b7280".into(),
            icon: "square".into(),
            description: "Stop announcement loop auto-advance".into(),
        },
    ];

    let companion_osc_summary = format!(
        "Church Presenter OSC Control Guide:\n\
         - Protocol: Open Sound Control (OSC) over UDP\n\
         - Default Port: {}\n\
         - Target Host: 127.0.0.1 (local) or Church Presenter computer LAN IP\n\
         - Compatible with: Elgato Stream Deck (OSC plugin), Bitfocus Companion, TouchOSC, QLab\n\n\
         Key OSC Addresses:\n\
         - /slide/next          -> Advance to next slide\n\
         - /slide/prev          -> Go to previous slide\n\
         - /item/next           -> Jump to next service item\n\
         - /item/prev           -> Jump to previous service item\n\
         - /live                -> Toggle live output\n\
         - /blackout            -> Toggle blackout\n\
         - /logo                -> Toggle logo\n\
         - /clear/media         -> Clear media playback\n\
         - /clear/props         -> Clear props overlay\n\
         - /clear/all           -> Clear all layers\n\
         - /timer/start         -> Start timer\n\
         - /timer/stop          -> Pause timer\n\
         - /timer/reset         -> Reset timer\n\
         - /macro/<id>          -> Run saved macro\n",
        osc_port
    );

    StreamDeckProfileExport {
        application: "ChurchPresenter".into(),
        default_osc_port: osc_port,
        buttons,
        companion_osc_summary,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn artnet_packet_structure_is_valid() {
        let mut ch = [0u8; DMX_CHANNELS];
        ch[0] = 255; // Channel 1: full on
        ch[511] = 128; // Channel 512: 50%

        let packet = build_artnet_packet(0, 1, &ch);
        assert_eq!(&packet[0..8], b"Art-Net\0");
        assert_eq!(packet[8], 0x00);
        assert_eq!(packet[9], 0x50);
        assert_eq!(packet[10], 0x00);
        assert_eq!(packet[11], 0x0e);
        assert_eq!(packet[12], 1); // sequence
        assert_eq!(packet[14], 0); // universe LSB
        assert_eq!(packet[15], 0); // universe MSB
        assert_eq!(packet[16], 0x02); // 512 length MSB
        assert_eq!(packet[17], 0x00); // 512 length LSB
        assert_eq!(packet[18], 255); // channel 1
        assert_eq!(packet[529], 128); // channel 512
    }

    #[test]
    fn stream_deck_profile_contains_all_15_buttons() {
        let profile = get_stream_deck_profile(9000);
        assert_eq!(profile.default_osc_port, 9000);
        assert_eq!(profile.buttons.len(), 15);
        assert!(profile.buttons.iter().any(|b| b.osc_path == "/slide/next"));
        assert!(profile.buttons.iter().any(|b| b.osc_path == "/blackout"));
        assert!(profile.buttons.iter().any(|b| b.osc_path == "/clear/all"));
        assert!(profile.companion_osc_summary.contains("/slide/next"));
    }

    #[test]
    fn dmx_service_off_by_default_and_config_roundtrip() {
        let db = DbManager::new_in_memory().unwrap();
        let svc = DmxService::new();

        let cfg = db.get_dmx_config().unwrap();
        assert!(!cfg.is_enabled); // off by default per requirement
        assert_eq!(cfg.target_port, 6454);
        assert_eq!(cfg.target_ip, "127.0.0.1");

        // When disabled, on_slide_change is a no-op
        assert!(svc.on_slide_change(&db, 2).is_ok());

        // Update config
        let updated = DmxConfig {
            is_enabled: true,
            target_ip: "192.168.1.100".into(),
            target_port: 6454,
            universe: 1,
            trigger_on_slide_change: true,
            slide_cue_channel: 10,
            ..cfg
        };
        db.update_dmx_config(&updated).unwrap();
        let loaded = db.get_dmx_config().unwrap();
        assert!(loaded.is_enabled);
        assert_eq!(loaded.target_ip, "192.168.1.100");
        assert_eq!(loaded.slide_cue_channel, 10);
    }
}
