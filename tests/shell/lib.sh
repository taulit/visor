#!/usr/bin/env bash
# Helpers for the runtime checks in this directory. They run inside
# scripts/nested.sh, e.g.: scripts/nested.sh --animations -- tests/shell/notch-motion.sh
source "$VISOR_REPO/scripts/lib/shell.sh"

failures=0

# check NAME JS EXPECTED: compares the JSON result of JS with EXPECTED.
check() {
    local got
    got="$(shell_eval "$2" 2>&1)" || true
    if [[ "$got" == "$3" ]]; then
        printf 'ok    %s  (%s)\n' "$1" "$got"
    else
        printf 'FAIL  %s: expected %s, got %s\n' "$1" "$3" "$got"
        failures=$((failures + 1))
    fi
}

# pause MS: lets the shell run for MS milliseconds.
pause() {
    shell_eval "new Promise(r => GLib.timeout_add(GLib.PRIORITY_DEFAULT, $1, () => (r(true), false)))" >/dev/null
}

# Test-only helpers inside the shell: a virtual pointer and keyboard, a module
# that gives the notch something to show, and a sampler for the size of the body.
shell_eval '(() => {
    const seat = Clutter.get_default_backend().get_default_seat();
    const pointer = seat.create_virtual_device(Clutter.InputDeviceType.POINTER_DEVICE);
    const keyboard = seat.create_virtual_device(Clutter.InputDeviceType.KEYBOARD_DEVICE);
    const now = () => GLib.get_monotonic_time();
    const idle = () => new Promise(r => GLib.timeout_add(GLib.PRIORITY_DEFAULT, 60, () => (r(true), false)));
    globalThis.visorTest = {
        // Moves the pointer and waits until the shell has picked the actor below it.
        async move(x, y) {
            pointer.notify_absolute_motion(now(), x, y);
            await idle();
        },
        async click() {
            pointer.notify_button(now(), Clutter.BUTTON_PRIMARY, Clutter.ButtonState.PRESSED);
            pointer.notify_button(now(), Clutter.BUTTON_PRIMARY, Clutter.ButtonState.RELEASED);
            await idle();
        },
        async key(keyval) {
            keyboard.notify_keyval(now(), keyval, Clutter.KeyState.PRESSED);
            keyboard.notify_keyval(now(), keyval, Clutter.KeyState.RELEASED);
            await idle();
        },
        // Centre of the neck, and a point over the wallpaper far from the notch.
        neck() {
            const neck = Main.panel._centerBox.get_first_child();
            const [x, y] = neck.get_transformed_position();
            return [x + neck.width / 2, y + neck.height / 2];
        },
        away: [300, 700],
        // One row and one chip. Modules do not survive disable(), so tests
        // call this again after they enabled the extension anew.
        register() {
            visor.api.register({
                id: "probe",
                name: "Probe",
                icon: "dialog-information-symbolic",
                slot: "now",
                enable(ctx) {
                    visorTest.ctx = ctx;
                    ctx.now.set([{ id: "row", icon: "dialog-information-symbolic", title: "Probe row" }]);
                    ctx.peek.set(visorTest.chip);
                },
                disable() {},
            });
        },
        // Wider than the hint, so the width of the peek state comes from the chip.
        chip: { icon: "dialog-information-symbolic", text: "The chip of the probe module", priority: 1 },
        // Calls start(), then records [ms, width, height] of the body every 8 ms.
        sample(notch, start, duration) {
            return new Promise(resolve => {
                const t0 = now();
                const out = [];
                start();
                GLib.timeout_add(GLib.PRIORITY_HIGH, 8, () => {
                    const ms = Math.round((now() - t0) / 1000);
                    out.push([ms, notch.body.visible ? notch.body.width : 0, notch.body.visible ? notch.body.height : 0]);
                    if (ms < duration)
                        return true;
                    resolve(out);
                    return false;
                });
            });
        },
    };
    return true;
})()' >/dev/null

# A new virtual pointer starts in the top left corner, which is the hot corner.
shell_eval 'new Gio.Settings({schema_id: "org.gnome.desktop.interface"}).set_boolean("enable-hot-corners", false)' >/dev/null
shell_eval 'visorTest.move(...visorTest.away).then(() => visorTest.move(...visorTest.away))' >/dev/null
shell_eval 'Main.overview.hide()' >/dev/null
shell_wait_for '!Main.overview.visible'
shell_eval 'visorTest.register()' >/dev/null

finish() {
    if ((failures == 0)); then echo "PASS"; else echo "FAILED: $failures"; fi
    exit "$((failures > 0))"
}
