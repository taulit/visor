import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';

import type { VisorApi } from './api.js';
import { Content } from './core/content.js';
import { Notch } from './core/notch.js';

export default class VisorExtension extends Extension {
  /** Module API. Other extensions reach it through `stateObj.api`. */
  api: VisorApi | null = null;
  /** Internal, not part of the API. */
  notch: Notch | null = null;
  private content: Content | null = null;

  override enable(): void {
    const settings = this.getSettings();
    this.content = new Content(settings, this);
    this.notch = new Notch(settings, this.content);
    this.content.setHost(this.notch);
    this.api = this.content.api;
  }

  override disable(): void {
    this.api = null;
    this.notch?.destroy();
    this.notch = null;
    this.content?.destroy();
    this.content = null;
  }
}
