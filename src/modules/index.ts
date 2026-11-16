import type { VisorModule } from '../api.js';

/**
 * The modules Visor ships. They use the same API as modules of other
 * extensions. Creating a module does no work; that starts in enable().
 */
export function builtinModules(): VisorModule[] {
  return [];
}
