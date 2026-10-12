import type { ConfigEnv, Plugin, PluginOption, UserConfig, UserConfigFnPromise } from 'vite';
import type { KmwcConfig, KmwcPackageConfig } from '../config.js';

export interface VitePresetConfig {
  /** Component root; defaults to `process.cwd()`. */
  root?: string;
  /** Extra plugins, appended after the kmwc examples plugin. */
  plugins?: PluginOption[];
  /** Per-config override of `package.json#kmwc.library`. */
  library?: KmwcPackageConfig['library'];
  /** Deep-merged last via Vite's `mergeConfig`. */
  overrides?: UserConfig;
  /** Env-dependent overrides; its return is deep-merged after `overrides`. */
  getOverridesCallback?: (env: ConfigEnv, config: KmwcConfig) => UserConfig | Promise<UserConfig>;
}

export interface ExamplesPluginConfig {
  /** Component root; defaults to `process.cwd()`. */
  root?: string;
  /** Force the analytics snippet on/off (default: on for `vite build` only). */
  shouldInjectAnalytics?: boolean;
}

export function defineComponentConfig(presetConfig?: VitePresetConfig): UserConfigFnPromise;

export function createExamplesPlugin(pluginConfig?: ExamplesPluginConfig): Plugin;

export function getExamplePages(config: KmwcConfig): Record<string, string>;
