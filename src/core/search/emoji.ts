// Emoji for the search field: `:rocket` or `:rakete` lists them, Enter copies
// one. The names come from Emojibase (MIT), in English and German, and are
// read from data/emoji.json on the first query that asks for them.
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import { SearchIndex } from './quick/match.js';

/** The emoji, its English and German name, and more words it is found by. */
type Entry = [emoji: string, en: string, de: string, keywords: string];

export interface EmojiMatch {
  emoji: string;
  name: string;
}

export const MAX_EMOJI = 8;

/** The text after the colon when the query asks for emoji, else null. */
export function emojiQuery(text: string): string | null {
  return text.startsWith(':') && text.length > 1 ? text.slice(1).trim() : null;
}

export class EmojiStore {
  private index: SearchIndex<Entry> | null = null;
  private loading = false;
  private destroyed = false;

  /** `changed` is called once the names are read. */
  constructor(private changed: () => void) {}

  /** The best matches, or null while the names are not read yet. */
  search(query: string, german: boolean): EmojiMatch[] | null {
    if (!this.index) {
      this.load();
      return null;
    }
    return this.index
      .search(query, { all: true })
      .slice(0, MAX_EMOJI)
      .map(([emoji, en, de]) => ({ emoji, name: german ? de : en }));
  }

  destroy(): void {
    this.destroyed = true;
    this.index = null;
  }

  private load(): void {
    if (this.loading) return;
    this.loading = true;
    // build/core/search/emoji.js → build/data/emoji.json
    const here = GLib.path_get_dirname(GLib.filename_from_uri(import.meta.url)[0]);
    const file = Gio.File.new_for_path(
      GLib.build_filenamev([here, '..', '..', 'data', 'emoji.json']),
    );
    file.load_contents_async(null, (_file, result) => {
      if (this.destroyed) return;
      let entries: Entry[] = [];
      try {
        const [, bytes] = file.load_contents_finish(result);
        entries = JSON.parse(new TextDecoder().decode(bytes)) as Entry[];
      } catch (e) {
        logError(e as Error, 'Visor: emoji names');
      }
      this.index = new SearchIndex(entries, ([, en, de, keywords]) => [
        [10, en],
        [10, de],
        [3, keywords.split(' ')],
      ]);
      this.changed();
    });
  }
}
