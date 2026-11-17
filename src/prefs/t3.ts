// Pairing with T3 Code, see docs/t3-protocol.md §2: the user pastes a pairing
// link, the window exchanges it for an access token and stores that in the
// keyring (modules/t3/keyring.ts), where the module finds it; the settings
// only say which origin is paired. Neither the link nor the token is ever
// logged.
import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Gtk from 'gi://Gtk';
import Soup from 'gi://Soup?version=3.0';

import { gettext as _ } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import { clearToken, lookupToken, storeToken } from '../modules/t3/keyring.js';
import {
  SERVER_KEY,
  TOKEN_ORIGIN_KEY,
  TOKEN_SERIAL_KEY,
  decodeAccessToken,
  exchangeError,
  isInsecurePairing,
  originToStore,
  parsePairing,
  tokenFits,
  tokenRequestBody,
  tokenUrl,
  type PairingError,
} from '../modules/t3/pairing.js';
import {
  cleanOrigin,
  decodeDescriptor,
  decodeRuntimeState,
  descriptorUrl,
  isCompatible,
  isInsecureOrigin,
} from '../modules/t3/protocol.js';

const TIMEOUT_SECONDS = 10;
const MAX_ANSWER_BYTES = 64 * 1024;

/** The origin of the server running on this machine, from its runtime file, or null. */
function localOrigin(): string | null {
  const base = GLib.getenv('T3CODE_HOME') || GLib.build_filenamev([GLib.get_home_dir(), '.t3']);
  try {
    const [, bytes] = GLib.file_get_contents(
      GLib.build_filenamev([base, 'userdata', 'server-runtime.json']),
    );
    return bytes.length <= MAX_ANSWER_BYTES
      ? decodeRuntimeState(new TextDecoder().decode(bytes))
      : null;
  } catch {
    return null;
  }
}

interface Answer {
  /** 0 when there was no answer. */
  status: number;
  body: string;
}

function send(
  http: Soup.Session,
  message: Soup.Message,
  cancellable: Gio.Cancellable,
): Promise<Answer> {
  return new Promise(resolve => {
    http.send_and_read_async(message, GLib.PRIORITY_DEFAULT, cancellable, (_source, result) => {
      try {
        const data = http.send_and_read_finish(result).get_data();
        const status = message.get_status();
        // Only a plain 200 has a body worth reading; a redirect is not followed.
        const fits = status === Soup.Status.OK && data !== null && data.length <= MAX_ANSWER_BYTES;
        resolve({ status, body: fits ? new TextDecoder().decode(data) : '' });
      } catch {
        resolve({ status: 0, body: '' });
      }
    });
  });
}

/**
 * Exchanges a one-time pairing code at the server for an access token.
 * Ends with 'unreachable' when `cancellable` is cancelled.
 */
export async function exchangePairingCode(
  http: Soup.Session,
  origin: string,
  code: string,
  cancellable: Gio.Cancellable,
): Promise<{ token: string } | { error: PairingError }> {
  let about: Soup.Message;
  let exchange: Soup.Message;
  try {
    about = Soup.Message.new('GET', descriptorUrl(origin));
    exchange = Soup.Message.new('POST', tokenUrl(origin));
  } catch {
    return { error: 'unreachable' };
  }
  // The code goes to the server the link names and is not carried along by a redirect.
  about.add_flags(Soup.MessageFlags.NO_REDIRECT);
  exchange.add_flags(Soup.MessageFlags.NO_REDIRECT);
  // The version first: a server that speaks another protocol keeps its code unused.
  const descriptor = decodeDescriptor((await send(http, about, cancellable)).body);
  if (!descriptor) return { error: 'unreachable' };
  if (!isCompatible(descriptor)) return { error: 'incompatible' };

  const label = `Visor (${GLib.get_host_name()})`;
  exchange.set_request_body_from_bytes(
    'application/x-www-form-urlencoded',
    new GLib.Bytes(new TextEncoder().encode(tokenRequestBody(code, label))),
  );
  const answer = await send(http, exchange, cancellable);
  if (answer.status !== Soup.Status.OK) return { error: exchangeError(answer.status) };
  const token = decodeAccessToken(answer.body);
  return token ? { token } : { error: 'rejected' };
}

function errorText(error: PairingError): string {
  switch (error) {
    case 'invalid':
      return _('This is not a pairing link');
    case 'insecure':
      return _('Use https for a server on another machine');
    case 'rejected':
      return _('The link is wrong or has expired');
    case 'incompatible':
      return _('This version of T3 Code does not fit Visor');
    case 'keyring':
      return _('The keyring is not available');
    default:
      return _('The server cannot be reached');
  }
}

/** The group "T3 Code" of the Modules page. Requests end when `window` closes. */
export function t3Group(
  settings: Gio.Settings,
  window: Adw.PreferencesWindow,
): Adw.PreferencesGroup {
  const group = new Adw.PreferencesGroup({ title: _('T3 Code') });
  const http = new Soup.Session({ timeout: TIMEOUT_SECONDS });
  let cancellable: Gio.Cancellable | null = null;
  let timeout = 0;

  // --- not paired ---
  const title = _('Pairing link or code');
  const entry = new Adw.PasswordEntryRow({ title });
  const connect = new Gtk.Button({
    label: _('Connect'),
    valign: Gtk.Align.CENTER,
    css_classes: ['suggested-action'],
  });
  entry.add_suffix(connect);
  group.add(entry);

  const showError = (error: PairingError | null): void => {
    entry.title = error ? errorText(error) : title;
    if (error) entry.add_css_class('error');
    else entry.remove_css_class('error');
  };
  const finish = (): void => {
    if (timeout) GLib.source_remove(timeout);
    timeout = 0;
    cancellable = null;
    connect.sensitive = true;
  };
  /** Tells the module in the shell that the token in the keyring changed. */
  const tokenChanged = (): void => {
    settings.set_int(TOKEN_SERIAL_KEY, (settings.get_int(TOKEN_SERIAL_KEY) + 1) % 1_000_000);
  };
  const pair = async (): Promise<void> => {
    if (cancellable) return;
    const pasted = entry.text;
    const pairing = parsePairing(pasted);
    // The code is good once; it does not stay in the window.
    entry.text = '';
    if (!pairing) {
      showError(isInsecurePairing(pasted) ? 'insecure' : 'invalid');
      return;
    }
    const local = localOrigin();
    const origin = pairing.origin ?? cleanOrigin(settings.get_string(SERVER_KEY)) ?? local;
    if (!origin) {
      showError('unreachable');
      return;
    }

    showError(null);
    connect.sensitive = false;
    const mine = (cancellable = new Gio.Cancellable());
    timeout = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, TIMEOUT_SECONDS, () => {
      timeout = 0;
      mine.cancel();
      return GLib.SOURCE_REMOVE;
    });
    // The keyring first: without one the token could not be kept, and the
    // code, which is good once, stays unused.
    const usable = (await lookupToken(origin, mine)) !== null;
    // The window closed meanwhile: its widgets are gone.
    if (cancellable !== mine) return;
    const result = usable
      ? await exchangePairingCode(http, origin, pairing.code, mine)
      : { error: 'keyring' as const };
    if (cancellable !== mine) return;
    const stored = 'token' in result && (await storeToken(origin, result.token, mine));
    if (cancellable !== mine) return;
    finish();
    if ('error' in result || !stored) {
      showError('error' in result ? result.error : 'keyring');
      return;
    }
    if (pairing.origin) settings.set_string(SERVER_KEY, originToStore(pairing.origin, local));
    // The token is for this origin; the module sends it nowhere else.
    settings.set_string(TOKEN_ORIGIN_KEY, origin);
    tokenChanged();
  };
  const start = (): void => {
    pair().catch(() => {
      finish();
      showError('unreachable');
    });
  };
  connect.connect('clicked', start);
  entry.connect('entry-activated', start);
  entry.connect('changed', () => {
    if (entry.text) showError(null);
  });

  // --- paired ---
  const paired = new Adw.ActionRow({ title: _('Connected') });
  paired.add_prefix(new Gtk.Image({ icon_name: 'object-select-symbolic' }));
  const disconnect = new Gtk.Button({ label: _('Disconnect'), valign: Gtk.Align.CENTER });
  // The protocol lets no session revoke itself, so the token is only forgotten here.
  const forget = (): void => {
    const origin = settings.get_string(TOKEN_ORIGIN_KEY);
    settings.set_string(TOKEN_ORIGIN_KEY, '');
    tokenChanged();
    // Not tied to the window: it may close before the keyring has answered.
    // Without a keyring there is nothing to remove.
    if (origin) void clearToken(origin, new Gio.Cancellable());
  };
  disconnect.connect('clicked', forget);
  paired.add_suffix(disconnect);
  group.add(paired);

  // --- the address ---
  const address = new Adw.ExpanderRow({ title: _('Server address') });
  const addressTitle = _('Address, empty for this machine');
  const addressEntry = new Adw.EntryRow({
    title: addressTitle,
    show_apply_button: true,
    input_purpose: Gtk.InputPurpose.URL,
  });
  addressEntry.connect('apply', () => {
    const text = addressEntry.text.trim();
    const origin = text ? cleanOrigin(text) : '';
    if (origin === null) {
      addressEntry.add_css_class('error');
      if (isInsecureOrigin(text))
        addressEntry.title = _('Use https for a server on another machine');
      return;
    }
    // Another server: the token was not issued by it and must not reach it.
    const pairedOrigin = settings.get_string(TOKEN_ORIGIN_KEY);
    if (pairedOrigin && !tokenFits(pairedOrigin, origin || localOrigin())) forget();
    settings.set_string(SERVER_KEY, origin);
  });
  addressEntry.connect('changed', () => {
    addressEntry.remove_css_class('error');
    addressEntry.title = addressTitle;
  });
  address.add_row(addressEntry);
  group.add(address);

  const sync = (): void => {
    const isPaired = settings.get_string(TOKEN_ORIGIN_KEY) !== '';
    const server = settings.get_string(SERVER_KEY);
    group.description = isPaired
      ? ''
      : _('Create a pairing link in T3 Code under Settings → Connections and paste it here.');
    entry.visible = !isPaired;
    paired.visible = isPaired;
    paired.subtitle = server || _('This machine');
    address.subtitle = server || _('This machine');
    if (addressEntry.text !== server) addressEntry.text = server;
  };
  const handlers = [
    settings.connect(`changed::${TOKEN_ORIGIN_KEY}`, sync),
    settings.connect(`changed::${SERVER_KEY}`, sync),
  ];
  sync();

  window.connect('close-request', () => {
    cancellable?.cancel();
    cancellable = null;
    if (timeout) GLib.source_remove(timeout);
    timeout = 0;
    for (const handler of handlers) settings.disconnect(handler);
    http.abort();
    return false;
  });
  return group;
}
