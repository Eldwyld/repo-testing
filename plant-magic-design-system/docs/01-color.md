# Color

## The idea

Two hues carry the brand: a deep **amethyst purple** and a **teal** that acts as
its counterweight. They almost never appear apart — the site's signature move is
a 135° gradient running purple → teal, which shows up on primary buttons, on
clipped heading text, on hover underlines, and on the newsletter submit.

Everything else is scaffolding. Neutral grays are stock Tailwind and carry body
copy on light surfaces; amber and emerald appear only as category gradients on
small tiles and pills.

## Amethyst ramp

The ramp does double duty: the four dark steps are **surfaces**, the light steps
are **ink and action**.

| Token | Hex | Role |
|---|---|---|
| `--pm-purple-950` | `#1F0B3D` | Deepest surface — final stop of the footer gradient |
| `--pm-purple-900` | `#2D0F63` | Nav bar (at 95% alpha), first stop of hero/footer gradients |
| `--pm-purple-850` | `#380F57` | Plum. Mid-stop of dark gradients; `<strong>` on light surfaces |
| `--pm-purple-700` | `#5A1BBC` | Royal. Section headings, outline-button rims, **the tint inside every card shadow** |
| `--pm-purple-600` | `#6B20E5` | Primary link hover; label colour on white CTA buttons |
| `--pm-purple-500` | `#7E2DF7` | **Primary action.** Links, gradient start, focus glow |
| `--pm-purple-400` | `#8C45FF` | Softer gradient start; the hover underline |
| `--pm-purple-300` | `#A66EFF` | Accent bars on dark |
| `--pm-purple-200` | `#C577FF` | Lightest brand tint |

Note that `850` is not simply a darker `700` — it is measurably more magenta
(`#380F57` vs `#5A1BBC`). That shift is what gives the dark gradients their
depth, so don't "correct" it to a clean ramp.

## Teal

| Token | Hex | Role |
|---|---|---|
| `--pm-teal-300` | `#39CDB5` | Accent bar gradient start |
| `--pm-teal-400` | `#1DAF99` | End stop of the hover-underline gradient |
| `--pm-teal-600` | `#12897A` | **Secondary action.** End stop of the brand gradient |
| `--pm-teal-700` | `#136E62` | Teal link hover |

## Magenta — a third link role

The production stylesheet defines three link colours, each a different hue:

```css
.link-primary   { color: #7E2DF7; }  /* amethyst  */
.link-secondary { color: #9930E3; }  /* magenta   */
.link-tertiary  { color: #12897A; }  /* teal      */
```

`#9930E3` is not on the purple ramp. Treat magenta as its own small family
(`--pm-magenta-500/600`) rather than folding it into amethyst.

## Category accents

Used only as 135° gradient pairs, on icon tiles and small pills. Never as flat
fills, and never on body copy.

| Pair | Value |
|---|---|
| Purple | `#7E2DF7 → #9333EA` |
| Teal | `#12897A → #059669` |
| Amber | `#F59E0B → #D97706` |

## Alpha values do the heavy lifting

On dark surfaces, translucent white replaces solid fills almost entirely. This
is the single most characteristic thing about the palette in use — the nav, the
dropdowns, the glass buttons, the footer links and the newsletter input are all
built from the same handful of alphas.

| Token | Value | Where |
|---|---|---|
| `--pm-nav-scrim` | `rgba(45,15,99,0.95)` | Nav and dropdown backgrounds |
| `--pm-white-10` | `rgba(255,255,255,0.10)` | Glass fill; nav link hover |
| `--pm-white-20` | `rgba(255,255,255,0.20)` | Glass border; active nav pill |
| `--pm-white-30` | `rgba(255,255,255,0.30)` | Glass button border; focus ring on dark |
| `--pm-white-70` | `rgba(255,255,255,0.70)` | Footer links at rest |
| `--pm-white-80` | `rgba(255,255,255,0.80)` | Body copy on dark |
| `--pm-white-90` | `rgba(255,255,255,0.90)` | Dropdown items at rest |

Purple tints do the same job on light surfaces:

| Token | Value | Where |
|---|---|---|
| `--pm-purple-tint-05` | `rgba(90,27,188,0.05)` | Soft pill background |
| `--pm-purple-tint-10` | `rgba(106,32,229,0.10)` | **Card hairline border** |
| `--pm-purple-tint-30` | `rgba(126,45,247,0.30)` | Featured card border; radial orb core |
| `--pm-purple-tint-60` | `rgba(126,45,247,0.60)` | Hero outline button rim |

Cards are bordered with a 10%-alpha purple, not a gray. Swapping in
`--pm-gray-200` reads as visibly colder and is the quickest way to make a new
component look foreign.

## Neutrals

Stock Tailwind gray, unmodified: `#4A5565` (gray-600) for body copy on white,
`#1E2939` (gray-800) for card titles, `#101828` (gray-900) for section headings.
No custom neutral ramp was ever introduced.

## ⚠️ The semantic layer is out of sync

The site ships the shadcn/ui token layer with its scaffold defaults untouched:

```css
:root {
  --primary: #6639ee;   /* shadcn default  */
  --ring:    #6639ee;
}
```

`#6639EE` is **not** the brand purple (`#7E2DF7`). Any component rendered
through `bg-primary` / `ring-ring` — the `Button` with `variant="secondary"` on
the About page, for instance — is quietly off-brand, while every hand-written
CTA uses the correct gradient.

`tokens/tokens.css` reproduces the layer as shipped so extraction stays
faithful, and adds an opt-in fix:

```html
<html class="pm-aligned">
```

which rebinds `--primary`, `--ring` and the accent pair to brand values. Adopt
it deliberately — it will shift the appearance of existing shadcn components.

## Contrast

Computed WCAG 2.1 ratios for the pairs this system actually produces.

| Pair | Ratio | Verdict |
|---|---|---|
| `purple-500` `#7E2DF7` on white | **5.82** | AA normal ✅, AAA ✗ |
| `purple-600` `#6B20E5` on white | **7.09** | AAA normal ✅ |
| `purple-700` `#5A1BBC` on white | **9.06** | AAA ✅ |
| `magenta-500` `#9930E3` on white | **5.40** | AA normal ✅ |
| `teal-600` `#12897A` on white | **4.30** | ⚠️ AA large only |
| `teal-700` `#136E62` on white | **6.11** | AA normal ✅ |
| `gray-600` `#4A5565` on white | **7.56** | AAA ✅ |
| White on `purple-900` `#2D0F63` | **15.44** | AAA ✅ |
| White on `purple-700` `#5A1BBC` | **9.06** | AAA ✅ |
| `white-80` on `purple-900` | **10.17** | AAA ✅ |
| `white-70` on `purple-900` | **8.03** | AAA ✅ |
| `white-60` placeholder on nav scrim | **6.22** | AA ✅ |

**The one real problem:** `--pm-teal-600` (`#12897A`) on white is **4.30:1** —
below the 4.5 threshold for normal text. It clears AA only at large sizes
(18.66px+, or 14px bold). The site uses `.link-tertiary` at `text-sm` in
places, which fails. Use `--pm-teal-700` (`#136E62`, 6.11:1) for teal text
below 18px and keep `teal-600` for fills, gradients and large display text.

**White on the brand gradient** ranges from 5.82:1 at the purple end down to
4.30:1 at the teal end. That is why every gradient button on the site is
`font-weight: 600` at `text-sm` or larger — keep it that way, and don't put
small or light-weight text on the teal half of a gradient.
