// A fake MPRIS player for tests/shell/modules-now.sh and the screenshot
// scenario. It runs inside the sandboxed session of scripts/nested.sh:
//
//   gjs -m tests/mpris-mock.js [suffix] [identity]
//
// owns org.mpris.MediaPlayer2.<suffix> (default: visormock) and is driven over
// the interface io.github.taulit.Visor.MprisMock on /org/mpris/MediaPlayer2:
//
//   SetStatus(s)              Playing, Paused or Stopped
//   SetTrack(s, as, s, x)     title, artists, art URL ('' for none), length in µs (0 for none)
//   SetPosition(x, b)         position in µs; true also emits Seeked
//   SetCan(b, b)              CanGoNext, CanGoPrevious
//   Calls() -> as             the player methods called so far, in order
//   Quit()
/* global printerr */
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import System from 'system';

const [suffix = 'visormock', identity = 'Visor Mock'] = System.programArgs;

// Never on the bus of a real session, where it would show up as a player.
if (!GLib.getenv('VISOR_SANDBOX')) {
  printerr('mpris-mock: runs only inside scripts/nested.sh');
  System.exit(2);
}

const ROOT_XML = `
<node><interface name="org.mpris.MediaPlayer2">
  <method name="Raise"/>
  <method name="Quit"/>
  <property name="CanQuit" type="b" access="read"/>
  <property name="CanRaise" type="b" access="read"/>
  <property name="Identity" type="s" access="read"/>
  <property name="DesktopEntry" type="s" access="read"/>
</interface></node>`;

const PLAYER_XML = `
<node><interface name="org.mpris.MediaPlayer2.Player">
  <method name="Next"/>
  <method name="Previous"/>
  <method name="Pause"/>
  <method name="PlayPause"/>
  <method name="Stop"/>
  <method name="Play"/>
  <signal name="Seeked"><arg type="x" name="Position"/></signal>
  <property name="PlaybackStatus" type="s" access="read"/>
  <property name="Metadata" type="a{sv}" access="read"/>
  <property name="Position" type="x" access="read"/>
  <property name="CanGoNext" type="b" access="read"/>
  <property name="CanGoPrevious" type="b" access="read"/>
  <property name="CanPlay" type="b" access="read"/>
  <property name="CanPause" type="b" access="read"/>
  <property name="CanControl" type="b" access="read"/>
</interface></node>`;

const CONTROL_XML = `
<node><interface name="io.github.taulit.Visor.MprisMock">
  <method name="SetStatus"><arg type="s" direction="in"/></method>
  <method name="SetTrack">
    <arg type="s" direction="in" name="title"/>
    <arg type="as" direction="in" name="artists"/>
    <arg type="s" direction="in" name="artUrl"/>
    <arg type="x" direction="in" name="length"/>
  </method>
  <method name="SetPosition">
    <arg type="x" direction="in" name="position"/>
    <arg type="b" direction="in" name="seeked"/>
  </method>
  <method name="SetCan">
    <arg type="b" direction="in" name="next"/>
    <arg type="b" direction="in" name="previous"/>
  </method>
  <method name="Calls"><arg type="as" direction="out"/></method>
  <method name="Quit"/>
</interface></node>`;

const loop = new GLib.MainLoop(null, false);
const calls = [];
let tracks = 0;

const root = {
  CanQuit: true,
  CanRaise: true,
  Identity: identity,
  DesktopEntry: '',
  Raise: () => calls.push('Raise'),
  Quit: () => loop.quit(),
};

const player = {
  PlaybackStatus: 'Stopped',
  Metadata: {},
  Position: 0,
  CanGoNext: true,
  CanGoPrevious: true,
  CanPlay: true,
  CanPause: true,
  CanControl: true,
  Next: () => calls.push('Next'),
  Previous: () => calls.push('Previous'),
  Pause() {
    calls.push('Pause');
    setStatus('Paused');
  },
  Play() {
    calls.push('Play');
    setStatus('Playing');
  },
  PlayPause() {
    calls.push('PlayPause');
    setStatus(player.PlaybackStatus === 'Playing' ? 'Paused' : 'Playing');
  },
  Stop() {
    calls.push('Stop');
    setStatus('Stopped');
  },
};

const playerObject = Gio.DBusExportedObject.wrapJSObject(PLAYER_XML, player);

function changed(name, signature) {
  playerObject.emit_property_changed(name, new GLib.Variant(signature, player[name]));
}

function setStatus(status) {
  player.PlaybackStatus = status;
  changed('PlaybackStatus', 's');
}

const control = {
  SetStatus: setStatus,
  SetTrack(title, artists, artUrl, length) {
    const metadata = {
      'mpris:trackid': new GLib.Variant('o', `/io/github/taulit/Visor/track/${++tracks}`),
      'xesam:title': new GLib.Variant('s', title),
      'xesam:artist': new GLib.Variant('as', artists),
    };
    if (artUrl) metadata['mpris:artUrl'] = new GLib.Variant('s', artUrl);
    if (length > 0) metadata['mpris:length'] = new GLib.Variant('x', length);
    player.Metadata = metadata;
    player.Position = 0;
    changed('Metadata', 'a{sv}');
  },
  SetPosition(position, seeked) {
    player.Position = position;
    if (seeked) playerObject.emit_signal('Seeked', new GLib.Variant('(x)', [position]));
  },
  SetCan(next, previous) {
    player.CanGoNext = next;
    player.CanGoPrevious = previous;
    changed('CanGoNext', 'b');
    changed('CanGoPrevious', 'b');
  },
  Calls: () => calls,
  Quit: () => loop.quit(),
};

// Kept in variables: an exported object that is collected leaves the bus.
const rootObject = Gio.DBusExportedObject.wrapJSObject(ROOT_XML, root);
const controlObject = Gio.DBusExportedObject.wrapJSObject(CONTROL_XML, control);

Gio.bus_own_name(
  Gio.BusType.SESSION,
  `org.mpris.MediaPlayer2.${suffix}`,
  Gio.BusNameOwnerFlags.NONE,
  connection => {
    const path = '/org/mpris/MediaPlayer2';
    rootObject.export(connection, path);
    playerObject.export(connection, path);
    controlObject.export(connection, path);
  },
  null,
  () => loop.quit(),
);

loop.run();
