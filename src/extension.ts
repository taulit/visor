import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';

import type { VisorApi } from './api.js';
import { Content } from './core/content.js';
import { Installer } from './core/installer.js';
import { metricsOn, now, reportEnable } from './core/metrics.js';
import { Notch } from './core/notch.js';
import { Updater } from './core/updater.js';
import { builtinModules } from './modules/index.js';

export default class VisorExtension extends Extension {
  /** Module API. Other extensions reach it through `stateObj.api`. */
  api: VisorApi | null = null;
  /** Internal, not part of the API. */
  notch: Notch | null = null;
  /** Internal: installs modules from GitHub for the settings window. */
  installer: Installer | null = null;
  private content: Content | null = null;
  /** Internal: updates of Visor from GitHub. */
  updater: Updater | null = null;

  override enable(): void {
    const settings = this.getSettings();
    const start = metricsOn(settings) ? now() : 0;
    this.updater = new Updater(
      settings,
      this.uuid,
      String(this.metadata['version-name'] ?? ''),
      this.path,
    );
    this.content = new Content(settings, this, this.updater);
    this.notch = new Notch(settings, this.content);
    this.content.setHost(this.notch);
    this.api = this.content.api;
    for (const module of builtinModules()) this.api.register(module);
    this.installer = new Installer();
    if (start) reportEnable(now() - start);
  }

  override disable(): void {
    this.installer?.destroy();
    this.installer = null;
    this.api = null;
    this.notch?.destroy();
    this.notch = null;
    this.content?.destroy();
    this.content = null;
    this.updater?.destroy();
    this.updater = null;
  }
}
