import { ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import { ConfigContext } from './forgeConfigState';
import { changedCategories } from '../config/registry';
import { compileConfig } from '../config/library';
import { defaultConfig, ForgeConfig } from '../config/schema';
import { validateConfig } from '../config/io';
import { getStore } from '../storage/store';

export function ForgeConfigProvider({ children }: { children: ReactNode }) {
  const store = getStore();
  const [ready, setReady] = useState(false);
  const [saved, setSaved] = useState<ForgeConfig>(defaultConfig);
  const [draft, setDraft] = useState<ForgeConfig>(defaultConfig);
  const [notes, setNotes] = useState<string[]>([]);
  const [saveError, setSaveError] = useState<string[] | null>(null);

  useEffect(() => {
    let live = true;
    store.loadConfig().then(({ config, notes }) => {
      if (!live) return;
      setSaved(config);
      setDraft(config);
      setNotes(notes);
      setReady(true);
    });
    return () => {
      live = false;
    };
  }, [store]);

  const compiled = useMemo(() => compileConfig(draft), [draft]);
  const changed = useMemo(() => changedCategories(saved, draft), [saved, draft]);

  const update = useCallback((fn: (c: ForgeConfig) => ForgeConfig) => setDraft(c => fn(structuredClone(c))), []);
  const replace = useCallback((c: ForgeConfig) => setDraft(structuredClone(c)), []);

  const save = useCallback(async () => {
    const r = validateConfig(draft);
    if (!r.ok) {
      setSaveError(r.errors);
      return false;
    }
    await store.saveConfig(r.value);
    setSaved(r.value);
    setDraft(r.value);
    setSaveError(null);
    return true;
  }, [draft, store]);

  const discard = useCallback(() => {
    setDraft(saved);
    setSaveError(null);
  }, [saved]);

  const value = useMemo(
    () => ({ ready, saved, draft, compiled, changed, notes, saveError, store, update, replace, save, discard }),
    [ready, saved, draft, compiled, changed, notes, saveError, store, update, replace, save, discard]
  );

  // Warn before closing the tab with unsaved changes.
  useEffect(() => {
    if (!changed.length) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [changed.length]);

  return <ConfigContext.Provider value={value}>{children}</ConfigContext.Provider>;
}
