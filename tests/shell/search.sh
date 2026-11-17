#!/usr/bin/env bash
# Drives the search in the sandboxed headless shell with real key and pointer
# events: calculation, currency, apps, the command and the search source of a
# demo module, a GNOME search provider, keys, stale answers, and what is left
# after closing.
#
# Usage: tests/shell/search.sh
# The log ends up in .shell-test/search.log. It contains one error of the demo
# module that throws on purpose; anything else fails the test.
set -euo pipefail

repo="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

if [[ "${1:-}" != --inside ]]; then
    exec "$repo/scripts/nested.sh" --log "$repo/.shell-test/search.log" -- \
        "$repo/tests/shell/search.sh" --inside
fi

# Everything below writes into the sandbox only.
[[ -n "${VISOR_SANDBOX:-}" && "$HOME" == "$VISOR_SANDBOX"/* ]] || { echo "not in the sandbox" >&2; exit 2; }

source "$repo/scripts/lib/shell.sh"
source "$repo/scripts/scenarios/search-lib.sh"

fail=0
# check NAME JS: passes when JS evaluates to true.
check() {
    local got
    got="$(shell_eval "$2" 2>&1)" || true
    if [[ "$got" == true ]]; then
        echo "ok    $1"
    else
        echo "FAIL  $1: $got"
        fail=1
    fi
}
run() { shell_eval "$1" >/dev/null; }

# Fresh rates, so the search has no reason to download any.
mkdir -p "$XDG_CACHE_HOME/visor"
rates="$XDG_CACHE_HOME/visor/rates.json"
printf '{"fetched":%s000,"date":"2026-11-13","rates":{"EUR":1,"USD":1.0812,"GBP":0.8377,"JPY":166.73}}' \
    "$(date +%s)" >"$rates"
rates_before="$(<"$rates")"

# A GNOME search provider of our own: an app, the provider file, and further
# down the D-Bus service, which lives in the shell itself. The providers of
# the installed apps are turned off, so none of them is started.
mkdir -p "$VISOR_SANDBOX/share/applications" "$VISOR_SANDBOX/share/gnome-shell/search-providers"
cat >"$VISOR_SANDBOX/share/applications/visor-demo-provider.desktop" <<'INI'
[Desktop Entry]
Type=Application
Name=Visor Demo Provider
Exec=true
Icon=folder
INI
cat >"$VISOR_SANDBOX/share/gnome-shell/search-providers/visor-demo.ini" <<'INI'
[Shell Search Provider]
DesktopId=visor-demo-provider.desktop
BusName=io.github.taulit.VisorDemo.SearchProvider
ObjectPath=/io/github/taulit/VisorDemo/SearchProvider
Version=2
INI

content_register
search_register
log_before="$(wc -l <"$HOME/shell.log")"

# Helpers that live in the shell for the rest of the test.
run "(() => {
    const seat = Clutter.get_default_backend().get_default_seat();
    const keyboard = seat.create_virtual_device(Clutter.InputDeviceType.KEYBOARD_DEVICE);
    const pointer = seat.create_virtual_device(Clutter.InputDeviceType.POINTER_DEVICE);
    const now = () => GLib.get_monotonic_time();
    const wait = ms => new Promise(r => GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, () => (r(true), false)));
    const centre = actor => {
        const [x, y] = actor.get_transformed_position();
        const [w, h] = actor.get_transformed_size();
        return [x + w / 2, y + h / 2];
    };
    const moveTo = async actor => {
        const [x, y] = centre(actor);
        for (let i = 0; i < 10; i++) {
            pointer.notify_absolute_motion(now(), x, y);
            await wait(60);
            const [px, py] = global.get_pointer();
            if (Math.abs(px - x) <= 1 && Math.abs(py - y) <= 1) return;
        }
        throw new Error('the pointer does not move to ' + x + ',' + y);
    };
    const press = symbol => {
        keyboard.notify_keyval(now(), symbol, Clutter.KeyState.PRESSED);
        keyboard.notify_keyval(now(), symbol, Clutter.KeyState.RELEASED);
    };
    const label = (line, cls) => $(content_find "' + cls + '").find(a => line.contains(a))?.text ?? '';
    globalThis.T = {
        wait,
        demo: visorSearchDemo,
        sheet: visor.content.sheet,
        finder: visor.content.finder,
        find: cls => $(content_find "' + cls + '"),
        focus: () => global.stage.get_key_focus(),
        async key(...symbols) {
            for (const symbol of symbols) {
                press(symbol);
                await wait(60);
            }
        },
        async ctrlEnter() {
            keyboard.notify_keyval(now(), Clutter.KEY_Control_L, Clutter.KeyState.PRESSED);
            press(Clutter.KEY_Return);
            keyboard.notify_keyval(now(), Clutter.KEY_Control_L, Clutter.KeyState.RELEASED);
            await wait(100);
        },
        // Types a text key by key, then waits for the debounce and the answers.
        async type(text, settle = 200) {
            for (const char of text) {
                press(Clutter.unicode_to_keysym(char.codePointAt(0)));
                await wait(15);
            }
            await wait(settle);
        },
        async open() {
            if (visor.notch.state !== 'open') visor.notch.open();
            await wait(150);
        },
        // Opens the panel with an empty entry and types.
        async ask(text, settle) {
            await T.open();
            T.sheet.clearQuery();
            T.sheet.entry.grab_key_focus();
            await T.type(text, settle);
        },
        text: () => T.sheet.entry.get_text(),
        shown: () => T.sheet.overlay.visible && T.sheet.overlay.mapped,
        // The lines of the list: 'title|subtitle|hint', '>' before the selected one, '-' before one that only says something.
        lines: () => T.shown() ? T.find('visor-result').filter(a => a.mapped).map(line =>
            (line.has_style_class_name('selected') ? '>' : line.has_style_class_name('quiet') ? '-' : '') +
            [label(line, 'visor-result-title'), label(line, 'visor-result-subtitle'), T.find('visor-result-hint').find(a => line.contains(a) && a.visible)?.text ?? ''].join('|')) : [],
        titles: () => T.lines().map(line => line.replace(/^[>-]/, '').split('|')[0]),
        selected: () => T.lines().find(line => line.startsWith('>'))?.slice(1).split('|')[0] ?? null,
        line: title => T.find('visor-result').find(line => line.mapped && label(line, 'visor-result-title') === title) ?? null,
        groups: () => T.shown() ? T.find('visor-result-group').filter(a => a.mapped).map(a => a.text) : [],
        // What is in a group of the controller, by its id.
        group: id => T.finder.groups.find(group => group.id === id)?.items.map(item => item.title) ?? null,
        clipboard: () => new Promise(resolve => St.Clipboard.get_default().get_text(St.ClipboardType.CLIPBOARD, (_c, text) => resolve(text))),
        logged: what => T.demo.log.filter(entry => entry === what).length,
        async move(actor) {
            await moveTo(actor);
            await wait(100);
        },
        async click(actor) {
            await moveTo(actor);
            pointer.notify_button(now(), Clutter.BUTTON_PRIMARY, Clutter.ButtonState.PRESSED);
            pointer.notify_button(now(), Clutter.BUTTON_PRIMARY, Clutter.ButtonState.RELEASED);
            await wait(150);
        },
        // Nothing of a query is left: no list, no cancellable, no idle source, no debounce.
        quiet: () => !T.sheet.overlay.visible && T.finder.groups.length === 0 && T.finder.cancellable === null && T.finder.idle === 0
            && T.finder.query === null && T.sheet.debounce === 0 && (T.finder.results?.later ?? 0) === 0 && (T.finder.rates?.running ?? null) === null && T.find('visor-result').every(a => !a.mapped),
        // Time from the query reaching the search until the next frame is on screen, in µs.
        async paint(text) {
            const original = T.sheet.queryHandler;
            let start = 0;
            T.sheet.queryHandler = query => { start = now(); original(query); };
            // A query that changes nothing on screen paints nothing; that one does not count.
            const painted = new Promise(resolve => {
                let id = global.stage.connect('after-paint', () => {
                    if (!start || !id) return;
                    global.stage.disconnect(id);
                    id = 0;
                    resolve(now() - start);
                });
                GLib.timeout_add(GLib.PRIORITY_DEFAULT, 400, () => {
                    if (id) global.stage.disconnect(id);
                    id = 0;
                    resolve(0);
                    return false;
                });
            });
            await T.type(text, 0);
            const time = await painted;
            T.sheet.queryHandler = original;
            await wait(150);
            return time;
        },
    };
    return true;
})()"

# The D-Bus side of the demo provider, and all other providers off.
run "(() => {
    const iface = '<node><interface name=\"org.gnome.Shell.SearchProvider2\">' +
        '<method name=\"GetInitialResultSet\"><arg type=\"as\" direction=\"in\"/><arg type=\"as\" direction=\"out\"/></method>' +
        '<method name=\"GetSubsearchResultSet\"><arg type=\"as\" direction=\"in\"/><arg type=\"as\" direction=\"in\"/><arg type=\"as\" direction=\"out\"/></method>' +
        '<method name=\"GetResultMetas\"><arg type=\"as\" direction=\"in\"/><arg type=\"aa{sv}\" direction=\"out\"/></method>' +
        '<method name=\"ActivateResult\"><arg type=\"s\" direction=\"in\"/><arg type=\"as\" direction=\"in\"/><arg type=\"u\" direction=\"in\"/></method>' +
        '<method name=\"LaunchSearch\"><arg type=\"as\" direction=\"in\"/><arg type=\"u\" direction=\"in\"/></method>' +
        '</interface></node>';
    const calls = [];
    const provider = {
        GetInitialResultSet(terms) {
            calls.push('search:' + terms.join(' '));
            return terms.join(' ').includes('visor') ? ['r1', 'r2', 'r3', 'r4', 'r5'] : [];
        },
        GetSubsearchResultSet(_previous, terms) { return provider.GetInitialResultSet(terms); },
        GetResultMetas(ids) {
            return ids.map(id => ({
                id: new GLib.Variant('s', id),
                name: new GLib.Variant('s', 'Demo result ' + id),
                description: new GLib.Variant('s', 'From the demo provider'),
                gicon: new GLib.Variant('s', 'folder-symbolic'),
            }));
        },
        ActivateResult(id, terms) { calls.push('activate:' + id + ':' + terms.join(' ')); },
        LaunchSearch() {},
    };
    const dbus = Gio.DBusExportedObject.wrapJSObject(iface, provider);
    dbus.export(Gio.DBus.session, '/io/github/taulit/VisorDemo/SearchProvider');
    const name = Gio.bus_own_name_on_connection(Gio.DBus.session, 'io.github.taulit.VisorDemo.SearchProvider', Gio.BusNameOwnerFlags.NONE, null, null);
    T.provider = { calls, stop() { Gio.bus_unown_name(name); dbus.unexport(); } };

    const others = [];
    for (const dir of GLib.get_system_data_dirs()) {
        const path = GLib.build_filenamev([dir, 'gnome-shell', 'search-providers']);
        let names;
        try { names = GLib.Dir.open(path, 0); } catch { continue; }
        for (let file = names.read_name(); file !== null; file = names.read_name()) {
            const keys = new GLib.KeyFile();
            try {
                keys.load_from_file(GLib.build_filenamev([path, file]), GLib.KeyFileFlags.NONE);
                const id = keys.get_string('Shell Search Provider', 'DesktopId');
                if (id !== 'visor-demo-provider.desktop') others.push(id);
            } catch {}
        }
    }
    new Gio.Settings({ schema_id: 'org.gnome.desktop.search-providers' }).set_strv('disabled', others);
    return true;
})()"
shell_wait_for '(() => { try { return imports.gi.GioUnix.DesktopAppInfo.new("visor-demo-provider.desktop") !== null; } catch { return false; } })()' 15

echo "# calculate"
run 'visor.notch.open()'
run 'T.wait(200)'
run 'globalThis.heightBefore = visor.notch.body.height'
check 'nothing is built before the first query' 'T.finder.results === null && T.finder.rates === null && !T.finder.remote.loaded && !T.shown()'
check 'typing 2+3*4 shows = 14 as the only, selected result' \
    'T.type("2+3*4").then(() => T.lines().join(" / ") === ">= 14||Enter copies" && T.groups().join() === "CALCULATE" || T.lines().join(" / ") + " # " + T.groups().join())'
check 'the list floats: the panel keeps its height' \
    'visor.notch.body.height === heightBefore && T.sheet.root.height === heightBefore || [heightBefore, visor.notch.body.height, T.sheet.root.height].join()'
check 'the list sits 6 px below the search row and is as wide as it' \
    '(() => { const row = T.find("visor-search")[0]; const list = T.sheet.overlay; const [rx, ry] = row.get_transformed_position(); const [lx, ly] = list.get_transformed_position(); return ly - (ry + row.height) === 6 && lx === rx && list.width === row.width || [ry, row.height, ly, rx, lx, row.width, list.width].join(); })()'
echo "      first query of the session, local results after µs: $(shell_eval 'T.finder.timing.local')"
# The first query of a session happens once, so there is no median to take: it is
# printed, and fails only beyond the hard limit of 50 ms (usual: 6 to 12 ms).
check 'the first query of the session stays below the hard limit of 50 ms' 'T.finder.timing.local <= 50000 || T.finder.timing.local'
check 'the focus stays in the entry' 'T.focus() === T.sheet.entry.clutter_text'
check 'Enter copies 14 and closes the panel' \
    'T.key(Clutter.KEY_Return).then(() => T.clipboard()).then(text => text === "14" && visor.notch.state === "idle" || [text, visor.notch.state].join())'
check 'after closing the entry is empty and nothing is left of the query' 'T.text() === "" && T.quiet() || [T.text(), T.sheet.overlay.visible, T.finder.groups.length, T.finder.idle].join()'
check 'an empty query shows no list, and Down still moves into the rows' \
    '(async () => { await T.ask("1+1"); const shown = T.shown(); for (let i = 0; i < 3; i++) await T.key(Clutter.KEY_BackSpace); await T.wait(150); const hidden = !T.shown() && T.quiet(); await T.key(Clutter.KEY_Down); const moved = T.focus().has_style_class_name("visor-row-main"); T.sheet.entry.grab_key_focus(); return shown && hidden && moved || [shown, hidden, moved].join(); })()'

echo "# convert"
check '100 usd in eur shows the amount, the rate and the day of the rates' \
    'T.ask("100 usd in eur", 400).then(() => T.lines().join(" / ") === ">€92.49|1 USD = 0.9249 EUR · Nov 13|Enter copies" || T.lines().join(" / "))'
check 'Enter copies the amount and closes the panel' \
    'T.key(Clutter.KEY_Return).then(() => T.clipboard()).then(text => text === "€92.49" && visor.notch.state === "idle" || [text, visor.notch.state].join())'
[[ "$(<"$rates")" == "$rates_before" ]] && echo "ok    fresh rates in the cache are not downloaded again" || { echo "FAIL  the cache file changed"; fail=1; }
check 'with the rates turned off a quiet line says so, and Enter does nothing' \
    '(async () => { visor.getSettings().set_boolean("currency-rates", false); await T.ask("100 usd in eur", 300); const lines = T.lines().join(" / "); await T.key(Clutter.KEY_Return); return lines === "-Currency rates are turned off||" && T.selected() === null && visor.notch.state === "open" && T.text() === "100 usd in eur" || [lines, visor.notch.state].join(); })()'
check 'turning the rates on again shows the amount at once' \
    '(async () => { visor.getSettings().reset("currency-rates"); await T.wait(100); return T.lines()[0].startsWith(">€92.49|") || T.lines().join(" / "); })()'
check 'a currency without a target converts to the currency of the locale' \
    'T.ask("50 gbp", 300).then(() => T.lines()[0].startsWith(">$64.53|1 GBP = 1.2907 USD") || T.lines().join(" / "))'

echo "# apps"
run '(() => {
    const apps = Shell.AppSystem.get_default().get_installed().filter(info => info.should_show());
    const info = apps.find(a => /^[a-z]{4,12}$/.test(a.get_name().toLowerCase()) && Shell.AppSystem.search(a.get_name().toLowerCase()).flat().includes(a.get_id()));
    const app = Shell.AppSystem.get_default().lookup_app(info.get_id());
    T.app = { id: info.get_id(), name: app.get_name(), query: app.get_name().toLowerCase(), calls: [] };
    // The test does not start apps.
    app.activate = () => T.app.calls.push("activate");
    app.open_new_window = () => T.app.calls.push("new-window");
    return true;
})()'
echo "      app under test: $(shell_eval 'T.app.id')"
check 'an app query finds the installed app, at most five, with its icon' \
    '(async () => { await T.ask(T.app.query, 300); const apps = T.finder.groups.find(g => g.id === "apps").items; const line = T.line(T.app.name); const icon = T.find("visor-result-icon").find(a => line?.contains(a)); await T.wait(50); return apps.length >= 1 && apps.length <= 5 && apps.some(a => a.id === T.app.id) && T.groups().includes("APPS") && icon?.gicon !== null && icon.has_style_class_name("app") || [apps.map(a => a.id).join(), T.groups().join()].join(" # "); })()'
check 'Enter launches the selected app and closes the panel' \
    '(async () => { const keys = T.finder.groups.flatMap(g => g.items.filter(i => i.activate).map(i => i.id)); for (let i = 0; i < keys.indexOf(T.app.id); i++) await T.key(Clutter.KEY_Down); const selected = T.selected(); await T.key(Clutter.KEY_Return); return selected === T.app.name && T.app.calls.join() === "activate" && visor.notch.state === "idle" || [selected, T.app.calls.join(), visor.notch.state].join(); })()'
check 'Ctrl+Enter opens a new window of the app' \
    '(async () => { await T.ask(T.app.query, 300); const keys = T.finder.groups.flatMap(g => g.items.filter(i => i.activate).map(i => i.id)); for (let i = 0; i < keys.indexOf(T.app.id); i++) await T.key(Clutter.KEY_Down); await T.ctrlEnter(); return T.app.calls.join() === "activate,new-window" && visor.notch.state === "idle" || [T.app.calls.join(), visor.notch.state].join(); })()'

echo "# commands"
check 'the beginning of a keyword offers the command, below everything else' \
    'T.ask("tim", 300).then(() => { const groups = T.groups(), lines = T.lines(); return groups[groups.length - 1] === "COMMANDS" && lines[lines.length - 1].endsWith("timer|timer 25m Pizza|Enter completes") && (lines.length === 1 || !lines[lines.length - 1].startsWith(">")) || [groups.join(), lines.join(" / ")].join(" # "); })'
check 'a prefix of a keyword that is also an app: Enter launches the first app, not the completion' \
    '(async () => {
        const keyword = T.app.query + "zz";
        visor.api.register({ id: "prefix", name: "Prefix", icon: "dialog-information-symbolic", slot: "now", enable() {}, disable() {},
            commands: [{ keyword: [keyword], hint: keyword + " now", resolve: () => [] }] });
        await T.ask(T.app.query, 300);
        const apps = T.finder.groups.find(g => g.id === "apps").items;
        // The test does not start apps: the first one may be another than the app under test.
        const top = Shell.AppSystem.get_default().lookup_app(apps[0].id);
        if (apps[0].id !== T.app.id) top.activate = () => T.app.calls.push("activate");
        const lines = T.lines(), selected = T.selected(), before = T.app.calls.length;
        await T.key(Clutter.KEY_Return);
        await T.wait(100);
        visor.api.unregister("prefix");
        const offered = lines[lines.length - 1] === keyword + "|" + keyword + " now|Enter completes";
        return offered && selected === top.get_name() && T.app.calls.length === before + 1 && T.app.calls[before] === "activate" && visor.notch.state === "idle" && T.text() === "" || [lines.join(" / "), selected, T.app.calls.join(), visor.notch.state, T.text()].join(" # ");
    })()'
check 'Enter on the completion writes the keyword into the entry and leaves the panel open' \
    '(async () => { await T.ask("tim", 300); for (let i = 0; i < 12 && T.selected() !== "timer"; i++) await T.key(Clutter.KEY_Down); await T.key(Clutter.KEY_Return); await T.wait(100); return T.text() === "timer " && T.sheet.entry.clutter_text.get_cursor_position() === -1 && visor.notch.state === "open" && T.focus() === T.sheet.entry.clutter_text || [T.text(), visor.notch.state].join(); })()'
check 'without arguments the hint of the command is a line that cannot be chosen' \
    '(() => { const line = T.lines()[0]; return line === "-timer 25m Pizza|Timers|" && T.group("command").join() === "timer 25m Pizza" && !T.finder.groups[0].items[0].activate && T.demo.log.length === 0 || line; })()'
check 'with arguments the command shows what Enter would do, without doing it' \
    'T.type("5m tea").then(() => T.lines()[0] === ">Start a timer: 5 min · tea|Runs as a live activity in the notch|Enter starts" && T.demo.log.length === 0 || [T.text(), T.lines().join(" / ")].join(" # "))'
check 'Ctrl+Enter runs alternate and closes the panel' \
    'T.ctrlEnter().then(() => T.logged("timer:alternate") === 1 && T.logged("timer:5:tea") === 0 && visor.notch.state === "idle" || T.demo.log.join())'
check 'Enter runs activate; a keyword in another language works too' \
    'T.ask("wecker 12m").then(() => T.key(Clutter.KEY_Return)).then(() => T.logged("timer:12:") === 1 && visor.notch.state === "idle" || T.demo.log.join())'
check 'Enter on nothing but a hint does nothing' \
    '(async () => { await T.ask("wecker"); const lines = T.lines().join(" / "); await T.key(Clutter.KEY_Return); return lines === "-timer 25m Pizza|Timers|" && T.selected() === null && visor.notch.state === "open" && T.text() === "wecker" || [lines, visor.notch.state].join(); })()'
check 'a recognised command asks neither apps nor providers, and Enter on its hint launches nothing' \
    '(async () => {
        visor.api.register({ id: "named", name: "Named", icon: "dialog-information-symbolic", slot: "now", enable() {}, disable() {},
            commands: [{ keyword: [T.app.query], hint: T.app.query + " 5m", resolve: () => [] }] });
        const before = T.app.calls.length;
        await T.ask(T.app.query, 400);
        const lines = T.lines().join(" / "), groups = T.finder.groups.map(g => g.id).join();
        await T.key(Clutter.KEY_Return);
        await T.wait(100);
        const state = visor.notch.state, text = T.text(), selected = T.selected();
        visor.api.unregister("named");
        return lines === "-" + T.app.query + " 5m|Named|" && groups === "command" && selected === null && T.app.calls.length === before && state === "open" && text === T.app.query || [lines, groups, T.app.calls.join(), state, text].join(" # ");
    })()'
check 'Ctrl+Enter on a result without alternate does nothing' \
    '(async () => { await T.ask("2*21"); await T.ctrlEnter(); const open = visor.notch.state === "open" && T.text() === "2*21"; return open && T.lines()[0].startsWith(">= 42") || [visor.notch.state, T.lines().join(" / ")].join(); })()'
check 'a command that answers later shows its hint first, then its result' \
    '(async () => { await T.ask("later milk"); const before = T.lines()[0]; T.demo.later(); await T.wait(100); return before === "-later Call the dentist|Timers|" && T.lines()[0].startsWith(">Later: milk|") || [before, T.lines()[0]].join(" # "); })()'

echo "# module source"
check 'the search source of a module has its own group below the apps' \
    'T.ask("shop", 300).then(() => T.group("source:demo-notes").join() === "Shopping list,Shop opening hours,Workshop notes" && T.groups().at(-1) === "NOTES" && T.demo.queries.at(-1) === "shop" || [T.group("source:demo-notes"), T.groups().join()].join(" # "))'
check 'the groups keep the fixed order' \
    '(() => { const ids = T.finder.groups.map(g => g.id); return ids.slice(0, 4).join() === "command,calc,apps,source:demo-notes" && ids.slice(4).every(id => id.startsWith("provider:")) || ids.join(); })()'

echo "# keys and pointer"
check 'Down and Up walk through all results that can be chosen and stop at the ends' \
    '(async () => { const all = T.finder.groups.flatMap(g => g.items.filter(i => i.activate).map(i => i.title)); const seen = [T.selected()]; for (let i = 0; i < all.length; i++) { await T.key(Clutter.KEY_Down); seen.push(T.selected()); } const down = seen.slice(0, all.length).join() === all.join() && seen.at(-1) === all.at(-1); const back = []; for (let i = 0; i < all.length; i++) { await T.key(Clutter.KEY_Up); back.push(T.selected()); } return all.length >= 3 && down && back.at(-1) === all[0] && back.at(-2) === all[0] && T.focus() === T.sheet.entry.clutter_text || [all.join(), seen.join(), back.join()].join(" # "); })()'
check 'moving the pointer over a line selects it' \
    'T.move(T.line("Shop opening hours")).then(() => T.selected() === "Shop opening hours" || T.selected())'
check 'a new text selects the first result again' \
    '(async () => { await T.type("p", 300); return T.text() === "shopp" && T.selected() === T.titles()[0] && T.group("source:demo-notes").join() === "Shopping list"; })().then(ok => ok || [T.text(), T.selected(), T.group("source:demo-notes")].join(" # "))'
check 'the selection stays where the user put it when a slower group answers' \
    '(async () => {
        visor.api.register({ id: "demo-three", name: "Three", icon: "folder-symbolic", slot: "now", enable() {}, disable() {},
            search: { id: "three", title: "Three", search: () => new Promise(resolve => { T.late = () => resolve([{ id: "late", title: "Late result", activate() {} }]); }) } });
        await T.ask("shop", 300);
        const first = T.selected();
        await T.key(Clutter.KEY_Down, Clutter.KEY_Down);
        const picked = T.selected();
        T.late();
        await T.wait(100);
        const kept = T.selected();
        const arrived = T.titles().includes("Late result");
        visor.api.unregister("demo-three");
        return picked !== null && picked !== first && kept === picked && arrived || [first, picked, kept, arrived].join();
    })()'
check 'a click on a line activates it and closes the panel' \
    '(async () => { await T.ask("shop", 300); await T.click(T.line("Workshop notes")); return T.logged("note:Workshop notes") === 1 && visor.notch.state === "idle" || [T.demo.log.join(), visor.notch.state].join(); })()'
check 'Enter right after the last key works on the text in the entry, not on an older list' \
    '(async () => { await T.ask("visor ideas x", 300); await T.key(Clutter.KEY_BackSpace, Clutter.KEY_BackSpace); await T.wait(200); const before = T.selected(); T.sheet.entry.set_text("2+2"); await T.key(Clutter.KEY_Return); const text = await T.clipboard(); return before === "Visor ideas" && text === "4" && T.logged("note:Visor ideas") === 0 && visor.notch.state === "idle" || [before, text, T.demo.log.join()].join(" # "); })()'
check 'Escape clears the entry and takes the list away, the second Escape closes the panel' \
    '(async () => { await T.ask("shop", 300); const shown = T.shown(); await T.key(Clutter.KEY_Escape); const cleared = T.text() === "" && !T.shown() && visor.notch.state === "open" && T.quiet(); await T.key(Clutter.KEY_Escape); return shown && cleared && visor.notch.state === "idle" || [shown, cleared, visor.notch.state].join(); })()'
check 'a query without any result shows one quiet line' \
    'T.ask("qqqqzzzz", 400).then(() => T.lines().join(" / ") === "-No results||" && T.groups().length === 0 && T.selected() === null || T.lines().join(" / "))'

echo "# stale answers"
check 'an answer for an older text is dropped, its cancellable is cancelled' \
    '(async () => {
        await T.ask("zzz", 300);
        T.demo.hold = true; T.demo.pending.length = 0;
        const calls = T.demo.cancellables.length;
        T.sheet.clearQuery();
        await T.type("sho", 150);          // asks the source; the answer is held back
        await T.type("pp", 150);           // the next keys: a new generation
        const [first, second] = T.demo.cancellables.slice(calls);
        const asked = T.demo.queries.slice(-2).join();
        T.demo.answer(0);                  // the late answer for "sho": three notes
        await T.wait(100);
        const afterStale = T.group("source:demo-notes").join();
        T.demo.answer(1);                  // the answer for "shopp": one note
        await T.wait(100);
        const afterCurrent = T.group("source:demo-notes").join();
        T.demo.hold = false;
        return asked === "sho,shopp" && first.is_cancelled() && !second.is_cancelled() && afterStale === "" && afterCurrent === "Shopping list" && T.titles().includes("Shopping list") && !T.titles().includes("Workshop notes")
            || [asked, first.is_cancelled(), second.is_cancelled(), afterStale, afterCurrent].join(" # ");
    })()'
check 'while a source has not answered, its previous results stay' \
    '(async () => { T.demo.hold = true; T.demo.pending.length = 0; await T.key(Clutter.KEY_BackSpace, Clutter.KEY_BackSpace); await T.wait(150); const kept = T.group("source:demo-notes").join(); const shown = T.titles().includes("Shopping list"); T.demo.pending.at(-1)(); await T.wait(100); T.demo.hold = false; return T.text() === "sho" && kept === "Shopping list" && shown && T.group("source:demo-notes").length === 3 || [T.text(), kept, shown, T.group("source:demo-notes")].join(" # "); })()'
check 'closing the panel cancels the running query and drops its answer' \
    '(async () => { T.demo.hold = true; T.demo.pending.length = 0; await T.ask("work", 150); const cancellable = T.demo.cancellables.at(-1); visor.notch.close(); await T.wait(100); const cancelled = cancellable.is_cancelled(); T.demo.answer(0); await T.wait(100); T.demo.hold = false; return cancelled && T.quiet() && T.text() === "" || [cancelled, T.quiet()].join(); })()'

echo "# GNOME search providers"
check 'the providers are loaded on the first query, the demo provider is the only one' \
    'T.finder.remote.loaded && T.finder.remote.providers.map(p => p.id).join() === "visor-demo-provider.desktop" || T.finder.remote.providers?.map(p => p.id).join()'
check 'a provider shows at most three results below its app name, with their icons' \
    '(async () => { await T.ask("visor", 600); const titles = T.group("provider:visor-demo-provider.desktop").join(); const line = T.line("Demo result r1"); const icon = line?.get_first_child().get_first_child(); return titles === "Demo result r1,Demo result r2,Demo result r3" && T.groups().at(-1) === "VISOR DEMO PROVIDER" && icon instanceof St.Icon && icon.gicon.to_string() === "folder-symbolic" || [titles, T.groups().join(), String(icon)].join(" # "); })()'
check 'Enter activates the result of the provider and closes the panel' \
    '(async () => { const keys = T.finder.groups.flatMap(g => g.items.filter(i => i.activate).map(i => i.title)); for (let i = 0; i < keys.indexOf("Demo result r2"); i++) await T.key(Clutter.KEY_Down); await T.key(Clutter.KEY_Return); await T.wait(200); return T.provider.calls.includes("activate:r2:visor") && visor.notch.state === "idle" || [T.provider.calls.join(), visor.notch.state].join(); })()'
check 'replacesSearchProvider of a module hides that provider and stops asking it' \
    '(async () => {
        visor.api.register({ id: "demo-replacer", name: "Replacer", icon: "folder-symbolic", slot: "now", enable() {}, disable() {}, replacesSearchProvider: "visor-demo-provider.desktop" });
        const calls = T.provider.calls.length;
        await T.ask("visor", 600);
        const hidden = T.group("provider:visor-demo-provider.desktop") === null && !T.titles().includes("Demo result r1") && T.provider.calls.length === calls;
        visor.api.unregister("demo-replacer");
        await T.wait(600);
        return hidden && T.group("provider:visor-demo-provider.desktop")?.length === 3 || [hidden, T.group("provider:visor-demo-provider.desktop")].join();
    })()'
check 'a change of the search settings reloads the providers on the next query' \
    '(async () => { const settings = new Gio.Settings({ schema_id: "org.gnome.desktop.search-providers" }); settings.set_boolean("disable-external", true); const dropped = !T.finder.remote.loaded; T.sheet.clearQuery(); await T.type("visor", 600); const none = T.finder.remote.providers.length === 0 && T.finder.groups.every(g => !g.id.startsWith("provider:")); settings.reset("disable-external"); return dropped && none || [dropped, none].join(); })()'

echo "# modules that throw"
check 'a source that rejects and a command that throws do not break the search' \
    '(async () => {
        visor.api.register({ id: "demo-broken", name: "Broken", icon: "dialog-error-symbolic", slot: "now", enable() {}, disable() {},
            search: { id: "broken", title: "Broken", search() { return Promise.reject(new Error("demo source")); } },
            commands: [{ keyword: ["boom"], hint: "boom now", resolve() { throw new Error("demo command"); } }, { keyword: ["bang"], hint: "bang now", resolve: () => Promise.reject(new Error("demo promise")) }] });
        await T.ask("shop", 300);
        const source = T.group("source:demo-notes").length === 3 && T.group("source:demo-broken").length === 0;
        await T.ask("boom 1", 300);
        const thrown = T.lines()[0] === "-boom now|Broken|";
        await T.ask("bang 1", 300);
        const rejected = T.lines()[0] === "-bang now|Broken|";
        await T.ask("2+2", 300);
        return source && thrown && rejected && T.lines()[0].startsWith(">= 4") || [source, thrown, rejected, T.lines().join(" / ")].join();
    })()'
run 'visor.api.unregister("demo-broken")'

echo "# long lists and short panels"
check 'a long list scrolls inside the overlay and follows the selection' \
    '(async () => {
        for (const id of ["demo-many", "demo-more"])
            visor.api.register({ id, name: id, icon: "folder-symbolic", slot: "now", enable() {}, disable() {},
                search: { id, title: id, search: () => Promise.resolve(Array.from({ length: 9 }, (_v, i) => ({ id: "m" + i, title: id + " result " + i, subtitle: "More than fits", activate() {} }))) } });
        await T.ask("shop", 300);
        const scroll = T.finder.results.actor;
        const many = T.group("source:demo-many").length;
        const fits = scroll.height <= 460 && scroll.vadjustment.upper > scroll.vadjustment.page_size && scroll.vadjustment.value === 0;
        for (let i = 0; i < 12; i++) await T.key(Clutter.KEY_Down);
        await T.wait(300);
        const line = T.line(T.selected());
        const [, y] = line.get_transformed_position(); const [, top] = scroll.get_transformed_position();
        const visible = scroll.vadjustment.value > 0 && y >= top && y + line.height <= top + scroll.height + 1;
        const bottom = visor.notch.body.get_transformed_position()[1] + visor.notch.body.height;
        return many === 5 && fits && visible && bottom <= global.stage.height || [many, scroll.height, scroll.vadjustment.upper, scroll.vadjustment.value, y, top, bottom].join();
    })()'
run 'visor.api.unregister("demo-many"), visor.api.unregister("demo-more")'
check 'a panel that is too short for the list grows, and shrinks back without it' \
    '(async () => {
        visor.notch.close();
        for (const id of ["media", "agents", "timers", "downloads", "calendar", "notifications", "notes"]) visor.api.unregister(id);
        await T.open();
        const empty = visor.notch.body.height;
        await T.type("shop", 400);
        const grown = visor.notch.body.height;
        const list = T.sheet.overlay;
        const inside = list.get_transformed_position()[1] + list.height <= visor.notch.body.get_transformed_position()[1] + grown;
        await T.key(Clutter.KEY_Escape); await T.wait(300);
        return grown > empty && inside && visor.notch.body.height === empty || [empty, grown, inside, visor.notch.body.height].join();
    })()'

echo "# speed"
run 'visor.notch.close()'
# Other work on the machine shows up in single queries (16.3 ms was seen once
# where 3 ms is usual). So the same queries are typed in five rounds and each
# query is judged by its median over the rounds: that one has to keep the
# budget, 16 ms for the list and two frames (33 ms) until it is painted. A
# single slow sample does not fail the test, but none may be slower than a
# hard limit of 50 ms for the list and 250 ms until painted (the headless
# shell paints in software, and a busy machine once took 134 ms for a frame): a real regression
# is slow every time and fails the median, a stall is caught by the limit.
measure='(async () => {
    const local = [], paint = [];
    const each = async text => { for (const char of text) { paint.push(await T.paint(char)); local.push(T.finder.timing.local); } };
    await T.ask("");
    await each("timer 5m");
    T.sheet.clearQuery();
    await each("2+3*4");
    T.sheet.clearQuery();
    await each(T.app.query);
    visor.notch.close();
    return [local, paint];
})()'
rounds=()
for round in 1 2 3 4 5; do
    rounds+=("$(shell_eval "$measure")")
done
all="[$(IFS=,; echo "${rounds[*]}")]"
# [worst median of a query, worst single sample] for the list (0) or the painted frame (1), in µs.
summary() {
    shell_eval "(() => { const rounds = $all.map(r => r[$1]); const median = a => [...a].sort((x, y) => x - y)[a.length >> 1]; const perQuery = rounds[0].map((_, i) => median(rounds.map(r => r[i]))); return [Math.max(...perQuery), Math.max(...rounds.flat()), rounds[0].length]; })()"
}
local_times="$(summary 0)" paint_times="$(summary 1)"
echo "      list:    worst median of a query / worst single sample / queries, µs: $local_times"
echo "      painted: worst median of a query / worst single sample / queries, µs: $paint_times"
check 'local results are in the list within 16 ms after the debounce (median of 5 rounds, per query)' \
    "(() => { const [median] = $local_times; return median <= 16000 || median; })()"
check 'no single query took longer than 50 ms for the list' \
    "(() => { const worst = ${local_times}[1]; return worst <= 50000 || worst; })()"
check 'and painted within two frames (median of 5 rounds, per query)' \
    "(() => { const [median] = $paint_times; return median <= 33000 || median; })()"
check 'no single query took longer than 250 ms until it was painted' \
    "(() => { const worst = ${paint_times}[1]; return worst <= 250000 || worst; })()"

echo "# closing and disabling"
check 'nothing is left after closing' \
    '(async () => { visor.notch.close(); await T.wait(150); return T.quiet() && T.text() === "" || [T.sheet.overlay.visible, T.finder.groups.length, T.finder.idle, T.find("visor-result").length].join(); })()'
count="$SHELL_ACTOR_COUNT"
uuid='visor@taulit.github.io'
run 'T.provider.stop()'
run 'delete globalThis.T'
run "Main.extensionManager.disableExtension('$uuid')"
shell_wait_for "Main.extensionManager.lookup('$uuid').state !== 1"
actors_off="$(shell_eval "$count")"
run "Main.extensionManager.enableExtension('$uuid')"
shell_wait_for "Main.extensionManager.lookup('$uuid').state === 1"
content_register
search_register
run 'visor.notch.open()'
run "(visor.content.sheet.entry.set_text('shop'), true)"
shell_wait_for "visor.content.finder.groups.some(g => g.id === 'source:demo-notes' && g.items.length === 3) && visor.content.finder.remote.loaded"
run '(globalThis.oldFinder = visor.content.finder, true)'
run "Main.extensionManager.disableExtension('$uuid')"
shell_wait_for "Main.extensionManager.lookup('$uuid').state !== 1"
check 'disabling the extension with the list open leaves no actor behind' "$count === $actors_off"
check 'destroy dropped the providers, the cancellable, the list and the settings' \
    '(() => { const f = oldFinder; delete globalThis.oldFinder; return f.results === null && f.rates === null && f.cancellable === null && f.idle === 0 && !f.remote.loaded && f.remote.settings === null && f.groups.length === 0; })()'

noise="$(tail -n "+$((log_before + 1))" "$HOME/shell.log" | grep -E 'JS ERROR|WARNING|CRITICAL|has been already disposed' || true)"
expected="$(grep -cE "Visor: module 'demo-broken'" <<<"$noise" || true)"
other="$(grep -vE "Visor: module 'demo-broken'" <<<"$noise" || true)"
echo "errors logged for the throwing module: $expected (1 expected)"
[[ "$expected" == 1 ]] || { echo "FAIL  the throwing module is logged exactly once"; fail=1; }
[[ -z "$other" ]] || { echo "FAIL  unexpected shell warnings:"; echo "$other" | head -n 20; fail=1; }

((fail == 0)) && echo "PASS"
exit "$fail"
