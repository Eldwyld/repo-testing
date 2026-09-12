# Plant Magic — Design System

A design system extracted from the production build of
[plantmagic.org](https://www.plantmagic.org), captured 12 Sep 2026 from `/`,
`/about`, `/cafe`, `/events` and `/rise-program`.

Deep amethyst purple and teal, almost always together as a 135° gradient.
Inscriptional Roman capitals (Cinzel) against a neutral grotesque (Inter).
Dark surfaces built from layered translucency — scrim, texture, radial bloom,
glass. Light surfaces are white cards with purple-tinted shadows. Everything
interactive is a pill.

## Quick start

```html
<link rel="stylesheet" href="tokens/tokens.css">
<link rel="stylesheet" href="css/plant-magic.css">
```

```html
<section class="pm-section pm-section--dark">
  <div class="pm-texture"></div>
  <div class="pm-container pm-layer">
    <h2 class="pm-h2 pm-glow-text">Gather With Us</h2>
    <a class="pm-btn pm-btn--lg pm-btn--primary">Explore Events</a>
    <a class="pm-btn pm-btn--lg pm-btn--glass-brand">Visit Our Café</a>
  </div>
</section>
```

With Tailwind:

```js
// tailwind.config.js
module.exports = { presets: [require('./tokens/tailwind.preset.js')] };
```

Open `examples/styleguide.html` in a browser to see everything rendered.

## Core values

| | |
|---|---|
| Primary action | `#7E2DF7` amethyst |
| Secondary action | `#12897A` teal |
| Signature gradient | `linear-gradient(135deg, #7E2DF7, #12897A)` |
| Dark surface | `linear-gradient(135deg, #2D0F63, #380F57, #1F0B3D)` |
| Display face | Cinzel 700, `letter-spacing: 0.01em` |
| Body face | Inter 400, 14px / 1.55 |
| Card elevation | `0 10px 30px rgba(90,27,188,.1), 0 5px 15px rgba(0,0,0,.03)` |
| Radius | `--radius: 0.625rem`; pills for anything interactive |
| Workhorse duration | 300ms `cubic-bezier(.4,0,.2,1)` |

## Layout

```
docs/
  00-overview.md              what this is, where the design lives, findings
  01-color.md                 palette, roles, alpha system, contrast audit
  02-typography.md            three families, scale, heading patterns
  03-layout-and-space.md      page frame, rhythm, grids, radius
  04-elevation-and-effects.md tinted shadows, texture, orbs, glass
  05-components.md            buttons, cards, nav, forms, footer
  06-motion.md                durations, easing, the four gestures
tokens/
  tokens.json                 machine-readable, with provenance per value
  tokens.css                  CSS custom properties
  tailwind.preset.js          Tailwind preset
css/
  plant-magic.css             framework-free component layer
examples/
  styleguide.html             living styleguide
assets/
  pattern.jpg                 texture overlay, extracted from the site
```

## Three things to know

**The brand palette is not in the token layer.** It lives in ~200 inline
`style` attributes scattered across the pages. The shipped shadcn tokens
(`--primary: #6639ee`) are untouched scaffold defaults that don't match the
brand purple (`#7E2DF7`), so components rendered through `bg-primary` are
quietly off-brand. `tokens.css` reproduces the layer faithfully and offers an
opt-in `.pm-aligned` fix.

**Teal fails contrast at small sizes.** `#12897A` on white is 4.30:1. Use
`#136E62` (6.11:1) for teal text below 18px.

**Ambient animation was built, then disabled.** `.animated-shape` and the
`float` keyframes ship behind `display: none !important`.

Details in `docs/00-overview.md`.

## Method

MHTML captures were parsed to separate HTML, stylesheets and assets. Values were
mined from three layers — Tailwind utility classes, the site's custom CSS
classes, and inline `style` attributes — then cross-referenced across all five
pages before being promoted to a token. Contrast ratios were computed, not
estimated. Where the source is internally inconsistent, the docs say so rather
than smoothing it over.

## Caveats

Captured from five pages; uncaptured routes may hold patterns not represented
here. Photography direction and component behaviour (state, routing, data) are
out of scope. The `.dark` block in the source is untouched shadcn default and is
not a designed dark theme.
