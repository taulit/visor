# Shared by the content-* scenarios: registers the demo modules of
# content-demo.js in the sandboxed shell. Sourced, not a scenario of its own.

# All actors below the notch that carry a style class, as a JS expression.
content_find() {
    printf '%s' "(function find(a, out) { if (a.has_style_class_name && a.has_style_class_name('$1')) out.push(a); for (const c of a.get_children()) find(c, out); return out; })(visor.notch.root, [])"
}

# The stand-in notch reads the colour of the panel once, in enable(), before
# the stylesheet of a light session is in place. Give it the colour it would
# read now, so the light tokens can be looked at.
content_match_panel() {
    shell_eval '(() => {
        const c = Main.panel.get_theme_node().get_background_color();
        const dark = 0.2126 * c.red + 0.7152 * c.green + 0.0722 * c.blue < 128;
        const root = visor.notch.root;
        root.style_class = dark ? "visor-dark" : "visor-light";
        root.style = `background-color: rgb(${c.red},${c.green},${c.blue}); border-radius: 0 0 30px 30px;`;
    })()' >/dev/null
}

# content_register [slots]: slots is a JS array such as "['ahead']"; all when empty.
content_register() {
    shell_wait_for 'visor !== null && visor.api !== null'
    content_match_panel
    # Stand-in for cover art.
    magick -size 96x96 -define gradient:angle=135 gradient:'#ff6a3d-#a23cff' "$HOME/cover.png"
    # The file defines visorDemoRegister(); shell_eval wants one expression.
    shell_eval "(() => { $(<"$repo/scripts/scenarios/content-demo.js")
        return globalThis.visorDemoRegister(${1:-null}); })()" >/dev/null
}
