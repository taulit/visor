/**
 * Date and time phrases in the other languages Visor is translated into, put
 * into the English words the evaluators know: `hace 2 semanas` and `2周前`
 * become `2 week ago`, `dans 3 heures` becomes `in 3 hour`. English and German
 * need none of this. Pure logic, only `Intl`.
 */

/** Spanish, French, Brazilian Portuguese, Italian, Polish, Russian, Simplified Chinese, Japanese. */
const LOCALES = ['es', 'fr', 'pt-BR', 'it', 'pl', 'ru', 'zh-CN', 'ja'];

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
// prettier-ignore
const MONTHS = [
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december',
];

/** Single words. Inflected forms are listed; the evaluators take singular and plural alike. */
// prettier-ignore
const WORDS: Record<string, string[]> = {
  today: ['hoy', "aujourd'hui", 'aujourd’hui', 'hoje', 'oggi', 'dziś', 'dzisiaj', 'сегодня'],
  tomorrow: ['mañana', 'demain', 'amanhã', 'domani', 'jutro', 'завтра'],
  yesterday: ['ayer', 'hier', 'ontem', 'ieri', 'wczoraj', 'вчера'],
  now: ['ahora', 'maintenant', 'agora', 'adesso', 'teraz', 'сейчас'],
  day: ['día', 'días', 'dia', 'dias', 'jour', 'jours', 'giorno', 'giorni', 'dzień', 'dni', 'dnia', 'день', 'дня', 'дней', 'днях'],
  week: [
    'semana', 'semanas', 'semaine', 'semaines', 'settimana', 'settimane',
    'tydzień', 'tygodnie', 'tygodni', 'tygodnia', 'неделя', 'недели', 'недель', 'неделю', 'неделях',
  ],
  month: [
    'mes', 'meses', 'mois', 'mês', 'mese', 'mesi',
    'miesiąc', 'miesiące', 'miesięcy', 'miesiąca', 'месяц', 'месяца', 'месяцев', 'месяцах',
  ],
  year: ['año', 'años', 'an', 'ans', 'année', 'années', 'ano', 'anos', 'anno', 'anni', 'rok', 'lata', 'lat', 'roku', 'год', 'года', 'лет'],
  hour: [
    'hora', 'horas', 'heure', 'heures', 'ore', 'godzina', 'godziny', 'godzin', 'godzinę',
    'час', 'часа', 'часов', 'часах',
  ],
  minute: [
    'minuto', 'minutos', 'minuti', 'minuta', 'minuty', 'minut', 'minutę',
    'минута', 'минуты', 'минут', 'минуту', 'минутах', 'мин',
  ],
  second: [
    'segundo', 'segundos', 'seconde', 'secondes', 'secondo', 'secondi',
    'sekunda', 'sekundy', 'sekund', 'sekundę', 'секунда', 'секунды', 'секунд', 'секунду', 'секундах', 'сек',
  ],
  next: [
    'próximo', 'próxima', 'proximo', 'proxima', 'prochain', 'prochaine', 'prossimo', 'prossima',
    'następny', 'następna', 'następną', 'przyszły', 'przyszła', 'следующий', 'следующая', 'следующую', 'следующее',
  ],
  last: [
    'pasado', 'pasada', 'último', 'última', 'dernier', 'dernière', 'passado', 'passada',
    'scorso', 'scorsa', 'zeszły', 'zeszła', 'zeszłą', 'ostatni', 'ostatnia', 'прошлый', 'прошлая', 'прошлую', 'прошлое',
  ],
  until: ["jusqu'à", 'jusqu’à', "jusqu'au", 'jusqu’au', 'hasta', 'até', 'fino', 'до'],
  since: ['desde', 'depuis', 'od', 'с'],
  time: ['orario', 'время'],
  // `data` (Italian, Polish, Portuguese) and `ora` (Italian for now) begin too many app names.
  date: ['fecha', 'дата'],
  christmas: ['navidad', 'noël', 'natal', 'natale', 'рождество'],
  easter: ['pascua', 'pâques', 'páscoa', 'pasqua', 'wielkanoc', 'пасха'],
};

/** Chinese and Japanese write no spaces: these are replaced inside the text, longest first. */
// prettier-ignore
const INLINE: [string, string][] = [
  ['星期', ' week '], ['週間', ' week '], ['个月', ' month '], ['個月', ' month '], ['ヶ月', ' month '],
  ['か月', ' month '], ['カ月', ' month '], ['小时', ' hour '], ['小時', ' hour '], ['時間', ' hour '],
  ['分钟', ' minute '], ['分鐘', ' minute '], ['今天', ' today '], ['今日', ' today '], ['明天', ' tomorrow '],
  ['明日', ' tomorrow '], ['昨天', ' yesterday '], ['昨日', ' yesterday '], ['现在', ' now '], ['現在', ' now '],
  ['周', ' week '], ['週', ' week '], ['天', ' day '], ['日', ' day '], ['月', ' month '], ['年', ' year '],
  ['分', ' minute '], ['秒', ' second '],
];

/** Words before the amount that mean "ago", and words after it. */
const AGO_BEFORE = /^(?:hace|il y a|há|faz) (.+)$/;
const AGO_AFTER = /^(.+?) ?(?:fa|temu|назад|atrás|atras|前|以前)$/;
/** "In …" before the amount, and after it. */
const IN_BEFORE = /^(?:en|dentro de|dans|em|daqui a|tra|fra|za|через) (.+)$/;
const IN_AFTER = /^(.+?) ?(?:后|後|以后|以後)$/;

let words: Map<string, string> | null = null;

function table(): Map<string, string> {
  if (words) return words;
  const map = new Map<string, string>();
  for (const [english, list] of Object.entries(WORDS))
    for (const word of list) map.set(word, english);
  // Long names of weekdays and months, standing alone and as written inside a date.
  for (const locale of LOCALES) {
    for (const [options, part] of [
      [{ weekday: 'long' }, 'weekday'],
      [{ month: 'long' }, 'month'],
      [{ day: 'numeric', month: 'long' }, 'month'],
    ] as const) {
      const format = new Intl.DateTimeFormat(locale, { ...options, timeZone: 'UTC' });
      const count = part === 'weekday' ? 7 : 12;
      for (let i = 0; i < count; i++) {
        // 2023-01-01 was a Sunday.
        const date = part === 'weekday' ? Date.UTC(2023, 0, 1 + i) : Date.UTC(2023, i, 15);
        const name = format
          .formatToParts(date)
          .find(p => p.type === part)
          ?.value.toLowerCase();
        const english = part === 'weekday' ? WEEKDAYS[i] : MONTHS[i];
        // `1月` and the like are handled as numbers.
        if (name && english && !/\d/.test(name) && !map.has(name)) map.set(name, english);
      }
    }
  }
  words = map;
  return map;
}

/**
 * The phrase in the words the evaluators know, or null when nothing in it was
 * recognised (the text is then English, German, or not a phrase at all).
 */
export function normalizePhrase(input: string): string | null {
  let text = input.trim().toLowerCase();
  if (!text) return null;
  const original = text;

  if (/[぀-ヿ一-鿿]/.test(text)) {
    let m = AGO_AFTER.exec(text);
    if (m) text = `${m[1]} ago`;
    else if ((m = IN_AFTER.exec(text))) text = `in ${m[1]}`;
    for (const [from, to] of INLINE) text = text.split(from).join(to);
    text = text.replace(/(\d)(?=\p{L})/gu, '$1 ');
  }

  const map = table();
  text = text
    .split(/\s+/)
    .filter(Boolean)
    .map(word => map.get(word) ?? word)
    .join(' ');

  // In the middle: `2 jours en heures`, `lunes en 3 semanas`.
  text = text.replace(/(?<=\S) (?:en|em|na|в|dans|za|через|tra|fra) (?=\S)/g, ' in ');
  // `vendredi prochain`, `semana pasada`: the qualifier comes first in English.
  text = text.replace(/^(\S+) (next|last)$/, '$2 $1');

  let m = AGO_BEFORE.exec(text);
  if (m) text = `${m[1]} ago`;
  else if ((m = AGO_AFTER.exec(text))) text = `${m[1]} ago`;
  else if ((m = IN_BEFORE.exec(text))) text = `in ${m[1]}`;

  return text === original ? null : text;
}
