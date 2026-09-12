# Components

Each entry gives the pattern as observed on plantmagic.org, the class from
`css/plant-magic.css`, and the Tailwind recipe the live site uses.

---

## Buttons

Pill-shaped by default. Six variants, all in production.

### Primary — gradient

The signature CTA. Brand gradient, glowing shadow that deepens on hover.

```html
<a class="pm-btn pm-btn--lg pm-btn--primary">Explore Events</a>
```

```
Tailwind: px-8 py-4 text-white rounded-2xl font-semibold text-lg shadow-lg hover:shadow-xl
Inline:   background: linear-gradient(135deg, #7E2DF7, #12897A);
          box-shadow: 0 8px 25px rgba(126,45,247,0.4);
```

Note the site uses `rounded-2xl` for hero CTAs and `rounded-full` everywhere
else. Both are correct; pick one per surface and stay consistent.

### Inverse — white on dark

The most common hero CTA. White pill, **purple label** (`#6B20E5`), never a
gray or black label.

```html
<a class="pm-btn pm-btn--lg pm-btn--inverse">Join Our Community</a>
```

### Glass — translucent

The second action on a dark surface.

```html
<a class="pm-btn pm-btn--lg pm-btn--glass">Contact Us</a>
```

```
background: rgba(255,255,255,0.15);
border: 1px solid rgba(255,255,255,0.3);
backdrop-filter: blur(8px);
box-shadow: 0 4px 12px rgba(0,0,0,0.1);
```

### Glass-brand — purple rim

Glass with a `rgba(126,45,247,0.6)` border. Used beside the primary CTA in the
hero so the pair reads as related.

```html
<a class="pm-btn pm-btn--lg pm-btn--glass-brand">Visit Our Cafe</a>
```

### Outline — light surface

`2px` royal purple rim, purple label, tinted wash on hover.

```html
<a class="pm-btn pm-btn--outline">Create account</a>
```

### Soft — tertiary

A tinted pill for in-card actions. `rgba(90,27,188,0.05)` fill, `#5A1BBC` label,
`font-weight: 500` rather than 600.

```html
<a class="pm-btn pm-btn--sm pm-btn--soft">Apply for this role</a>
```

### Sizing

| Size | Padding | Text |
|---|---|---|
| `--sm` | `0.5rem 1rem` | `xs` |
| default | `0.75rem 1.5rem` | `sm` |
| `--lg` | `1rem 2rem` | `lg` |

All transition `all 300ms cubic-bezier(.4,0,.2,1)`.

---

## Pills & badges

Small gradient chips, `rounded-full`, `text-xs font-medium`, `px-3 py-1`.

```html
<span class="pm-pill pm-pill--purple">Ceremony</span>
<span class="pm-pill pm-pill--teal">Café</span>
<span class="pm-pill pm-pill--amber">Event</span>
<span class="pm-pill pm-pill--tint">Draft</span>
<span class="pm-pill pm-pill--glass">Featured</span>
```

Category colour is carried by a 135° gradient plus a matching 20%-alpha shadow.
The glass variant adds `backdrop-filter: blur(4px)` and is used over imagery.

---

## Cards

White, generously rounded, lifted by a purple-tinted shadow, hairline-bordered
in 10%-alpha purple.

### Standard

```html
<article class="pm-card">
  <h3 class="pm-card__title">Sunday Service</h3>
  <div class="pm-card__body">…</div>
  <div class="pm-card__footer"><a class="pm-btn pm-btn--sm pm-btn--soft">Read more</a></div>
</article>
```

```
bg-white rounded-xl p-8 border h-full flex flex-col
box-shadow: 0 10px 30px rgba(90,27,188,.1), 0 5px 15px rgba(0,0,0,.03);
border: 1px solid rgba(106,32,229,.1);
```

### Feature

`rounded-3xl`, `p-10`, stronger shadow, lifts `0.5rem` on hover. Usually opens
with an icon tile.

```html
<div class="pm-lift-group">
  <article class="pm-card pm-card--feature pm-card--hover">
    <div class="pm-icon-tile">…</div>
    <h3 class="pm-card__title">Sacred Spaces</h3>
    …
  </article>
</div>
```

The live site borders these per category — `border-purple-100`,
`border-teal-100`, `border-amber-100` — matching the icon tile's gradient.

### Media

Image bleeds to the rounded edge, so the card has no padding and the body is
inset instead.

```html
<article class="pm-card pm-card--media pm-card--hover">
  <img class="pm-card__media" src="…" alt="">
  <div class="pm-card__body">…</div>
</article>
```

```
rounded-2xl overflow-hidden h-full flex flex-col
img: h-48 object-cover w-full
border: 1px solid rgba(126,45,247,.3);
box-shadow: 0 10px 30px rgba(90,27,188,.15), 0 5px 15px rgba(0,0,0,.08);
```

Card titles go `text-gray-800 → text-purple-700` on group hover.

### Glass

The dark-surface counterpart: `white-10` fill, `white-20` border,
`backdrop-blur-sm`, `0 15px 30px rgba(0,0,0,.2)`.

### Quiet

`bg-gray-50`, `border-gray-100`, soft shadow. For supporting grids where the
white cards would compete with the main content.

---

## Icon tile

A 3.5rem rounded square carrying a category gradient. Sits at the top of feature
cards and beside list items.

```html
<div class="pm-icon-tile pm-icon-tile--teal">
  <svg width="24" height="24">…</svg>
</div>
```

`rounded-xl` by default; `--round` for the circular variant used in avatars and
social links.

---

## Navigation

Fixed, saturated purple glass, pill links, panel dropdowns.

```html
<nav class="pm-nav">
  <div class="pm-texture"></div>
  <div class="pm-container pm-layer">
    <div class="pm-nav__inner">
      <a class="pm-nav__brand" href="/">Plant Magic</a>
      <div class="pm-nav__links">
        <div class="pm-menu-wrap">
          <button class="pm-nav__link" aria-expanded="false">
            About <svg class="pm-nudge">▾</svg>
          </button>
          <div class="pm-menu">
            <a class="pm-menu__item" href="/about">Overview</a>
            <a class="pm-menu__item" href="/sanctuary">Sanctuary</a>
            <hr class="pm-menu__divider">
            <a class="pm-menu__item" href="/donate">Donate</a>
          </div>
        </div>
        <a class="pm-nav__link pm-nav__link--active" href="/cafe">Café</a>
      </div>
    </div>
  </div>
</nav>
```

Key specs:

| Part | Spec |
|---|---|
| Bar | `fixed`, `py-2`, `rgba(45,15,99,.95)`, `blur(20px) saturate(180%)`, `border-b white-20`, `z-50` |
| Wordmark | Cinzel 600, `text-lg md:text-xl`, `text-shadow: 0 2px 10px rgba(0,0,0,.3)` |
| Link | `px-4 py-2 rounded-full font-medium`, hover `white-10`, active `white-20` |
| Dropdown | `w-56`, opens at `calc(100% + 8px)`, `rgba(45,15,99,.95)`, `white-20` border, `0 25px 50px rgba(0,0,0,.4)`, `blur(16px)` |
| Dropdown item | `px-4 py-2 text-sm`, `white-90` → white on hover with `white-10` fill |
| Enter transition | `150ms ease-out`, from `opacity 0, translateY(-8px), scale(.95)` |

Below `md` the links collapse to a hamburger and the items become full-width
`rounded-md` rows with `px-4 py-3`.

There is an 8px invisible bridge element between trigger and panel so the
pointer can cross the gap without the menu closing — keep it if you rebuild the
dropdown on hover. Better still, drive it from `data-open` on click, which is
what `.pm-menu[data-open="true"]` supports.

---

## Forms

Glass inputs on dark, white inputs on light. Both `rounded-full`.

```html
<form class="pm-form-row">
  <input class="pm-field" type="email" placeholder="Join our sacred circle…">
  <button class="pm-btn pm-btn--primary" type="submit">Subscribe</button>
</form>
```

```
input:  px-4 py-3 rounded-full bg-white/10 backdrop-blur-sm border border-white/20
        text-white placeholder-white/60 focus:ring-2 focus:ring-white/30
button: px-6 py-3 rounded-full font-semibold
        background: linear-gradient(135deg, #7E2DF7, #12897A)
```

Stacks vertically below `sm`, row above. Disabled states use `opacity-50` plus
`cursor-not-allowed`.

---

## Footer

The most decorated surface on the site — hero gradient, texture, two orbs, a
newsletter block, then four link columns.

```html
<footer class="pm-footer">
  <div class="pm-texture pm-texture--strong"></div>
  <div class="pm-orb" style="top:0;left:0;width:10rem;height:10rem;transform:translate(-20%,-20%)"></div>
  <div class="pm-orb pm-orb--teal" style="bottom:0;right:0;width:15rem;height:15rem;transform:translate(30%,30%)"></div>

  <div class="pm-container pm-layer">
    <div class="pm-section-header">
      <h2 class="pm-h2 pm-glow-text">Plant Magic</h2>
      <p>Bridging ancient wisdom and modern healing…</p>
      <form class="pm-form-row">…</form>
    </div>

    <div class="pm-footer__grid">
      <div>
        <h3 class="pm-footer__heading">Sacred Spaces</h3>
        <a class="pm-dot-link"><span>Plant Magic Café</span></a>
        <a class="pm-dot-link pm-dot-link--purple"><span>Plant Magic Club</span></a>
      </div>
      …
    </div>
  </div>
</footer>
```

The link treatment is specific and worth preserving: a **2×2 coloured dot**
bullet (teal / purple / green, varied per item) with the label nudging
`translateX(0.25rem)` on hover while the colour goes `white-70 → white`.

---

## Section header

```html
<div class="pm-section-header">
  <h2 class="pm-h2 pm-gradient-text">Upcoming Gatherings</h2>
  <p class="pm-lede">…</p>
</div>
```

Centred, capped at `max-w-2xl`, `margin-bottom: 4rem`.

---

## Hover behaviour summary

| Element | On hover |
|---|---|
| Card | `translateY(-0.5rem)` + deeper shadow, 300ms |
| `.pm-lift` | `translateY(-5px)`, 300ms |
| Card title | `gray-800 → purple-700` |
| Nav link | background `transparent → white-10` |
| Footer link | `white-70 → white`, label `translateX(0.25rem)` |
| Chevron / arrow | `translateX(0.25rem)` |
| Primary button | shadow `0 4px 15px → 0 8px 25px` |
| `.pm-underline` | gradient rule sweeps `scaleX(0 → 1)` |
| Social icon | `scale(1.1)` |
