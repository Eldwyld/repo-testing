# Overview

## What this is

A design system reverse-engineered from the production build of
[plantmagic.org](https://www.plantmagic.org), captured 12 Sep 2026 from five
pages: `/`, `/about`, `/cafe`, `/events` and `/rise-program`.

Every value here was observed in shipped code — the Tailwind v4 stylesheet
chunk (`b9ae36e9aee867bd.css`), the font chunk (`7ba853b2867ca772.css`), and the
inline `style` attributes that carry a surprising amount of the site's identity.
Nothing was invented to fill a gap; where the source is inconsistent, the doc
says so.

## The design in one paragraph

Deep amethyst purple and teal, almost always together as a 135° gradient.
Inscriptional Roman capitals (Cinzel) against a neutral grotesque (Inter) —
ancient and modern, which is the brand's stated thesis. Dark surfaces are built
from layered translucency: a purple scrim, a barely-visible texture, soft
radial blooms, and glass panels edged in 20%-alpha white. Light surfaces are
white cards with purple-tinted shadows and purple hairline borders. Everything
interactive is a pill. Motion is four gestures and nothing more.

## Where the design actually lives

Worth knowing before you go looking in the wrong place:

| Layer | Contains | Reliability |
|---|---|---|
| Tailwind utilities | Layout, spacing, type scale, neutral colours | Canonical |
| Custom CSS classes | `.gradient-text`, `.glass`, `.hover-lift`, `.custom-underline`, `.link-primary/secondary/tertiary`, `.bg-gradient-primary/hero`, `.prose-purple` | Canonical |
| **Inline `style` attributes** | **Every brand colour, every gradient, every tinted shadow** | Canonical but scattered |
| shadcn `:root` tokens | `--primary`, `--ring`, `--secondary`… | ⚠️ Scaffold defaults, off-brand |

The brand palette is not in the token layer. It is spread across ~200 inline
style attributes. That is the central finding of this extraction, and the reason
this repo exists: `tokens/tokens.css` is the first place those values have been
collected in one file.

## Contents

| Path | What |
|---|---|
| `docs/01-color.md` | Palette, roles, alpha system, contrast audit |
| `docs/02-typography.md` | Three families, scale, heading patterns, prose |
| `docs/03-layout-and-space.md` | Page frame, rhythm, grids, radius |
| `docs/04-elevation-and-effects.md` | Tinted shadows, texture, orbs, glass |
| `docs/05-components.md` | Buttons, cards, nav, forms, footer |
| `docs/06-motion.md` | Durations, easing, the four gestures |
| `tokens/tokens.json` | Machine-readable tokens with provenance notes |
| `tokens/tokens.css` | CSS custom properties |
| `tokens/tailwind.preset.js` | Tailwind preset |
| `css/plant-magic.css` | Framework-free component layer |
| `examples/styleguide.html` | Living styleguide — open it in a browser |
| `assets/pattern.jpg` | The texture overlay, extracted from the site |

## Findings

Three things a rebuild should decide about deliberately.

**1. The semantic token layer is off-brand.** `--primary: #6639ee` is a shadcn
scaffold default; the brand purple is `#7E2DF7`. Components rendered through
`bg-primary` don't match hand-written CTAs. `tokens.css` ships the layer as-is
and offers an opt-in `.pm-aligned` fix. → `docs/01-color.md`

**2. Teal at small sizes fails contrast.** `#12897A` on white is 4.30:1, below
the 4.5 threshold. `.link-tertiary` is used at `text-sm` in places. Use
`#136E62` (6.11:1) for teal text under 18px. → `docs/01-color.md`

**3. Ambient animation was built, then disabled.** `.animated-shape` and the
`float` keyframes ship with `display: none !important`. The intended design was
more animated than the shipped one. → `docs/06-motion.md`

## Reuse

```html
<link rel="stylesheet" href="tokens/tokens.css">
<link rel="stylesheet" href="css/plant-magic.css">
```

Or, with Tailwind:

```js
// tailwind.config.js
module.exports = { presets: [require('./tokens/tailwind.preset.js')] };
```

## Caveats

- Captured from five pages. Pages not captured (`/sanctuary`, `/dao`, `/donate`,
  `/press`, `/club`, `/store`) may hold patterns not represented here.
- Images other than `pattern.jpg` were not extracted; photography direction is
  out of scope.
- Component *behaviour* (React state, routing, data) was not reverse-engineered
  — this covers visual language only.
- The dark-mode block in the source (`.dark`) is untouched shadcn default and
  bears no relation to the brand. It is reproduced in `tokens.css` for fidelity
  but should not be treated as a designed dark theme.
