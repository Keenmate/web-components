import type { PlaywrightTestConfig, Project } from '@playwright/test';

export interface PlaywrightPresetConfig extends Omit<PlaywrightTestConfig, 'projects' | 'use' | 'webServer'> {
  /** Component root; defaults to `process.cwd()`. */
  root?: string;
  /** Replaces the default single desktop-chromium project. */
  projects?: Project[];
  /** Merged over the default `use` (baseURL is derived from kmwc.ports.dev). */
  use?: PlaywrightTestConfig['use'];
  /** Merged over the default webServer (`npm run dev` on kmwc.ports.dev); an array replaces it. */
  webServer?: Partial<NonNullable<Exclude<PlaywrightTestConfig['webServer'], unknown[]>>> | PlaywrightTestConfig['webServer'];
}

export function definePlaywrightConfig(presetConfig?: PlaywrightPresetConfig): PlaywrightTestConfig;
export const devices: typeof import('@playwright/test').devices;
