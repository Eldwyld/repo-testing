# Layout & Space

## Scale

4px base (`--spacing: 0.25rem`). Stock Tailwind steps throughout — no custom
spacing scale was introduced.

The values that actually recur, in order of frequency: `4` (1rem), `2` (0.5rem),
`6` (1.5rem), `3` (0.75rem), `8` (2rem), `16` (4rem), `20` (5rem), `24` (6rem).

## Page frame

Every page uses the same wrapper:

```html
<div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
```

- Max width **80rem** (1280px)
- Gutter steps **1rem → 1.5rem → 2rem** at `sm` / `lg`

Content widths inside it:

| Cap | Value | Use |
|---|---|---|
| `max-w-7xl` | 80rem | Page frame |
| `max-w-5xl` | 64rem | Wide feature rows |
| `max-w-3xl` | 48rem | Lede paragraphs, long-form copy |
| `max-w-2xl` | 42rem | Centred section intros |
| `max-w-md` | 28rem | Newsletter form |

## Breakpoints

| Name | Min-width |
|---|---|
| `sm` | 40rem (640px) |
| `md` | 48rem (768px) |
| `lg` | 64rem (1024px) |
| `xl` | 80rem (1280px) |
| `2xl` | 96rem (1536px) |

`md` (768px) is the meaningful one — it's where the nav swaps from hamburger to
full menu and where display type jumps a step.

## Vertical rhythm

Sections are the unit of vertical spacing. Three sizes:

| Pattern | Value | Use |
|---|---|---|
| `py-16` | 4rem | Compact bands, footer |
| `py-20` | 5rem | **Default section** |
| `py-24` / `md:py-28` | 6rem / 7rem | Feature and hero-adjacent sections |

Inside a section:

```
section
  └─ header block          margin-bottom: 4rem   (mb-16)
      ├─ heading           margin-bottom: 1rem   (mb-4)
      └─ lede
  └─ content grid          gap-8 / gap-12
```

Heading-to-body is `mb-4` (1rem) or `mb-6` (1.5rem); section-header-to-content
is `mb-16` (4rem). That 4rem gap is what gives the pages their unhurried feel —
tightening it is the fastest way to make a new section look off.

Because the nav is `position: fixed`, the first section on every page carries
extra top padding: `pt-20` … `pt-28`.

## Grids

| Pattern | Columns |
|---|---|
| Card grid | `grid-cols-1 md:grid-cols-2 lg:grid-cols-3`, `gap-8` |
| Footer | `grid-cols-1 md:grid-cols-2 lg:grid-cols-4`, `gap-12` |
| Feature split | `grid-cols-1 lg:grid-cols-2`, `gap-12` / `gap-16` |

Cards in a grid are always `h-full` with `flex flex-col`, so a row of cards ends
flush regardless of copy length. Put `mt-auto` on the footer element of the card
to push CTAs to a common baseline.

## Radius

Derived from `--radius: 0.625rem` exactly as Tailwind v4 / shadcn compute it:

| Token | Value | Use |
|---|---|---|
| `sm` | 0.375rem | — |
| `md` | 0.5rem | Mobile nav items |
| `lg` | 0.625rem | Dropdown panels |
| `xl` | 0.875rem | Standard card, icon tile |
| `2xl` | 1.125rem | Hero CTA buttons, media cards |
| `3xl` | 1.375rem | Large feature cards |
| `full` | 9999px | **Default for buttons, pills, nav links, avatars, inputs** |

The governing habit: **anything interactive and inline is a pill**; anything
that contains content is `xl`–`3xl`. There are almost no square corners on the
site.

## Section surface alternation

Light sections alternate to keep long pages from flattening:

1. `bg-white`
2. `bg-gradient-to-b from-purple-50 to-white` (or `from-purple-50 to-teal-50`)
3. `bg-white`
4. Dark band — `linear-gradient(to right, #380F57, #5A1BBC)` — for a CTA
5. Footer — `linear-gradient(135deg, #2D0F63, #380F57, #1F0B3D)`

Dark sections always carry `position: relative; overflow: hidden` so their
texture and orb decoration can't spill.

## Fixed nav offset

```css
.pm-nav { position: fixed; top: 0; z-index: 50; }
```

The live site anchors it to `top: var(--impersonation-banner-height, 0px)` so an
admin banner can push it down. Worth keeping that indirection if you have any
chrome above the nav.
