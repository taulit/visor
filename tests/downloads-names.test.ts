import { describe, expect, it } from 'vitest';
import {
  PARTIAL_SUFFIXES,
  finalName,
  formatBytes,
  isPartial,
} from '../src/modules/downloads/names.js';

describe('PARTIAL_SUFFIXES', () => {
  it('lists the browsers suffixes', () => {
    expect(PARTIAL_SUFFIXES).toEqual(['.part', '.crdownload', '.download', '.partial']);
  });
});

describe('isPartial', () => {
  it.each([
    ['movie.mkv.part', true],
    ['setup.exe.crdownload', true],
    ['photo.jpg.download', true],
    ['file.zip.partial', true],
    ['FILE.ZIP.PART', true],
    ['movie.mkv', false],
    ['part', false],
    ['notes.part.txt', false],
    ['.hidden', false],
    ['', false],
  ])('%s is %s', (name, expected) => {
    expect(isPartial(name)).toBe(expected);
  });
});

describe('finalName', () => {
  it.each([
    ['movie.mkv.part', 'movie.mkv'],
    ['setup.exe.crdownload', 'setup.exe'],
    ['photo.jpg.download', 'photo.jpg'],
    ['file.zip.partial', 'file.zip'],
    ['Report Final.PDF.PART', 'Report Final.PDF'],
    ['Unconfirmed 123456.crdownload', ''],
    ['unconfirmed 7.crdownload', ''],
    ['.part', ''],
    ['movie.mkv', 'movie.mkv'],
    ['Unconfirmed 123456.zip', 'Unconfirmed 123456.zip'],
  ])('%s becomes "%s"', (name, expected) => {
    expect(finalName(name)).toBe(expected);
  });
});

describe('formatBytes', () => {
  it.each([
    [0, 'en-US', '0 kB'],
    [500, 'en-US', '0.5 kB'],
    [1200, 'en-US', '1.2 kB'],
    [9_990, 'en-US', '10 kB'],
    [14_000, 'en-US', '14 kB'],
    [999_400, 'en-US', '999 kB'],
    [999_600, 'en-US', '1.0 MB'],
    [1_000_000, 'en-US', '1.0 MB'],
    [14_300_000, 'en-US', '14 MB'],
    [1_240_000_000, 'en-US', '1.2 GB'],
    [1_240_000_000, 'de-DE', '1,2 GB'],
    [2_000_000_000, 'en-US', '2.0 GB'],
    [3_500_000_000_000, 'en-US', '3.5 TB'],
    [5_000_000_000_000_000, 'en-US', '5,000 TB'],
    [-5, 'en-US', '0 kB'],
    [NaN, 'en-US', '0 kB'],
  ])('%d bytes in %s is %s', (bytes, locale, expected) => {
    expect(formatBytes(bytes, locale)).toBe(expected);
  });
});
