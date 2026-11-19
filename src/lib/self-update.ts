/**
 * Updating Visor from its latest GitHub release. Pure logic: versions, the
 * answer of the GitHub API, and whether a downloaded ZIP is the release.
 */

export const DEFAULT_UPDATE_URL = 'https://api.github.com/repos/taulit/visor/releases/latest';
/** Where the ZIP of a release of Visor is downloaded from when the default address is used. */
const GITHUB_DOWNLOADS = 'https://github.com/taulit/visor/releases/download/';
/** The answer of the API is small; the ZIP of Visor is about half a megabyte. */
export const MAX_ANSWER_BYTES = 256 * 1024;
export const MAX_ZIP_BYTES = 20 * 1024 * 1024;

export interface Release {
  /** `1.2.0`, without the `v` of the tag. */
  version: string;
  zipUrl: string;
  /** The page of the release, for its notes. */
  page: string;
}

/** `1.2.0` or `v1.2.0` as numbers; null for anything else, also for `1.2.0-rc.1`. */
export function parseVersion(text: unknown): [number, number, number] | null {
  if (typeof text !== 'string') return null;
  const match = /^v?(\d{1,5})\.(\d{1,5})\.(\d{1,5})$/.exec(text.trim());
  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null;
}

/** True when `candidate` is a later version than `current`. */
export function isNewer(candidate: string, current: string): boolean {
  const a = parseVersion(candidate);
  const b = parseVersion(current);
  if (!a || !b) return false;
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i]! > b[i]!;
  return false;
}

/** The origin of an https address, `https://host[:port]`; null for anything else. */
function origin(url: string): string | null {
  const match = /^(https?):\/\/([^/?#@]+)(?:[/?#]|$)/.exec(url);
  return match ? `${match[1]}://${match[2]}` : null;
}

/**
 * The release in an answer of `releases/latest`, or null when it is a draft,
 * a pre-release, or has no ZIP of `uuid`. With the default address the ZIP has
 * to come from the releases of taulit/visor; with another one (tests) from
 * the same origin as that address.
 */
export function parseRelease(text: string, uuid: string, updateUrl: string): Release | null {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof data !== 'object' || data === null) return null;
  const release = data as Record<string, unknown>;
  if (release['draft'] === true || release['prerelease'] === true) return null;
  const version = parseVersion(release['tag_name']);
  if (!version) return null;
  const assets = Array.isArray(release['assets']) ? (release['assets'] as unknown[]) : [];
  const zip = assets.find(
    (asset): asset is Record<string, unknown> =>
      typeof asset === 'object' &&
      asset !== null &&
      (asset as Record<string, unknown>)['name'] === `${uuid}.shell-extension.zip`,
  );
  const zipUrl = zip?.['browser_download_url'];
  if (typeof zipUrl !== 'string') return null;
  const allowed =
    updateUrl === DEFAULT_UPDATE_URL
      ? zipUrl.startsWith(GITHUB_DOWNLOADS)
      : origin(zipUrl) !== null && origin(zipUrl) === origin(updateUrl);
  if (!allowed) return null;
  const page = typeof release['html_url'] === 'string' ? release['html_url'] : '';
  return { version: version.join('.'), zipUrl, page };
}

/** Why the metadata.json of a downloaded ZIP is not the release; null when it is. */
export function metadataProblem(text: string, uuid: string, version: string): string | null {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return 'metadata.json is not JSON';
  }
  if (typeof data !== 'object' || data === null) return 'metadata.json is not an object';
  const meta = data as Record<string, unknown>;
  if (meta['uuid'] !== uuid) return `the ZIP is ${String(meta['uuid'])}, not ${uuid}`;
  if (meta['version-name'] !== version)
    return `the ZIP is version ${String(meta['version-name'])}, not ${version}`;
  return null;
}
