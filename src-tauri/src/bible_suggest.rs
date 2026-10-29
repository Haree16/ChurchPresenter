//! Reference suggestions while typing in the Bible lookup box ("jo", "ps 2", "john 3:1"), built from
//! the verses that are actually imported, so a book, chapter or verse that does not exist is never offered.

use crate::db::{resolve_book_number, DbManager};
use rusqlite::{params, Result};
use serde::{Deserialize, Serialize};

pub const DEFAULT_SUGGESTION_LIMIT: usize = 8;
pub const MAX_SUGGESTION_LIMIT: usize = 20;
/// Longest input considered; anything longer is not a reference.
const MAX_INPUT_CHARS: usize = 60;
/// Most chapters or verses offered for one typed prefix of a number.
const MAX_NUMBER_CHOICES: usize = 5;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BibleSuggestion {
    /// What to put in the box when chosen, e.g. `John 3:16-17`.
    pub label: String,
    /// The book as stored for this translation.
    pub book: String,
    pub book_number: i32,
    pub chapter: Option<i32>,
    pub start_verse: Option<i32>,
    pub end_verse: Option<i32>,
}

/// A reference typed so far: the book text and any numbers after it.
#[derive(Debug, Clone, PartialEq)]
pub struct PartialReference {
    pub book: String,
    pub chapter: Option<i32>,
    /// A `:` was typed, so verses are being chosen.
    pub in_verse: bool,
    pub start_verse: Option<i32>,
    /// A `-` was typed after the first verse.
    pub in_range: bool,
    pub end_verse: Option<i32>,
}

fn is_letter(c: char) -> bool {
    c.is_alphabetic() || ('\u{0B80}'..='\u{0BFF}').contains(&c)
}

/// Splits `input` into book text and numbers. Returns None when it cannot be a reference.
pub fn split_partial_reference(input: &str) -> Option<PartialReference> {
    let s = input.trim();
    if s.is_empty() || s.chars().count() > MAX_INPUT_CHARS {
        return None;
    }
    // the book ends after the last letter; a leading "1 " in "1 john" is part of the book
    let end = s.char_indices().filter(|(_, c)| is_letter(*c)).map(|(i, c)| i + c.len_utf8()).last()?;
    let book = s[..end].trim().trim_end_matches('.').trim().to_string();
    let tail = s[end..].trim_start_matches(|c: char| c == '.' || c.is_whitespace());
    let mut out = PartialReference { book, chapter: None, in_verse: false, start_verse: None, in_range: false, end_verse: None };
    if tail.is_empty() {
        return Some(out);
    }
    let tail = tail.replace('.', ":").replace('–', "-").replace('—', "-");
    let (chapter_text, verse_text) = match tail.split_once(':') {
        Some((c, v)) => (c.trim(), Some(v.trim())),
        None => (tail.trim(), None),
    };
    out.chapter = Some(chapter_text.parse().ok().filter(|n| *n > 0)?);
    if let Some(v) = verse_text {
        out.in_verse = true;
        let (start_text, end_text) = match v.split_once('-') {
            Some((a, b)) => (a.trim(), Some(b.trim())),
            None => (v, None),
        };
        if !start_text.is_empty() {
            out.start_verse = Some(start_text.parse().ok().filter(|n| *n > 0)?);
        }
        if let Some(e) = end_text {
            out.in_range = true;
            if !e.is_empty() {
                out.end_verse = Some(e.parse().ok().filter(|n| *n > 0)?);
            }
        }
    }
    Some(out)
}

fn squash(s: &str) -> String {
    s.chars().filter(|c| !c.is_whitespace() && *c != '.').flat_map(|c| c.to_lowercase()).collect()
}

/// Numbers from `available` whose digits start with `typed`, smallest first (typing 1 offers 1, 10, 11 ...).
fn numbers_starting_with(typed: i32, available: &[i32]) -> Vec<i32> {
    let prefix = typed.to_string();
    available.iter().copied().filter(|n| n.to_string().starts_with(&prefix)).take(MAX_NUMBER_CHOICES).collect()
}

struct BookInfo {
    number: i32,
    name: String,
    /// The chapters that have verses imported, in order (a partial import can have gaps).
    chapters: Vec<i32>,
}

impl DbManager {
    fn bible_books_for(&self, translation: &str) -> Result<Vec<BookInfo>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT book_number, MIN(book), chapter FROM bible_verses
             WHERE LOWER(translation) = LOWER(?1) GROUP BY book_number, chapter ORDER BY book_number, chapter;",
        )?;
        let rows = stmt.query_map(params![translation], |r| Ok((r.get::<_, i32>(0)?, r.get::<_, String>(1)?, r.get::<_, i32>(2)?)))?;
        let mut books: Vec<BookInfo> = Vec::new();
        for row in rows {
            let (number, name, chapter) = row?;
            match books.last_mut() {
                Some(b) if b.number == number => b.chapters.push(chapter),
                _ => books.push(BookInfo { number, name, chapters: vec![chapter] }),
            }
        }
        Ok(books)
    }

    /// The verse numbers that exist in a chapter, in order.
    fn bible_verses_in_chapter(&self, translation: &str, book_number: i32, chapter: i32) -> Result<Vec<i32>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT DISTINCT verse FROM bible_verses WHERE LOWER(translation) = LOWER(?1) AND book_number = ?2 AND chapter = ?3 ORDER BY verse;",
        )?;
        let rows = stmt.query_map(params![translation, book_number, chapter], |r| r.get(0))?;
        rows.collect()
    }

    /// Suggestions for what is typed so far, from the books, chapters and verses imported for `translation`.
    pub fn suggest_bible_references(&self, input: &str, translation: &str, limit: usize) -> Result<Vec<BibleSuggestion>> {
        let limit = limit.clamp(1, MAX_SUGGESTION_LIMIT);
        let Some(partial) = split_partial_reference(input) else { return Ok(vec![]) };
        let typed = squash(&partial.book);
        if typed.is_empty() {
            return Ok(vec![]);
        }
        let alias = resolve_book_number(&partial.book).map(|n| n as i32);
        // "John " (a space after the book) means the book is chosen and a chapter comes next
        let after_space = input.ends_with(|c: char| c.is_whitespace());

        let mut out: Vec<BibleSuggestion> = Vec::new();
        for book in self.bible_books_for(translation)? {
            if out.len() >= limit {
                break;
            }
            // a name that starts with what was typed ("jo" -> John, Job), or an abbreviation ("jn", "ps")
            if !(squash(&book.name).starts_with(&typed) || alias == Some(book.number)) {
                continue;
            }
            let make = |label: String, chapter: Option<i32>, start: Option<i32>, end: Option<i32>| BibleSuggestion {
                label,
                book: book.name.clone(),
                book_number: book.number,
                chapter,
                start_verse: start,
                end_verse: end,
            };

            let Some(chapter) = partial.chapter else {
                if after_space {
                    for c in book.chapters.iter().copied().take(MAX_NUMBER_CHOICES) {
                        out.push(make(format!("{} {}", book.name, c), Some(c), None, None));
                    }
                } else {
                    out.push(make(book.name.clone(), None, None, None));
                }
                continue;
            };
            if !partial.in_verse {
                for c in numbers_starting_with(chapter, &book.chapters) {
                    out.push(make(format!("{} {}", book.name, c), Some(c), None, None));
                }
                continue;
            }
            if !book.chapters.contains(&chapter) {
                continue;
            }

            let verses = self.bible_verses_in_chapter(translation, book.number, chapter)?;
            match (partial.start_verse, partial.in_range, partial.end_verse) {
                (None, _, _) => {
                    for v in verses.iter().copied().take(MAX_NUMBER_CHOICES) {
                        out.push(make(format!("{} {}:{}", book.name, chapter, v), Some(chapter), Some(v), Some(v)));
                    }
                }
                (Some(start), false, _) => {
                    for v in numbers_starting_with(start, &verses) {
                        out.push(make(format!("{} {}:{}", book.name, chapter, v), Some(chapter), Some(v), Some(v)));
                    }
                }
                (Some(start), true, None) => {
                    // "john 3:16-" offers the end of the range
                    if verses.contains(&start) {
                        for v in verses.iter().copied().filter(|v| *v >= start).take(MAX_NUMBER_CHOICES) {
                            out.push(make(format!("{} {}:{}-{}", book.name, chapter, start, v), Some(chapter), Some(start), Some(v)));
                        }
                    }
                }
                (Some(start), true, Some(end)) => {
                    if start <= end && verses.contains(&start) && verses.contains(&end) {
                        out.push(make(format!("{} {}:{}-{}", book.name, chapter, start, end), Some(chapter), Some(start), Some(end)));
                    }
                }
            }
        }
        out.truncate(limit);
        Ok(out)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::BibleVerse;

    fn verse(translation: &str, book: &str, number: i32, chapter: i32, verse: i32) -> BibleVerse {
        BibleVerse {
            id: format!("{translation}-{number}-{chapter}-{verse}"),
            translation: translation.into(),
            book: book.into(),
            book_number: number,
            chapter,
            verse,
            text: "text".into(),
        }
    }

    /// John (3 chapters of 5, 8 and 36 verses), Job, Joel, Psalms (2 chapters of 6 verses), 1 John (1 chapter of 4).
    fn db_with_books() -> DbManager {
        let db = DbManager::new_in_memory().unwrap();
        let mut vs = Vec::new();
        for (name, num, chapters) in [
            ("John", 43, vec![5, 8, 36]),
            ("Job", 18, vec![3]),
            ("Joel", 29, vec![2]),
            ("Psalms", 19, vec![6, 6]),
            ("1 John", 62, vec![4]),
        ] {
            for (c, count) in chapters.iter().enumerate() {
                for v in 1..=*count {
                    vs.push(verse("TST", name, num, c as i32 + 1, v));
                }
            }
        }
        db.import_bible_verses(&vs).unwrap();
        db
    }

    fn labels(db: &DbManager, input: &str) -> Vec<String> {
        db.suggest_bible_references(input, "TST", 20).unwrap().into_iter().map(|s| s.label).collect()
    }

    #[test]
    fn splits_what_is_typed_into_book_and_numbers() {
        let p = |s: &str| split_partial_reference(s).unwrap();
        assert_eq!(p("jo").book, "jo");
        assert_eq!(p("1 john").book, "1 john");
        assert_eq!(p("Jn. 3").chapter, Some(3));
        let full = p("john 3:16-17");
        assert_eq!((full.chapter, full.start_verse, full.end_verse, full.in_verse, full.in_range), (Some(3), Some(16), Some(17), true, true));
        let open_range = p("john 3:16-");
        assert!(open_range.in_range && open_range.end_verse.is_none());
        let colon = p("john 3:");
        assert!(colon.in_verse && colon.start_verse.is_none());
        assert_eq!(p("jn 3.16").start_verse, Some(16));
        assert_eq!(p("யோவான் 3").chapter, Some(3));
        assert_eq!(p("john 3:16–17").end_verse, Some(17)); // en dash
        // not a reference at all: no letters, empty, too long, or a number that is not a positive whole number
        for bad in ["", "   ", "123", "john 0", "john 3:0", "john 3:16-17-18", "john 99999999999", &"a".repeat(61)] {
            assert_eq!(split_partial_reference(bad), None, "{bad:?}");
        }
    }

    #[test]
    fn books_are_matched_by_name_prefix_or_abbreviation() {
        let db = db_with_books();
        assert_eq!(labels(&db, "jo"), vec!["Job", "Joel", "John"]); // in book order; "1 John" does not start with "jo"
        assert_eq!(labels(&db, "joh"), vec!["John"]);
        assert_eq!(labels(&db, "jn"), vec!["John"]); // abbreviation
        assert_eq!(labels(&db, "ps"), vec!["Psalms"]);
        assert_eq!(labels(&db, "1 jo"), vec!["1 John"]);
        assert_eq!(labels(&db, "1jn"), vec!["1 John"]);
        assert_eq!(labels(&db, "JOHN"), vec!["John"]); // case does not matter
        assert!(labels(&db, "zzz").is_empty());
        assert!(labels(&db, "").is_empty());
    }

    #[test]
    fn a_space_after_the_book_offers_its_first_chapters() {
        let db = db_with_books();
        assert_eq!(labels(&db, "john"), vec!["John"]);
        assert_eq!(labels(&db, "john "), vec!["John 1", "John 2", "John 3"]);
        assert_eq!(labels(&db, "ps "), vec!["Psalms 1", "Psalms 2"]);
        assert_eq!(labels(&db, "jo "), vec!["Job 1", "Joel 1", "John 1", "John 2", "John 3"]);
        let first = &db.suggest_bible_references("john ", "TST", 8).unwrap()[0];
        assert_eq!((first.chapter, first.start_verse), (Some(1), None));
    }

    #[test]
    fn only_books_that_are_imported_are_offered() {
        let db = db_with_books();
        // Genesis has an abbreviation but no verses in this translation
        assert!(labels(&db, "gen").is_empty());
        // a translation with nothing imported offers nothing
        assert!(db.suggest_bible_references("jo", "Missing", 8).unwrap().is_empty());
        // the translation name is case-insensitive
        assert_eq!(db.suggest_bible_references("jn", "tst", 8).unwrap().len(), 1);
    }

    #[test]
    fn chapters_come_from_the_imported_verses() {
        let db = db_with_books();
        assert_eq!(labels(&db, "john 2"), vec!["John 2"]);
        assert_eq!(labels(&db, "john 1"), vec!["John 1"]); // John has 3 chapters, so no 10-19
        assert!(labels(&db, "john 4").is_empty()); // there is no chapter 4
        assert_eq!(labels(&db, "ps 1"), vec!["Psalms 1"]);
        let many = DbManager::new_in_memory().unwrap();
        let vs: Vec<_> = (1..=25).map(|c| verse("TST", "Psalms", 19, c, 1)).collect();
        many.import_bible_verses(&vs).unwrap();
        // typing 1 offers 1, 10, 11, 12, 13 (the first few chapters starting with 1)
        assert_eq!(labels(&many, "ps 1"), vec!["Psalms 1", "Psalms 10", "Psalms 11", "Psalms 12", "Psalms 13"]);
        assert_eq!(labels(&many, "ps 2"), vec!["Psalms 2", "Psalms 20", "Psalms 21", "Psalms 22", "Psalms 23"]);
    }

    #[test]
    fn verses_are_limited_to_the_chapter_length() {
        let db = db_with_books();
        assert_eq!(labels(&db, "john 1:"), vec!["John 1:1", "John 1:2", "John 1:3", "John 1:4", "John 1:5"]);
        assert_eq!(labels(&db, "john 1:3"), vec!["John 1:3"]);
        assert!(labels(&db, "john 1:6").is_empty()); // chapter 1 has 5 verses
        assert_eq!(labels(&db, "john 3:3"), vec!["John 3:3", "John 3:30", "John 3:31", "John 3:32", "John 3:33"]);
    }

    #[test]
    fn ranges_must_stay_inside_the_chapter() {
        let db = db_with_books();
        assert_eq!(labels(&db, "john 3:16-17"), vec!["John 3:16-17"]);
        assert!(labels(&db, "john 3:17-16").is_empty()); // backwards
        assert!(labels(&db, "john 3:30-40").is_empty()); // past the 36th verse
        assert_eq!(labels(&db, "john 1:2-"), vec!["John 1:2-2", "John 1:2-3", "John 1:2-4", "John 1:2-5"]);
        let first = &db.suggest_bible_references("john 3:16-17", "TST", 8).unwrap()[0];
        assert_eq!((first.chapter, first.start_verse, first.end_verse, first.book_number), (Some(3), Some(16), Some(17), 43));
    }

    #[test]
    fn a_partial_import_only_offers_what_it_has() {
        let db = DbManager::new_in_memory().unwrap();
        // John 3:16-18 and Psalms 23:1, 23:4 and 100:1 only, like a small sample
        let vs = [(43, "John", 3, 16), (43, "John", 3, 17), (43, "John", 3, 18), (19, "Psalms", 23, 1), (19, "Psalms", 23, 4), (19, "Psalms", 100, 1)]
            .map(|(n, b, c, v)| verse("TST", b, n, c, v));
        db.import_bible_verses(&vs).unwrap();
        assert_eq!(labels(&db, "john 3:"), vec!["John 3:16", "John 3:17", "John 3:18"]);
        assert_eq!(labels(&db, "john 3:1"), vec!["John 3:16", "John 3:17", "John 3:18"]); // no 1, 10-15
        assert!(labels(&db, "john 3:2").is_empty());
        assert!(labels(&db, "john 2").is_empty()); // only chapter 3 is there
        assert!(labels(&db, "john 2:1").is_empty());
        assert_eq!(labels(&db, "john 3"), vec!["John 3"]);
        assert_eq!(labels(&db, "john "), vec!["John 3"]);
        assert_eq!(labels(&db, "ps 2"), vec!["Psalms 23"]);
        assert_eq!(labels(&db, "ps 1"), vec!["Psalms 100"]);
        assert_eq!(labels(&db, "ps 23:"), vec!["Psalms 23:1", "Psalms 23:4"]); // a gap between them
        assert_eq!(labels(&db, "john 3:16-"), vec!["John 3:16-16", "John 3:16-17", "John 3:16-18"]);
        assert_eq!(labels(&db, "john 3:16-18"), vec!["John 3:16-18"]);
        assert!(labels(&db, "john 3:16-19").is_empty());
        assert_eq!(labels(&db, "ps 23:1-4"), vec!["Psalms 23:1-4"]); // both ends exist
        assert!(labels(&db, "ps 23:1-3").is_empty()); // verse 3 is not imported
    }

    #[test]
    fn the_limit_applies_and_is_kept_in_range() {
        let db = db_with_books();
        assert_eq!(db.suggest_bible_references("jo", "TST", 2).unwrap().len(), 2);
        assert_eq!(db.suggest_bible_references("jo", "TST", 0).unwrap().len(), 1); // at least one
        assert!(db.suggest_bible_references("john 3:", "TST", 1000).unwrap().len() <= MAX_SUGGESTION_LIMIT);
    }

    #[test]
    fn abbreviations_find_books_in_any_language() {
        let db = DbManager::new_in_memory().unwrap();
        db.import_bible_verses(&[verse("Tamil", "யோவான்", 43, 3, 16), verse("Tamil", "சங்கீதம்", 19, 23, 1)]).unwrap();
        let got = db.suggest_bible_references("jn 3", "Tamil", 8).unwrap();
        assert_eq!(got.len(), 1);
        assert_eq!(got[0].label, "யோவான் 3");
        assert_eq!(db.suggest_bible_references("ps", "Tamil", 8).unwrap()[0].label, "சங்கீதம்");
        assert_eq!(db.suggest_bible_references("யோவ", "Tamil", 8).unwrap()[0].label, "யோவான்"); // name prefix
    }

    #[test]
    fn hostile_input_returns_nothing_instead_of_failing() {
        let db = db_with_books();
        let before = db.list_bible_translations().unwrap().len();
        for bad in ["'; DROP TABLE bible_verses;--", "%", "john 3:99999999999", "john 99999999999", "\u{0}", "john 3:16-17-18"] {
            assert!(db.suggest_bible_references(bad, "TST", 8).is_ok(), "{bad:?}");
        }
        assert_eq!(db.list_bible_translations().unwrap().len(), before); // the table is still there
    }
}
