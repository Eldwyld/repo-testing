/**
 * Images & videos for Forge sessions, managed from the studio. Files are
 * imported from this device into the browser's own storage (IndexedDB) via
 * the same code as the classic "Device" tab; nothing is uploaded.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useImages } from '../../settings';
import { ImageServiceType, ImageType } from '../../types';
import { useLocalImages } from '../../local/LocalProvider';
import { localImageService } from '../../local/LocalImageService';
import { useLocalImport } from '../../local/useLocalImport';
import { OFFLINE_BUILD } from '../../utils/offline';
import { setPath } from '../config/registry';
import { ForgeConfig } from '../config/schema';
import { Card, TagInput } from './components';

type Props = {
  /** Full mode lists every item with tags; compact mode only summarises. */
  mode?: 'compact' | 'full';
  config?: ForgeConfig;
  update?: (fn: (c: ForgeConfig) => ForgeConfig) => void;
};

const LIST_LIMIT = 200;

export function MediaLibrary({ mode = 'compact', config, update }: Props) {
  const [images, setImages] = useImages();
  const { removeImage } = useLocalImages();
  const { importFiles, busy, total, done } = useLocalImport();
  const [names, setNames] = useState<Record<string, string>>({});
  const [message, setMessage] = useState('');
  const filesRef = useRef<HTMLInputElement>(null);
  const folderRef = useRef<HTMLInputElement>(null);

  const local = useMemo(
    () => (images ?? []).filter(i => i.service === ImageServiceType.local),
    [images]
  );
  const online = (images ?? []).length - local.length;
  const count = (type: ImageType) => local.filter(i => i.type === type).length;

  useEffect(() => {
    if (mode !== 'full') return;
    let live = true;
    const missing = local
      .slice(0, LIST_LIMIT)
      .filter(i => names[i.id] === undefined);
    if (!missing.length) return;
    Promise.all(
      missing.map(async i => [
        i.id,
        (await localImageService.getImage(i.id))?.name ?? i.id,
      ])
    ).then(entries => {
      if (live) setNames(prev => ({ ...prev, ...Object.fromEntries(entries) }));
    });
    return () => {
      live = false;
    };
  }, [local, mode, names]);

  const onPick = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const list = event.target.files;
    if (!list?.length) return;
    const added = await importFiles(list);
    setMessage(
      added
        ? `Added ${added} file(s). They stay in this browser only.`
        : 'No supported image or video files found.'
    );
    event.target.value = '';
  };

  const remove = async (ids: string[]) => {
    setImages(prev => (prev ?? []).filter(i => !ids.includes(i.id)));
    await removeImage(ids);
  };

  const tagsOf = (id: string) => config?.media.tags[`local:${id}`] ?? [];
  const setTags = (id: string, tags: string[]) =>
    update?.(c => {
      const next = { ...c.media.tags };
      if (tags.length) next[`local:${id}`] = tags;
      else delete next[`local:${id}`];
      return setPath(c, 'media.tags', next);
    });

  return (
    <Card title='Images & videos' level={mode === 'full' ? 3 : 2}>
      <p className='muted'>
        {OFFLINE_BUILD
          ? 'Offline build: sessions only use images and videos from this device. Nothing is sent over the network.'
          : 'Add images and videos from this device. They are stored in this browser only and never uploaded.'}
      </p>
      <p>
        <strong>{count(ImageType.image)}</strong> images ·{' '}
        <strong>{count(ImageType.gif)}</strong> GIFs ·{' '}
        <strong>{count(ImageType.video)}</strong> videos on this device
        {online > 0 &&
          (OFFLINE_BUILD
            ? ` · ${online} online item(s) ignored in the offline build`
            : ` · ${online} online item(s)`)}
      </p>
      <input
        ref={filesRef}
        type='file'
        multiple
        accept='image/*,video/*'
        hidden
        aria-hidden='true'
        tabIndex={-1}
        onChange={onPick}
        data-testid='media-files'
      />
      <input
        ref={folderRef}
        type='file'
        multiple
        hidden
        aria-hidden='true'
        tabIndex={-1}
        onChange={onPick}
        {...{ webkitdirectory: '', directory: '' }}
      />
      <div className='row'>
        <button
          type='button'
          className='primary'
          disabled={busy}
          onClick={() => filesRef.current?.click()}
        >
          Add images / videos…
        </button>
        <button
          type='button'
          disabled={busy}
          onClick={() => folderRef.current?.click()}
        >
          Add a folder…
        </button>
        {local.length > 0 && (
          <button
            type='button'
            className='danger'
            disabled={busy}
            onClick={async () => {
              if (
                !window.confirm(
                  `Remove all ${local.length} local images and videos from this browser?`
                )
              )
                return;
              await remove(local.map(i => i.id));
              setMessage('Local media removed.');
            }}
          >
            Remove all local media
          </button>
        )}
      </div>
      <p role='status' aria-live='polite' className='muted'>
        {busy && total !== undefined
          ? `Importing… ${done} / ${total}`
          : message}
      </p>
      {mode === 'full' && local.length > 0 && (
        <table>
          <thead>
            <tr>
              <th>File</th>
              <th>Type</th>
              <th>Tags (for media associations)</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {local.slice(0, LIST_LIMIT).map(item => (
              <tr key={item.id}>
                <td>
                  {names[item.id] ?? '…'}
                  <br />
                  <code className='muted'>local:{item.id.slice(0, 10)}</code>
                </td>
                <td>{item.type}</td>
                <td>
                  {update ? (
                    <TagInput
                      label='Tags'
                      value={tagsOf(item.id)}
                      onChange={tags => setTags(item.id, tags)}
                    />
                  ) : (
                    tagsOf(item.id).join(', ')
                  )}
                </td>
                <td>
                  <button
                    type='button'
                    className='small'
                    onClick={() => remove([item.id])}
                  >
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {mode === 'full' && local.length > LIST_LIMIT && (
        <p className='muted'>
          Showing the first {LIST_LIMIT} of {local.length}.
        </p>
      )}
    </Card>
  );
}
