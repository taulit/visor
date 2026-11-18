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

# keyring_start: runs the Secret Service of the sandbox, an unlocked login
# keyring below the sandbox HOME (its password is no secret), and waits until
# it is on the bus. Its process id is in keyring_pid.
keyring_start() {
    keyring_guard
    printf 'sandbox' | gnome-keyring-daemon --unlock --foreground --components=secrets \
        >>"$HOME/keyring.log" 2>&1 &
    keyring_pid=$!
    for _ in $(seq 1 50); do
        gdbus call --session --dest org.freedesktop.DBus --object-path /org/freedesktop/DBus \
            --method org.freedesktop.DBus.NameHasOwner org.freedesktop.secrets 2>/dev/null |
            grep -q true && break
        sleep 0.1
    done
}

# keyring_lock: locks the login keyring of the sandbox (its password is "sandbox");
# the next call that needs it makes the shell ask for the password.
keyring_lock() {
    keyring_guard
    gdbus call --session --dest org.freedesktop.secrets --object-path /org/freedesktop/secrets \
        --method org.freedesktop.Secret.Service.Lock \
        "['/org/freedesktop/secrets/collection/login']" >/dev/null
}
