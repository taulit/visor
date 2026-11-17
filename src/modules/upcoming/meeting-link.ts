/** Find the video-call link in an event's location, description or URL. Pure logic. */

export type MeetingService = 'meet' | 'teams' | 'zoom' | 'jitsi';

export interface MeetingLink {
  url: string;
  service: MeetingService;
}

/**
 * Jitsi can be self-hosted anywhere, so only these hosts (and their subdomains) count:
 * the public instance, the project site and 8x8's hosted Jitsi. On `meet.jit.si` the room name is
 * the whole path, elsewhere a link is a single room segment; 8x8 puts its tenant before the room
 * (`8x8.vc/<tenant>/<room>`).
 */
const JITSI_HOSTS = ['meet.jit.si', 'jitsi.org', '8x8.vc'];

const URL_PATTERN = /https:\/\/[^\s<>"'\\]+/gi;

const isHost = (host: string, domain: string): boolean =>
  host === domain || host.endsWith(`.${domain}`);

function classify(host: string, path: string): MeetingService | null {
  const hasRest = (prefix: string): boolean =>
    path.startsWith(prefix) && path.length > prefix.length;

  if (host === 'meet.google.com') return path.length > 1 ? 'meet' : null;

  if (host === 'teams.microsoft.com') {
    return hasRest('/l/meetup-join/') || hasRest('/meet/') ? 'teams' : null;
  }
  if (host === 'teams.live.com') return hasRest('/meet/') ? 'teams' : null;

  if (isHost(host, 'zoom.us')) {
    return hasRest('/j/') || hasRest('/my/') || hasRest('/w/') ? 'zoom' : null;
  }

  if (host === 'meet.jit.si') return path.length > 1 ? 'jitsi' : null;
  if (isHost(host, '8x8.vc') && /^\/[^/]+\/[^/]+\/?$/.test(path)) return 'jitsi';
  if (JITSI_HOSTS.some((domain: string) => isHost(host, domain)) && /^\/[^/]+\/?$/.test(path))
    return 'jitsi';
  return null;
}

/** Cut what surrounds a link in plain text and HTML: `)`, `>`, quotes, sentence punctuation. */
const cleanUrl = (url: string): string =>
  url.replace(/&amp;/g, '&').replace(/[.,;:!?)\]}>"']+$/, '');

/** The first Meet, Teams, Zoom or Jitsi link in the texts, `https:` only. */
export function findMeetingLink(...texts: (string | null | undefined)[]): MeetingLink | null {
  for (const text of texts) {
    for (const [candidate] of (text ?? '').matchAll(URL_PATTERN)) {
      const url = cleanUrl(candidate);
      const parts = /^https:\/\/([^/?#:]+)(?::\d+)?([^?#]*)/i.exec(url);
      if (!parts) continue;
      const service = classify((parts[1] as string).toLowerCase(), (parts[2] as string) || '/');
      if (service) return { url, service };
    }
  }
  return null;
}
