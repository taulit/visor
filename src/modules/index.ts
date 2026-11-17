import type { VisorModule } from '../api.js';
import { mediaModule } from './media/module.js';
import { timersModule } from './timers/module.js';

/**
 * The modules Visor ships. They use the same API as modules of other
 * extensions. Creating a module does no work; that starts in enable().
 */
export function builtinModules(): VisorModule[] {
  return [mediaModule(), timersModule()];
}
