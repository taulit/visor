import { describe, expect, it } from 'vitest';
import { findMeetingLink } from '../src/modules/upcoming/meeting-link.js';

describe('findMeetingLink', () => {
  // [text, url, service]
  const found: [string, string, string][] = [
    ['https://meet.google.com/abc-defg-hij', 'https://meet.google.com/abc-defg-hij', 'meet'],
    ['Join: https://meet.google.com/abc-defg-hij.', 'https://meet.google.com/abc-defg-hij', 'meet'],
    ['(https://meet.google.com/abc-defg-hij)', 'https://meet.google.com/abc-defg-hij', 'meet'],
    [
      '<a href="https://meet.google.com/abc-defg-hij?authuser=0">Join</a>',
      'https://meet.google.com/abc-defg-hij?authuser=0',
      'meet',
    ],
    ['<https://meet.google.com/abc-defg-hij>', 'https://meet.google.com/abc-defg-hij', 'meet'],
    [
      'https://meet.google.com/abc-defg-hij?a=1&amp;b=2',
      'https://meet.google.com/abc-defg-hij?a=1&b=2',
      'meet',
    ],
    ['HTTPS://MEET.GOOGLE.COM/abc-defg-hij', 'HTTPS://MEET.GOOGLE.COM/abc-defg-hij', 'meet'],
    [
      'https://teams.microsoft.com/l/meetup-join/19%3ameeting_abc%40thread.v2/0?context=%7b%7d',
      'https://teams.microsoft.com/l/meetup-join/19%3ameeting_abc%40thread.v2/0?context=%7b%7d',
      'teams',
    ],
    ['https://teams.live.com/meet/9876543210', 'https://teams.live.com/meet/9876543210', 'teams'],
    [
      'https://teams.microsoft.com/meet/123456789?p=abc',
      'https://teams.microsoft.com/meet/123456789?p=abc',
      'teams',
    ],
    ['https://zoom.us/j/123456789', 'https://zoom.us/j/123456789', 'zoom'],
    [
      'https://us02web.zoom.us/j/123456789?pwd=abc',
      'https://us02web.zoom.us/j/123456789?pwd=abc',
      'zoom',
    ],
    ['https://company.zoom.us/my/jane.doe', 'https://company.zoom.us/my/jane.doe', 'zoom'],
    ['https://company.zoom.us/w/123456', 'https://company.zoom.us/w/123456', 'zoom'],
    ['https://meet.jit.si/StandupRoom', 'https://meet.jit.si/StandupRoom', 'jitsi'],
    ['https://meet.jit.si/Standup/', 'https://meet.jit.si/Standup/', 'jitsi'],
    ['https://8x8.vc/StandupRoom', 'https://8x8.vc/StandupRoom', 'jitsi'],
    [
      'https://8x8.vc/vpaas-magic-cookie-1234/StandupRoom',
      'https://8x8.vc/vpaas-magic-cookie-1234/StandupRoom',
      'jitsi',
    ],
    ['https://8x8.vc/acme/standup/', 'https://8x8.vc/acme/standup/', 'jitsi'],
    ['https://meet.jit.si/Room#config.x=1,', 'https://meet.jit.si/Room#config.x=1', 'jitsi'],
  ];

  it.each(found)('finds the link in "%s"', (text, url, service) => {
    expect(findMeetingLink(text)).toEqual({ url, service });
  });

  const missing: [string, string | null | undefined][] = [
    ['empty', ''],
    ['no link', 'Meeting room 3, bring snacks'],
    ['http instead of https', 'http://meet.google.com/abc-defg-hij'],
    ['other scheme', 'zoommtg://zoom.us/join?confno=123'],
    ['other site', 'https://example.com/j/123456789'],
    ['host only', 'https://meet.google.com/'],
    ['lookalike host', 'https://meet.google.com.evil.example/abc-defg-hij'],
    ['lookalike zoom', 'https://notzoom.us/j/123'],
    ['zoom without meeting path', 'https://zoom.us/pricing'],
    ['teams without join path', 'https://teams.microsoft.com/'],
    ['jitsi on an unknown host', 'https://jitsi.example.org/Room'],
    ['jitsi.org with a long path', 'https://jitsi.org/downloads/ubuntu-debian-installations/'],
    ['8x8.vc with a long path', 'https://8x8.vc/a/b/c'],
    ['jitsi.org with two segments', 'https://jitsi.org/user/room'],
    ['null', null],
    ['undefined', undefined],
  ];

  it.each(missing)('finds nothing: %s', (_name, text) => {
    expect(findMeetingLink(text)).toBeNull();
  });

  it('searches the texts in order and takes the first link', () => {
    const result = findMeetingLink(
      null,
      'Notes: https://example.com/doc and https://zoom.us/j/1',
      'https://meet.google.com/abc-defg-hij',
    );
    expect(result).toEqual({ url: 'https://zoom.us/j/1', service: 'zoom' });
  });

  it('skips non-meeting links before a meeting link in the same text', () => {
    expect(findMeetingLink('Agenda https://example.com/a then https://meet.jit.si/Room')).toEqual({
      url: 'https://meet.jit.si/Room',
      service: 'jitsi',
    });
  });

  it('returns null without arguments', () => {
    expect(findMeetingLink()).toBeNull();
  });
});
