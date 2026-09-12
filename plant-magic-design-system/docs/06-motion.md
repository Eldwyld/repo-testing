# Motion

Restrained and consistent. Nothing loops in the viewport, nothing bounces, and
the entire vocabulary is four gestures.

## Durations

| Token | Value | Use |
|---|---|---|
| `--pm-duration-fast` | 150ms | Colour changes, dropdown enter, nav hover |
| `--pm-duration-base` | 200ms | Link colour, small nudges |
| `--pm-duration-slow` | **300ms** | Card hover, buttons, transforms — the workhorse |
| `--pm-duration-slower` | 500ms | Large reveals |

## Easing

| Token | Curve | Use |
|---|---|---|
| `--pm-ease` | `cubic-bezier(.4, 0, .2, 1)` | Default for everything |
| `--pm-ease-out` | `cubic-bezier(0, 0, .2, 1)` | Enter transitions, the underline sweep |
| `--pm-ease-in` | `cubic-bezier(.4, 0, 1, 1)` | The fade-in reveal |

## The four gestures

### 1. Lift

Cards and tiles rise on hover. Two amplitudes:

```css
.pm-lift:hover        { transform: translateY(-5px); }      /* .hover-lift */
.pm-card--hover:hover { transform: translateY(-0.5rem); }   /* hover:-translate-y-2 */
```

Always paired with a shadow that deepens at the same time — the lift without the
shadow change reads as a glitch.

### 2. Nudge

Chevrons, arrows and footer link labels slide forward when their row is hovered.
Always `0.25rem`, always 200ms.

```css
.pm-nudge { transition: transform 200ms; }
.pm-lift-group:hover .pm-nudge { transform: translateX(0.25rem); }
```

### 3. Sweep

The underline. Scales in from the left, and on exit retreats to the right — the
`transform-origin` flip is what produces that:

```css
.pm-underline::after     { transform: scaleX(0); transform-origin: 100% 100%; }
.pm-underline:hover::after { transform: scaleX(1); transform-origin: 0 100%; }
```

### 4. Fade-in

One-shot reveal, 1s, `ease-in`, forwards:

```css
@keyframes pm-fade-in {
  from { opacity: 0; transform: translateY(20px); }
  to   { opacity: 1; transform: translateY(0); }
}
```

## Dropdown enter

```css
/* closed */ opacity: 0; visibility: hidden; transform: translateY(-0.5rem) scale(0.95);
/* open   */ opacity: 1; visibility: visible; transform: translateY(0) scale(1);
transition: all 150ms cubic-bezier(0, 0, 0.2, 1);
```

`visibility` is animated alongside opacity so the panel is not focusable while
hidden.

## Float — defined but disabled

A `float` keyframe and `.animated-shape` / `.shape-1..3` classes exist in the
stylesheet, but the production build ships:

```css
.animated-shape, .shape-1, .shape-2, .shape-3 { display: none !important; }
```

Someone built ambient floating shapes and then switched them off. `pm-float` is
kept in `plant-magic.css` for the decorative orbs if you want it, but the
shipped design is **static decoration**. Adopt the animation deliberately.

## Reduced motion

The source build emits a `prefers-reduced-motion` block. `plant-magic.css`
honours it by collapsing durations and disabling the lift transforms — hover
still produces a colour and shadow change, so affordance survives.

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
  .pm-lift:hover, .pm-card--hover:hover { transform: none; }
}
```

## What the system does not do

No parallax, no scroll-linked animation, no entrance staggering, no looping
ambient motion, no spring physics. Hover and one fade are the whole vocabulary.
Adding more will read as off-brand.
