/**
 * The Forge emblem: an original sticker built to the Sticker World bible.
 * A puffy, sleepy star with a die-cut warm-milk border, hand-inked contour,
 * halftone shadow corner, an off-register colour echo, and a small orbit of
 * story debris (sparkles, an eye charm, a spiral). Decorative only.
 *
 * Colours come from the theme tokens, so it follows Pastel Cloud / Neon Riot.
 */

// Five-point star with slightly uneven radii so the silhouette wobbles.
const OUTER = [40, 37, 41, 38, 39];
const INNER = [19, 21, 18, 20, 19.5];
const star = (cx: number, cy: number) =>
  Array.from({ length: 10 }, (_, i) => {
    const r = i % 2 === 0 ? OUTER[i / 2] : INNER[(i - 1) / 2];
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    return `${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`;
  }).join(' ');

const BODY = star(60, 62);
const ECHO = star(64, 66);

export function StickerEmblem() {
  return (
    <svg
      className='sticker-emblem'
      viewBox='0 0 120 120'
      aria-hidden='true'
      focusable='false'
    >
      <defs>
        <pattern
          id='forge-halftone'
          width='5'
          height='5'
          patternUnits='userSpaceOnUse'
        >
          <circle cx='2.5' cy='2.5' r='1.1' fill='var(--ink)' opacity='0.35' />
        </pattern>
        <clipPath id='forge-body'>
          <polygon points={BODY} />
        </clipPath>
      </defs>

      {/* faint cut edge, die-cut milk border, ink contour */}
      <polygon
        points={BODY}
        fill='var(--edge)'
        stroke='var(--edge)'
        strokeWidth='35'
        strokeLinejoin='round'
      />
      <polygon
        points={BODY}
        fill='var(--milk)'
        stroke='var(--milk)'
        strokeWidth='31'
        strokeLinejoin='round'
      />
      {/* off-register print echo */}
      <polygon
        points={ECHO}
        fill='none'
        stroke='var(--echo-2)'
        strokeWidth='17'
        strokeLinejoin='round'
        opacity='0.9'
      />
      <polygon
        points={BODY}
        fill='var(--ink)'
        stroke='var(--ink)'
        strokeWidth='19'
        strokeLinejoin='round'
      />
      {/* puffy body */}
      <polygon
        points={BODY}
        fill='var(--pink)'
        stroke='var(--pink)'
        strokeWidth='13'
        strokeLinejoin='round'
      />
      {/* halftone shadow cluster, lower right */}
      <g clipPath='url(#forge-body)'>
        <circle cx='88' cy='92' r='30' fill='url(#forge-halftone)' />
      </g>

      {/* heavy-lidded sleepy eyes and a small blunt mouth */}
      <path
        d='M44 58 q6 5 12 0 M64 57 q6 5 12 0'
        fill='none'
        stroke='var(--ink)'
        strokeWidth='3.2'
        strokeLinecap='round'
      />
      <path
        d='M43 55 q7 -3 13 0 M63 54 q7 -3 13 0'
        fill='none'
        stroke='var(--ink)'
        strokeWidth='2'
        strokeLinecap='round'
        opacity='0.7'
      />
      <path
        d='M56 70 q4 3 8 -0.5'
        fill='none'
        stroke='var(--ink)'
        strokeWidth='2.6'
        strokeLinecap='round'
      />

      {/* story debris: sparkles, an eye charm, a spiral */}
      <path
        d='M104 18 l2.5 6 6 2.5 -6 2.5 -2.5 6 -2.5 -6 -6 -2.5 6 -2.5z'
        fill='var(--yellow)'
        stroke='var(--ink)'
        strokeWidth='1.5'
        strokeLinejoin='round'
      />
      <path
        d='M14 96 l1.6 4 4 1.6 -4 1.6 -1.6 4 -1.6 -4 -4 -1.6 4 -1.6z'
        fill='var(--blue)'
        stroke='var(--ink)'
        strokeWidth='1.2'
        strokeLinejoin='round'
      />
      <g transform='translate(104 100)'>
        <ellipse
          rx='8'
          ry='5'
          fill='var(--milk)'
          stroke='var(--ink)'
          strokeWidth='1.6'
        />
        <circle r='2.4' fill='var(--ink)' />
      </g>
      <path
        d='M13 22 c3 -3 7 0 4 3 c-3 3 -8 -1 -5 -6 c3 -5 11 -3 11 3'
        fill='none'
        stroke='var(--purple)'
        strokeWidth='2'
        strokeLinecap='round'
      />
    </svg>
  );
}
