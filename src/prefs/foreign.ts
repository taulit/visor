// Modules of other extensions, as the settings window sees them: an extension
// whose metadata.json has a "visor" object. No gi:// imports, so Vitest can load it.
import { API_VERSION, type Slot } from '../api.js';
import { declaredApi } from '../lib/modules.js';
import { SLOTS } from './builtin-modules.js';

export interface ForeignModule {
  uuid: string;
  name: string;
  description: string;
  slot: Slot;
  enabled: boolean;
  hasPrefs: boolean;
  /** Built for another module API than this Visor has. */
  incompatible: boolean;
}

/**
 * `info` is the entry of the extension in the answer of `ListExtensions`,
 * `metadata` its metadata.json. Null when the extension has no "visor" object.
 */
export function foreignModule(
  uuid: string,
  info: Record<string, unknown>,
  metadata: unknown,
): ForeignModule | null {
  const visor = (metadata as { visor?: unknown } | null)?.visor;
  if (typeof visor !== 'object' || visor === null) return null;

  const slot = (visor as { slot?: unknown }).slot;
  const api = declaredApi(metadata);
  return {
    uuid,
    name: typeof info['name'] === 'string' ? info['name'] : uuid,
    description: typeof info['description'] === 'string' ? info['description'] : '',
    slot: SLOTS.find(entry => entry.slot === slot)?.slot ?? 'dock',
    enabled: info['enabled'] === true,
    hasPrefs: info['hasPrefs'] === true,
    incompatible: api !== null && api !== API_VERSION,
  };
}
