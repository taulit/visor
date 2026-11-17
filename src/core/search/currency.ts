// The exchange rates of the European Central Bank: read from the cache file,
// downloaded at most once a day, and only while the panel is open.
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Soup from 'gi://Soup?version=3.0';

import { httpSession } from '../../lib/http.js';
import { parseRatesCache, serializeRatesCache, type RatesCache } from './model.js';
import { parseRatesXml, shouldRefresh, type Rates } from './rates.js';

const RATES_URL = 'https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml';
const SETTING = 'currency-rates';

function cacheFile(): Gio.File {
  return Gio.File.new_for_path(
    GLib.build_filenamev([GLib.get_user_cache_dir(), 'visor', 'rates.json']),
  );
}

/** The text of a file, or null when it cannot be read. */
function readText(file: Gio.File, cancellable: Gio.Cancellable): Promise<string | null> {
  return new Promise(resolve => {
    file.load_contents_async(cancellable, (_source, result) => {
      try {
        const [, bytes] = file.load_contents_finish(result);
        resolve(new TextDecoder().decode(bytes));
      } catch {
        resolve(null);
      }
    });
  });
}

/** Creates a directory and the ones above it. False when that failed. */
function makeDirectory(dir: Gio.File, cancellable: Gio.Cancellable): Promise<boolean> {
  return new Promise(resolve => {
    dir.make_directory_async(GLib.PRIORITY_DEFAULT, cancellable, (_source, result) => {
      try {
        dir.make_directory_finish(result);
        resolve(true);
      } catch (e) {
        const parent = dir.get_parent();
        if ((e as GLib.Error).matches(Gio.io_error_quark(), Gio.IOErrorEnum.EXISTS)) {
          resolve(true);
        } else if (
          (e as GLib.Error).matches(Gio.io_error_quark(), Gio.IOErrorEnum.NOT_FOUND) &&
          parent
        ) {
          makeDirectory(parent, cancellable)
            .then(made => (made ? makeDirectory(dir, cancellable) : false))
            .then(resolve);
        } else {
          resolve(false);
        }
      }
    });
  });
}

function writeText(file: Gio.File, text: string, cancellable: Gio.Cancellable): Promise<boolean> {
  return new Promise(resolve => {
    file.replace_contents_bytes_async(
      new GLib.Bytes(new TextEncoder().encode(text)),
      null,
      false,
      Gio.FileCreateFlags.REPLACE_DESTINATION,
      cancellable,
      (_source, result) => {
        try {
          file.replace_contents_finish(result);
          resolve(true);
        } catch {
          resolve(false);
        }
      },
    );
  });
}

/** The body of a page, or null when the download failed. */
function download(url: string, cancellable: Gio.Cancellable): Promise<string | null> {
  return new Promise(resolve => {
    const session = httpSession();
    const message = Soup.Message.new('GET', url);
    session.send_and_read_async(message, GLib.PRIORITY_DEFAULT, cancellable, (_source, result) => {
      try {
        const bytes = session.send_and_read_finish(result);
        const data = bytes.get_data();
        const ok = message.get_status() === Soup.Status.OK && data !== null;
        resolve(ok ? new TextDecoder().decode(data) : null);
      } catch {
        resolve(null);
      }
    });
  });
}

export class RatesStore {
  private cache: RatesCache | null = null;
  /** The cache file was read. */
  private loaded = false;
  /** A download failed since the panel opened; the next one waits for the next opening. */
  private failed = false;
  private running: Gio.Cancellable | null = null;
  private destroyed = false;

  /** `changed` is called when rates arrived or the setting was switched. */
  constructor(
    private settings: Gio.Settings,
    private changed: () => void,
  ) {
    settings.connectObject(`changed::${SETTING}`, () => this.changed(), this);
  }

  /** False when the user turned the rates off. */
  get enabled(): boolean {
    return this.settings.get_boolean(SETTING);
  }

  /**
   * The rates, or null while there are none. Asking is what starts reading
   * the cache and, once a day, the download; `changed` reports the outcome.
   */
  get(): Rates | null {
    if (!this.enabled) return null;
    this.refresh();
    return this.cache;
  }

  /** The panel closed: whatever runs is cancelled. */
  stop(): void {
    this.running?.cancel();
    this.running = null;
    this.failed = false;
  }

  destroy(): void {
    this.destroyed = true;
    this.stop();
    this.settings.disconnectObject(this);
  }

  private refresh(): void {
    if (this.running || this.destroyed) return;
    const due = shouldRefresh(this.cache?.fetched ?? null, Date.now()) && !this.failed;
    if (this.loaded && !due) return;
    const cancellable = (this.running = new Gio.Cancellable());
    this.run(cancellable)
      .catch(e => logError(e as Error, 'Visor: currency rates'))
      .finally(() => {
        if (this.running === cancellable) this.running = null;
      });
  }

  private async run(cancellable: Gio.Cancellable): Promise<void> {
    const file = cacheFile();
    if (!this.loaded) {
      const text = await readText(file, cancellable);
      if (cancellable.is_cancelled()) return;
      this.loaded = true;
      this.cache = text === null ? null : parseRatesCache(text);
      if (this.cache) this.changed();
    }
    if (!shouldRefresh(this.cache?.fetched ?? null, Date.now())) return;

    const xml = await download(RATES_URL, cancellable);
    if (cancellable.is_cancelled()) return;
    const rates = xml === null ? null : parseRatesXml(xml);
    if (!rates) {
      this.failed = true;
      return;
    }
    this.cache = { fetched: Date.now(), ...rates };
    this.changed();

    const dir = file.get_parent();
    if (dir && (await makeDirectory(dir, cancellable)))
      await writeText(file, serializeRatesCache(this.cache), cancellable);
  }
}
