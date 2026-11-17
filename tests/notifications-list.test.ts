import { describe, expect, it } from 'vitest';
import {
  arrange,
  flashText,
  needsExpand,
  newestFirst,
  plainBody,
  subtitleText,
} from '../src/modules/notifications/list.js';

const item = (id: string, app: string, time: number) => ({ id, app, time });
const ids = (items: { id: string }[]): string => items.map(i => i.id).join(' ');

describe('newestFirst', () => {
  it('sorts by time, later arrivals first on a tie', () => {
    expect(ids(newestFirst([item('a', 'x', 1), item('b', 'x', 3), item('c', 'x', 3)]))).toBe(
      'c b a',
    );
  });
});

describe('arrange', () => {
  const items = [
    item('m1', 'Mail', 1),
    item('c1', 'Chat', 2),
    item('m2', 'Mail', 3),
    item('s1', 'Software', 4),
    item('m3', 'Mail', 5),
    item('c2', 'Chat', 6),
  ];

  it('shows the three newest while collapsed', () => {
    expect(ids(arrange(items, false))).toBe('c2 m3 s1');
  });

  it('shows all when expanded, with more than two of one app together', () => {
    expect(ids(arrange(items, true))).toBe('c2 m3 m2 m1 s1 c1');
  });

  it('keeps two of one app where they are', () => {
    expect(ids(arrange(items.slice(1), true))).toBe('c2 m3 s1 m2 c1');
  });

  it('is empty without notifications', () => {
    expect(arrange([], true)).toEqual([]);
  });
});

describe('texts', () => {
  it('reads the markup of a body', () => {
    expect(
      plainBody('<b>Mum</b>: 1 &lt; 2 &amp;&amp; <a href="https://x.org">link</a><br/>next', true),
    ).toBe('Mum: 1 < 2 && link\nnext');
    expect(plainBody('a &#228; &#xe4; &unknown;', true)).toBe('a ä ä &unknown;');
    expect(plainBody('<b>kept</b>', false)).toBe('<b>kept</b>');
  });

  it('reads an entity that is no character as U+FFFD and never throws', () => {
    expect(plainBody('a&#x110000;b', true)).toBe('a\ufffdb');
    expect(plainBody('&#1114112; &#99999999999999999999;', true)).toBe('\ufffd \ufffd');
    expect(plainBody('&#xd800; &#57343; &#0; &#x0;', true)).toBe('\ufffd \ufffd \ufffd \ufffd');
    expect(plainBody('&#x10ffff; &#x1F600;', true)).toBe('\u{10ffff} \u{1f600}');
    expect(plainBody(null, true)).toBe('');
  });

  it('puts the app before the body on one line', () => {
    expect(subtitleText('Firefox', 'New message\nfrom  Mum')).toBe(
      'Firefox · New message from Mum',
    );
    expect(subtitleText('Firefox', '')).toBe('Firefox');
    expect(subtitleText('', 'Body')).toBe('Body');
  });

  it('expands rows with actions or a long body', () => {
    expect(needsExpand('Mail', 'Short', 0)).toBe(false);
    expect(needsExpand('Mail', 'Short', 2)).toBe(true);
    expect(needsExpand('Mail', 'Two\nlines', 0)).toBe(true);
    expect(needsExpand('Mail', 'A body that is clearly longer than one line in the panel', 0)).toBe(
      true,
    );
  });

  it('builds the text of the flash chip', () => {
    expect(flashText('Mail', 'Hello')).toBe('Mail: Hello');
    expect(flashText('', 'Hello')).toBe('Hello');
    expect(flashText('Mail', 'A subject that goes on and on and on and on')).toBe(
      'Mail: A subject that goes on and on and…',
    );
  });
});
