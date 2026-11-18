import { expect, test } from 'vitest';

import { evaluateQuick as evaluate } from '../src/core/search/quick/index.js';

const now = new Date('2026-10-12T12:57:00Z');
const context = {
  locale: 'en-US',
  timeZone: 'Europe/Berlin',
  now,
  rates: { USD: 1.09, GBP: 0.85, JPY: 162 },
  defaultCurrency: 'EUR',
};
const show = (query: string) => evaluate(query, context)?.display ?? null;

test('math', () => {
  expect(show('2+3*4')).toBe('14');
  expect(show('(1+2)*3')).toBe('9');
  expect(show('2^10')).toBe('1,024');
  expect(show('2 power 10')).toBe('1,024');
  expect(show('sqrt(625)')).toBe('25');
  expect(show('square root of 625')).toBe('25');
  expect(show('10!')).toBe('3,628,800');
  expect(show('2pi')).toBe('6.283185307');
  expect(show('sin(30)')).toBe('0.5');
  expect(show('1,5 * 2')).toBe('3');
  expect(show('1.5k * 3')).toBe('4,500');
  expect(show('10 mod 3')).toBe('1');
});

test('percentages', () => {
  expect(show('52% of 900')).toBe('468');
  expect(show('7 % von 200')).toBe('14');
  expect(show('20% off 80')).toBe('64');
  expect(show('80 + 20%')).toBe('96');
  expect(show('80 - 25%')).toBe('60');
});

test('units', () => {
  expect(show('2 min in year')).toBe('3.802649 × 10⁻⁶ yr');
  expect(show('10ft in m')).toBe('3.048 m');
  expect(show('1h 30min in min')).toBe('90 min');
  expect(show('2 tage in stunden')).toBe('48 h');
  expect(show('145 min to timespan')).toBe('2 h 25 min');
  expect(show('28h / 5')).toBe('5 h 36 min');
  expect(show('100 h / 3')).toBe('33 h 20 min');
  expect(show('7 min / 2')).toBe('3 min 30 s');
  expect(show('10 h / 2')).toBe('5 h');
  expect(show('5,6h')).toBe('5 h 36 min');
  expect(show('5h')).toBe(null);
  expect(show('90 min in h')).toBe('1 h 30 min');
  expect(show('1.5 wk')).toBe('1 wk 3 d 12 h');
  expect(show('2.5 years')).toBe('2 yr 6 mo');
  expect(show('3 km / 50 kmh')).toBe('3 min 36 s');
  expect(show('55h in workdays')).toBe('6.875 workday');
  expect(show('100 km/h in mph')).toBe('62.13711922 mph');
  expect(show('60 mph in km/h')).toBe('96.56064 km/h');
  expect(show('30 mpg in l/100km')).toBe('7.840486111 l/100 km');
  expect(show('1 m2 in cm2')).toBe('10,000 cm²');
  expect(show('1 GiB in MB')).toBe('1,073.741824 MB');
  expect(show('500 mb in gb')).toBe('0.5 GB');
  expect(show('32px in rem')).toBe('2 rem');
  expect(show('100 W * 3 h in kWh')).toBe('0.3 kWh');
  expect(show('3 km + 200 m')).toBe('3.2 km');
  expect(show('5 m * 3 m')).toBe('15 m²');
});

test('temperatures', () => {
  expect(show('20 c in f')).toBe('68°F');
  expect(show('100 °F in °C')).toBe('37.77777778°C');
  expect(show('0 K in C')).toBe('-273.15°C');
});

test('bases', () => {
  expect(show('255 in hex')).toBe('0xff');
  expect(show('0xff in bin')).toBe('0b11111111');
  expect(show('0b1010 in dec')).toBe('10');
});

test('currencies', () => {
  expect(show('100 usd in gbp')).toBe('77.98 GBP');
  expect(show('100 eur in usd')).toBe('109.00 USD');
  expect(show('100 usd')).toBe('91.74 EUR');
  expect(show('$50')).toBe('45.87 EUR');
  // A plain number added to an amount is in the same currency.
  expect(show('254 + 548 usd in eur')).toBe(show('802 usd in eur'));
  expect(show('5 + 3 km in m')).toBe('8,000 m');
  expect(evaluate('100 usd in eur', { ...context, rates: undefined })).toBe(null);
});

test('plain words and lone numbers are not calculations', () => {
  for (const query of ['github', '1password', '2fa', '42', '5 km', 'mon', 'do', 'aws console', ''])
    expect(show(query)).toBe(null);
});

test('dates', () => {
  expect(show('today')).toBe('Monday, October 12, 2026');
  expect(show('heute')).toBe('Monday, October 12, 2026');
  expect(show('tomorrow')).toBe('Tuesday, October 13, 2026');
  expect(show('monday in 3 weeks')).toBe('Monday, November 2, 2026');
  expect(show('next friday')).toBe('Friday, October 16, 2026');
  expect(show('in 3 weeks')).toBe('Monday, November 2, 2026');
  expect(show('vor 2 wochen')).toBe('Monday, September 28, 2026');
  expect(show('today + 10 days')).toBe('Thursday, October 22, 2026');
  expect(show('days until 24.12.')).toBe('73 days');
  expect(show('days until christmas')).toBe('74 days');
  expect(show('weeks until christmas')).toBe('10 weeks 4 days');
  expect(show('months until christmas')).toBe('2 months 13 days');
  expect(show('days since 1.1.')).toBe('284 days');
  expect(show('easter')).toBe('Sunday, March 28, 2027');
  expect(show('kw')).toBe('Week 42');
  expect(evaluate('kw 1', context)?.expression.replace(/\s/g, ' ')).toBe(
    'Dec 29, 2025 – Jan 4, 2026',
  );
  expect(evaluate('1760000000', context)?.copy).toBe('2025-10-09T08:53:20.000Z');
  expect(show('unix')).toBe('1791809820');
});

test('moving a time or date', () => {
  expect(show('13:59 uhr - 20h')).toBe('05:59 PM');
  expect(evaluate('13:59 uhr - 20h', context)?.expression ?? '').toMatch(/yesterday/);
  expect(show('current - 2 month')).toBe('Wednesday, August 12, 2026');
  expect(show('jetzt - 2 monate')).toBe('Wednesday, August 12, 2026');
  expect(show('in 3 hours')).toBe('05:57 PM');
  expect(show('in 2h 30min')).toBe('05:27 PM');
  expect(show('vor 20 min')).toBe('02:37 PM');
  expect(show('3 hours ago')).toBe('11:57 AM');
  expect(show('now + 1,5h')).toBe('04:27 PM');
  expect(show('13:59 + 2h - 15min')).toBe('03:44 PM');
  expect(show('morgen 9 uhr + 90 min')).toBe('10:30 AM');
  expect(show('5pm in 2 hours')).toBe('07:00 PM');
  // Further away than a day shows the date too; day steps keep the clock time across DST
  expect(show('13:00 + 14 days')).toBe('Mon, Oct 26, 01:00 PM');
  expect(evaluate('24.12. 18:00 - 3h', context)?.copy).toBe('2026-12-24 15:00');
  expect(show('in 30 days')).toBe('Wednesday, November 11, 2026');
});

test('time between two moments', () => {
  expect(show('17:30 - 9:15')).toBe('8 h 15 min');
  expect(show('9:00 bis 17:30')).toBe('8 h 30 min');
  expect(show('22:00 bis 6:00')).toBe('8 h');
  expect(show('jetzt - 9:15')).toBe('5 h 42 min');
});

test('time zones', () => {
  expect(show('time in tokyo')).toBe('09:57 PM');
  expect(show('zeit in new york')).toBe('08:57 AM');
  expect(show('5pm berlin in tokyo')).toBe('12:00 AM');
  expect(show('9am ny to berlin')).toBe('03:00 PM');
  expect(show('time in são paulo')).toBe('09:57 AM');
  expect(show('diff london')).toBe('−1 h');
});

test('phrases in the other languages give what the English ones give', () => {
  const same: [string, string][] = [
    ['vor 12h', '12h ago'],
    ['hace 2 semanas', '2 weeks ago'],
    ['hace 3 días', '3 days ago'],
    ['il y a 3 jours', '3 days ago'],
    ['dans 3 heures', 'in 3 hours'],
    ['há 2 dias', '2 days ago'],
    ['daqui a 2 semanas', 'in 2 weeks'],
    ['2 settimane fa', '2 weeks ago'],
    ['tra 3 ore', 'in 3 hours'],
    ['2 tygodnie temu', '2 weeks ago'],
    ['za 3 godziny', 'in 3 hours'],
    ['2 недели назад', '2 weeks ago'],
    ['через 3 часа', 'in 3 hours'],
    ['2周前', '2 weeks ago'],
    ['3天后', 'in 3 days'],
    ['3日前', '3 days ago'],
    ['2時間後', 'in 2 hours'],
    ['3ヶ月前', '3 months ago'],
    ['mañana', 'tomorrow'],
    ['demain', 'tomorrow'],
    ['вчера', 'yesterday'],
    ['今天', 'today'],
    ['明日', 'tomorrow'],
    ['próximo viernes', 'next friday'],
    ['vendredi prochain', 'next friday'],
    ['hoy + 10 días', 'today + 10 days'],
    ['2 jours en heures', '2 days in hours'],
    ['lunes en 3 semanas', 'monday in 3 weeks'],
    ['2 дня в часах', '2 days in hours'],
  ];
  for (const [phrase, english] of same) {
    expect(show(english), english).not.toBeNull();
    expect(show(phrase), phrase).toBe(show(english));
  }
});

test('the question shown is the one that was typed', () => {
  expect(evaluate('hace 2 semanas', context)?.expression).toMatch(/^hace 2 semanas/);
});

test('words of those languages alone are not answers', () => {
  for (const query of [
    'en',
    'za',
    'fa',
    'tra',
    'mes',
    'hora',
    'dans',
    'temu',
    'jour',
    '前',
    'firefox',
    'ora',
    'data',
  ]) {
    expect(show(query), query).toBeNull();
  }
});
