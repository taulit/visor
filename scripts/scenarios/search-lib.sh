# Shared by the search-* scenarios and tests/shell/search.sh: the demo modules
# of search-demo.js and a way to put a text into the search entry. Sourced,
# not a scenario of its own.
source "$repo/scripts/scenarios/content-lib.sh"

# The search providers of the installed apps would start their services in the
# sandbox and show whatever this machine has; scenarios do without them.
search_without_providers() {
    shell_eval 'new Gio.Settings({schema_id: "org.gnome.desktop.search-providers"}).set_boolean("disable-external", true)' >/dev/null
}

search_register() {
    shell_wait_for 'visor !== null && visor.api !== null'
    shell_eval "(() => { $(<"$repo/scripts/scenarios/search-demo.js")
        return globalThis.visorSearchDemoRegister(); })()" >/dev/null
}

# search_query TEXT: opens the panel if needed, sets the text and waits for the list.
search_query() {
    shell_eval 'visor.notch.open()' >/dev/null
    shell_eval "(visor.content.sheet.entry.set_text('$1'), true)" >/dev/null
    shell_eval 'new Promise(r => GLib.timeout_add(GLib.PRIORITY_DEFAULT, 250, () => (r(true), false)))' >/dev/null
}
