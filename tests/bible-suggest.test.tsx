import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { api } from '../src/services/api';
import { splitPartialReference, suggestFromVerses } from '../src/services/bibleSuggest';
import { BiblePassageModal } from '../src/components/Services/BiblePassageModal';
import { BibleVerse } from '../src/types';

const verse = (book: string, bookNumber: number, chapter: number, v: number, translation = 'TST'): BibleVerse => ({
  id: `${translation}-${bookNumber}-${chapter}-${v}`, translation, book, bookNumber, chapter, verse: v, text: 't',
});

/** Whole chapters: [book, number, verses per chapter...] */
const chapters = (rows: [string, number, number[]][]): BibleVerse[] =>
  rows.flatMap(([book, n, counts]) => counts.flatMap((count, c) => Array.from({ length: count }, (_, i) => verse(book, n, c + 1, i + 1))));

const FULL = chapters([['John', 43, [5, 8, 36]], ['Job', 18, [3]], ['Joel', 29, [2]], ['Psalms', 19, [6, 6]], ['1 John', 62, [4]]]);
const labels = (input: string, verses = FULL, limit = 20) => suggestFromVerses(input, 'TST', verses, limit).map((s) => s.label);

describe('splitting what is typed', () => {
  it('finds the book and the numbers', () => {
    expect(splitPartialReference('1 john')).toMatchObject({ book: '1 john' });
    expect(splitPartialReference('Jn. 3')).toMatchObject({ book: 'Jn', chapter: 3 });
    expect(splitPartialReference('john 3:16-17')).toMatchObject({ chapter: 3, startVerse: 16, endVerse: 17, inVerse: true, inRange: true });
    const openRange = splitPartialReference('john 3:16-')!;
    expect(openRange.inRange).toBe(true);
    expect(openRange.endVerse).toBeUndefined();
    const openVerse = splitPartialReference('john 3:')!;
    expect(openVerse.inVerse).toBe(true);
    expect(openVerse.startVerse).toBeUndefined();
    expect(splitPartialReference('jn 3.16')).toMatchObject({ startVerse: 16 });
    expect(splitPartialReference('யோவான் 3')).toMatchObject({ chapter: 3 });
    expect(splitPartialReference('john 3:16–17')).toMatchObject({ endVerse: 17 });
  });

  it('refuses things that cannot be references', () => {
    for (const bad of ['', '   ', '123', 'john 0', 'john 3:0', 'john 3:16-17-18', 'john 99999999999', 'a'.repeat(61)]) {
      expect(splitPartialReference(bad), bad).toBeNull();
    }
  });
});

describe('suggestions from the stored verses', () => {
  it('matches books by name prefix or abbreviation, in book order', () => {
    expect(labels('jo')).toEqual(['Job', 'Joel', 'John']);
    expect(labels('jn')).toEqual(['John']);
    expect(labels('ps')).toEqual(['Psalms']);
    expect(labels('1 jo')).toEqual(['1 John']);
    expect(labels('JOHN')).toEqual(['John']);
    expect(labels('zzz')).toEqual([]);
    expect(labels('gen')).toEqual([]); // known abbreviation, but nothing imported
  });

  it('offers chapters and verses that exist, and ranges that stay inside the chapter', () => {
    expect(labels('john ')).toEqual(['John 1', 'John 2', 'John 3']);
    expect(labels('john 1')).toEqual(['John 1']);
    expect(labels('john 4')).toEqual([]);
    expect(labels('john 1:')).toEqual(['John 1:1', 'John 1:2', 'John 1:3', 'John 1:4', 'John 1:5']);
    expect(labels('john 1:6')).toEqual([]);
    expect(labels('john 3:3')).toEqual(['John 3:3', 'John 3:30', 'John 3:31', 'John 3:32', 'John 3:33']);
    expect(labels('john 3:16-17')).toEqual(['John 3:16-17']);
    expect(labels('john 3:17-16')).toEqual([]);
    expect(labels('john 3:30-40')).toEqual([]);
    expect(labels('john 1:2-')).toEqual(['John 1:2-2', 'John 1:2-3', 'John 1:2-4', 'John 1:2-5']);
  });

  it('only offers what a partial import has', () => {
    const partial = [verse('John', 43, 3, 16), verse('John', 43, 3, 17), verse('John', 43, 3, 18), verse('Psalms', 19, 23, 1), verse('Psalms', 19, 23, 4), verse('Psalms', 19, 100, 1)];
    expect(labels('john 3:1', partial)).toEqual(['John 3:16', 'John 3:17', 'John 3:18']);
    expect(labels('john 3:2', partial)).toEqual([]);
    expect(labels('john 2', partial)).toEqual([]);
    expect(labels('ps 2', partial)).toEqual(['Psalms 23']);
    expect(labels('ps 23:', partial)).toEqual(['Psalms 23:1', 'Psalms 23:4']);
    expect(labels('ps 23:1-4', partial)).toEqual(['Psalms 23:1-4']);
    expect(labels('ps 23:1-3', partial)).toEqual([]);
  });

  it('keeps to the translation and the limit, and carries the fields for a full passage', () => {
    expect(suggestFromVerses('jn', 'Other', FULL)).toEqual([]);
    expect(suggestFromVerses('jn', 'tst', FULL)).toHaveLength(1);
    expect(suggestFromVerses('jo', 'TST', FULL, 2)).toHaveLength(2);
    expect(suggestFromVerses('jo', 'TST', FULL, 0)).toHaveLength(1);
    expect(suggestFromVerses('john 3:16-17', 'TST', FULL)[0]).toEqual({
      label: 'John 3:16-17', book: 'John', bookNumber: 43, chapter: 3, startVerse: 16, endVerse: 17,
    });
  });
});

describe('Bible lookup box', () => {
  const open = () => render(<BiblePassageModal isOpen onClose={vi.fn()} onAddPassage={vi.fn()} themes={[]} />);
  const type = (value: string) => fireEvent.change(screen.getByTestId('quick-reference-input'), { target: { value } });

  it('suggests books and passages that are really stored, not a fixed list', async () => {
    open();
    type('jn 3:1');
    const dropdown = await screen.findByTestId('autocomplete-dropdown');
    // the stored sample has John 3:16-18 only
    expect(dropdown.textContent).toContain('John 3:16');
    expect(dropdown.textContent).toContain('John 3:18');
    expect(dropdown.textContent).not.toContain('John 3:10');
    expect(dropdown.textContent).not.toContain('Revelation');
  });

  it('choosing a book moves on to its chapters, and choosing a passage fills the reference', async () => {
    open();
    type('joh');
    fireEvent.click(await screen.findByRole('button', { name: 'John' }));
    await waitFor(() => expect((screen.getByTestId('quick-reference-input') as HTMLInputElement).value).toBe('John '));
    fireEvent.click(await screen.findByRole('button', { name: 'John 3' }));
    await waitFor(() => expect((screen.getByTestId('quick-reference-input') as HTMLInputElement).value).toBe('John 3'));
    type('john 3:16-17');
    fireEvent.click(await screen.findByRole('button', { name: 'John 3:16-17' }));
    await waitFor(() => expect(screen.queryByTestId('autocomplete-dropdown')).toBeNull());
    expect((screen.getByTestId('quick-reference-input') as HTMLInputElement).value).toBe('John 3:16-17');
  });

  it('shows nothing for a single letter or when nothing matches', async () => {
    open();
    type('j');
    expect(screen.queryByTestId('autocomplete-dropdown')).toBeNull();
    type('zzzz');
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByTestId('autocomplete-dropdown')).toBeNull();
  });

  it('the API gives the same answer the box shows', async () => {
    const got = await api.suggestBibleReferences('jn 3:16', 'KJV');
    expect(got.map((s) => s.label)).toEqual(['John 3:16']);
    expect(await api.suggestBibleReferences('', 'KJV')).toEqual([]);
  });
});
