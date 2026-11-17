import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';

import type { VisorApi } from './api.js';
import { Content } from './core/content.js';
import { metricsOn, now, reportEnable } from './core/metrics.js';
import { Notch } from './core/notch.js';
import { builtinModules } from './modules/index.js';

export default class VisorExtension extends Extension {
  /** Module API. Other extensions reach it through `stateObj.api`. */
  api: VisorApi | null = null;
  /** Internal, not part of the API. */
  notch: Notch | null = null;
  private content: Content | null = null;

  override enable(): void {
    const settings = this.getSettings();
    const start = metricsOn(settings) ? now() : 0;
    this.content = new Content(settings, this);
    this.notch = new Notch(settings, this.content);
    this.content.setHost(this.notch);
    this.api = this.content.api;
    for (const module of builtinModules()) this.api.register(module);
    if (start) reportEnable(now() - start);
  }

  override disable(): void {
    this.api = null;
    this.notch?.destroy();
    this.notch = null;
    this.content?.destroy();
    this.content = null;
  }
}
