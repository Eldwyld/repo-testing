import { createContext, useContext } from 'react';
import { CompiledConfig } from '../config/library';
import { ForgeConfig } from '../config/schema';
import { ForgeStore } from '../storage/store';

export type Ctx = {
  ready: boolean;
  saved: ForgeConfig;
  draft: ForgeConfig;
  compiled: CompiledConfig;
  changed: string[];
  notes: string[];
  saveError: string[] | null;
  store: ForgeStore;
  update: (fn: (c: ForgeConfig) => ForgeConfig) => void;
  replace: (c: ForgeConfig) => void;
  save: () => Promise<boolean>;
  discard: () => void;
};

export const ConfigContext = createContext<Ctx | null>(null);

export function useForgeConfig(): Ctx {
  const ctx = useContext(ConfigContext);
  if (!ctx)
    throw new Error('useForgeConfig must be used inside ForgeConfigProvider');
  return ctx;
}

export function rootClass(config: ForgeConfig) {
  const a = config.accessibility;
  return [
    'forge',
    a.highContrast ? 'high-contrast' : '',
    a.reducedMotion === 'on' ? 'reduced-motion' : '',
  ].join(' ');
}

export function rootStyle(config: ForgeConfig) {
  return {
    ['--forge-font-scale' as string]: String(config.accessibility.fontScale),
  };
}
