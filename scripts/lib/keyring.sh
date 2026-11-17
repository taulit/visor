#!/usr/bin/env bash
# The keyring of the sandbox, for commands that run inside scripts/nested.sh.
# Everything here refuses to run anywhere else, so that no test can read or
# write the keyring of the session you are logged in to.

# keyring_guard: stops the script unless HOME, the runtime directory and the
# session bus are those of the sandbox.
keyring_guard() {
    local real_bus="unix:path=/run/user/$(id -u)/bus"
    if [[ -z "${VISOR_SANDBOX:-}" || "$HOME" != "$VISOR_SANDBOX/home" ||
        "${XDG_RUNTIME_DIR:-}" != "$VISOR_SANDBOX/run" ||
        "${XDG_DATA_HOME:-}" != "$VISOR_SANDBOX/home/.local/share" ||
        -z "${DBUS_SESSION_BUS_ADDRESS:-}" || "$DBUS_SESSION_BUS_ADDRESS" == "$real_bus"* ]]; then
        echo "keyring.sh: not inside the sandbox of scripts/nested.sh, refusing to touch a keyring" >&2
        exit 97
    fi
}

# keyring_store ORIGIN TOKEN: stores the T3 Code token the way the settings window does.
keyring_store() {
    keyring_guard
    printf '%s' "$2" | secret-tool store --label="Visor: T3 Code ($1)" \
        xdg:schema io.github.taulit.Visor.T3 origin "$1"
}

# keyring_lookup ORIGIN: prints the stored token, nothing when there is none.
keyring_lookup() {
    keyring_guard
    secret-tool lookup xdg:schema io.github.taulit.Visor.T3 origin "$1" 2>/dev/null || true
}

# keyring_lock: locks the login keyring of the sandbox (its password is "sandbox");
# the next call that needs it makes the shell ask for the password.
keyring_lock() {
    keyring_guard
    gdbus call --session --dest org.freedesktop.secrets --object-path /org/freedesktop/secrets \
        --method org.freedesktop.Secret.Service.Lock \
        "['/org/freedesktop/secrets/collection/login']" >/dev/null
}

# t3_pair ORIGIN TOKEN: what pairing in the settings window leaves behind.
# Needs scripts/lib/shell.sh and Visor running.
t3_pair() {
    keyring_store "$1" "$2"
    shell_eval "(() => { const s = visor.getSettings(); s.set_string('t3-token-origin', '$1'); s.set_int('t3-token-serial', s.get_int('t3-token-serial') + 1); return true; })()" >/dev/null
}
