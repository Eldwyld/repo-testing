# Typography

## Three families, three jobs

| Family | Stack | Job |
|---|---|---|
| **Cinzel** | `"Cinzel", "Trajan Pro", "Times New Roman", serif` | Every heading. Display voice. |
| **Inter** | `"Inter", system-ui, -apple-system, "Segoe UI", Roboto, ...` | All body copy, labels, buttons, nav. |
| **Cormorant** | `"Cormorant", "EB Garamond", "Garamond", "Georgia", serif` | Editorial asides and pull quotes (`.font-serif`). |

Cinzel is an all-caps-flavoured Roman inscriptional face — it carries the
"ancient wisdom" half of the brand. Inter carries the modern half. The contrast
between them *is* the typographic identity; don't set headings in Inter.

Weights loaded: Cinzel 400/500/600/700, Inter 400/500/600/700, Cormorant
400/600/700. All `font-display: swap`.

## Global base

```css
body {
  font-family: var(--pm-font-body);
  font-weight: 400;
  font-size: 0.875rem;   /* 14px — smaller than the usual 16px */
  line-height: 1.55;
  -webkit-font-smoothing: antialiased;
  text-rendering: optimizeLegibility;
  font-feature-settings: "cv02", "cv03", "cv04", "cv11";
}
```

Two things worth preserving:

1. **The base size is 14px, not 16px.** Component padding on this site was tuned
   against a 14px base. Raising it to 16px without re-tuning makes buttons and
   nav items look cramped.
2. **The Inter feature settings are deliberate** — `cv02`/`cv03`/`cv04`/`cv11`
   switch on the single-storey `a`, the open `g`, the `l` with a tail and the
   single-storey `t`. They soften Inter noticeably. Keep them.

## Heading rule

```css
h1, h2, h3, h4, h5, h6, .font-display {
  font-family: var(--pm-font-display);
  font-weight: 700;
  letter-spacing: 0.01em;
}
```

Cinzel is set slightly open at `0.01em`. Applied to *all* headings globally, so
any `<h*>` inherits the display voice without a class.

## Scale

Stock Tailwind, unmodified.

| Step | Size | Line height |
|---|---|---|
| `xs` | 0.75rem | 1.333 |
| `sm` | 0.875rem | 1.429 |
| `base` | 1rem | 1.5 |
| `lg` | 1.125rem | 1.556 |
| `xl` | 1.25rem | 1.4 |
| `2xl` | 1.5rem | 1.333 |
| `3xl` | 1.875rem | 1.2 |
| `4xl` | 2.25rem | 1.111 |
| `5xl` | 3rem | 1 |
| `6xl` | 3.75rem | 1 |
| `7xl` | 4.5rem | 1 |

## Observed heading patterns

Heading **level** and heading **size** are decoupled — pick the size that fits
the visual hierarchy, then use whatever tag is semantically right.

| Use | Pattern |
|---|---|
| Hero headline | `text-5xl md:text-7xl font-bold` + `text-shadow: 0 0 30px rgba(126,45,247,.8)` |
| Hero (gradient fill) | `text-4xl md:text-6xl lg:text-7xl font-bold leading-tight` + clipped white→violet gradient |
| Section heading, light | `text-4xl md:text-5xl font-bold text-gray-900` |
| Section heading, gradient | `text-4xl md:text-5xl font-semibold` + `background: linear-gradient(to right, #380F57, #5A1BBC)` clipped to text |
| Section heading, dark | `text-4xl md:text-5xl font-bold text-white` + `text-shadow: 0 0 20px rgba(126,45,247,.5)` |
| Card title | `text-xl font-bold text-gray-800`, → `text-purple-700` on group hover |
| Sub-heading | `text-xl font-semibold` in `#380F57` |
| Footer column | `text-xl font-bold text-white` |

Note the weight split: **bold (700)** for solid-colour headings, **semibold
(600)** for gradient-filled ones. Gradient fills read heavier, so the weight is
pulled back to compensate.

## Two display treatments

**Gradient fill** — for headings on light surfaces:

```css
.pm-gradient-text {
  background-image: linear-gradient(90deg, #7e2df7, #12897a);
  background-clip: text;
  -webkit-background-clip: text;
  color: transparent;
}
```

**Purple bloom** — for headings on dark surfaces. The site never uses a
conventional drop shadow on display type; it uses a coloured glow:

```css
text-shadow: 0 0 20px rgba(126, 45, 247, 0.5);   /* section */
text-shadow: 0 0 30px rgba(126, 45, 247, 0.8);   /* hero    */
```

## Body copy

| Role | Spec |
|---|---|
| Lede / intro | `text-xl leading-relaxed` (1.625), `--pm-gray-600`, capped at `max-w-3xl` |
| Default body | `text-sm` / `text-base`, `--pm-gray-600`, line-height 1.55 |
| Body on dark | `--pm-white-80`; secondary `--pm-white-70` |
| Eyebrow | `text-xs font-semibold uppercase tracking-widest` (0.1em) in `--pm-action` |
| Card body | `text-sm`, `--pm-gray-600`, often `line-clamp-2` / `line-clamp-3` |

Long-form copy is capped at `max-w-3xl` (48rem) and centred intros at
`max-w-2xl` (42rem).

## Long-form (`.pm-prose` / `.prose-purple`)

```css
--tw-prose-headings: #5A1BBC;   /* royal   */
--tw-prose-links:    #7E2DF7;   /* action  */
--tw-prose-bold:     #380F57;   /* plum    */
--tw-prose-quotes:   #6B7280;
```

Prose headings stay in Cinzel. List markers take the action purple. Blockquotes
get a 4px `#7E2DF7` left rule, a `rgba(126,45,247,.05)` wash, `0.5rem` radius
and italics.
