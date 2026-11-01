/// <reference types="vite/client" />

/** Short git commit of the build (see vite.config.ts). */
declare const __FORGE_BUILD__: string;

interface ImportMetaEnv {
  /** "true" in the offline build (see .env.offline). */
  readonly VITE_FORGE_OFFLINE?: string;
}
