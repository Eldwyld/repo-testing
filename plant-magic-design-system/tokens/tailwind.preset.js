/**
 * Plant Magic — Tailwind preset
 *
 * Extends Tailwind with the brand ramps, gradients, tinted shadows and type
 * stacks observed on plantmagic.org, so the patterns in docs/05-components.md
 * can be written as utilities instead of inline styles.
 *
 * Tailwind v3:
 *   module.exports = { presets: [require('./tokens/tailwind.preset.js')], ... }
 *
 * Tailwind v4 (CSS-first): import tokens/tokens.css and map what you need
 * inside an @theme block — this file is the reference for those values.
 */

module.exports = {
  theme: {
    extend: {
      colors: {
        /* Brand — amethyst. Dark steps are surfaces, 500 is the action colour. */
        purple: {
          200: '#c577ff',
          300: '#a66eff',
          400: '#8c45ff',
          500: '#7e2df7',
          600: '#6b20e5',
          700: '#5a1bbc',
          850: '#380f57',
          900: '#2d0f63',
          950: '#1f0b3d',
        },
        magenta: {
          500: '#9930e3',
          600: '#8222c3',
        },
        teal: {
          300: '#39cdb5',
          400: '#1daf99',
          600: '#12897a',
          700: '#136e62',
        },
        /* Role aliases — prefer these in components. */
        action: {
          DEFAULT: '#7e2df7',
          hover: '#6b20e5',
          secondary: '#9930e3',
          tertiary: '#12897a',
        },
      },

      fontFamily: {
        display: ['Cinzel', 'Trajan Pro', 'Times New Roman', 'serif'],
        sans: [
          'Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto',
          'Helvetica Neue', 'Arial', 'sans-serif',
        ],
        serif: ['Cormorant', 'EB Garamond', 'Garamond', 'Georgia', 'serif'],
        mono: [
          'ui-monospace', 'SFMono-Regular', 'SF Mono', 'Menlo', 'Consolas',
          'Liberation Mono', 'monospace',
        ],
      },

      letterSpacing: {
        display: '0.01em',
      },

      lineHeight: {
        body: '1.55',
      },

      borderRadius: {
        /* Derived from --radius: 0.625rem, matching the site's shadcn setup. */
        lg: 'var(--radius, 0.625rem)',
        xl: 'calc(var(--radius, 0.625rem) + 4px)',
        '2xl': 'calc(var(--radius, 0.625rem) + 8px)',
        '3xl': 'calc(var(--radius, 0.625rem) + 12px)',
      },

      backgroundImage: {
        'pm-brand': 'linear-gradient(135deg, #7e2df7, #12897a)',
        'pm-brand-h': 'linear-gradient(to right, #7e2df7, #12897a)',
        'pm-brand-soft': 'linear-gradient(to right, #8c45ff, #12897a)',
        'pm-text': 'linear-gradient(90deg, #7e2df7, #12897a)',
        'pm-text-royal': 'linear-gradient(to right, #380f57, #5a1bbc)',
        'pm-underline': 'linear-gradient(90deg, #8c45ff, #1daf99)',
        'pm-hero': 'linear-gradient(135deg, #2d0f63, #380f57, #1f0b3d)',
        'pm-hero-lift': 'linear-gradient(#2d0f63 0%, #380f57 50%, #5a1bbc 100%)',
        'pm-surface': 'linear-gradient(135deg, #2d0f63 0%, #380f57 100%)',
        'pm-band': 'linear-gradient(to right, #380f57, #5a1bbc)',
        'pm-pill-purple': 'linear-gradient(135deg, #7e2df7, #9333ea)',
        'pm-pill-teal': 'linear-gradient(135deg, #12897a, #059669)',
        'pm-pill-amber': 'linear-gradient(135deg, #f59e0b, #d97706)',
        'pm-glow-purple':
          'radial-gradient(circle, rgba(126,45,247,0.3) 0%, rgba(126,45,247,0) 70%)',
        'pm-glow-teal':
          'radial-gradient(circle, rgba(18,137,122,0.3) 0%, rgba(18,137,122,0) 70%)',
        'pm-texture': "url('/assets/pattern.jpg')",
      },

      boxShadow: {
        /* Elevation is tinted with royal purple on light surfaces. */
        'pm-card': '0 10px 30px rgba(90,27,188,0.10), 0 5px 15px rgba(0,0,0,0.03)',
        'pm-card-strong': '0 10px 30px rgba(90,27,188,0.15), 0 5px 15px rgba(0,0,0,0.08)',
        'pm-card-soft': '0 5px 20px rgba(90,27,188,0.08)',
        'pm-pill': '0 4px 12px rgba(126,45,247,0.20)',
        'pm-button': '0 4px 15px rgba(126,45,247,0.30)',
        'pm-button-glow': '0 8px 25px rgba(126,45,247,0.40)',
        'pm-on-dark': '0 8px 25px rgba(0,0,0,0.20)',
        'pm-float-dark': '0 15px 30px rgba(0,0,0,0.20)',
        'pm-overlay': '0 25px 50px rgba(0,0,0,0.40)',
      },

      textShadow: {
        /* Requires a text-shadow plugin, or apply inline as the site does. */
        'pm-glow': '0 0 20px rgba(126,45,247,0.50)',
        'pm-glow-strong': '0 0 30px rgba(126,45,247,0.80)',
      },

      backdropBlur: {
        nav: '20px',
      },

      maxWidth: {
        page: '80rem',
        prose: '48rem',
        narrow: '42rem',
      },

      transitionDuration: {
        DEFAULT: '150ms',
      },

      keyframes: {
        'pm-fade-in': {
          from: { opacity: '0', transform: 'translateY(20px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'pm-float': {
          '0%': { transform: 'translate(0, 0)' },
          '50%': { transform: 'translate(15px, 15px)' },
          '100%': { transform: 'translate(-15px, 15px)' },
        },
      },

      animation: {
        'pm-fade-in': 'pm-fade-in 1s cubic-bezier(0.4, 0, 1, 1) forwards',
        'pm-float': 'pm-float 12s cubic-bezier(0.4, 0, 0.2, 1) infinite',
      },
    },
  },
};
