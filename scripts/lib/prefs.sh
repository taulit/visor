#!/usr/bin/env bash
# Helpers to open and drive the settings window of Visor inside scripts/nested.sh.
# Needs scripts/lib/shell.sh.

PREFS_WINDOW="Visor"

# prefs_click DX DY: clicks at DX, DY from the top left corner of the window.
# A window takes no click until the pointer has entered it and moved once more;
# the shell does not tell when a frame of the window is on screen, so it waits.
prefs_click() {
    shell_eval "(async () => {
        const meta = global.get_window_actors().map(a => a.meta_window).find(w => w.title === '$PREFS_WINDOW');
        const { x, y } = meta.get_frame_rect();
        const pointer = Clutter.get_default_backend().get_default_seat().create_virtual_device(Clutter.InputDeviceType.POINTER_DEVICE);
        const now = () => GLib.get_monotonic_time();
        const wait = ms => new Promise(r => GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, () => (r(), false)));
        for (const dx of [-10, 0]) {
            pointer.notify_absolute_motion(now(), x + $1 + dx, y + $2);
            await wait(300);
        }
        pointer.notify_button(now(), Clutter.BUTTON_PRIMARY, Clutter.ButtonState.PRESSED);
        await wait(100);
        pointer.notify_button(now(), Clutter.BUTTON_PRIMARY, Clutter.ButtonState.RELEASED);
        await wait(1000);
        pointer.notify_absolute_motion(now(), 5, 5);
        await wait(300);
        return true;
    })()" >/dev/null
}

# prefs_drag DX DY TO_DX TO_DY: drags from one place of the window to another.
prefs_drag() {
    shell_eval "(async () => {
        const meta = global.get_window_actors().map(a => a.meta_window).find(w => w.title === '$PREFS_WINDOW');
        const { x, y } = meta.get_frame_rect();
        const pointer = Clutter.get_default_backend().get_default_seat().create_virtual_device(Clutter.InputDeviceType.POINTER_DEVICE);
        const now = () => GLib.get_monotonic_time();
        const wait = ms => new Promise(r => GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, () => (r(), false)));
        for (const dx of [-10, 0]) {
            pointer.notify_absolute_motion(now(), x + $1 + dx, y + $2);
            await wait(300);
        }
        pointer.notify_button(now(), Clutter.BUTTON_PRIMARY, Clutter.ButtonState.PRESSED);
        await wait(200);
        for (let i = 1; i <= 12; i++) {
            pointer.notify_absolute_motion(now(), x + $1 + (($3) - ($1)) * i / 12, y + $2 + (($4) - ($2)) * i / 12);
            await wait(60);
        }
        await wait(300);
        pointer.notify_button(now(), Clutter.BUTTON_PRIMARY, Clutter.ButtonState.RELEASED);
        await wait(1500);
        pointer.notify_absolute_motion(now(), 5, 5);
        await wait(300);
        return true;
    })()" >/dev/null
}

# prefs_open: asks the shell for the settings window and waits until it can be used.
prefs_open() {
    shell_wait_for "Main.extensionManager.lookup('visor@taulit.github.io')?.state === 1"
    gdbus call --session --dest org.gnome.Shell --object-path /org/gnome/Shell \
        --method org.gnome.Shell.Extensions.OpenExtensionPrefs 'visor@taulit.github.io' '' '{}' >/dev/null
    shell_wait_for "global.get_window_actors().some(a => a.meta_window.title === '$PREFS_WINDOW')" 20
    sleep 1
    # The first click after the window opens is lost; this one hits the margin of the page.
    prefs_click 20 400
}

# prefs_page general|modules|about: clicks the tab of that page in the header bar.
prefs_page() {
    case "$1" in
        general) prefs_click 197 23 ;;
        modules) prefs_click 321 23 ;;
        about) prefs_click 443 23 ;;
        *) echo "prefs_page: unknown page $1" >&2; return 1 ;;
    esac
}

# prefs_close: asks the shell to close the window and waits until it is gone.
prefs_close() {
    shell_eval "global.get_window_actors().map(a => a.meta_window).find(w => w.title === '$PREFS_WINDOW').delete(global.get_current_time())" >/dev/null
    shell_wait_for "!global.get_window_actors().some(a => a.meta_window.title === '$PREFS_WINDOW')"
}
