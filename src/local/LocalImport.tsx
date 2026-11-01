import { SettingsDescription, Space, SettingsGrid, JoiStack } from '../common';
import { AnimatePresence } from 'framer-motion';
import {
  WaButton,
  WaIcon,
  WaProgressBar,
} from '@awesome.me/webawesome/dist/react';
import { useLocalImport } from './useLocalImport';

export const LocalImport = () => {
  const { importFiles, busy: loading, total, done } = useLocalImport();
  const files = total === undefined ? undefined : { length: total };
  const progress = done;

  const select = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = event.target.files;
    if (!fileList) return;
    await importFiles(fileList);
    event.target.value = '';
  };

  return (
    <SettingsGrid>
      <SettingsDescription>Add images from your device</SettingsDescription>
      <Space size='medium' />
      <input
        type='file'
        multiple
        accept='image/*,video/*'
        style={{ display: 'none' }}
        id='filePicker'
        onChange={select}
      />
      <WaButton
        style={{ justifySelf: 'center' }}
        onClick={() => document.getElementById('filePicker')?.click()}
        disabled={loading}
      >
        <span>Select Files</span>
        <WaIcon slot='end' name='upload' />
      </WaButton>
      <Space size='small' />
      <AnimatePresence>
        {files && (
          <JoiStack direction='column'>
            <span>{`${progress ?? 0} / ${files.length} files processed`}</span>
            <WaProgressBar value={((progress ?? 1) / files.length) * 100} />
          </JoiStack>
        )}
      </AnimatePresence>
      <Space size='small' />
    </SettingsGrid>
  );
};
