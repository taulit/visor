// "Discover" on the Modules page: the catalog of modules as cards with a
// picture, a search and a filter by place, and a page per module. Installing
// is done by the shell from the GNOME extension store; Visor loads no code.
// Every text of the catalog is shown as plain text, never as markup.
import Adw from 'gi://Adw';
import Gdk from 'gi://Gdk';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Gtk from 'gi://Gtk';
import Pango from 'gi://Pango';
import Soup from 'gi://Soup?version=3.0';

import { gettext as _ } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import type { Slot } from '../api.js';
import { searchCatalog } from '../lib/catalog-search.js';
import { SLOTS } from './builtin-modules.js';
import { catalogBase, installState, localized, type CatalogModule } from './catalog-model.js';
import { loadCatalog, loadPicture, refreshCatalog } from './catalog-store.js';
import { installExtension, installFromGitHub, listInstalledUuids } from './shell-extensions.js';

const UPDATES_KEY = 'catalog-updates';
const URL_KEY = 'catalog-url';
const TIMEOUT_SECONDS = 15;
/** Cards are 16:10 pictures, two side by side in a window of the default width. */
const COVER_HEIGHT = 168;

/** What the pages of this file share. */
interface Shared {
  window: Adw.PreferencesWindow;
  http: Soup.Session;
  cancellable: Gio.Cancellable;
  languages: string[];
  installed: Set<string>;
  /** Where Visor is installed; the pictures of the snapshot are below it. */
  extensionPath: string;
  /** Where pictures come from, null when the network is off or the address is none. */
  base: () => string | null;
  /** Called after something was installed. */
  changed: (() => void)[];
}

function label(text: string, classes: string[], lines = 1): Gtk.Label {
  const widget = new Gtk.Label({
    label: text,
    xalign: 0,
    css_classes: classes,
    ellipsize: Pango.EllipsizeMode.END,
    lines,
    wrap: lines > 1,
    wrap_mode: Pango.WrapMode.WORD_CHAR,
  });
  return widget;
}

/**
 * A picture that fills in once its file is there; until then, and without
 * one, a quiet icon. The picture lies over the placeholder, so its size in
 * pixels has no say in how wide a card wants to be.
 */
function cover(shared: Shared, path: string | undefined, height: number): Gtk.Widget {
  const overlay = new Gtk.Overlay({ height_request: height, hexpand: true });
  overlay.set_child(
    new Gtk.Image({
      icon_name: 'view-grid-symbolic',
      pixel_size: 32,
      css_classes: ['dim-label'],
      // Decoration: the name is next to it.
      accessible_role: Gtk.AccessibleRole.PRESENTATION,
    }),
  );
  if (!path) return overlay;
  // Fetched when the card first shows, not when the window is built.
  let asked = false;
  overlay.connect('map', () => {
    if (asked) return;
    asked = true;
    loadPicture(shared.http, shared.base(), shared.extensionPath, path, shared.cancellable).then(
      file => {
        if (!file || shared.cancellable.is_cancelled()) return;
        overlay.add_overlay(
          new Gtk.Picture({
            file: Gio.File.new_for_path(file),
            content_fit: Gtk.ContentFit.COVER,
            can_shrink: true,
            accessible_role: Gtk.AccessibleRole.PRESENTATION,
          }),
        );
      },
      () => undefined,
    );
  });
  return overlay;
}

/** The button of a module: Install, or why there is nothing to install. */
function installButton(shared: Shared, entry: CatalogModule): Gtk.Button {
  const button = new Gtk.Button({ valign: Gtk.Align.CENTER });
  const sync = (): void => {
    const state = installState(entry, shared.installed);
    button.label =
      state === 'installed'
        ? _('Installed')
        : state === 'available'
          ? _('Install')
          : _('Not in the store yet');
    button.sensitive = state === 'available';
    if (state === 'available') button.add_css_class('suggested-action');
    else button.remove_css_class('suggested-action');
  };
  sync();
  shared.changed.push(sync);
  button.connect('clicked', () => {
    button.sensitive = false;
    // From the store where it is there, else from the release on GitHub.
    const install =
      entry.egoId !== null
        ? installExtension(entry.uuid)
        : installFromGitHub(entry.uuid, entry.repo);
    install.then(done => {
      if (shared.cancellable.is_cancelled()) return;
      if (done) shared.installed.add(entry.uuid);
      for (const callback of shared.changed) callback();
    });
  });
  return button;
}

const slotName = (slot: Slot): string => _(SLOTS.find(known => known.slot === slot)?.title ?? '');

/** The author in one quiet line, with a mark for modules of the makers of Visor. */
function byline(entry: CatalogModule, withPlace: boolean): Gtk.Widget {
  const box = new Gtk.Box({ spacing: 4 });
  const who = withPlace ? `${entry.author.name} · ${slotName(entry.slot)}` : entry.author.name;
  const text = label(who, ['caption', 'dim-label']);
  // Asks for little and takes what is there, so two cards fit side by side.
  text.max_width_chars = 12;
  text.hexpand = !entry.verified;
  box.append(text);
  if (entry.verified) {
    box.append(
      new Gtk.Image({
        icon_name: 'emblem-ok-symbolic',
        pixel_size: 12,
        css_classes: ['dim-label'],
        tooltip_text: _('By the makers of Visor'),
        accessible_role: Gtk.AccessibleRole.IMG,
      }),
    );
  }
  return box;
}

function card(shared: Shared, entry: CatalogModule): Gtk.FlowBoxChild {
  const box = new Gtk.Box({
    orientation: Gtk.Orientation.VERTICAL,
    css_classes: ['card'],
    overflow: Gtk.Overflow.HIDDEN,
  });
  box.append(cover(shared, entry.screenshots[0], COVER_HEIGHT));
  const body = new Gtk.Box({
    orientation: Gtk.Orientation.VERTICAL,
    spacing: 4,
    margin_top: 10,
    margin_bottom: 12,
    margin_start: 12,
    margin_end: 12,
  });
  const name = label(entry.name, ['heading']);
  name.max_width_chars = 16;
  body.append(name);
  body.append(byline(entry, false));
  const summary = label(localized(entry.summary, shared.languages), ['caption'], 3);
  // Three lines for every card, so the cards of a row are equally high.
  summary.set_size_request(-1, 54);
  summary.yalign = 0;
  summary.margin_top = 4;
  // Without this a text that wraps asks for the width of its whole sentence,
  // and two cards would not fit side by side.
  summary.max_width_chars = 24;
  body.append(summary);
  const foot = new Gtk.Box({ spacing: 8, margin_top: 6 });
  const place = label(slotName(entry.slot), ['caption', 'dim-label']);
  place.hexpand = true;
  foot.append(place);
  foot.append(installButton(shared, entry));
  body.append(foot);
  box.append(body);

  const child = new Gtk.FlowBoxChild({ child: box, name: entry.uuid });
  child.update_property([Gtk.AccessibleProperty.LABEL], [entry.name]);
  return child;
}

function paragraph(text: string): Gtk.Label {
  return new Gtk.Label({
    label: text,
    xalign: 0,
    wrap: true,
    wrap_mode: Pango.WrapMode.WORD_CHAR,
    selectable: false,
  });
}

/** The page of one module: all pictures, what it does, where it comes from. */
function detailPage(shared: Shared, entry: CatalogModule): Adw.NavigationPage {
  const content = new Gtk.Box({
    orientation: Gtk.Orientation.VERTICAL,
    spacing: 18,
    margin_top: 18,
    margin_bottom: 24,
    margin_start: 12,
    margin_end: 12,
  });

  if (entry.screenshots.length > 0) {
    const carousel = new Adw.Carousel({ spacing: 12, css_classes: ['card'] });
    carousel.overflow = Gtk.Overflow.HIDDEN;
    for (const path of entry.screenshots) carousel.append(cover(shared, path, 360));
    content.append(carousel);
    if (entry.screenshots.length > 1) content.append(new Adw.CarouselIndicatorDots({ carousel }));
  }

  const head = new Gtk.Box({ spacing: 12 });
  const titles = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, spacing: 2, hexpand: true });
  titles.append(label(entry.name, ['title-2']));
  titles.append(byline(entry, true));
  head.append(titles);
  head.append(installButton(shared, entry));
  content.append(head);

  content.append(paragraph(localized(entry.description, shared.languages)));
  for (const [title, value] of [
    [_('What it shows'), entry.shows],
    [_('When it appears'), entry.appears],
  ] as const) {
    if (!value) continue;
    const part = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, spacing: 4 });
    part.append(label(title, ['heading']));
    part.append(paragraph(localized(value, shared.languages)));
    content.append(part);
  }

  const facts = new Adw.PreferencesGroup();
  const fact = (title: string, value: string, uri: string | null): void => {
    const row = new Adw.ActionRow({
      title,
      subtitle: value,
      use_markup: false,
      activatable: uri !== null,
    });
    if (uri) {
      row.add_suffix(new Gtk.Image({ icon_name: 'adw-external-link-symbolic' }));
      row.connect('activated', () => Gtk.show_uri(shared.window, uri, Gdk.CURRENT_TIME));
    }
    facts.add(row);
  };
  fact(_('Author'), entry.author.name, entry.author.url);
  fact(_('Source code'), entry.repo, entry.repo);
  if (entry.egoId !== null) {
    const store = `https://extensions.gnome.org/extension/${entry.egoId}/`;
    fact(_('GNOME extension store'), store, store);
  }
  fact(_('License'), entry.license, null);
  content.append(facts);

  const view = new Adw.ToolbarView();
  view.add_top_bar(new Adw.HeaderBar());
  view.set_content(
    new Gtk.ScrolledWindow({
      hscrollbar_policy: Gtk.PolicyType.NEVER,
      child: new Adw.Clamp({ child: content, maximum_size: 600 }),
    }),
  );
  return new Adw.NavigationPage({ title: entry.name, child: view });
}

/** Adds the groups of "Discover" to the Modules page. `extensionPath` is where Visor is installed. */
export function addDiscover(
  page: Adw.PreferencesPage,
  settings: Gio.Settings,
  window: Adw.PreferencesWindow,
  extensionPath: string,
): void {
  const shared: Shared = {
    window,
    http: new Soup.Session({
      timeout: TIMEOUT_SECONDS,
      user_agent: 'Visor (GNOME Shell extension)',
    }),
    cancellable: new Gio.Cancellable(),
    languages: GLib.get_language_names(),
    installed: new Set(),
    extensionPath,
    base: () =>
      settings.get_boolean(UPDATES_KEY) ? catalogBase(settings.get_string(URL_KEY)) : null,
    changed: [],
  };

  const group = new Adw.PreferencesGroup({
    title: _('Discover'),
    description: _('Modules from the GNOME extension store that add to Visor.'),
  });

  const controls = new Gtk.Box({ spacing: 8, margin_bottom: 12 });
  const search = new Gtk.SearchEntry({ placeholder_text: _('Search modules'), hexpand: true });
  const places = [_('All places'), ...SLOTS.map(({ title }) => _(title))];
  const place = new Gtk.DropDown({ model: Gtk.StringList.new(places) });
  search.update_property([Gtk.AccessibleProperty.LABEL], [_('Search modules')]);
  place.update_property([Gtk.AccessibleProperty.LABEL], [_('Place')]);
  controls.append(search);
  controls.append(place);
  group.add(controls);

  const grid = new Gtk.FlowBox({
    selection_mode: Gtk.SelectionMode.NONE,
    homogeneous: true,
    min_children_per_line: 1,
    max_children_per_line: 2,
    column_spacing: 12,
    row_spacing: 12,
    activate_on_single_click: true,
  });
  group.add(grid);
  const none = new Gtk.Label({
    label: _('No modules found'),
    css_classes: ['dim-label'],
    margin_top: 18,
    margin_bottom: 18,
    visible: false,
  });
  group.add(none);
  page.add(group);

  let modules: CatalogModule[] = [];
  /** Position of each module that fits the search; the others are hidden. */
  let rank = new Map<string, number>();
  const filter = (): void => {
    const slot = place.selected > 0 ? SLOTS[place.selected - 1]?.slot : undefined;
    const found = searchCatalog(modules, search.text, slot ? { slot } : {});
    rank = new Map(found.map((entry, position) => [entry.uuid, position]));
    grid.invalidate_filter();
    grid.invalidate_sort();
    none.visible = found.length === 0;
  };
  grid.set_filter_func(child => rank.has(child.name));
  grid.set_sort_func((a, b) => (rank.get(a.name) ?? 0) - (rank.get(b.name) ?? 0));
  grid.connect('child-activated', (_grid, child) => {
    const entry = modules.find(known => known.uuid === child.name);
    if (entry) window.push_subpage(detailPage(shared, entry));
  });
  search.connect('search-changed', filter);
  place.connect('notify::selected', filter);

  const show = (list: CatalogModule[]): void => {
    modules = list;
    grid.remove_all();
    for (const entry of modules) grid.append(card(shared, entry));
    filter();
  };
  show(loadCatalog(extensionPath));

  const more = new Adw.PreferencesGroup();
  const updates = new Adw.SwitchRow({
    title: _('Update the catalog from the network'),
    subtitle: _('At most once a day, when this page is opened. Pictures are loaded with it.'),
  });
  settings.bind(UPDATES_KEY, updates, 'active', Gio.SettingsBindFlags.DEFAULT);
  more.add(updates);
  page.add(more);

  listInstalledUuids().then(uuids => {
    if (shared.cancellable.is_cancelled()) return;
    for (const uuid of uuids) shared.installed.add(uuid);
    for (const callback of shared.changed) callback();
  });

  // The network is asked when the page is first looked at, not when the window opens.
  let refreshed = false;
  group.connect('map', () => {
    const base = shared.base();
    if (refreshed || !base) return;
    refreshed = true;
    refreshCatalog(shared.http, base, shared.cancellable).then(
      list => {
        if (!list || shared.cancellable.is_cancelled()) return;
        // The callbacks of the old cards go with them.
        shared.changed.length = 0;
        show(list);
      },
      () => undefined,
    );
  });

  window.connect('close-request', () => {
    shared.cancellable.cancel();
    shared.http.abort();
    return false;
  });
}
