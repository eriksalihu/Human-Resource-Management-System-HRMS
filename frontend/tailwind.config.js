/**
 * @file frontend/tailwind.config.js
 * @description Tailwind CSS configuration — class-strategy dark mode, brand color palette, extended spacing, and custom keyframe animations
 */

// ESM import (this file is `export default`, so CommonJS `require` is
// undefined here and tripped no-undef).
import tailwindForms from '@tailwindcss/forms';

/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],

  /**
   * Use the class strategy so the `dark` class on <html> (toggled by
   * `ThemeContext`) drives `dark:` variants. Without this, Tailwind
   * defaults to `'media'` (system preference) and the toggle button is
   * effectively a no-op.
   */
  darkMode: 'class',

  theme: {
    extend: {
      /**
       * Brand color palette — `brand` is the primary indigo we use for
       * action buttons, focus rings, and the active-route accent. Keeping
       * it under a custom key alongside Tailwind's defaults means we can
       * reference `bg-brand-600` from any component without losing access
       * to the standard `indigo-*` ramp.
       */
      colors: {
        brand: {
          50: '#eef2ff',
          100: '#e0e7ff',
          200: '#c7d2fe',
          300: '#a5b4fc',
          400: '#818cf8',
          500: '#6366f1',
          600: '#4f46e5', // primary
          700: '#4338ca',
          800: '#3730a3',
          900: '#312e81',
          950: '#1e1b4b',
        },
        // Semantic aliases for dashboard charts / status surfaces.
        // Pulled from the existing palette so refactors stay 1:1.
        success: '#10b981', // emerald-500
        warning: '#f59e0b', // amber-500
        danger: '#ef4444',  // rose-500
        info: '#0ea5e9',    // sky-500
      },

      /**
       * Extra spacing values for layout chrome that Tailwind's default
       * scale doesn't cover cleanly. `18` (4.5rem) is handy for the
       * sidebar's collapsed-state width if we add one later; `72` and
       * `88` align with common chart-container widths.
       */
      spacing: {
        18: '4.5rem',
        72: '18rem',
        88: '22rem',
        112: '28rem',
        128: '32rem',
      },

      /** Slightly tighter heading line-height than the Tailwind default. */
      lineHeight: {
        tight: '1.15',
      },

      /**
       * Custom keyframes powering the form-shake error feedback (Login),
       * fade-in for modal / dropdown reveal, and slide-in for sidebar /
       * notification panels. All exposed as classes via the `animation`
       * extension below.
       */
      keyframes: {
        fadeIn: {
          '0%':   { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideInRight: {
          '0%':   { transform: 'translateX(20px)', opacity: '0' },
          '100%': { transform: 'translateX(0)',    opacity: '1' },
        },
        slideInLeft: {
          '0%':   { transform: 'translateX(-20px)', opacity: '0' },
          '100%': { transform: 'translateX(0)',     opacity: '1' },
        },
        slideInDown: {
          '0%':   { transform: 'translateY(-10px)', opacity: '0' },
          '100%': { transform: 'translateY(0)',     opacity: '1' },
        },
        // Mobile-modal "rise from bottom" entrance — bigger travel than
        // the dropdown slides so the dialog reveal feels purposeful.
        slideUp: {
          '0%':   { transform: 'translateY(100%)', opacity: '0' },
          '100%': { transform: 'translateY(0)',    opacity: '1' },
        },
        shake: {
          '0%, 100%': { transform: 'translateX(0)' },
          '15%, 45%': { transform: 'translateX(-8px)' },
          '30%, 60%': { transform: 'translateX(8px)' },
          '75%':      { transform: 'translateX(-4px)' },
          '90%':      { transform: 'translateX(4px)' },
        },
      },

      animation: {
        'fade-in':         'fadeIn 200ms ease-out both',
        'slide-in-right':  'slideInRight 250ms ease-out both',
        'slide-in-left':   'slideInLeft 250ms ease-out both',
        'slide-in-down':   'slideInDown 200ms ease-out both',
        'slide-up':        'slideUp 220ms ease-out both',
        shake:             'shake 450ms ease-in-out',
      },

      /**
       * Default transition timing curve. Setting it on the theme means
       * `transition` (without a duration override) feels consistent
       * across the app.
       */
      transitionTimingFunction: {
        'in-out-soft': 'cubic-bezier(0.4, 0, 0.2, 1)',
      },
    },
  },

  plugins: [tailwindForms],
};
