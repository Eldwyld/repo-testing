# Elevation & Effects

This is where the design system is most distinctive — and most easily lost when
someone builds a new component with default Tailwind shadows.

## Rule 1: Shadows are tinted, never neutral

On light surfaces, every shadow carries royal purple (`#5A1BBC`). A plain
`rgba(0,0,0,…)` shadow reads grubby against the warm purple palette; the tinted
version reads like coloured light.

```css
/* resting card */
box-shadow: 0 10px 30px rgba(90, 27, 188, 0.10),
            0 5px  15px rgba(0,  0,   0,   0.03);

/* featured / hoverable card */
box-shadow: 0 10px 30px rgba(90, 27, 188, 0.15),
            0 5px  15px rgba(0,  0,   0,   0.08);

/* compact list card */
box-shadow: 0 5px 20px rgba(90, 27, 188, 0.08);
```

Note the structure: a **wide tinted glow** plus a **tight neutral contact
shadow**. The neutral layer is always the quieter of the two (3–8% vs 10–15%).

Interactive elements are tinted with the *action* purple (`#7E2DF7`) instead:

| Token | Value | Use |
|---|---|---|
| `--pm-shadow-pill` | `0 4px 12px rgba(126,45,247,.20)` | Small gradient pill |
| `--pm-shadow-button` | `0 4px 15px rgba(126,45,247,.30)` | Primary button at rest |
| `--pm-shadow-button-glow` | `0 8px 25px rgba(126,45,247,.40)` | Hero primary button |

On **dark** surfaces the logic inverts — tinted shadows are invisible there, so
shadows go plain black at high spread:

| Token | Value | Use |
|---|---|---|
| `--pm-shadow-on-dark` | `0 8px 25px rgba(0,0,0,.20)` | Glass button |
| `--pm-shadow-float-dark` | `0 15px 30px rgba(0,0,0,.20)` | Glass card |
| `--pm-shadow-overlay` | `0 25px 50px rgba(0,0,0,.40)` | Dropdown menus, modals |

## Rule 2: Dark surfaces are never flat

Two devices, layered beneath the content, do all the work.

### Texture

A tiled organic pattern (`assets/pattern.jpg`, 1742×980) at **3–5% opacity**:

```html
<section class="pm-section pm-section--dark">
  <div class="pm-texture"></div>          <!-- opacity .03 -->
  <div class="pm-layer">…content…</div>
</section>
```

The nav uses `opacity-[0.03]`, the footer `opacity-5`. It is barely perceptible
by design — it kills banding in the large gradients and adds grain. Always
`position: absolute; inset: 0; pointer-events: none`, always beneath a
`position: relative; z-index: 1` content layer.

### Radial orbs

Soft coloured blooms bleeding off the edges, at 20% opacity:

```css
background: radial-gradient(circle, rgba(126,45,247,0.3) 0%, rgba(126,45,247,0) 70%);
```

The footer places a 10rem purple orb at the top-left (translated `-20%, -20%`)
and a 15rem teal orb at the bottom-right (translated `30%, 30%`). Purple and
teal are used in pairs, echoing the brand gradient.

## Rule 3: Glass, not opacity

Translucent surfaces on dark backgrounds combine fill, border and blur. The
border is what sells it — a glass panel without the `white-20` hairline reads as
a smudge.

```css
background: rgba(255, 255, 255, 0.10);
border: 1px solid rgba(255, 255, 255, 0.20);
backdrop-filter: blur(8px);
```

The nav is the strongest instance, and adds saturation:

```css
background: rgba(45, 15, 99, 0.95);
backdrop-filter: blur(20px) saturate(180%);
```

The `saturate(180%)` is what makes content scrolling under the nav bloom rather
than mud. Blur steps in use: `sm` 8px, `md` 12px, `lg` 16px, `xl` 24px, nav 20px.

## Rule 4: Glow replaces text-shadow on display type

Headings over dark surfaces never take a conventional drop shadow:

```css
text-shadow: 0 0 20px rgba(126, 45, 247, 0.50);   /* section heading */
text-shadow: 0 0 30px rgba(126, 45, 247, 0.80);   /* hero headline   */
```

The nav wordmark is the exception — it uses a real shadow for legibility over
arbitrary scrolling content:

```css
text-shadow: 0 2px 10px rgba(0, 0, 0, 0.3);
filter: drop-shadow(0 1px 3px rgba(0, 0, 0, 0.3));
```

## Borders

| Context | Border |
|---|---|
| Card on light | `1px solid rgba(106, 32, 229, 0.10)` |
| Featured card | `1px solid rgba(126, 45, 247, 0.30)` |
| Glass on dark | `1px solid rgba(255, 255, 255, 0.20)` |
| Glass button | `1px solid rgba(255, 255, 255, 0.30)` |
| Hero outline CTA | `1px solid rgba(126, 45, 247, 0.60)` |
| Outline button | `2px solid #5A1BBC` |

Card borders are purple at 10% alpha. Never gray.

## Composition order

For any dark section, the stacking is fixed:

```
1. gradient background      (on the section itself)
2. texture overlay          .pm-texture   — opacity .03–.05
3. radial orbs              .pm-orb       — opacity .2
4. content                  .pm-layer     — position: relative; z-index: 1
```

Getting this order wrong is what makes a hand-rolled section look flat next to
the real ones.
