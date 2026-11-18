# Translating Visor

Every text in Visor goes through gettext. The source language is English, German (`de`) is the reference translation.
Spanish, French, Brazilian Portuguese, Italian, Polish, Russian, Simplified Chinese and Japanese are machine translated;
improvements are welcome.

## Add a language

1. `pnpm install`, then `pnpm pot`. This builds the extension, rewrites `po/visor.pot` and merges it into every `po/*.po`.
2. Create the file with the locale code, for example `sv`:
   `msginit --no-translator -l sv -i po/visor.pot -o po/sv.po`
3. Add `sv` to `po/LINGUAS`.
4. Translate every entry. Check `Language`, `Language-Team` and `Plural-Forms` in the header; `Content-Type` stays
   `text/plain; charset=UTF-8`. Check that `msginit` did not leave `nplurals=INTEGER; plural=EXPRESSION;` behind.
5. `msgfmt --check --statistics -o /dev/null po/sv.po` must report no untranslated and no fuzzy entries.
6. `pnpm build && pnpm lint && pnpm test`. The build compiles every `po/*.po` into `build/locale/<lang>/LC_MESSAGES/visor.mo`.

## Update a language

After the source changed, run `pnpm pot`. New and changed texts arrive in each `.po` file as empty or `#, fuzzy` entries.
Translate them and delete the `fuzzy` flag once the text is right. `msgfmt --check` catches broken placeholders.

Modules outside Visor use the same steps in their own `po/` folder. The template in `examples/module-template/po/` has a
`pot` script and a `LINGUAS` file and ships the same eight languages.

## Rules

- **Tone:** short, friendly, plain, no exclamation marks. Where the language has an informal and a formal address, use the
  informal one in sentences (es tú, it tu). French, Polish, Russian and Japanese use the neutral style of GNOME's own
  translations (infinitive or impersonal, です/ます). Labels on buttons and chips stay about as short as the German ones.
- **GNOME terms:** use the word GNOME's own translation uses for desktop concepts, see the table below. When unsure, look
  the word up in GNOME Shell, Settings, Clocks or Files in your language.
- **Do not translate** `Visor`, `GNOME`, currency codes, the keywords that are typed into the search (`timer`,
  `stopwatch`). In the example hints (`timer 25m Pizza`,
  `stopwatch Research`) keep the keyword and the duration, translate only the free text.
  The timer keyword comes from the code, not from gettext, so a translated keyword would not work.
- **Placeholders:** keep every `%s` and `%d` exactly and **in the same order**. The code fills them one after the other
  (`in %d h %d min` takes hours first, then minutes), so positional forms like `%2$d` do not work.
- **Punctuation:** keep the ellipsis `…`, key names (`Super+V`, `Esc`, `Backspace`) and the middle dot `·`. Follow the
  punctuation of the language: no narrow spaces before `:` or `?` in short French labels, full-width punctuation in
  Chinese and Japanese (`，` `。` `（` `）`).
- **Plurals:** the plural entry needs every form of the language (`msgstr[0]` … `msgstr[n-1]`). Polish and Russian have three.
- Mark anything uncertain with a translator comment (`# …`) instead of guessing silently.

## Glossary

| English        | es               | fr              | pt_BR        | it             | pl               | ru                | zh_CN  | ja               |
| -------------- | ---------------- | --------------- | ------------ | -------------- | ---------------- | ----------------- | ------ | ---------------- |
| Now            | Ahora            | Maintenant      | Agora        | Adesso         | Teraz            | Сейчас            | 现在   | 現在             |
| Up Next        | A continuación   | À venir         | A seguir     | In arrivo      | Następnie        | Далее             | 接下来 | この後           |
| Notifications  | Notificaciones   | Notifications   | Notificações | Notifiche      | Powiadomienia    | Уведомления       | 通知   | 通知             |
| Do Not Disturb | No molestar      | Ne pas déranger | Não perturbe | Non disturbare | Nie przeszkadzać | Не беспокоить     | 勿扰   | サイレントモード |
| Modules        | Módulos          | Modules         | Módulos      | Moduli         | Moduły           | Модули            | 模块   | モジュール       |
| Discover       | Descubrir        | Découvrir       | Descobrir    | Scopri         | Odkrywanie       | Каталог           | 发现   | 見つける         |
| Timer          | Temporizador     | Minuteur        | Temporizador | Timer          | Minutnik         | Таймер            | 计时器 | タイマー         |
| Stopwatch      | Cronómetro       | Chronomètre     | Cronômetro   | Cronometro     | Stoper           | Секундомер        | 秒表   | ストップウォッチ |
| Alarm          | Alarma           | Alarme          | Alarme       | Sveglia        | Budzik           | Будильник         | 闹钟   | アラーム         |
| Downloads      | Descargas        | Téléchargements | Downloads    | Download       | Pobrane          | Загрузки          | 下载   | ダウンロード     |
| Shortcut       | Atajo de teclado | Raccourci       | Atalho       | Scorciatoia    | Skrót klawiszowy | Комбинация клавиш | 快捷键 | ショートカット   |
| Dismiss        | Descartar        | Ignorer         | Dispensar    | Ignora         | Odrzuć           | Скрыть            | 忽略   | 閉じる           |
| Dock           | Dock             | Dock            | Dock         | Dock           | Dock             | Док               | Dock   | Dock             |
| Media          | Multimedia       | Médias          | Mídia        | Multimedia     | Multimedia       | Медиа             | 媒体   | メディア         |
| Pairing        | emparejamiento   | appairage       | pareamento   | abbinamento    | parowanie        | сопряжение        | 配对   | ペアリング       |
| Thread         | hilo             | fil             | conversa     | thread         | wątek            | тред              | 会话   | スレッド         |
| Agent          | Agente           | Agent           | Agente       | Agente         | Agent            | Агент             | 代理   | エージェント     |

The German terms (`Jetzt`, `Als Nächstes`, `Mitteilungen`, `Nicht stören`, …) are listed in
`docs/design/plan/04-design.md` and serve as the reference for the meaning of each term.
