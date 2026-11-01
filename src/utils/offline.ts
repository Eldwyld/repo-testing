/**
 * True in the offline build (`npm run build:offline`, Vite mode "offline").
 * That build only uses images and videos imported from this device, never
 * contacts online services, and ships with a Content-Security-Policy that
 * blocks any non-local network request.
 */
export const OFFLINE_BUILD: boolean =
  import.meta.env.VITE_FORGE_OFFLINE === 'true';
