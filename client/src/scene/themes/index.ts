import { egypt } from './egypt';
import { island } from './island';
import { japan } from './japan';
import { nyc } from './nyc';
import { office } from './office';
import { taiwan } from './taiwan';
import type { SceneTheme } from './types';

export type { SceneTheme } from './types';

/** HUD 選單的順序 */
export const THEMES: SceneTheme[] = [office, nyc, taiwan, japan, island, egypt];

export function getTheme(id: string): SceneTheme {
  return THEMES.find((t) => t.id === id) ?? office;
}
