// Placeholder so the notch can be developed on its own. The real content
// (registry, sheet, peek chips) replaces this file.
import type Gio from 'gi://Gio';
import St from 'gi://St';

import type { NotchContent, NotchHost, NotchState } from './types.js';
import type { ModuleOwner, VisorApi } from '../api.js';

export class Content implements NotchContent {
  readonly api: VisorApi = {
    version: 1,
    register: () => {},
    unregister: () => {},
  };

  private peek: St.Widget | null = null;
  private sheet: St.Widget | null = null;

  constructor(_settings: Gio.Settings, _extension: ModuleOwner) {}

  setHost(_host: NotchHost): void {}

  hasPeek(): boolean {
    return true;
  }

  getPeek(): St.Widget {
    this.peek ??= new St.Label({ text: 'peek placeholder', style: 'padding: 20px 14px;' });
    return this.peek;
  }

  getSheet(): St.Widget {
    this.sheet ??= new St.Label({
      text: 'sheet placeholder',
      style: 'padding: 24px; height: 300px;',
    });
    return this.sheet;
  }

  sheetWidth(): number {
    return 960 * St.ThemeContext.get_for_stage(global.stage).scale_factor;
  }

  stateChanged(_state: NotchState, _previous: NotchState): void {}

  handleEscape(): boolean {
    return false;
  }

  destroy(): void {
    this.peek?.destroy();
    this.sheet?.destroy();
    this.peek = this.sheet = null;
  }
}
