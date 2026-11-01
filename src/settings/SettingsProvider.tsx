import { useCallback } from 'react';
import { createLocalStorageProvider } from '../utils';
import { interpolateWith } from '../utils/translate';
import type { Settings } from './Settings';
import { defaultSettings } from './Settings';

const settingsStorageKey = 'settings';

export const {
  Provider: SettingsProvider,
  useProvider: useSettings,
  useProviderSelector: useSetting,
} = createLocalStorageProvider<Settings>({
  key: settingsStorageKey,
  defaultData: defaultSettings,
});

const removeTrailingComma = (str: string): string => {
  return str.trim().replace(/,$/, '');
};

export const useTranslate = (): ((value: string) => string) => {
  const [gender] = useSetting('gender');
  const [hypno] = useSetting('hypno');
  const [body] = useSetting('body');

  return useCallback(
    (value: string) =>
      removeTrailingComma(
        interpolateWith(value, {
          player: {
            male: 'boy',
            female: 'girl',
            other: 'toy',
          }[gender],
          master: {
            off: '',
            joi: '',
            breeding: '',
            maledom: 'master',
            femdom: 'mistress',
          }[hypno],
          hands: {
            off: 'hands',
            joi: 'hands',
            breeding: 'hands',
            maledom: 'hands',
            femdom: 'hands',
          }[hypno],
          part: {
            penis: 'cock',
            vagina: 'pussy',
            neuter: 'mound',
          }[body],
          stroke: {
            penis: 'stroke',
            vagina: 'rub',
            neuter: 'touch',
          }[body],
        })
      ),
    [body, gender, hypno]
  );
};
