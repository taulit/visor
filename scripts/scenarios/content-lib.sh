# Shared by the content-* scenarios: registers the demo modules of
# content-demo.js in the sandboxed shell. Sourced, not a scenario of its own.

# All actors below the notch that carry a style class, as a JS expression.
content_find() {
    printf '%s' "(function find(a, out) { if (a.has_style_class_name && a.has_style_class_name('$1')) out.push(a); for (const c of a.get_children()) find(c, out); return out; })(visor.notch.root, [])"
}

# The scenarios show modules made for them. The built-in ones would show the
# calendar and the notifications of the sandbox next to them, and two of them
# share an id with a demo module.
content_clear() {
    shell_wait_for 'visor !== null && visor.api !== null'
    shell_eval '(() => { for (const entry of visor.content.registry.all()) visor.api.unregister(entry.module.id); return true; })()' >/dev/null
}

# content_register [slots]: slots is a JS array such as "['ahead']"; all when empty.
content_register() {
    content_clear
    # Stand-in for cover art.
    magick -size 96x96 -define gradient:angle=135 gradient:'#ff6a3d-#a23cff' "$HOME/cover.png"
    # The file defines visorDemoRegister(); shell_eval wants one expression.
    shell_eval "(() => { $(<"$repo/scripts/scenarios/content-demo.js")
        return globalThis.visorDemoRegister(${1:-null}); })()" >/dev/null
}
