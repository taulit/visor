/**
 * Installing a module from the release of its GitHub repository, for modules
 * that are not on extensions.gnome.org. Pure logic: which repositories count,
 * where the ZIP is, and whether what came is the module that was asked for.
 */

/** A UUID as extensions use them; nothing that could leave the folder of extensions. */
const UUID = /^[A-Za-z0-9][A-Za-z0-9._-]*@[A-Za-z0-9][A-Za-z0-9._-]*$/;
const REPO = /^https:\/\/github\.com\/([A-Za-z0-9][A-Za-z0-9-]*)\/([A-Za-z0-9._-]+?)\/?$/;

/** At most this many bytes are downloaded; a module is far smaller. */
export const MAX_ZIP_BYTES = 10 * 1024 * 1024;

export const isUuid = (uuid: unknown): uuid is string =>
  typeof uuid === 'string' && uuid.length <= 128 && UUID.test(uuid) && !uuid.includes('..');

/** `https://github.com/owner/name` without anything after it; null for any other address. */
export function githubRepo(url: unknown): string | null {
  if (typeof url !== 'string') return null;
  const match = REPO.exec(url);
  if (!match || match[2] === '.' || match[2] === '..') return null;
  return `https://github.com/${match[1]}/${match[2]}`;
}

/** The ZIP of the latest release, as the release workflow of the template names it. */
export function releaseZipUrl(repo: string, uuid: string): string {
  return `${repo}/releases/latest/download/${uuid}.shell-extension.zip`;
}

/** Why the metadata.json of a downloaded ZIP is not the module asked for; null when it is. */
export function metadataProblem(text: string, uuid: string): string | null {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return 'metadata.json is not JSON';
  }
  if (typeof data !== 'object' || data === null) return 'metadata.json is not an object';
  const meta = data as Record<string, unknown>;
  if (meta['uuid'] !== uuid) return `the ZIP is ${String(meta['uuid'])}, not ${uuid}`;
  const visor = meta['visor'];
  if (typeof visor !== 'object' || visor === null) return 'the extension is no module for Visor';
  return null;
}
