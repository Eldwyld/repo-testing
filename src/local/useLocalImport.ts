import { useCallback, useState } from 'react';
import { chunk } from 'lodash';
import { useImages } from '../settings';
import { ImageServiceType } from '../types';
import { discoverImageFiles, imageTypeFromExtension } from './files';
import { useLocalImages } from './LocalProvider';
import { LocalImageRequest } from './LocalImageService';

/**
 * Import image/video files from this device into the local media library
 * (IndexedDB) and add them to the active slideshow. Shared by the classic
 * "Device" tab and the Forge studio. Files never leave the browser.
 */
export function useLocalImport() {
  const { storeImage } = useLocalImages();
  const [, setImages] = useImages();
  const [busy, setBusy] = useState(false);
  const [total, setTotal] = useState<number | undefined>(undefined);
  const [done, setDone] = useState(0);

  const importFiles = useCallback(
    async (fileList: FileList | File[]) => {
      setBusy(true);
      setDone(0);
      setTotal(0);
      let added = 0;
      try {
        const imageFiles = Array.isArray(fileList)
          ? fileList
          : await discoverImageFiles(fileList);
        setTotal(imageFiles.length);
        for (const part of chunk(imageFiles, 30)) {
          const requests = part.map<LocalImageRequest>(file => ({
            blob: file,
            type: imageTypeFromExtension(
              file.name.split('.').pop()?.toLowerCase() ?? ''
            ),
            name: file.name,
          }));
          const results = await storeImage(requests);
          setDone(prev => prev + part.length);
          added += results.length;
          setImages(prev => {
            const existing = new Set((prev ?? []).map(i => i.id));
            return [
              ...(prev ?? []),
              ...results
                .filter(result => !existing.has(result.id))
                .map(result => ({
                  thumbnail: `local://thumbnail/${result.id}`,
                  preview: `local://preview/${result.id}`,
                  full: `local://full/${result.id}`,
                  type: result.type,
                  source: `local://full/${result.id}`,
                  service: ImageServiceType.local,
                  id: result.id,
                })),
            ];
          });
        }
      } finally {
        setBusy(false);
        setTotal(undefined);
      }
      return added;
    },
    [storeImage, setImages]
  );

  return { importFiles, busy, total, done };
}
