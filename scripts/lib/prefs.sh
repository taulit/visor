#!/usr/bin/env bash
# Helpers to open and drive the settings window of Visor inside scripts/nested.sh.
# Needs scripts/lib/shell.sh.

PREFS_WINDOW="Visor"

# prefs_open: asks the shell for the settings window and waits until it shows.
prefs_open() {
    shell_wait_for "Main.extensionManager.lookup('visor@taulit.github.io')?.state === 1"
    gdbus call --session --dest org.gnome.Shell --object-path /org/gnome/Shell \
        --method org.gnome.Shell.Extensions.OpenExtensionPrefs 'visor@taulit.github.io' '' '{}' >/dev/null
    shell_wait_for "global.get_window_actors().some(a => a.meta_window.title === '$PREFS_WINDOW')" 20
    sleep 1
}

# prefs_page general|modules|about: clicks the tab of that page in the header bar.
prefs_page() {
    local index
    case "$1" in
        general) index=0 ;;
        modules) index=1 ;;
        about) index=2 ;;
        *) echo "prefs_page: unknown page $1" >&2; return 1 ;;
    esac
    shell_eval "(async () => {
        const meta = global.get_window_actors().map(a => a.meta_window).find(w => w.title === '$PREFS_WINDOW');
        const { x, y } = meta.get_frame_rect();
        const pointer = Clutter.get_default_backend().get_default_seat().create_virtual_device(Clutter.InputDeviceType.POINTER_DEVICE);
        const now = () => GLib.get_monotonic_time();
        const wait = ms => new Promise(r => GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, () => (r(), false)));
        pointer.notify_absolute_motion(now(), x + [197, 321, 443][$index], y + 23);
        await wait(200);
        // The window sometimes ignores the first click, and a second one on the same tab does no harm.
        for (let i = 0; i < 2; i++) {
            pointer.notify_button(now(), Clutter.BUTTON_PRIMARY, Clutter.ButtonState.PRESSED);
            await wait(100);
            pointer.notify_button(now(), Clutter.BUTTON_PRIMARY, Clutter.ButtonState.RELEASED);
            await wait(300);
        }
        pointer.notify_absolute_motion(now(), 5, 5);
        await wait(200);
        return true;
    })()" >/dev/null
}

# prefs_close: asks the shell to close the window and waits until it is gone.
prefs_close() {
    shell_eval "global.get_window_actors().map(a => a.meta_window).find(w => w.title === '$PREFS_WINDOW').delete(global.get_current_time())" >/dev/null
    shell_wait_for "!global.get_window_actors().some(a => a.meta_window.title === '$PREFS_WINDOW')"
}
