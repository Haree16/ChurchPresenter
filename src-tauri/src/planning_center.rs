//! Planning Center Services (PCO) integration.
//! Allows churches to connect their Planning Center Services account, browse plans,
//! and import plan items (songs, headers, service order) directly into Church Presenter services.
//!
//! Offline-first: sync is strictly on-demand. Credentials are saved locally in SQLite
//! and are never included in database backup exports.

use crate::db::DbManager;
use base64::{engine::general_purpose::STANDARD, Engine as _};
use chrono::Utc;
use rusqlite::{params, Result};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

const PCO_BASE_URL: &str = "https://api.planningcenteronline.com/services/v2";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PcoConfig {
    pub app_id: String,
    pub secret: String,
    pub organization_name: Option<String>,
    pub last_synced_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PcoStatus {
    pub is_connected: bool,
    pub organization_name: Option<String>,
    pub app_id_masked: Option<String>,
    pub last_synced_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PcoServiceType {
    pub id: String,
    pub name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PcoPlan {
    pub id: String,
    pub service_type_id: String,
    pub dates: String,
    pub title: Option<String>,
    pub series_title: Option<String>,
    pub sort_date: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PcoItem {
    pub id: String,
    pub title: String,
    /// "song", "header", "regular"
    pub item_type: String,
    pub service_position: String,
    pub sequence: i32,
    pub length: Option<i32>,
    pub description: Option<String>,
    pub song_id: Option<String>,
    pub song_title: Option<String>,
    pub ccli_number: Option<String>,
    pub author: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PcoPlanDetail {
    pub plan: PcoPlan,
    pub items: Vec<PcoItem>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PcoImportResult {
    pub service_id: String,
    pub service_title: String,
    pub matched_songs_count: i32,
    pub placeholder_songs_count: i32,
    pub total_items_count: i32,
}

fn mask_app_id(id: &str) -> String {
    let s = id.trim();
    if s.len() <= 8 {
        "••••••••".to_string()
    } else {
        format!("{}••••{}", &s[..4], &s[s.len() - 4..])
    }
}

fn auth_header(app_id: &str, secret: &str) -> String {
    let raw = format!("{}:{}", app_id.trim(), secret.trim());
    format!("Basic {}", STANDARD.encode(raw.as_bytes()))
}

impl DbManager {
    pub fn get_planning_center_config(&self) -> Result<Option<PcoConfig>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT app_id, secret, organization_name, last_synced_at FROM planning_center_config WHERE id = 1;",
        )?;
        let mut rows = stmt.query([])?;
        if let Some(row) = rows.next()? {
            Ok(Some(PcoConfig {
                app_id: row.get(0)?,
                secret: row.get(1)?,
                organization_name: row.get(2)?,
                last_synced_at: row.get(3)?,
            }))
        } else {
            Ok(None)
        }
    }

    pub fn get_planning_center_status(&self) -> Result<PcoStatus> {
        let cfg = self.get_planning_center_config()?;
        match cfg {
            Some(c) => Ok(PcoStatus {
                is_connected: true,
                organization_name: c.organization_name,
                app_id_masked: Some(mask_app_id(&c.app_id)),
                last_synced_at: c.last_synced_at,
            }),
            None => Ok(PcoStatus {
                is_connected: false,
                organization_name: None,
                app_id_masked: None,
                last_synced_at: None,
            }),
        }
    }

    pub fn save_planning_center_credentials(
        &self,
        app_id: &str,
        secret: &str,
    ) -> std::result::Result<PcoStatus, String> {
        let app_id = app_id.trim();
        let secret = secret.trim();
        if app_id.is_empty() || secret.is_empty() {
            return Err("Both Application ID and Secret are required.".to_string());
        }

        let org_name = test_pco_credentials(app_id, secret)?;
        let now = Utc::now().to_rfc3339();

        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT INTO planning_center_config (id, app_id, secret, organization_name, last_synced_at, created_at, updated_at)
             VALUES (1, ?1, ?2, ?3, ?4, ?4, ?4)
             ON CONFLICT(id) DO UPDATE SET app_id = ?1, secret = ?2, organization_name = ?3, last_synced_at = ?4, updated_at = ?4;",
            params![app_id, secret, org_name, now],
        )
        .map_err(|e| e.to_string())?;

        Ok(PcoStatus {
            is_connected: true,
            organization_name: Some(org_name),
            app_id_masked: Some(mask_app_id(app_id)),
            last_synced_at: Some(now),
        })
    }

    pub fn disconnect_planning_center(&self) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute("DELETE FROM planning_center_config WHERE id = 1;", [])?;
        Ok(())
    }

    pub fn list_planning_center_service_types(&self) -> std::result::Result<Vec<PcoServiceType>, String> {
        let cfg = self.get_planning_center_config().map_err(|e| e.to_string())?
            .ok_or_else(|| "Planning Center is not connected.".to_string())?;

        if is_mock_token(&cfg.app_id) {
            return Ok(mock_service_types());
        }

        let url = format!("{}/service_types?order=name", PCO_BASE_URL);
        let resp = ureq::get(&url)
            .set("Authorization", &auth_header(&cfg.app_id, &cfg.secret))
            .call()
            .map_err(|e| format!("Failed to fetch service types: {}", e))?;

        let json: serde_json::Value = resp.into_json().map_err(|e| e.to_string())?;
        let data = json.get("data").and_then(|v| v.as_array()).ok_or("Invalid response from Planning Center")?;

        let mut list = Vec::new();
        for item in data {
            let id = item.get("id").and_then(|v| v.as_str()).unwrap_or("").to_string();
            let name = item.get("attributes").and_then(|a| a.get("name")).and_then(|v| v.as_str()).unwrap_or("Unnamed Service").to_string();
            if !id.is_empty() {
                list.push(PcoServiceType { id, name });
            }
        }
        Ok(list)
    }

    pub fn list_planning_center_plans(&self, service_type_id: &str) -> std::result::Result<Vec<PcoPlan>, String> {
        let cfg = self.get_planning_center_config().map_err(|e| e.to_string())?
            .ok_or_else(|| "Planning Center is not connected.".to_string())?;

        if is_mock_token(&cfg.app_id) {
            return Ok(mock_plans(service_type_id));
        }

        // Try future plans first, then fallback to recent
        let url = format!("{}/service_types/{}/plans?order=-sort_date&per_page=20", PCO_BASE_URL, service_type_id);
        let resp = ureq::get(&url)
            .set("Authorization", &auth_header(&cfg.app_id, &cfg.secret))
            .call()
            .map_err(|e| format!("Failed to fetch plans: {}", e))?;

        let json: serde_json::Value = resp.into_json().map_err(|e| e.to_string())?;
        let data = json.get("data").and_then(|v| v.as_array()).ok_or("Invalid response from Planning Center")?;

        let mut list = Vec::new();
        for item in data {
            let id = item.get("id").and_then(|v| v.as_str()).unwrap_or("").to_string();
            let attrs = item.get("attributes");
            let dates = attrs.and_then(|a| a.get("dates")).and_then(|v| v.as_str()).unwrap_or("").to_string();
            let title = attrs.and_then(|a| a.get("title")).and_then(|v| v.as_str()).map(|s| s.to_string());
            let series_title = attrs.and_then(|a| a.get("series_title")).and_then(|v| v.as_str()).map(|s| s.to_string());
            let sort_date = attrs.and_then(|a| a.get("sort_date")).and_then(|v| v.as_str()).unwrap_or("").to_string();

            if !id.is_empty() {
                list.push(PcoPlan {
                    id,
                    service_type_id: service_type_id.to_string(),
                    dates,
                    title,
                    series_title,
                    sort_date,
                });
            }
        }
        Ok(list)
    }

    pub fn get_planning_center_plan_details(
        &self,
        service_type_id: &str,
        plan_id: &str,
    ) -> std::result::Result<PcoPlanDetail, String> {
        let cfg = self.get_planning_center_config().map_err(|e| e.to_string())?
            .ok_or_else(|| "Planning Center is not connected.".to_string())?;

        if is_mock_token(&cfg.app_id) {
            return Ok(mock_plan_details(service_type_id, plan_id));
        }

        // Fetch plan info
        let plan_url = format!("{}/service_types/{}/plans/{}", PCO_BASE_URL, service_type_id, plan_id);
        let plan_resp = ureq::get(&plan_url)
            .set("Authorization", &auth_header(&cfg.app_id, &cfg.secret))
            .call()
            .map_err(|e| format!("Failed to fetch plan info: {}", e))?;

        let plan_json: serde_json::Value = plan_resp.into_json().map_err(|e| e.to_string())?;
        let p_data = plan_json.get("data").ok_or("Plan data not found")?;
        let p_attrs = p_data.get("attributes");

        let plan = PcoPlan {
            id: plan_id.to_string(),
            service_type_id: service_type_id.to_string(),
            dates: p_attrs.and_then(|a| a.get("dates")).and_then(|v| v.as_str()).unwrap_or("").to_string(),
            title: p_attrs.and_then(|a| a.get("title")).and_then(|v| v.as_str()).map(|s| s.to_string()),
            series_title: p_attrs.and_then(|a| a.get("series_title")).and_then(|v| v.as_str()).map(|s| s.to_string()),
            sort_date: p_attrs.and_then(|a| a.get("sort_date")).and_then(|v| v.as_str()).unwrap_or("").to_string(),
        };

        // Fetch items with songs included
        let items_url = format!(
            "{}/service_types/{}/plans/{}/items?include=song&per_page=100",
            PCO_BASE_URL, service_type_id, plan_id
        );
        let items_resp = ureq::get(&items_url)
            .set("Authorization", &auth_header(&cfg.app_id, &cfg.secret))
            .call()
            .map_err(|e| format!("Failed to fetch plan items: {}", e))?;

        let items_json: serde_json::Value = items_resp.into_json().map_err(|e| e.to_string())?;
        let data = items_json.get("data").and_then(|v| v.as_array()).ok_or("Items not found")?;

        // Index included songs
        let mut included_songs: HashMap<String, (String, Option<String>, Option<String>)> = HashMap::new();
        if let Some(inc) = items_json.get("included").and_then(|v| v.as_array()) {
            for song in inc {
                if song.get("type").and_then(|v| v.as_str()) == Some("Song") {
                    let s_id = song.get("id").and_then(|v| v.as_str()).unwrap_or("").to_string();
                    let attrs = song.get("attributes");
                    let title = attrs.and_then(|a| a.get("title")).and_then(|v| v.as_str()).unwrap_or("").to_string();
                    let ccli = attrs
                        .and_then(|a| a.get("ccli_number"))
                        .and_then(|v| v.as_i64().map(|n| n.to_string()).or_else(|| v.as_str().map(|s| s.to_string())));
                    let author = attrs.and_then(|a| a.get("author")).and_then(|v| v.as_str()).map(|s| s.to_string());
                    if !s_id.is_empty() {
                        included_songs.insert(s_id, (title, ccli, author));
                    }
                }
            }
        }

        let mut items = Vec::new();
        for it in data {
            let id = it.get("id").and_then(|v| v.as_str()).unwrap_or("").to_string();
            let attrs = it.get("attributes");
            let title = attrs.and_then(|a| a.get("title")).and_then(|v| v.as_str()).unwrap_or("Untitled Item").to_string();
            let item_type = attrs.and_then(|a| a.get("item_type")).and_then(|v| v.as_str()).unwrap_or("regular").to_string();
            let service_position = attrs.and_then(|a| a.get("service_position")).and_then(|v| v.as_str()).unwrap_or("during").to_string();
            let sequence = attrs.and_then(|a| a.get("sequence")).and_then(|v| v.as_i64()).unwrap_or(0) as i32;
            let length = attrs.and_then(|a| a.get("length")).and_then(|v| v.as_i64()).map(|n| n as i32);
            let description = attrs.and_then(|a| a.get("description")).and_then(|v| v.as_str()).map(|s| s.to_string());

            let mut song_id = None;
            let mut song_title = None;
            let mut ccli_number = None;
            let mut author = None;

            if item_type == "song" {
                if let Some(s_rel) = it.get("relationships").and_then(|r| r.get("song")).and_then(|s| s.get("data")).and_then(|d| d.get("id")).and_then(|v| v.as_str()) {
                    song_id = Some(s_rel.to_string());
                    if let Some((t, c, a)) = included_songs.get(s_rel) {
                        song_title = Some(t.clone());
                        ccli_number = c.clone();
                        author = a.clone();
                    }
                }
            }

            items.push(PcoItem {
                id,
                title,
                item_type,
                service_position,
                sequence,
                length,
                description,
                song_id,
                song_title,
                ccli_number,
                author,
            });
        }

        items.sort_by_key(|i| i.sequence);
        Ok(PcoPlanDetail { plan, items })
    }

    pub fn import_planning_center_plan(
        &self,
        service_type_id: &str,
        plan_id: &str,
    ) -> std::result::Result<PcoImportResult, String> {
        let details = self.get_planning_center_plan_details(service_type_id, plan_id)?;
        let plan = details.plan;

        let service_title = if let Some(t) = plan.title.as_deref() {
            if !t.is_empty() {
                format!("{} ({})", t, plan.dates)
            } else {
                plan.dates.clone()
            }
        } else if !plan.dates.is_empty() {
            plan.dates.clone()
        } else {
            "Planning Center Service".to_string()
        };

        // Create the Service container in Church Presenter
        let service_id = format!("svc-{}", uuid::Uuid::new_v4());
        let now = Utc::now().to_rfc3339();

        {
            let conn = self.conn.lock().unwrap();
            conn.execute(
                "INSERT INTO services (id, title, description, service_date, category, notes, created_at, updated_at)
                 VALUES (?1, ?2, ?3, ?4, 'Sunday Worship', ?5, ?6, ?6);",
                params![
                    service_id,
                    service_title,
                    format!("Planning Center Plan #{}", plan.id),
                    if plan.sort_date.is_empty() { now.clone() } else { plan.sort_date.clone() },
                    format!("Series: {}\nDates: {}", plan.series_title.as_deref().unwrap_or("None"), plan.dates),
                    now
                ],
            )
            .map_err(|e| e.to_string())?;
        }

        let mut matched_songs = 0;
        let mut placeholder_songs = 0;
        let total_items = details.items.len() as i32;

        for (idx, item) in details.items.iter().enumerate() {
            let item_id = format!("item-{}", uuid::Uuid::new_v4());
            let order = idx as i32;

            if item.item_type == "header" {
                // Divider line in the service order
                let conn = self.conn.lock().unwrap();
                let _ = conn.execute(
                    "INSERT INTO service_items (id, service_id, item_type, presentation_id, custom_name, sort_order, notes, created_at)
                     VALUES (?1, ?2, 'divider', NULL, ?3, ?4, ?5, ?6);",
                    params![item_id, service_id, item.title, order, item.description, now],
                );
            } else if item.item_type == "song" {
                // Check if this song exists in the local song library
                let matched_song_id = self.find_matching_song(item.ccli_number.as_deref(), &item.title)?;

                if let Some(song_id) = matched_song_id {
                    // Song exists! Add using standard default arrangement
                    if let Ok(_) = self.add_song_to_service(&service_id, &song_id, None, None, None) {
                        matched_songs += 1;
                    } else {
                        // Fallback: create placeholder
                        let conn = self.conn.lock().unwrap();
                        let _ = conn.execute(
                            "INSERT INTO service_items (id, service_id, item_type, presentation_id, custom_name, sort_order, notes, created_at)
                             VALUES (?1, ?2, 'divider', NULL, ?3, ?4, ?5, ?6);",
                            params![item_id, service_id, format!("♪ {}", item.title), order, item.description, now],
                        );
                        placeholder_songs += 1;
                    }
                } else {
                    // Song not in library yet: insert a placeholder slot with song metadata
                    let song_notes = format!(
                        "PCO Song: {}\nCCLI: {}\nAuthor: {}\n{}",
                        item.title,
                        item.ccli_number.as_deref().unwrap_or("None"),
                        item.author.as_deref().unwrap_or("Unknown"),
                        item.description.as_deref().unwrap_or("")
                    );
                    let conn = self.conn.lock().unwrap();
                    let _ = conn.execute(
                        "INSERT INTO service_items (id, service_id, item_type, presentation_id, custom_name, sort_order, notes, created_at)
                         VALUES (?1, ?2, 'divider', NULL, ?3, ?4, ?5, ?6);",
                        params![item_id, service_id, format!("♪ {} [Add to Library]", item.title), order, song_notes, now],
                    );
                    placeholder_songs += 1;
                }
            } else {
                // Regular element (welcome, scripture reading, sermon, offering, benediction)
                let conn = self.conn.lock().unwrap();
                let _ = conn.execute(
                    "INSERT INTO service_items (id, service_id, item_type, presentation_id, custom_name, sort_order, notes, created_at)
                     VALUES (?1, ?2, 'divider', NULL, ?3, ?4, ?5, ?6);",
                    params![item_id, service_id, item.title, order, item.description, now],
                );
            }
        }

        // Update last synced timestamp
        {
            let conn = self.conn.lock().unwrap();
            let _ = conn.execute(
                "UPDATE planning_center_config SET last_synced_at = ?1 WHERE id = 1;",
                params![now],
            );
        }

        Ok(PcoImportResult {
            service_id,
            service_title,
            matched_songs_count: matched_songs,
            placeholder_songs_count: placeholder_songs,
            total_items_count: total_items,
        })
    }

    fn find_matching_song(&self, ccli_number: Option<&str>, title: &str) -> std::result::Result<Option<String>, String> {
        let conn = self.conn.lock().unwrap();

        // 1. Match by CCLI number if provided
        if let Some(ccli) = ccli_number {
            let clean_ccli = ccli.trim();
            if !clean_ccli.is_empty() {
                let mut stmt = conn.prepare(
                    "SELECT id FROM songs WHERE ccli_number = ?1 LIMIT 1;",
                ).map_err(|e| e.to_string())?;
                let mut rows = stmt.query(params![clean_ccli]).map_err(|e| e.to_string())?;
                if let Some(row) = rows.next().map_err(|e| e.to_string())? {
                    return Ok(Some(row.get(0).map_err(|e| e.to_string())?));
                }
            }
        }

        // 2. Match by exact title (case-insensitive)
        let clean_title = title.trim();
        let mut stmt = conn.prepare(
            "SELECT id FROM songs WHERE LOWER(TRIM(title)) = LOWER(TRIM(?1)) LIMIT 1;",
        ).map_err(|e| e.to_string())?;
        let mut rows = stmt.query(params![clean_title]).map_err(|e| e.to_string())?;
        if let Some(row) = rows.next().map_err(|e| e.to_string())? {
            return Ok(Some(row.get(0).map_err(|e| e.to_string())?));
        }

        Ok(None)
    }
}

fn is_mock_token(app_id: &str) -> bool {
    app_id.starts_with("test_") || app_id.starts_with("mock_") || app_id == "demo"
}

fn test_pco_credentials(app_id: &str, secret: &str) -> std::result::Result<String, String> {
    if is_mock_token(app_id) {
        return Ok("Grace Community Church".to_string());
    }

    let url = format!("{}/organization", PCO_BASE_URL);
    let resp = ureq::get(&url)
        .set("Authorization", &auth_header(app_id, secret))
        .call()
        .map_err(|e| match e {
            ureq::Error::Status(401, _) => "Invalid Application ID or Secret. Please check your Personal Access Token.".to_string(),
            ureq::Error::Status(code, _) => format!("Planning Center responded with HTTP status {}.", code),
            ureq::Error::Transport(t) => format!("Could not reach Planning Center: {}", t),
        })?;

    let json: serde_json::Value = resp.into_json().map_err(|e| e.to_string())?;
    let org_name = json
        .get("data")
        .and_then(|d| d.get("attributes"))
        .and_then(|a| a.get("name"))
        .and_then(|v| v.as_str())
        .unwrap_or("Connected Organization")
        .to_string();

    Ok(org_name)
}

fn mock_service_types() -> Vec<PcoServiceType> {
    vec![
        PcoServiceType { id: "st-1".into(), name: "Sunday Morning Service".into() },
        PcoServiceType { id: "st-2".into(), name: "Midweek Prayer & Worship".into() },
    ]
}

fn mock_plans(service_type_id: &str) -> Vec<PcoPlan> {
    vec![
        PcoPlan {
            id: "plan-101".into(),
            service_type_id: service_type_id.into(),
            dates: "Sunday, Nov 1, 2026".into(),
            title: Some("Sunday Worship".into()),
            series_title: Some("Living by Faith".into()),
            sort_date: "2026-11-01T09:30:00Z".into(),
        },
        PcoPlan {
            id: "plan-102".into(),
            service_type_id: service_type_id.into(),
            dates: "Sunday, Nov 8, 2026".into(),
            title: Some("Sunday Worship".into()),
            series_title: Some("Living by Faith".into()),
            sort_date: "2026-11-08T09:30:00Z".into(),
        },
    ]
}

fn mock_plan_details(service_type_id: &str, plan_id: &str) -> PcoPlanDetail {
    PcoPlanDetail {
        plan: PcoPlan {
            id: plan_id.into(),
            service_type_id: service_type_id.into(),
            dates: "Sunday, Nov 1, 2026".into(),
            title: Some("Sunday Worship".into()),
            series_title: Some("Living by Faith".into()),
            sort_date: "2026-11-01T09:30:00Z".into(),
        },
        items: vec![
            PcoItem {
                id: "item-1".into(),
                title: "Welcome & Countdown".into(),
                item_type: "regular".into(),
                service_position: "pre".into(),
                sequence: 1,
                length: Some(300),
                description: Some("5 minute countdown video".into()),
                song_id: None,
                song_title: None,
                ccli_number: None,
                author: None,
            },
            PcoItem {
                id: "item-2".into(),
                title: "Praise & Worship".into(),
                item_type: "header".into(),
                service_position: "during".into(),
                sequence: 2,
                length: None,
                description: None,
                song_id: None,
                song_title: None,
                ccli_number: None,
                author: None,
            },
            PcoItem {
                id: "item-3".into(),
                title: "Way Maker".into(),
                item_type: "song".into(),
                service_position: "during".into(),
                sequence: 3,
                length: Some(360),
                description: Some("Key of E".into()),
                song_id: Some("song-waymaker".into()),
                song_title: Some("Way Maker".into()),
                ccli_number: Some("7115744".into()),
                author: Some("Osinachi Kalu Okoro Egbu".into()),
            },
            PcoItem {
                id: "item-4".into(),
                title: "Sermon".into(),
                item_type: "regular".into(),
                service_position: "during".into(),
                sequence: 4,
                length: Some(1800),
                description: Some("Living by Faith - Part 1".into()),
                song_id: None,
                song_title: None,
                ccli_number: None,
                author: None,
            },
        ],
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn mask_app_id_protects_credentials() {
        assert_eq!(mask_app_id("short"), "••••••••");
        assert_eq!(mask_app_id("1234567890abcdef"), "1234••••cdef");
    }

    #[test]
    fn auth_header_encodes_basic_auth() {
        let h = auth_header("user", "pass");
        assert!(h.starts_with("Basic "));
        // base64("user:pass") = "dXNlcjpwYXNz"
        assert_eq!(h, "Basic dXNlcjpwYXNz");
    }

    #[test]
    fn config_lifecycle_and_mock_sync() {
        let db = DbManager::new_in_memory().unwrap();
        assert!(!db.get_planning_center_status().unwrap().is_connected);

        // Rejects empty
        assert!(db.save_planning_center_credentials(" ", "").is_err());

        // Connects using test token
        let status = db.save_planning_center_credentials("test_app_id_12345", "test_secret").unwrap();
        assert!(status.is_connected);
        assert_eq!(status.organization_name.as_deref(), Some("Grace Community Church"));
        assert!(status.app_id_masked.unwrap().contains("••••"));

        let st = db.list_planning_center_service_types().unwrap();
        assert_eq!(st.len(), 2);
        assert_eq!(st[0].name, "Sunday Morning Service");

        let plans = db.list_planning_center_plans(&st[0].id).unwrap();
        assert_eq!(plans.len(), 2);
        assert_eq!(plans[0].title.as_deref(), Some("Sunday Worship"));

        let details = db.get_planning_center_plan_details(&st[0].id, &plans[0].id).unwrap();
        assert_eq!(details.items.len(), 4);
        assert_eq!(details.items[2].title, "Way Maker");
        assert_eq!(details.items[2].ccli_number.as_deref(), Some("7115744"));

        // Import into Church Presenter service
        let result = db.import_planning_center_plan(&st[0].id, &plans[0].id).unwrap();
        assert_eq!(result.total_items_count, 4);
        assert!(result.service_id.starts_with("svc-"));

        // Disconnect
        db.disconnect_planning_center().unwrap();
        assert!(!db.get_planning_center_status().unwrap().is_connected);
    }

    #[test]
    fn credentials_are_not_leaked_in_backups() {
        let db = DbManager::new_in_memory().unwrap();
        db.save_planning_center_credentials("test_app", "test_secret").unwrap();

        let backup = db.export_backup().unwrap();
        let json = serde_json::to_string(&backup).unwrap();
        assert!(!json.contains("test_secret"));
        assert!(!json.contains("planning_center"));
    }
}
