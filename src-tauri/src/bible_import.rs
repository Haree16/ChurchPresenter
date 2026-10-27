//! Bible text importers: USFM, OSIS, Zefania XML and JSON.
//!
//! Every parser returns verses with a canonical `book_number` (1..=66) so that
//! lookups by reference work regardless of the source's own book naming.

use crate::db::resolve_book_number;
use crate::models::BibleVerse;

/// (book number, English name, USFM id, OSIS id)
const BOOKS: [(i32, &str, &str, &str); 66] = [
    (1, "Genesis", "GEN", "Gen"),
    (2, "Exodus", "EXO", "Exod"),
    (3, "Leviticus", "LEV", "Lev"),
    (4, "Numbers", "NUM", "Num"),
    (5, "Deuteronomy", "DEU", "Deut"),
    (6, "Joshua", "JOS", "Josh"),
    (7, "Judges", "JDG", "Judg"),
    (8, "Ruth", "RUT", "Ruth"),
    (9, "1 Samuel", "1SA", "1Sam"),
    (10, "2 Samuel", "2SA", "2Sam"),
    (11, "1 Kings", "1KI", "1Kgs"),
    (12, "2 Kings", "2KI", "2Kgs"),
    (13, "1 Chronicles", "1CH", "1Chr"),
    (14, "2 Chronicles", "2CH", "2Chr"),
    (15, "Ezra", "EZR", "Ezra"),
    (16, "Nehemiah", "NEH", "Neh"),
    (17, "Esther", "EST", "Esth"),
    (18, "Job", "JOB", "Job"),
    (19, "Psalms", "PSA", "Ps"),
    (20, "Proverbs", "PRO", "Prov"),
    (21, "Ecclesiastes", "ECC", "Eccl"),
    (22, "Song of Solomon", "SNG", "Song"),
    (23, "Isaiah", "ISA", "Isa"),
    (24, "Jeremiah", "JER", "Jer"),
    (25, "Lamentations", "LAM", "Lam"),
    (26, "Ezekiel", "EZK", "Ezek"),
    (27, "Daniel", "DAN", "Dan"),
    (28, "Hosea", "HOS", "Hos"),
    (29, "Joel", "JOL", "Joel"),
    (30, "Amos", "AMO", "Amos"),
    (31, "Obadiah", "OBA", "Obad"),
    (32, "Jonah", "JON", "Jonah"),
    (33, "Micah", "MIC", "Mic"),
    (34, "Nahum", "NAM", "Nah"),
    (35, "Habakkuk", "HAB", "Hab"),
    (36, "Zephaniah", "ZEP", "Zeph"),
    (37, "Haggai", "HAG", "Hag"),
    (38, "Zechariah", "ZEC", "Zech"),
    (39, "Malachi", "MAL", "Mal"),
    (40, "Matthew", "MAT", "Matt"),
    (41, "Mark", "MRK", "Mark"),
    (42, "Luke", "LUK", "Luke"),
    (43, "John", "JHN", "John"),
    (44, "Acts", "ACT", "Acts"),
    (45, "Romans", "ROM", "Rom"),
    (46, "1 Corinthians", "1CO", "1Cor"),
    (47, "2 Corinthians", "2CO", "2Cor"),
    (48, "Galatians", "GAL", "Gal"),
    (49, "Ephesians", "EPH", "Eph"),
    (50, "Philippians", "PHP", "Phil"),
    (51, "Colossians", "COL", "Col"),
    (52, "1 Thessalonians", "1TH", "1Thess"),
    (53, "2 Thessalonians", "2TH", "2Thess"),
    (54, "1 Timothy", "1TI", "1Tim"),
    (55, "2 Timothy", "2TI", "2Tim"),
    (56, "Titus", "TIT", "Titus"),
    (57, "Philemon", "PHM", "Phlm"),
    (58, "Hebrews", "HEB", "Heb"),
    (59, "James", "JAS", "Jas"),
    (60, "1 Peter", "1PE", "1Pet"),
    (61, "2 Peter", "2PE", "2Pet"),
    (62, "1 John", "1JN", "1John"),
    (63, "2 John", "2JN", "2John"),
    (64, "3 John", "3JN", "3John"),
    (65, "Jude", "JUD", "Jude"),
    (66, "Revelation", "REV", "Rev"),
];

pub fn book_name(number: i32) -> Option<&'static str> {
    BOOKS.iter().find(|b| b.0 == number).map(|b| b.1)
}

fn book_by_usfm(code: &str) -> Option<(i32, &'static str)> {
    BOOKS
        .iter()
        .find(|b| b.2.eq_ignore_ascii_case(code))
        .map(|b| (b.0, b.1))
}

fn book_by_osis(code: &str) -> Option<(i32, &'static str)> {
    BOOKS
        .iter()
        .find(|b| b.3.eq_ignore_ascii_case(code))
        .map(|b| (b.0, b.1))
}

fn make_verse(translation: &str, book_number: i32, book: &str, chapter: i32, verse: i32, text: &str) -> BibleVerse {
    BibleVerse {
        id: format!("{}-{}-{}-{}", translation, book_number, chapter, verse),
        translation: translation.to_string(),
        book: book.to_string(),
        book_number,
        chapter,
        verse,
        text: text.to_string(),
    }
}

fn collapse_ws(s: &str) -> String {
    s.split_whitespace().collect::<Vec<_>>().join(" ")
}

/// Detects the format of `raw` and parses it. Returns an error naming the problem
/// when the format is unrecognised or yields no verses.
pub fn parse_bible_text(raw: &str, translation: &str) -> Result<Vec<BibleVerse>, String> {
    let trimmed = raw.trim_start_matches('\u{feff}').trim();
    if trimmed.is_empty() {
        return Err("The file is empty.".to_string());
    }
    let lower_head: String = trimmed.chars().take(4000).collect::<String>().to_lowercase();

    let verses = if trimmed.starts_with('[') || trimmed.starts_with('{') {
        parse_json(trimmed, translation)?
    } else if lower_head.contains("<xmlbible") {
        parse_zefania(trimmed, translation)
    } else if lower_head.contains("<osis") {
        parse_osis(trimmed, translation)
    } else if trimmed.contains("\\c ") || trimmed.contains("\\v ") || trimmed.contains("\\id ") {
        parse_usfm(trimmed, translation)
    } else {
        return Err("Unrecognised Bible format. Supported: USFM, OSIS, Zefania XML, JSON.".to_string());
    };

    if verses.is_empty() {
        return Err("No verses were found in the file.".to_string());
    }
    Ok(verses)
}

// ---------------------------------------------------------------- JSON

fn parse_json(raw: &str, translation: &str) -> Result<Vec<BibleVerse>, String> {
    let value: serde_json::Value =
        serde_json::from_str(raw).map_err(|e| format!("Invalid JSON: {}", e))?;

    // The translation name chosen by the user always wins over any name inside the file.
    let tr = translation;

    let mut out = Vec::new();

    // Flat list: [{book, chapter, verse, text}] or {verses: [...]}
    let flat = if value.is_array() {
        value.as_array()
    } else {
        value.get("verses").and_then(|v| v.as_array())
    };
    if let Some(list) = flat {
        for item in list {
            let book_str = item.get("book").and_then(|b| b.as_str()).unwrap_or("");
            let num = item
                .get("bookNumber")
                .or_else(|| item.get("book_number"))
                .and_then(|n| n.as_i64())
                .map(|n| n as i32)
                .or_else(|| resolve_book_number(book_str).map(|n| n as i32));
            let chapter = item.get("chapter").and_then(|c| c.as_i64());
            let verse = item.get("verse").and_then(|v| v.as_i64());
            let text = item.get("text").and_then(|t| t.as_str());
            if let (Some(num), Some(chapter), Some(verse), Some(text)) = (num, chapter, verse, text) {
                let name = book_name(num).unwrap_or(book_str);
                out.push(make_verse(tr, num, name, chapter as i32, verse as i32, text.trim()));
            }
        }
        return Ok(out);
    }

    // Nested: {books: [{name, chapters: [{chapter, verses: [{verse, text}]}]}]}
    if let Some(books) = value.get("books").and_then(|b| b.as_array()) {
        for (bi, b) in books.iter().enumerate() {
            let name = b.get("name").and_then(|n| n.as_str()).unwrap_or("");
            let num = resolve_book_number(name).map(|n| n as i32).unwrap_or(bi as i32 + 1);
            let canon = book_name(num).unwrap_or(name);
            let chapters = b.get("chapters").and_then(|c| c.as_array()).cloned().unwrap_or_default();
            for (ci, c) in chapters.iter().enumerate() {
                let chap_no = c.get("chapter").and_then(|n| n.as_i64()).unwrap_or(ci as i64 + 1) as i32;
                let verses = c.get("verses").and_then(|v| v.as_array()).cloned().unwrap_or_default();
                for (vi, v) in verses.iter().enumerate() {
                    let vno = v.get("verse").and_then(|n| n.as_i64()).unwrap_or(vi as i64 + 1) as i32;
                    if let Some(text) = v.get("text").and_then(|t| t.as_str()) {
                        out.push(make_verse(tr, num, canon, chap_no, vno, text.trim()));
                    }
                }
            }
        }
        return Ok(out);
    }

    Err("JSON must be a verse list, {\"verses\": [...]} or {\"books\": [...]}.".to_string())
}

// ---------------------------------------------------------------- XML

#[derive(Debug)]
enum Tok {
    Open { name: String, attrs: Vec<(String, String)>, self_close: bool },
    Close(String),
    Text(String),
}

fn decode_entities(s: &str) -> String {
    if !s.contains('&') {
        return s.to_string();
    }
    let mut out = String::with_capacity(s.len());
    let mut rest = s;
    while let Some(pos) = rest.find('&') {
        out.push_str(&rest[..pos]);
        let after = &rest[pos + 1..];
        if let Some(end) = after.find(';').filter(|e| *e <= 8) {
            let ent = &after[..end];
            let rep = match ent {
                "amp" => Some('&'),
                "lt" => Some('<'),
                "gt" => Some('>'),
                "quot" => Some('"'),
                "apos" => Some('\''),
                _ if ent.starts_with("#x") || ent.starts_with("#X") => {
                    u32::from_str_radix(&ent[2..], 16).ok().and_then(char::from_u32)
                }
                _ if ent.starts_with('#') => ent[1..].parse::<u32>().ok().and_then(char::from_u32),
                _ => None,
            };
            if let Some(c) = rep {
                out.push(c);
                rest = &after[end + 1..];
                continue;
            }
        }
        out.push('&');
        rest = after;
    }
    out.push_str(rest);
    out
}

fn parse_attrs(s: &str) -> Vec<(String, String)> {
    let mut attrs = Vec::new();
    let chars: Vec<char> = s.chars().collect();
    let mut i = 0;
    while i < chars.len() {
        while i < chars.len() && (chars[i].is_whitespace() || chars[i] == '/') {
            i += 1;
        }
        let start = i;
        while i < chars.len() && chars[i] != '=' && !chars[i].is_whitespace() && chars[i] != '/' {
            i += 1;
        }
        if start == i {
            break;
        }
        let key: String = chars[start..i].iter().collect();
        while i < chars.len() && chars[i].is_whitespace() {
            i += 1;
        }
        if i < chars.len() && chars[i] == '=' {
            i += 1;
            while i < chars.len() && chars[i].is_whitespace() {
                i += 1;
            }
            if i < chars.len() && (chars[i] == '"' || chars[i] == '\'') {
                let q = chars[i];
                i += 1;
                let vs = i;
                while i < chars.len() && chars[i] != q {
                    i += 1;
                }
                let val: String = chars[vs..i].iter().collect();
                i += 1;
                attrs.push((key.to_lowercase(), decode_entities(&val)));
            }
        }
    }
    attrs
}

fn tokenize_xml(s: &str) -> Vec<Tok> {
    let mut toks = Vec::new();
    let mut rest = s;
    while !rest.is_empty() {
        match rest.find('<') {
            None => {
                toks.push(Tok::Text(decode_entities(rest)));
                break;
            }
            Some(0) => {
                if rest.starts_with("<!--") {
                    rest = rest.find("-->").map(|e| &rest[e + 3..]).unwrap_or("");
                    continue;
                }
                if rest.starts_with("<![CDATA[") {
                    if let Some(e) = rest.find("]]>") {
                        toks.push(Tok::Text(rest[9..e].to_string()));
                        rest = &rest[e + 3..];
                        continue;
                    }
                    break;
                }
                let end = match rest.find('>') {
                    Some(e) => e,
                    None => break,
                };
                let inner = &rest[1..end];
                rest = &rest[end + 1..];
                if inner.starts_with('?') || inner.starts_with('!') {
                    continue;
                }
                if let Some(name) = inner.strip_prefix('/') {
                    toks.push(Tok::Close(name.trim().to_lowercase()));
                    continue;
                }
                let self_close = inner.ends_with('/');
                let inner = inner.trim_end_matches('/');
                let name_end = inner.find(|c: char| c.is_whitespace()).unwrap_or(inner.len());
                toks.push(Tok::Open {
                    name: inner[..name_end].to_lowercase(),
                    attrs: parse_attrs(&inner[name_end..]),
                    self_close,
                });
            }
            Some(pos) => {
                toks.push(Tok::Text(decode_entities(&rest[..pos])));
                rest = &rest[pos..];
            }
        }
    }
    toks
}

fn attr<'a>(attrs: &'a [(String, String)], key: &str) -> Option<&'a str> {
    attrs.iter().find(|(k, _)| k == key).map(|(_, v)| v.as_str())
}

fn parse_zefania(raw: &str, translation: &str) -> Vec<BibleVerse> {
    let mut out = Vec::new();
    let mut book: Option<(i32, String)> = None;
    let mut chapter = 0;
    let mut verse: Option<i32> = None;
    let mut buf = String::new();
    let mut note_depth = 0;
    let mut seq_book = 0;

    let flush = |book: &Option<(i32, String)>, chapter: i32, verse: &mut Option<i32>, buf: &mut String, out: &mut Vec<BibleVerse>| {
        if let (Some(v), Some((num, name))) = (verse.take(), book.as_ref()) {
            let text = collapse_ws(buf);
            if !text.is_empty() && chapter > 0 {
                out.push(make_verse(translation, *num, name, chapter, v, &text));
            }
        }
        buf.clear();
    };

    for tok in tokenize_xml(raw) {
        match tok {
            Tok::Open { name, attrs, .. } => match name.as_str() {
                "biblebook" => {
                    seq_book += 1;
                    let bname = attr(&attrs, "bname").unwrap_or("").to_string();
                    let num = attr(&attrs, "bnumber")
                        .and_then(|n| n.parse::<i32>().ok())
                        .or_else(|| resolve_book_number(&bname).map(|n| n as i32))
                        .unwrap_or(seq_book);
                    let display = if bname.is_empty() {
                        book_name(num).unwrap_or("").to_string()
                    } else {
                        bname
                    };
                    book = Some((num, display));
                }
                "chapter" => {
                    chapter = attr(&attrs, "cnumber").and_then(|n| n.parse().ok()).unwrap_or(chapter + 1);
                }
                "vers" => {
                    flush(&book, chapter, &mut verse, &mut buf, &mut out);
                    verse = attr(&attrs, "vnumber").and_then(|n| n.parse().ok());
                }
                "note" => note_depth += 1,
                _ => {}
            },
            Tok::Close(name) => match name.as_str() {
                "vers" => flush(&book, chapter, &mut verse, &mut buf, &mut out),
                "note" => note_depth = (note_depth - 1).max(0),
                _ => {}
            },
            Tok::Text(t) => {
                if verse.is_some() && note_depth == 0 {
                    buf.push_str(&t);
                }
            }
        }
    }
    out
}

fn parse_osis(raw: &str, translation: &str) -> Vec<BibleVerse> {
    let mut out = Vec::new();
    let mut current: Option<(i32, &'static str, i32, i32)> = None; // book, name, chapter, verse
    let mut buf = String::new();
    let mut note_depth = 0;

    let finish = |current: &mut Option<(i32, &'static str, i32, i32)>, buf: &mut String, out: &mut Vec<BibleVerse>| {
        if let Some((num, name, ch, v)) = current.take() {
            let text = collapse_ws(buf);
            if !text.is_empty() {
                out.push(make_verse(translation, num, name, ch, v, &text));
            }
        }
        buf.clear();
    };

    let parse_id = |id: &str| -> Option<(i32, &'static str, i32, i32)> {
        let first = id.split_whitespace().next()?;
        let mut parts = first.split('.');
        let (num, name) = book_by_osis(parts.next()?)?;
        let ch = parts.next()?.parse().ok()?;
        let v = parts.next()?.split('-').next()?.parse().ok()?;
        Some((num, name, ch, v))
    };

    for tok in tokenize_xml(raw) {
        match tok {
            Tok::Open { name, attrs, self_close } => match name.as_str() {
                "verse" => {
                    if attr(&attrs, "eid").is_some() {
                        finish(&mut current, &mut buf, &mut out);
                    } else if let Some(id) = attr(&attrs, "sid").or_else(|| attr(&attrs, "osisid")) {
                        finish(&mut current, &mut buf, &mut out);
                        current = parse_id(id);
                        // A self-closing osisID-only verse has no content to collect.
                        if self_close && attr(&attrs, "sid").is_none() {
                            current = None;
                        }
                    }
                }
                "note" => note_depth += 1,
                _ => {}
            },
            Tok::Close(name) => match name.as_str() {
                "verse" => finish(&mut current, &mut buf, &mut out),
                "note" => note_depth = (note_depth - 1).max(0),
                _ => {}
            },
            Tok::Text(t) => {
                if current.is_some() && note_depth == 0 {
                    buf.push_str(&t);
                    buf.push(' ');
                }
            }
        }
    }
    finish(&mut current, &mut buf, &mut out);
    out
}

// ---------------------------------------------------------------- USFM

/// Markers whose whole line is structure (titles, headers), not verse text.
fn is_heading_marker(m: &str) -> bool {
    let base = m.trim_end_matches(|c: char| c.is_ascii_digit());
    matches!(
        base,
        "id" | "ide" | "usfm" | "h" | "toc" | "mt" | "mte" | "ms" | "mr" | "s" | "sr" | "r" | "d" | "sp"
            | "rem" | "cl" | "cp" | "cd" | "periph" | "sts" | "lit"
    )
}

fn parse_usfm(raw: &str, translation: &str) -> Vec<BibleVerse> {
    let chars: Vec<char> = raw.chars().collect();
    let n = chars.len();
    let mut out = Vec::new();

    let mut book: Option<(i32, &'static str)> = None;
    let mut chapter = 0;
    let mut verse: Option<i32> = None;
    let mut buf = String::new();
    let mut in_w = false;

    let skip_to_eol = |i: &mut usize| {
        while *i < n && chars[*i] != '\n' {
            *i += 1;
        }
    };
    let find_str = |from: usize, needle: &str| -> Option<usize> {
        let nd: Vec<char> = needle.chars().collect();
        (from..n.saturating_sub(nd.len() - 1)).find(|&k| chars[k..k + nd.len()] == nd[..])
    };

    let mut i = 0;
    while i < n {
        let c = chars[i];
        if c == '\\' {
            let mut j = i + 1;
            while j < n && (chars[j].is_ascii_alphanumeric() || chars[j] == '+') {
                j += 1;
            }
            if j < n && chars[j] == '*' {
                j += 1;
            }
            let marker: String = chars[i + 1..j].iter().collect::<String>().replace('+', "");
            i = j;

            let flush = |book: &Option<(i32, &'static str)>, chapter: i32, verse: &mut Option<i32>, buf: &mut String, out: &mut Vec<BibleVerse>| {
                if let (Some(v), Some((num, name))) = (verse.take(), book.as_ref()) {
                    let text = collapse_ws(buf);
                    if !text.is_empty() && chapter > 0 {
                        out.push(make_verse(translation, *num, name, chapter, v, &text));
                    }
                }
                buf.clear();
            };

            match marker.as_str() {
                "id" => {
                    flush(&book, chapter, &mut verse, &mut buf, &mut out);
                    while i < n && chars[i] == ' ' {
                        i += 1;
                    }
                    let code: String = chars[i..].iter().take_while(|c| !c.is_whitespace()).collect();
                    book = book_by_usfm(&code);
                    chapter = 0;
                    skip_to_eol(&mut i);
                }
                "c" => {
                    flush(&book, chapter, &mut verse, &mut buf, &mut out);
                    while i < n && chars[i] == ' ' {
                        i += 1;
                    }
                    let num: String = chars[i..].iter().take_while(|c| c.is_ascii_digit()).collect();
                    chapter = num.parse().unwrap_or(chapter + 1);
                    skip_to_eol(&mut i);
                }
                "v" => {
                    flush(&book, chapter, &mut verse, &mut buf, &mut out);
                    while i < n && chars[i] == ' ' {
                        i += 1;
                    }
                    let num: String = chars[i..].iter().take_while(|c| c.is_ascii_digit()).collect();
                    verse = num.parse().ok();
                    // consume the verse label, including ranges (1-2) and parts (3a)
                    while i < n && (chars[i].is_ascii_alphanumeric() || chars[i] == '-' || chars[i] == ',') {
                        i += 1;
                    }
                }
                "f" | "fe" | "x" => {
                    let closer = format!("\\{}*", marker);
                    i = match find_str(i, &closer) {
                        Some(k) => k + closer.chars().count(),
                        None => {
                            skip_to_eol(&mut i);
                            i
                        }
                    };
                }
                "w" => in_w = true,
                "w*" => in_w = false,
                m if m.ends_with('*') => {} // closing character style: no text
                m if is_heading_marker(m) => {
                    skip_to_eol(&mut i);
                }
                _ => {
                    // paragraph / poetry / character-style opener: acts as whitespace
                    buf.push(' ');
                }
            }
        } else if c == '|' && in_w {
            // word attributes (lemma, strong, ...) run to the closing \w*
            while i < n && !(chars[i] == '\\' && i + 2 < n && chars[i + 1] == 'w' && chars[i + 2] == '*') {
                i += 1;
            }
        } else {
            if verse.is_some() {
                buf.push(c);
            }
            i += 1;
        }
    }

    if let (Some(v), Some((num, name))) = (verse, book) {
        let text = collapse_ws(&buf);
        if !text.is_empty() && chapter > 0 {
            out.push(make_verse(translation, num, name, chapter, v, &text));
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn book_table_is_consistent() {
        for (i, b) in BOOKS.iter().enumerate() {
            assert_eq!(b.0 as usize, i + 1);
            assert_eq!(resolve_book_number(b.1), Some(b.0 as u32), "{} must resolve", b.1);
        }
        assert_eq!(book_by_usfm("jhn"), Some((43, "John")));
        assert_eq!(book_by_osis("Ps"), Some((19, "Psalms")));
    }

    #[test]
    fn usfm_parses_books_chapters_and_multiline_verses() {
        let usfm = "\\id JHN World English Bible\n\\h John\n\\mt1 John\n\\c 3\n\\s1 Born again\n\\p\n\\v 16 For God so loved the world,\nthat he gave his only born Son,\n\\v 17 For God didn't send his Son\n\\c 4\n\\v 1 Therefore when the Lord knew";
        let v = parse_bible_text(usfm, "WEB").unwrap();
        assert_eq!(v.len(), 3);
        assert_eq!((v[0].book.as_str(), v[0].book_number, v[0].chapter, v[0].verse), ("John", 43, 3, 16));
        assert_eq!(v[0].text, "For God so loved the world, that he gave his only born Son,");
        assert_eq!(v[1].text, "For God didn't send his Son");
        assert_eq!((v[2].chapter, v[2].verse), (4, 1));
        assert_eq!(v[0].id, "WEB-43-3-16");
    }

    #[test]
    fn usfm_strips_footnotes_word_attributes_and_char_styles() {
        let usfm = "\\id GEN\n\\c 1\n\\p\n\\v 1 \\w In|lemma=\"in\" x-strong=\"H0\"\\w* the beginning\\f + \\fr 1:1 \\ft note text\\f* \\add God\\add* created \\nd the LORD\\nd*.\n\\v 2-3 Next verse";
        let v = parse_bible_text(usfm, "T").unwrap();
        assert_eq!(v[0].text, "In the beginning God created the LORD.");
        assert_eq!(v[1].verse, 2);
        assert_eq!(v[1].text, "Next verse");
    }

    #[test]
    fn usfm_handles_multiple_books_in_one_file() {
        let usfm = "\\id GEN\n\\c 1\n\\v 1 In the beginning\n\\id REV\n\\c 22\n\\v 21 Grace be with all.";
        let v = parse_bible_text(usfm, "T").unwrap();
        assert_eq!((v[0].book_number, v[1].book_number), (1, 66));
        assert_eq!(v[1].book, "Revelation");
    }

    #[test]
    fn zefania_parses_with_any_attribute_order_and_skips_notes() {
        let xml = r#"<?xml version="1.0"?><XMLBIBLE biblename="Test"><BIBLEBOOK bname="Psalms" bnumber="19"><CHAPTER cnumber="23"><VERS vnumber="1">The <STYLE css="x">LORD</STYLE> is my shepherd<NOTE>skip me</NOTE>; I shall not want.</VERS><VERS vnumber="2">He makes me lie down &amp; rest.</VERS></CHAPTER></BIBLEBOOK></XMLBIBLE>"#;
        let v = parse_bible_text(xml, "KJV").unwrap();
        assert_eq!(v.len(), 2);
        assert_eq!((v[0].book_number, v[0].chapter, v[0].verse), (19, 23, 1));
        assert_eq!(v[0].text, "The LORD is my shepherd; I shall not want.");
        assert_eq!(v[1].text, "He makes me lie down & rest.");
    }

    #[test]
    fn zefania_resolves_missing_book_number_from_tamil_name() {
        let xml = r#"<XMLBIBLE><BIBLEBOOK bname="யோவான்"><CHAPTER cnumber="3"><VERS vnumber="16">தேவன்</VERS></CHAPTER></BIBLEBOOK></XMLBIBLE>"#;
        let v = parse_bible_text(xml, "Tamil").unwrap();
        assert_eq!(v[0].book_number, 43);
        assert_eq!(v[0].book, "யோவான்");
    }

    #[test]
    fn osis_parses_container_and_milestone_verses() {
        let container = r#"<osis><osisText><div type="book" osisID="John"><chapter osisID="John.3"><verse osisID="John.3.16">For God so loved<note>n</note> the world</verse><verse osisID="John.3.17">Not to condemn</verse></chapter></div></osisText></osis>"#;
        let v = parse_bible_text(container, "T").unwrap();
        assert_eq!(v.len(), 2);
        assert_eq!((v[0].book_number, v[0].chapter, v[0].verse), (43, 3, 16));
        assert_eq!(v[0].text, "For God so loved the world");

        let milestone = r#"<osis><osisText><verse sID="Ps.23.1" osisID="Ps.23.1"/>The LORD is my shepherd.<verse eID="Ps.23.1"/><verse sID="Ps.23.2" osisID="Ps.23.2"/>He makes me lie down.<verse eID="Ps.23.2"/></osisText></osis>"#;
        let m = parse_bible_text(milestone, "T").unwrap();
        assert_eq!(m.len(), 2);
        assert_eq!((m[0].book_number, m[0].chapter, m[0].verse), (19, 23, 1));
        assert_eq!(m[1].text, "He makes me lie down.");
    }

    #[test]
    fn json_flat_list_and_nested_books() {
        let flat = r#"[{"book":"Jn","chapter":3,"verse":16,"text":"For God so loved"},{"book":"Genesis","chapter":1,"verse":1,"text":"In the beginning"}]"#;
        let v = parse_bible_text(flat, "KJV").unwrap();
        assert_eq!((v[0].book_number, v[0].book.as_str()), (43, "John"));
        assert_eq!(v[1].book_number, 1);

        let nested = r#"{"translation":"X","books":[{"name":"Ruth","chapters":[{"chapter":1,"verses":[{"verse":1,"text":"In the days"}]}]}]}"#;
        let n = parse_bible_text(nested, "KJV").unwrap();
        assert_eq!((n[0].book_number, n[0].translation.as_str()), (8, "KJV"));
    }

    #[test]
    fn rejects_empty_unknown_and_verse_free_input() {
        assert!(parse_bible_text("   ", "T").is_err());
        assert!(parse_bible_text("just some prose", "T").is_err());
        assert!(parse_bible_text("[]", "T").is_err());
        assert!(parse_bible_text("{not json", "T").is_err());
        assert!(parse_bible_text("\\id GEN\n\\c 1\n", "T").is_err());
    }

    #[test]
    fn byte_order_mark_is_ignored() {
        let v = parse_bible_text("\u{feff}\\id RUT\n\\c 1\n\\v 1 Hello", "T").unwrap();
        assert_eq!(v[0].book_number, 8);
    }
}
