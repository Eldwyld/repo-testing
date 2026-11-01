import { ImageItem, ImageServiceType } from '../../types';
import { OFFLINE_BUILD } from '../../utils/offline';

/** In the offline build only media stored on this device is ever shown. */
export const playableImages = (
  images: ImageItem[] | undefined,
  offline = OFFLINE_BUILD
): ImageItem[] =>
  offline
    ? (images ?? []).filter(i => i.service === ImageServiceType.local)
    : (images ?? []);
