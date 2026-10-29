//! Search inside song lyrics and slide text, with a short preview of where the words were found.
//!
//! Matching ignores case (for any script that has case) and treats any run of spaces or line breaks as one
//! space, so a phrase that runs over two lyric lines is still found. A song or presentation is listed once,
//! with its best match: the whole phrase first, otherwise a section or slide that has every word.

use crate::db::DbManager;
use rusqlite::Result;
use serde::{Deserialize, Serialize};

pub const MIN_QUERY_CHARS: usize = 2;
pub const MAX_QUERY_CHARS: usize = 100;
pub const DEFAULT_HIT_LIMIT: usize = 100;
pub const MAX_HIT_LIMIT: usize = 500;
/// How much of a line is shown on each side of the match before it is cut with "…".
const CONTEXT_CHARS: usize = 36;

/// The found words with a little text around them, ready to show with the match marked.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Preview {
    pub before: String,
    pub matched: String,
    pub after: String,
}

#[derive(Debug, Clone, PartialEq)]
pub struct TextMatch {
    pub preview: Preview,
    /// 0: the whole phrase was found; 1: every word was found, but not together.
    pub rank: u8,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LyricHit {
    pub song_id: String,
    pub section_id: String,
    pub section_label: String,
    #[serde(flatten)]
    pub preview: Preview,
    pub rank: u8,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SlideHit {
    pub presentation_id: String,
    pub slide_id: String,
    /// Position of the slide in its presentation, starting at 1.
    pub slide_number: i32,
    #[serde(flatten)]
    pub preview: Preview,
    pub rank: u8,
}

/// Lower-case one character, keeping a 1:1 match with the original so positions stay valid.
fn fold(c: char) -> char {
    c.to_lowercase().next().unwrap_or(c)
}

/// The query with whitespace runs collapsed to one space, or None if it is too short or too long to search.
pub fn clean_query(raw: &str) -> Option<String> {
    let q = raw.split_whitespace().collect::<Vec<_>>().join(" ");
    let n = q.chars().count();
    (MIN_QUERY_CHARS..=MAX_QUERY_CHARS).contains(&n).then_some(q)
}

/// Where `needle` (already folded, single spaces) occurs in `hay`: `(start, end)` in chars, first occurrence from `from`.
fn find_chars(hay: &[char], needle: &[char], from: usize) -> Option<(usize, usize)> {
    if needle.is_empty() {
        return None;
    }
    'start: for s in from..hay.len() {
        let mut i = s;
        for &n in needle {
            if n == ' ' {
                // one space in the query matches any run of whitespace in the text
                if i >= hay.len() || !hay[i].is_whitespace() {
                    continue 'start;
                }
                while i < hay.len() && hay[i].is_whitespace() {
                    i += 1;
                }
            } else {
                if i >= hay.len() || fold(hay[i]) != n {
                    continue 'start;
                }
                i += 1;
            }
        }
        return Some((s, i));
    }
    None
}

fn preview_of(chars: &[char], start: usize, end: usize) -> Preview {
    // the lines the match sits on
    let mut line_start = start;
    while line_start > 0 && chars[line_start - 1] != '\n' {
        line_start -= 1;
    }
    let mut line_end = end;
    while line_end < chars.len() && chars[line_end] != '\n' {
        line_end += 1;
    }
    let lo = line_start.max(start.saturating_sub(CONTEXT_CHARS));
    let hi = line_end.min(end + CONTEXT_CHARS);
    let flat = |s: &[char]| -> String {
        let text: String = s.iter().map(|c| if c.is_whitespace() { ' ' } else { *c }).collect();
        text.split(' ').filter(|p| !p.is_empty()).collect::<Vec<_>>().join(" ")
    };
    let mut before = flat(&chars[lo..start]);
    let mut after = flat(&chars[end..hi]);
    // keep the single space that separates the match from its neighbours
    if chars[lo..start].last().map_or(false, |c| c.is_whitespace()) && !before.is_empty() {
        before.push(' ');
    }
    if chars[end..hi].first().map_or(false, |c| c.is_whitespace()) && !after.is_empty() {
        after.insert(0, ' ');
    }
    if lo > line_start {
        before.insert(0, '…');
    }
    if hi < line_end {
        after.push('…');
    }
    Preview { before, matched: flat(&chars[start..end]), after }
}

/// Finds `query` (see `clean_query`) in `text`: the whole phrase, else every word of it.
pub fn find_in_text(text: &str, query: &str) -> Option<TextMatch> {
    let chars: Vec<char> = text.chars().collect();
    let q: Vec<char> = query.chars().map(fold).collect();
    if let Some((s, e)) = find_chars(&chars, &q, 0) {
        return Some(TextMatch { preview: preview_of(&chars, s, e), rank: 0 });
    }
    let words: Vec<Vec<char>> = query.split(' ').filter(|w| !w.is_empty()).map(|w| w.chars().map(fold).collect()).collect();
    if words.len() < 2 {
        return None;
    }
    let mut first: Option<(usize, usize)> = None;
    for w in &words {
        let found = find_chars(&chars, w, 0)?;
        first = Some(first.map_or(found, |f: (usize, usize)| if found.0 < f.0 { found } else { f }));
    }
    let (s, e) = first?;
    Some(TextMatch { preview: preview_of(&chars, s, e), rank: 1 })
}

impl DbManager {
    /// Songs whose lyrics contain the words, one hit per song (its best section), best matches first.
    pub fn search_song_lyrics(&self, query: &str, limit: usize) -> Result<Vec<LyricHit>> {
        let Some(q) = clean_query(query) else { return Ok(vec![]) };
        let limit = limit.clamp(1, MAX_HIT_LIMIT);
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT s.id, s.title, ss.id, ss.label, ss.lyrics FROM song_sections ss
             JOIN songs s ON s.id = ss.song_id ORDER BY s.id, ss.sort_order;",
        )?;
        let rows = stmt.query_map([], |r| {
            Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?, r.get::<_, String>(2)?, r.get::<_, String>(3)?, r.get::<_, String>(4)?))
        })?;
        let mut best: Vec<(String, LyricHit)> = Vec::new(); // (title, hit)
        for row in rows {
            let (song_id, title, section_id, label, lyrics) = row?;
            let Some(m) = find_in_text(&lyrics, &q) else { continue };
            let hit = LyricHit { song_id: song_id.clone(), section_id, section_label: label, preview: m.preview, rank: m.rank };
            match best.iter_mut().find(|(_, h)| h.song_id == song_id) {
                Some((_, existing)) if existing.rank <= hit.rank => {} // keep the earlier section when equally good
                Some(slot) => slot.1 = hit,
                None => best.push((title, hit)),
            }
        }
        best.sort_by(|a, b| a.1.rank.cmp(&b.1.rank).then_with(|| a.0.to_lowercase().cmp(&b.0.to_lowercase())));
        best.truncate(limit);
        Ok(best.into_iter().map(|(_, h)| h).collect())
    }

    /// Presentations with a slide whose title or text contains the words, one hit per presentation.
    pub fn search_slide_text(&self, query: &str, limit: usize) -> Result<Vec<SlideHit>> {
        let Some(q) = clean_query(query) else { return Ok(vec![]) };
        let limit = limit.clamp(1, MAX_HIT_LIMIT);
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT p.id, p.title, s.id, s.title, s.body FROM slides s
             JOIN presentations p ON p.id = s.presentation_id ORDER BY p.id, s.sort_order;",
        )?;
        let rows = stmt.query_map([], |r| {
            Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?, r.get::<_, String>(2)?, r.get::<_, String>(3)?, r.get::<_, String>(4)?))
        })?;
        let mut best: Vec<(String, SlideHit)> = Vec::new();
        let (mut current, mut number) = (String::new(), 0);
        for row in rows {
            let (pres_id, title, slide_id, slide_title, body) = row?;
            if pres_id != current {
                current = pres_id.clone();
                number = 0;
            }
            number += 1;
            let text = format!("{}\n{}", slide_title, body);
            let Some(m) = find_in_text(&text, &q) else { continue };
            let hit = SlideHit { presentation_id: pres_id.clone(), slide_id, slide_number: number, preview: m.preview, rank: m.rank };
            match best.iter_mut().find(|(_, h)| h.presentation_id == pres_id) {
                Some((_, existing)) if existing.rank <= hit.rank => {}
                Some(slot) => slot.1 = hit,
                None => best.push((title, hit)),
            }
        }
        best.sort_by(|a, b| a.1.rank.cmp(&b.1.rank).then_with(|| a.0.to_lowercase().cmp(&b.0.to_lowercase())));
        best.truncate(limit);
        Ok(best.into_iter().map(|(_, h)| h).collect())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::{Song, SongSection};

    fn find(text: &str, q: &str) -> Option<(String, String, String, u8)> {
        let q = clean_query(q)?;
        find_in_text(text, &q).map(|m| (m.preview.before, m.preview.matched, m.preview.after, m.rank))
    }

    #[test]
    fn queries_are_cleaned_and_bounded() {
        assert_eq!(clean_query("  amazing   grace "), Some("amazing grace".into()));
        assert_eq!(clean_query("a"), None);
        assert_eq!(clean_query("   "), None);
        assert_eq!(clean_query("ab"), Some("ab".into()));
        assert_eq!(clean_query(&"x".repeat(100)).map(|q| q.len()), Some(100));
        assert_eq!(clean_query(&"x".repeat(101)), None);
        assert_eq!(clean_query("அன்பு"), Some("அன்பு".into())); // counted in characters, not bytes
    }

    #[test]
    fn a_phrase_is_found_ignoring_case_with_the_text_around_it() {
        let (b, m, a, rank) = find("Amazing grace, how sweet the sound", "HOW SWEET").unwrap();
        assert_eq!((b.as_str(), m.as_str(), a.as_str(), rank), ("Amazing grace, ", "how sweet", " the sound", 0));
        let (b, m, a, _) = find("Amazing grace", "amazing").unwrap();
        assert_eq!((b.as_str(), m.as_str(), a.as_str()), ("", "Amazing", " grace"));
    }

    #[test]
    fn a_phrase_can_run_over_a_line_break() {
        let text = "Amazing grace how sweet the sound\nThat saved a wretch like me";
        let (b, m, a, rank) = find(text, "sound that saved").unwrap();
        assert_eq!(rank, 0);
        assert_eq!(m, "sound That saved");
        assert_eq!(b, "Amazing grace how sweet the ");
        assert_eq!(a, " a wretch like me");
    }

    #[test]
    fn only_the_lines_with_the_match_are_shown_and_long_lines_are_cut() {
        let text = "First line\nthe quick brown fox\nLast line";
        let (b, m, a, _) = find(text, "brown").unwrap();
        assert_eq!((b.as_str(), m.as_str(), a.as_str()), ("the quick ", "brown", " fox"));
        let long = format!("{} needle {}", "word ".repeat(30), "tail ".repeat(30));
        let (b, m, a, _) = find(&long, "needle").unwrap();
        assert!(b.starts_with('…') && a.ends_with('…'));
        assert_eq!(m, "needle");
        assert!(b.chars().count() <= CONTEXT_CHARS + 2 && a.chars().count() <= CONTEXT_CHARS + 2);
    }

    #[test]
    fn all_words_in_any_order_is_a_weaker_match() {
        let (b, m, a, rank) = find("Grace was sweet, and the sound was amazing", "sound sweet").unwrap();
        assert_eq!(rank, 1);
        assert_eq!(m, "sweet"); // the earliest of the words
        assert!(b.starts_with("Grace was ") && a.contains("sound"));
        assert!(find("Grace was sweet", "sound sweet").is_none()); // one word is missing
        assert!(find("sweet", "sweet").is_some());
    }

    #[test]
    fn it_works_for_other_scripts_and_cases() {
        let (b, m, _, _) = find("கர்த்தர் என் மேய்ப்பராயிருக்கிறார்\nநான் தாழ்ச்சியடையேன்", "மேய்ப்பர").unwrap();
        assert_eq!((b.as_str(), m.as_str()), ("கர்த்தர் என் ", "மேய்ப்பர"));
        assert!(find("Ünïcode Straße", "ÜNÏCODE").is_some());
        assert!(find("İstanbul", "istanbul").is_none() || find("İstanbul", "istanbul").is_some()); // must not panic
    }

    #[test]
    fn no_match_and_odd_text_do_not_panic() {
        assert!(find("", "grace").is_none());
        assert!(find("grace", "graces").is_none());
        assert!(find("  \n\n  ", "grace").is_none());
        assert!(find("%_\\ grace", "%_").is_some()); // characters that mean something to SQL are plain text here
        assert!(find("a😀b grace", "😀b").is_some());
    }

    fn song(db: &DbManager, title: &str, sections: &[(&str, &str)]) -> Song {
        let now = "2026-01-01T00:00:00Z".to_string();
        let s = db
            .create_song(&Song {
                id: String::new(), title: title.into(), alternate_title: None, language: "English".into(), author: None, composer: None,
                copyright: None, ccli_number: None, song_key: None, tempo: None, tags: vec![], category: "Worship".into(),
                default_theme_id: None, sections_count: 0, created_at: now.clone(), updated_at: now.clone(),
            })
            .unwrap();
        let secs: Vec<SongSection> = sections
            .iter()
            .enumerate()
            .map(|(i, (label, lyrics))| SongSection {
                id: String::new(), song_id: s.id.clone(), section_type: "verse".into(), label: (*label).into(), lyrics: (*lyrics).into(),
                sort_order: i as i32, notes: None, color: None, created_at: now.clone(), updated_at: now.clone(),
            })
            .collect();
        db.save_song_sections(&s.id, &secs).unwrap();
        s
    }

    // The in-memory database already holds a few sample songs, so these tests use words they do not have.

    #[test]
    fn songs_are_found_by_their_lyrics_once_each_with_the_section() {
        let db = DbManager::new_in_memory().unwrap();
        let first = song(&db, "Quokka Song", &[("Verse 1", "The quokka sings loud and clear\nThat zebrafish dance with me"), ("Verse 2", "A quokka at the gate")]);
        let other = song(&db, "Other", &[("Chorus", "Sing of the quokka and of love")]);
        let _none = song(&db, "Nothing", &[("Verse 1", "Totally different words")]);

        let hits = db.search_song_lyrics("quokka", 50).unwrap();
        assert_eq!(hits.len(), 2); // both songs; the first song's two matching sections count once
        let g = hits.iter().find(|h| h.song_id == first.id).unwrap();
        assert_eq!(g.section_label, "Verse 1"); // the earlier section when both match equally
        assert_eq!(g.preview.matched.to_lowercase(), "quokka");
        assert!(hits.iter().any(|h| h.song_id == other.id && h.section_label == "Chorus"));

        // a phrase that runs over two lines
        let phrase = db.search_song_lyrics("clear that zebrafish", 50).unwrap();
        assert_eq!(phrase.len(), 1);
        assert_eq!(phrase[0].song_id, first.id);
    }

    #[test]
    fn the_whole_phrase_beats_having_all_the_words() {
        let db = DbManager::new_in_memory().unwrap();
        let words = song(&db, "Aaa Words Apart", &[("V1", "marmot is the whistle of the sea")]);
        let phrase = song(&db, "Zzz Phrase", &[("V1", "A marmot whistle it is")]);
        // the song with the phrase comes first even though its title sorts last; the other follows as a weaker match
        let hits = db.search_song_lyrics("marmot whistle", 50).unwrap();
        assert_eq!(hits.iter().map(|h| (h.song_id.as_str(), h.rank)).collect::<Vec<_>>(), vec![(phrase.id.as_str(), 0), (words.id.as_str(), 1)]);
        // the words the other way round are in neither song as a phrase
        let hits = db.search_song_lyrics("whistle marmot", 50).unwrap();
        assert_eq!(hits.len(), 2);
        assert!(hits.iter().all(|h| h.rank == 1));
    }

    #[test]
    fn a_better_later_section_replaces_a_weaker_earlier_one() {
        let db = DbManager::new_in_memory().unwrap();
        let s = song(&db, "Mixed", &[("V1", "the whistle was marmot"), ("V2", "a marmot whistle rang out")]);
        let hits = db.search_song_lyrics("marmot whistle", 50).unwrap();
        assert_eq!(hits.len(), 1);
        assert_eq!((hits[0].song_id.as_str(), hits[0].section_label.as_str(), hits[0].rank), (s.id.as_str(), "V2", 0));
    }

    #[test]
    fn short_or_missing_queries_and_limits_are_safe() {
        let db = DbManager::new_in_memory().unwrap();
        let before = db.list_songs(None, None, None).unwrap().len();
        for i in 0..5 {
            song(&db, &format!("Song {i}"), &[("V1", "xylophone shared words here")]);
        }
        assert!(db.search_song_lyrics("", 10).unwrap().is_empty());
        assert!(db.search_song_lyrics("s", 10).unwrap().is_empty());
        assert_eq!(db.search_song_lyrics("xylophone", 3).unwrap().len(), 3);
        assert_eq!(db.search_song_lyrics("xylophone", 0).unwrap().len(), 1); // at least one
        assert_eq!(db.search_song_lyrics("xylophone", 1000).unwrap().len(), 5);
        for hostile in ["'; DROP TABLE songs;--", "%%", "_", "\\", "\u{0}x"] {
            assert!(db.search_song_lyrics(hostile, 10).is_ok(), "{hostile:?}");
        }
        assert_eq!(db.list_songs(None, None, None).unwrap().len(), before + 5); // nothing was dropped
    }

    #[test]
    fn slide_text_is_found_with_the_slide_number() {
        let db = DbManager::new_in_memory().unwrap();
        let pres = db.create_presentation("Sermon", "Sermon", None).unwrap();
        for (title, body) in [("Intro", "Welcome everyone"), ("Point one", "Grace is a gift\nnot a wage"), ("Point two", "Grace again")] {
            db.create_slide(&crate::models::Slide {
                id: String::new(), presentation_id: pres.id.clone(), sort_order: -1, title: title.into(), body: body.into(),
                background_color: "#000000".into(), foreground_color: "#ffffff".into(), font_size: "large".into(),
                text_alignment: "center".into(), theme_override: None, background_image: None, overlay_color: None,
                line_spacing: None, text_shadow: None, vertical_alignment: None, font_family: None, font_weight: None,
                group_label: None, group_color: None, layout: None, created_at: String::new(), updated_at: String::new(),
            })
            .unwrap();
        }
        let hits = db.search_slide_text("grace", 50).unwrap();
        let mine: Vec<_> = hits.iter().filter(|h| h.presentation_id == pres.id).collect();
        assert_eq!(mine.len(), 1); // one hit per presentation, its first matching slide
        assert_eq!(mine[0].slide_number, 2);
        assert_eq!(mine[0].preview.matched, "Grace");
        // the slide title is searched too
        let by_title = db.search_slide_text("point two", 50).unwrap();
        assert_eq!(by_title.iter().find(|h| h.presentation_id == pres.id).unwrap().slide_number, 3);
        assert!(db.search_slide_text("zzzznotthere", 50).unwrap().is_empty());
    }
}
