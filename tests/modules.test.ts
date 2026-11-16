import { describe, expect, it } from 'vitest';
import {
  aggregateAttention,
  badgeText,
  declaredApi,
  isValidModuleId,
  orderIds,
} from '../src/lib/modules.js';

describe('isValidModuleId', () => {
  it('accepts lower case letters, digits and dashes', () => {
    expect(isValidModuleId('notes')).toBe(true);
    expect(isValidModuleId('t3-code')).toBe(true);
    expect(isValidModuleId('2fa')).toBe(true);
  });

  it('refuses everything else', () => {
    for (const id of ['', 'Notes', 'my module', 'a_b', 'ä', 'a.b', ':modules', 5, null, undefined])
      expect(isValidModuleId(id)).toBe(false);
  });
});

describe('orderIds', () => {
  it('keeps the order of registration without a setting', () => {
    expect(orderIds(['media', 'timers', 'notes'], [])).toEqual(['media', 'timers', 'notes']);
  });

  it('puts the ids of the setting first, in its order', () => {
    expect(orderIds(['media', 'timers', 'notes'], ['notes', 'media'])).toEqual([
      'notes',
      'media',
      'timers',
    ]);
  });

  it('appends ids the setting does not know in the order of registration', () => {
    expect(orderIds(['a', 'b', 'c', 'd'], ['c'])).toEqual(['c', 'a', 'b', 'd']);
  });

  it('skips ids that are not registered and repeated ids', () => {
    expect(orderIds(['a', 'b'], ['gone', 'b', 'b', 'a', 'b'])).toEqual(['b', 'a']);
    expect(orderIds([], ['a'])).toEqual([]);
  });
});

describe('declaredApi', () => {
  it('reads the version from the metadata', () => {
    expect(declaredApi({ uuid: 'x', visor: { api: 1 } })).toBe(1);
    expect(declaredApi({ visor: { api: 2 } })).toBe(2);
  });

  it('returns null when the metadata says nothing', () => {
    expect(declaredApi({ uuid: 'x' })).toBeNull();
    expect(declaredApi({ visor: {} })).toBeNull();
    expect(declaredApi({ visor: 'yes' })).toBeNull();
    expect(declaredApi(null)).toBeNull();
    expect(declaredApi(undefined)).toBeNull();
  });

  it('returns NaN, which matches no version, for a value that is not a number', () => {
    expect(declaredApi({ visor: { api: '1' } })).toBeNaN();
  });
});

describe('aggregateAttention', () => {
  it('is null without anything to show', () => {
    expect(aggregateAttention([])).toBeNull();
    expect(aggregateAttention([null, undefined, null])).toBeNull();
  });

  it('shows unread when a module has something unread', () => {
    expect(aggregateAttention([null, 'unread', null])).toBe('unread');
  });

  it('lets waiting beat unread, in any order', () => {
    expect(aggregateAttention(['unread', 'waiting'])).toBe('waiting');
    expect(aggregateAttention(['waiting', 'unread', null])).toBe('waiting');
  });
});

describe('badgeText', () => {
  it('shows whole positive numbers', () => {
    expect(badgeText(1)).toBe('1');
    expect(badgeText(12.7)).toBe('12');
    expect(badgeText(99)).toBe('99');
  });

  it('caps large numbers', () => {
    expect(badgeText(100)).toBe('99+');
    expect(badgeText(4711)).toBe('99+');
  });

  it('shows nothing for null, zero, negative and invalid values', () => {
    for (const count of [null, undefined, 0, -3, 0.4, NaN, Infinity])
      expect(badgeText(count)).toBeNull();
  });
});
