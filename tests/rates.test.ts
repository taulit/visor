import { describe, expect, it } from 'vitest';
import {
  convert,
  formatMoney,
  homeCurrencyForRegion,
  parseCurrencyQuery,
  parseRatesXml,
  shouldRefresh,
} from '../src/core/search/rates.js';

const ECB_XML = `<?xml version="1.0" encoding="UTF-8"?>
<gesmes:Envelope xmlns:gesmes="http://www.gesmes.org/xml/2002-08-01" xmlns="http://www.ecb.int/vocabulary/2002-08-01/eurofxref">
  <gesmes:subject>Reference rates</gesmes:subject>
  <gesmes:Sender><gesmes:name>European Central Bank</gesmes:name></gesmes:Sender>
  <Cube>
    <Cube time='2026-11-13'>
      <Cube currency='USD' rate='1.0812'/>
      <Cube currency='JPY' rate='163.52'/>
      <Cube currency='CHF' rate='0.9421'/>
    </Cube>
  </Cube>
</gesmes:Envelope>`;

describe('parseRatesXml', () => {
  it('reads the date and the rates, and adds EUR', () => {
    expect(parseRatesXml(ECB_XML)).toEqual({
      date: '2026-11-13',
      rates: { EUR: 1, USD: 1.0812, JPY: 163.52, CHF: 0.9421 },
    });
  });

  it('accepts double quotes and the other attribute order', () => {
    const xml = `<Cube><Cube time="2026-01-02"><Cube rate="2.5" currency="GBP"/></Cube></Cube>`;
    expect(parseRatesXml(xml)).toEqual({ date: '2026-01-02', rates: { EUR: 1, GBP: 2.5 } });
  });

  const malformed: [string, string][] = [
    ['empty string', ''],
    ['no cubes', '<gesmes:Envelope></gesmes:Envelope>'],
    ['no rates', `<Cube><Cube time='2026-11-13'></Cube></Cube>`],
    ['no date', `<Cube><Cube currency='USD' rate='1.08'/></Cube>`],
    ['bad date', `<Cube time='13.11.2026'><Cube currency='USD' rate='1.08'/></Cube>`],
    [
      'two dates',
      `<Cube time='2026-11-13'><Cube currency='USD' rate='1.08'/><Cube time='2026-11-12'/></Cube>`,
    ],
    ['non-numeric rate', `<Cube time='2026-11-13'><Cube currency='USD' rate='abc'/></Cube>`],
    ['zero rate', `<Cube time='2026-11-13'><Cube currency='USD' rate='0'/></Cube>`],
    ['bad currency', `<Cube time='2026-11-13'><Cube currency='usd1' rate='1.08'/></Cube>`],
    ['rate without currency', `<Cube time='2026-11-13'><Cube rate='1.08'/></Cube>`],
    ['html', '<html><body>Service unavailable</body></html>'],
  ];

  it.each(malformed)('returns null for %s', (_name, xml) => {
    expect(parseRatesXml(xml)).toBeNull();
  });
});

describe('convert', () => {
  const rates = { EUR: 1, USD: 1.25, CHF: 0.8 };

  it.each([
    [100, 'EUR', 'USD', 125],
    [125, 'USD', 'EUR', 100],
    [125, 'USD', 'CHF', 80],
    [10, 'eur', 'chf', 8],
    [0, 'EUR', 'USD', 0],
  ])('%d %s to %s is %d', (amount, from, to, expected) => {
    expect(convert(amount, from, to, rates)).toBeCloseTo(expected, 10);
  });

  it.each([
    ['unknown source', 'XXX', 'EUR'],
    ['unknown target', 'EUR', 'XXX'],
    ['constructor', 'constructor', 'EUR'],
  ])('returns null for %s', (_name, from, to) => {
    expect(convert(1, from, to, rates)).toBeNull();
  });

  it('returns null for an invalid amount', () => {
    expect(convert(NaN, 'EUR', 'USD', rates)).toBeNull();
  });
});

describe('parseCurrencyQuery', () => {
  // [input, home, locale, expected]
  const ok: [string, string, string, { amount: number; from: string; to: string }][] = [
    ['100 usd in eur', 'EUR', 'en-US', { amount: 100, from: 'USD', to: 'EUR' }],
    ['100 usd to eur', 'EUR', 'en-US', { amount: 100, from: 'USD', to: 'EUR' }],
    ['100 usd eur', 'EUR', 'en-US', { amount: 100, from: 'USD', to: 'EUR' }],
    ['100 USD IN CHF', 'EUR', 'en-US', { amount: 100, from: 'USD', to: 'CHF' }],
    ['100 usd nach chf', 'EUR', 'de-DE', { amount: 100, from: 'USD', to: 'CHF' }],
    ['100$ €', 'CHF', 'en-US', { amount: 100, from: 'USD', to: 'EUR' }],
    ['100 $ in €', 'CHF', 'en-US', { amount: 100, from: 'USD', to: 'EUR' }],
    ['€100 in usd', 'CHF', 'en-US', { amount: 100, from: 'EUR', to: 'USD' }],
    ['€ 100 in usd', 'CHF', 'en-US', { amount: 100, from: 'EUR', to: 'USD' }],
    ['$100 in eur', 'CHF', 'en-US', { amount: 100, from: 'USD', to: 'EUR' }],
    ['usd 100 in eur', 'CHF', 'en-US', { amount: 100, from: 'USD', to: 'EUR' }],
    ['100 usd -> eur', 'EUR', 'en-US', { amount: 100, from: 'USD', to: 'EUR' }],
    ['100 usd → eur', 'EUR', 'en-US', { amount: 100, from: 'USD', to: 'EUR' }],
    ['50 chf', 'EUR', 'de-DE', { amount: 50, from: 'CHF', to: 'EUR' }],
    ['50 chf', 'USD', 'en-US', { amount: 50, from: 'CHF', to: 'USD' }],
    ['50 eur', 'EUR', 'de-DE', { amount: 50, from: 'EUR', to: 'USD' }],
    ['50 usd', 'USD', 'en-US', { amount: 50, from: 'USD', to: 'EUR' }],
    ['12,50 € in usd', 'EUR', 'de-DE', { amount: 12.5, from: 'EUR', to: 'USD' }],
    ['12.50 € in usd', 'EUR', 'de-DE', { amount: 12.5, from: 'EUR', to: 'USD' }],
    ['1.234,50 € in usd', 'EUR', 'de-DE', { amount: 1234.5, from: 'EUR', to: 'USD' }],
    ['1,234.50 usd in eur', 'EUR', 'en-US', { amount: 1234.5, from: 'USD', to: 'EUR' }],
    ['5 £ in €', 'EUR', 'en-US', { amount: 5, from: 'GBP', to: 'EUR' }],
    ['1000 ¥ in ₺', 'EUR', 'en-US', { amount: 1000, from: 'JPY', to: 'TRY' }],
    ['2 ₹ in ₩', 'EUR', 'en-US', { amount: 2, from: 'INR', to: 'KRW' }],
    ['20 zł in €', 'EUR', 'de-DE', { amount: 20, from: 'PLN', to: 'EUR' }],
    ['20 Fr in €', 'EUR', 'de-DE', { amount: 20, from: 'CHF', to: 'EUR' }],
    ['20 fr. in €', 'EUR', 'de-DE', { amount: 20, from: 'CHF', to: 'EUR' }],
    ['  100 usd in eur  ', 'EUR', 'en-US', { amount: 100, from: 'USD', to: 'EUR' }],
    ['100 try in jpy', 'EUR', 'en-US', { amount: 100, from: 'TRY', to: 'JPY' }],
  ];

  it.each(ok)('parses "%s" (home %s, %s)', (input, home, locale, expected) => {
    expect(parseCurrencyQuery(input, home, locale)).toEqual(expected);
  });

  const no: string[] = [
    '',
    '100',
    'usd',
    '100 cat in hat',
    '100 usd in',
    '100 usd in hat',
    '100 usd in eur please',
    '100 kr in eur',
    '100 usd usd',
    '100 eur in eur',
    'hello world',
    '100 + 5 usd',
    'twelve usd in eur',
    '100 friday',
    '5 to 10',
    '€ in usd',
  ];

  it.each(no)('rejects "%s"', (input) => {
    expect(parseCurrencyQuery(input, 'EUR', 'en-US')).toBeNull();
  });
});

describe('homeCurrencyForRegion', () => {
  it.each([
    ['DE', 'EUR'],
    ['FR', 'EUR'],
    ['AT', 'EUR'],
    ['US', 'USD'],
    ['CH', 'CHF'],
    ['GB', 'GBP'],
    ['JP', 'JPY'],
    ['pl', 'PLN'],
    ['ZZ', 'EUR'],
    ['', 'EUR'],
  ])('%s is %s', (region, currency) => {
    expect(homeCurrencyForRegion(region)).toBe(currency);
  });
});

describe('shouldRefresh', () => {
  const noon = Date.UTC(2026, 10, 13, 12, 0, 0);

  it.each([
    ['never fetched', null, noon, true],
    ['earlier the same day', Date.UTC(2026, 10, 13, 0, 0, 1), noon, false],
    ['a minute ago', noon - 60_000, noon, false],
    ['the previous day, late', Date.UTC(2026, 10, 12, 23, 59, 59), noon, true],
    [
      'across midnight by one second',
      Date.UTC(2026, 10, 12, 23, 59, 59),
      Date.UTC(2026, 10, 13, 0, 0, 0),
      true,
    ],
    ['a week ago', noon - 7 * 86_400_000, noon, true],
  ])('%s', (_name, last, now, expected) => {
    expect(shouldRefresh(last, now)).toBe(expected);
  });
});

describe('formatMoney', () => {
  it.each([
    [1234.5, 'USD', 'en-US', '$1,234.50'],
    [1234.5, 'EUR', 'en-US', '€1,234.50'],
    [1234.5, 'EUR', 'de-DE', '1.234,50 €'],
    [12, 'JPY', 'en-US', '¥12'],
  ])('%d %s in %s', (value, currency, locale, expected) => {
    expect(formatMoney(value, currency, locale)).toBe(expected);
  });
});
