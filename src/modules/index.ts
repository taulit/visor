import type { VisorModule } from '../api.js';
import { downloadsModule } from './downloads/module.js';
import { mediaModule } from './media/module.js';
import { timersModule } from './timers/module.js';
import { notificationsModule } from './notifications/module.js';
import { upcomingModule } from './upcoming/module.js';

/**
 * The modules Visor ships. They use the same API as modules of other
 * extensions. Creating a module does no work; that starts in enable().
 */
export function builtinModules(): VisorModule[] {
  return [
    mediaModule(),
    timersModule(),
    downloadsModule(),
    upcomingModule(),
    notificationsModule(),
  ];
}
