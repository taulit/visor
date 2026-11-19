// Where the settings window gets the module catalog from: the snapshot that
// ships with Visor, a newer copy in the cache, and the network, which is
// asked at most once a day and only when the user left that on. Pictures come
// from the cache, the ones of the snapshot that ship with Visor, or are
// fetched when a card shows and kept in the cache. Runs in the settings
// window only.
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Soup from 'gi://Soup?version=3.0';

import {
  MAX_CATALOG_BYTES,
  catalogUrl,
  parseCatalog,
  pictureUrl,
  type CatalogModule,
} from './catalog-model.js';

const DAY_SECONDS = 24 * 60 * 60;
const MAX_PICTURE_BYTES = 2 * 1024 * 1024;
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

const cacheDir = (): string =>
  GLib.build_filenamev([GLib.get_user_cache_dir(), 'visor', 'catalog']);
const cachedCatalog = (): string => GLib.build_filenamev([cacheDir(), 'catalog.json']);

function readText(path: string): string | null {
  try {
    const [, bytes] = GLib.file_get_contents(path);
    return bytes.length <= MAX_CATALOG_BYTES ? new TextDecoder().decode(bytes) : null;
  } catch {
    return null;
  }
}

/** The copy in the cache when it is a sound catalog, else the snapshot in `extensionPath`. */
export function loadCatalog(extensionPath: string): CatalogModule[] {
  const cached = parseCatalog(readText(cachedCatalog()) ?? '');
  if (cached && cached.length > 0) return cached;
  const shipped = GLib.build_filenamev([extensionPath, 'data', 'catalog.json']);
  return parseCatalog(readText(shipped) ?? '') ?? [];
}

/** Seconds since the catalog in the cache was written, Infinity when there is none. */
function cacheAge(): number {
  try {
    const info = Gio.File.new_for_path(cachedCatalog()).query_info(
      Gio.FILE_ATTRIBUTE_TIME_MODIFIED,
      Gio.FileQueryInfoFlags.NONE,
      null,
    );
    const modified = info.get_attribute_uint64(Gio.FILE_ATTRIBUTE_TIME_MODIFIED);
    return Math.max(0, GLib.get_real_time() / 1_000_000 - modified);
  } catch {
    return Infinity;
  }
}

/** The body of a plain 200 answer of at most `maxBytes`, or null. A redirect is not followed. */
function fetchBytes(
  http: Soup.Session,
  url: string,
  maxBytes: number,
  cancellable: Gio.Cancellable,
): Promise<Uint8Array | null> {
  return new Promise(resolve => {
    let message: Soup.Message | null = null;
    try {
      message = Soup.Message.new('GET', url);
    } catch {
      // Not an address.
    }
    if (!message) {
      resolve(null);
      return;
    }
    const sent = message;
    sent.add_flags(Soup.MessageFlags.NO_REDIRECT);
    http.send_and_read_async(sent, GLib.PRIORITY_DEFAULT, cancellable, (_source, result) => {
      try {
        const data = http.send_and_read_finish(result).get_data();
        const ok = sent.get_status() === Soup.Status.OK && data !== null && data.length <= maxBytes;
        resolve(ok ? data : null);
      } catch {
        resolve(null);
      }
    });
  });
}

function writeFile(path: string, bytes: Uint8Array): boolean {
  try {
    GLib.mkdir_with_parents(GLib.path_get_dirname(path), 0o755);
    return GLib.file_set_contents(path, bytes);
  } catch {
    return false;
  }
}

/**
 * Fetches the catalog from `base` unless the copy in the cache is younger
 * than a day. The modules of a new, sound catalog, which is then in the
 * cache; null when nothing was fetched or it was no catalog.
 */
export async function refreshCatalog(
  http: Soup.Session,
  base: string,
  cancellable: Gio.Cancellable,
): Promise<CatalogModule[] | null> {
  if (cacheAge() < DAY_SECONDS) return null;
  const bytes = await fetchBytes(http, catalogUrl(base), MAX_CATALOG_BYTES, cancellable);
  if (!bytes) return null;
  const modules = parseCatalog(new TextDecoder().decode(bytes));
  // An empty catalog is more likely a mistake of the server than the truth.
  if (!modules || modules.length === 0) return null;
  writeFile(cachedCatalog(), bytes);
  return modules;
}

/**
 * The file of a screenshot: the one in the cache, else the one that ships
 * with Visor in `extensionPath`, else fetched from `base` when that is given.
 * Null when there is no picture to show.
 */
export async function loadPicture(
  http: Soup.Session,
  base: string | null,
  extensionPath: string,
  path: string,
  cancellable: Gio.Cancellable,
): Promise<string | null> {
  const file = GLib.build_filenamev([cacheDir(), 'modules', ...path.split('/')]);
  if (GLib.file_test(file, GLib.FileTest.EXISTS)) return file;
  const shipped = GLib.build_filenamev([extensionPath, 'data', 'modules', ...path.split('/')]);
  if (GLib.file_test(shipped, GLib.FileTest.EXISTS)) return shipped;
  if (!base) return null;
  const bytes = await fetchBytes(http, pictureUrl(base, path), MAX_PICTURE_BYTES, cancellable);
  // Only what says it is a PNG is kept and handed to the picture loader.
  if (!bytes || bytes.length < PNG.length || PNG.some((byte, i) => bytes[i] !== byte)) return null;
  return writeFile(file, bytes) ? file : null;
}
