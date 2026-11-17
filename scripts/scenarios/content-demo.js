// Demo modules for the content scenarios. Test data, not shipped: evaluated in
// the sandboxed shell through shell_eval, which has Gio, GLib and `visor` in
// scope. `only` limits the slots that register.
/* global Gio, GLib, visor */
globalThis.visorDemoRegister = only => {
  const demo = (globalThis.visorDemo = { log: [], rows: {}, ctx: {} });
  const note = what => () => demo.log.push(what);
  const want = slot => !only || only.includes(slot);
  const cover = new Gio.FileIcon({
    file: Gio.File.new_for_path(`${GLib.get_home_dir()}/cover.png`),
  });

  const media = {
    id: 'media',
    name: 'Media',
    icon: 'audio-x-generic-symbolic',
    slot: 'now',
    enable(ctx) {
      demo.ctx.media = ctx;
      demo.rows.media = () => [
        {
          id: 'track',
          icon: cover,
          iconStyle: 'cover',
          title: 'Midnight City',
          subtitle: 'M83 · Headphones',
          progress: 0.42,
          activate: note('media:activate'),
          actions: [
            {
              label: 'Switch audio output',
              icon: 'audio-headphones-symbolic',
              run: note('media:output'),
            },
          ],
          controls: [
            { label: 'Previous', icon: 'media-skip-backward-symbolic', run: note('media:prev') },
            {
              label: 'Pause',
              icon: 'media-playback-pause-symbolic',
              style: 'filled',
              run: note('media:pause'),
            },
            { label: 'Next', icon: 'media-skip-forward-symbolic', run: note('media:next') },
          ],
        },
      ];
      ctx.now.set(demo.rows.media());
      ctx.peek.set({ icon: 'media-playback-start-symbolic', text: 'Midnight City', priority: 30 });
    },
    disable: note('media:disable'),
  };

  const agents = {
    id: 'agents',
    name: 'T3 Code',
    icon: 'chat-message-new-symbolic',
    slot: 'now',
    enable(ctx) {
      demo.ctx.agents = ctx;
      ctx.now.set([
        {
          id: 'taulit',
          icon: 'chat-message-new-symbolic',
          title: 'taulit',
          subtitle: 'wants to run:',
          detail: 'pnpm install:ios:xtool',
          status: 'waiting',
          controls: [{ label: 'Deny', style: 'ghost', run: note('agents:deny') }],
          primary: { label: 'Allow', style: 'primary', run: note('agents:allow') },
        },
        {
          id: 'iphone-control',
          icon: 'chat-message-new-symbolic',
          title: 'iphone-control',
          subtitle: 'working · 4:16 · Rebuilding WebDriverAgent',
          expand: () => ctx.kit.button({ label: 'Reply', run: note('agents:reply') }),
        },
        {
          id: 'gnome-island',
          icon: 'chat-message-new-symbolic',
          title: 'gnome-island',
          subtitle: 'done · Round 2 finished',
          status: 'done',
        },
      ]);
      ctx.attention('waiting');
      ctx.peek.set({
        icon: 'chat-message-new-symbolic',
        text: 'taulit is waiting',
        tone: 'waiting',
        priority: 50,
      });
    },
    disable: note('agents:disable'),
  };

  const timers = {
    id: 'timers',
    name: 'Timers',
    icon: 'alarm-symbolic',
    slot: 'now',
    enable(ctx) {
      demo.ctx.timers = ctx;
      demo.rows.timers = value => [
        {
          id: 'research',
          icon: 'alarm-symbolic',
          title: 'tender research',
          subtitle: 'Stopwatch',
          value,
          actions: [
            { label: 'Stop', icon: 'media-playback-stop-symbolic', run: note('timers:stop') },
          ],
        },
      ];
      ctx.now.set(demo.rows.timers('3:16'));
      ctx.peek.set({ icon: 'alarm-symbolic', text: '3:16', priority: 5 });
    },
    disable: note('timers:disable'),
  };

  const downloads = {
    id: 'downloads',
    name: 'Downloads',
    icon: 'folder-download-symbolic',
    slot: 'now',
    enable(ctx) {
      ctx.now.set([
        {
          id: 'iso',
          icon: 'folder-download-symbolic',
          title: 'fedora-44.iso',
          meta: '1.4 / 2.2 GB',
          progress: 0.64,
          progressTone: 'accent',
        },
      ]);
    },
    disable: note('downloads:disable'),
  };

  let calendarKit;
  const calendar = {
    id: 'calendar',
    name: 'Up Next',
    icon: 'x-office-calendar-symbolic',
    slot: 'ahead',
    enable(ctx) {
      calendarKit = ctx.kit;
      ctx.peek.set({ icon: 'x-office-calendar-symbolic', text: 'Tomorrow: Jukek', priority: 20 });
    },
    disable: note('calendar:disable'),
    buildSection() {
      const section = calendarKit.section({ title: 'Up Next' });
      const rows = [
        { lead: 'Sat', title: 'Jukek’s birthday', subtitle: 'all day' },
        {
          lead: '15:00',
          title: 'Sprint Review',
          subtitle: 'in 1 h 36 min · Teams',
          primary: { label: 'Join', run: note('calendar:join') },
        },
        { lead: 'Fri', title: 'Tender submission', subtitle: 'Deadline' },
      ];
      for (const row of rows) section.body.add_child(calendarKit.row(row).actor);
      return section.actor;
    },
  };

  let notificationsKit;
  const notifications = {
    id: 'notifications',
    name: 'Notifications',
    icon: 'preferences-system-notifications-symbolic',
    slot: 'ahead',
    enable(ctx) {
      notificationsKit = ctx.kit;
      ctx.attention('unread');
      ctx.peek.set({ icon: 'preferences-system-notifications-symbolic', text: '4', priority: 10 });
    },
    disable: note('notifications:disable'),
    buildSection() {
      const kit = notificationsKit;
      const section = kit.section({
        title: 'Notifications',
        links: [{ label: 'Clear', run: note('notifications:clear') }],
      });
      const dismiss = {
        label: 'Dismiss',
        icon: 'window-close-symbolic',
        run: note('notifications:dismiss'),
      };
      const rows = [
        ['org.gnome.Settings', 'Updates available', 'Software · 12 packages can be updated', '2 h'],
        ['firefox', 'web.whatsapp.com', 'Firefox · New message from Mum', '3 h'],
        ['org.gnome.Calendar', 'Review requested', 'GitHub · fork/feat-mjpeg · 3 files', '4 h'],
      ];
      for (const [icon, title, subtitle, meta] of rows) {
        const props = {
          icon: new Gio.ThemedIcon({ name: icon }),
          title,
          subtitle,
          meta,
          actions: [dismiss],
        };
        section.body.add_child(kit.row(props).actor);
      }
      section.body.add_child(
        kit.button({ label: 'Show all 4', style: 'link', run: note('notifications:all') }),
      );
      return section.actor;
    },
  };

  let notesKit;
  const notes = {
    id: 'notes',
    name: 'Notes',
    icon: 'text-x-generic-symbolic',
    slot: 'dock',
    enable(ctx) {
      notesKit = ctx.kit;
      ctx.badge(2);
    },
    disable: note('notes:disable'),
    buildView() {
      const kit = notesKit;
      const section = kit.section({ title: 'Pinned' });
      section.body.add_child(
        kit.row({
          icon: 'text-x-generic-symbolic',
          title: 'Shopping list',
          subtitle: 'Milk, bread, coffee',
          meta: 'Today',
        }).actor,
      );
      section.body.add_child(
        kit.row({
          icon: 'text-x-generic-symbolic',
          title: 'Visor ideas',
          subtitle: 'Peek chips for timers',
          meta: 'Mon',
        }).actor,
      );
      section.body.add_child(kit.empty('Two notes.'));
      return section.actor;
    },
  };

  const registered = [];
  for (const module of [media, agents, timers, downloads, calendar, notifications, notes]) {
    if (!want(module.slot)) continue;
    // The demo takes the place of the built-in module with the same id.
    visor.api.unregister(module.id);
    visor.api.register(module);
    registered.push(module.id);
  }
  return registered;
};
