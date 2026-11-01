/**
 * Serve the app's Web Awesome icons from bundled SVGs instead of the Font
 * Awesome CDN, so icons work offline and no third-party request is made for
 * them. Brand logos are not bundled: the online build still loads those from
 * the CDN, the offline build shows a local stand-in.
 */
import {
  getIconLibrary,
  registerIconLibrary,
} from '@awesome.me/webawesome/dist/components/icon/library.js';
import type { IconDefinition } from '@fortawesome/fontawesome-svg-core';
import {
  faAngleDown,
  faAngleRight,
  faArrowsRotate,
  faArrowUpRightFromSquare,
  faBan,
  faBars,
  faCheck,
  faCircleInfo,
  faCircleQuestion,
  faCodeBranch,
  faComments,
  faCompress,
  faDollarSign,
  faExpand,
  faFileExport,
  faFileImport,
  faFloppyDisk,
  faGear,
  faMagnifyingGlass,
  faPause,
  faPlay,
  faRightFromBracket,
  faSatelliteDish,
  faSquareCheck,
  faTrash,
  faTriangleExclamation,
  faUpload,
} from '@fortawesome/free-solid-svg-icons';
import { OFFLINE_BUILD } from './offline';

const svgFromDefinition = (def: IconDefinition): string => {
  const [width, height, , , path] = def.icon;
  const d = Array.isArray(path) ? path.join(' ') : path;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}"><path fill="currentColor" d="${d}"/></svg>`;
};

// Outline ("regular") icons used by toggle tiles, drawn locally.
const outline = (inner: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512" fill="none" stroke="currentColor" stroke-width="40">${inner}</svg>`;
const REGULAR: Record<string, string> = {
  square: outline('<rect x="44" y="76" width="360" height="360" rx="56"/>'),
  'square-check': outline(
    '<rect x="44" y="76" width="360" height="360" rx="56"/><path d="M128 260l64 64 128-136" stroke-linecap="round" stroke-linejoin="round"/>'
  ),
  circle: outline('<circle cx="224" cy="256" r="184"/>'),
  'circle-dot': outline(
    '<circle cx="224" cy="256" r="184"/><circle cx="224" cy="256" r="72" fill="currentColor" stroke="none"/>'
  ),
};

const SOLID: Record<string, IconDefinition> = {
  'angle-down': faAngleDown,
  'angle-right': faAngleRight,
  'arrow-up-right-from-square': faArrowUpRightFromSquare,
  ban: faBan,
  bars: faBars,
  check: faCheck,
  'circle-info': faCircleInfo,
  'info-circle': faCircleInfo,
  compress: faCompress,
  dollar: faDollarSign,
  'dollar-sign': faDollarSign,
  expand: faExpand,
  'file-export': faFileExport,
  'file-import': faFileImport,
  'floppy-disk': faFloppyDisk,
  save: faFloppyDisk,
  gear: faGear,
  'magnifying-glass': faMagnifyingGlass,
  search: faMagnifyingGlass,
  pause: faPause,
  play: faPlay,
  'right-from-bracket': faRightFromBracket,
  'satellite-dish': faSatelliteDish,
  'square-check': faSquareCheck,
  'arrows-rotate': faArrowsRotate,
  sync: faArrowsRotate,
  trash: faTrash,
  'triangle-exclamation': faTriangleExclamation,
  upload: faUpload,
};

// Offline-only stand-ins for brand logos (no brand icon set is bundled).
const BRAND_STANDINS: Record<string, IconDefinition> = {
  github: faCodeBranch,
  discord: faComments,
};

const dataUri = (svg: string) =>
  `data:image/svg+xml,${encodeURIComponent(svg)}`;

/** The SVG markup for an icon, or undefined when it is not bundled. */
export function localIconSvg(
  name: string,
  family = 'classic',
  variant = 'solid'
): string | undefined {
  if (variant === 'regular' && REGULAR[name]) return REGULAR[name];
  if (family === 'brands') {
    return OFFLINE_BUILD && BRAND_STANDINS[name]
      ? svgFromDefinition(BRAND_STANDINS[name])
      : undefined;
  }
  if (SOLID[name]) return svgFromDefinition(SOLID[name]);
  return undefined;
}

const FALLBACK = svgFromDefinition(faCircleQuestion);
const warned = new Set<string>();

export function installLocalIcons() {
  const cdn = getIconLibrary('default');
  registerIconLibrary('default', {
    resolver: (name: string, family?: string, variant?: string, ...rest) => {
      const svg = localIconSvg(name, family, variant);
      if (svg) return dataUri(svg);
      if (!OFFLINE_BUILD && cdn) {
        return (
          cdn.resolver as (
            n: string,
            f?: string,
            v?: string,
            ...r: unknown[]
          ) => string
        )(name, family, variant, ...rest);
      }
      if (!warned.has(name)) {
        warned.add(name);
        console.warn(`Icon "${name}" is not bundled; showing a placeholder.`);
      }
      return dataUri(FALLBACK);
    },
    mutator: cdn?.mutator,
  });
}
