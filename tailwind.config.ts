import { type Config } from "tailwindcss";
import { fontFamily } from "tailwindcss/defaultTheme";

export default {
  content: ["./src/**/*.{js,ts,jsx,tsx}"],
  darkMode: ['class', '[data-mantine-color-scheme="dark"]'],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-geist-sans)", ...fontFamily.sans],
        inter: ["var(--font-inter)", ...fontFamily.sans],
      },
      colors: {
        // Background colors
        background: {
          DEFAULT: 'var(--color-bg-primary)',
          primary: 'var(--color-bg-primary)',
          secondary: 'var(--color-bg-secondary)',
          tertiary: 'var(--color-bg-tertiary)',
          elevated: 'var(--color-bg-elevated)',
          overlay: 'var(--color-bg-overlay)',
        },
        // Surface colors
        surface: {
          DEFAULT: 'var(--color-surface-primary)',
          primary: 'var(--color-surface-primary)',
          secondary: 'var(--color-surface-secondary)',
          tertiary: 'var(--color-surface-tertiary)',
          hover: 'var(--color-surface-hover)',
          active: 'var(--color-surface-active)',
          // Meetings v2: tonal panel surface
          muted: 'var(--color-surface-muted)',
        },
        // Text colors
        text: {
          DEFAULT: 'var(--color-text-primary)',
          primary: 'var(--color-text-primary)',
          secondary: 'var(--color-text-secondary)',
          muted: 'var(--color-text-muted)',
          disabled: 'var(--color-text-disabled)',
          inverse: 'var(--color-text-inverse)',
          // Meetings v2: tertiary/faint text for separators and small captions
          faint: 'var(--color-text-faint)',
        },
        // Border colors
        border: {
          DEFAULT: 'var(--color-border-primary)',
          primary: 'var(--color-border-primary)',
          secondary: 'var(--color-border-secondary)',
          tertiary: 'var(--color-border-tertiary)',
          focus: 'var(--color-border-focus)',
          // Meetings v2: low-contrast hairline and emphasized hover borders
          subtle: 'var(--color-border-subtle)',
          strong: 'var(--color-border-strong)',
        },
        // Brand colors
        brand: {
          DEFAULT: 'var(--color-brand-primary)',
          primary: 'var(--color-brand-primary)',
          'primary-hover': 'var(--color-brand-primary-hover)',
          'primary-active': 'var(--color-brand-primary-active)',
          secondary: 'var(--color-brand-secondary)',
          success: 'var(--color-brand-success)',
          warning: 'var(--color-brand-warning)',
          error: 'var(--color-brand-error)',
          info: 'var(--color-brand-info)',
          'primary-opacity': 'var(--color-brand-primary-opacity)',
          // Subtle brand wash (rgba ~6%) — e.g. the calendar "today" column.
          subtle: 'var(--color-brand-subtle)',
          // Meetings v2: secondary brand tier used for "TODAY" date label,
          // sparkline highlight bar, "Open transcript" link. Uses the RGB
          // triplet form so opacity modifiers like `bg-brand-400/10` resolve
          // through Tailwind's <alpha-value> substitution.
          400: 'rgb(var(--brand-400-rgb) / <alpha-value>)',
        },
        // Error/Warning utility colors
        error: {
          bg: 'var(--color-error-bg)',
          border: 'var(--color-error-border)',
        },
        warning: {
          bg: 'var(--color-warning-bg)',
          border: 'var(--color-warning-border)',
        },
        // Accent colors for landing page + Meetings v2 design tokens
        accent: {
          periwinkle: 'var(--color-accent-periwinkle)',
          indigo: 'var(--color-accent-indigo)',
          // Domain accents — used by Meetings v2 cards, panels, and chips.
          // The RGB triplet form is required so Tailwind opacity modifiers
          // (`bg-accent-meetings/20`, `border-accent-meetings/[0.06]`, etc.)
          // produce valid CSS. Hex-valued CSS vars cannot be split into
          // channels at compile-time and the modifier silently fails,
          // producing a stark currentColor fallback (white in dark mode).
          meetings: 'rgb(var(--accent-meetings-rgb) / <alpha-value>)',
          crm: 'rgb(var(--accent-crm-rgb) / <alpha-value>)',
          okr: 'rgb(var(--accent-okr-rgb) / <alpha-value>)',
          due: 'rgb(var(--accent-due-rgb) / <alpha-value>)',
          ritual: 'rgb(var(--accent-ritual-rgb) / <alpha-value>)',
          // The design calls this "knowledge"; the existing CSS var is named
          // `--accent-quick`. Keep the CSS var name; expose under the design's.
          knowledge: 'rgb(var(--accent-quick-rgb) / <alpha-value>)',
        },
        // Calendar event palette — harmonized 7-hue tint-fill + accent-bar
        // system. Each hue exposes its base (accent bar / "now" line), the
        // tinted fill (+ hover / past), the AA label, the dimmed past label,
        // and the secondary "sub" text. All layers are precomputed via
        // color-mix in globals.css, so these alias the vars directly (no
        // opacity-modifier form needed). Usage:
        //   bg-event-indigo-fill text-event-indigo-label border-l-event-indigo
        event: {
          indigo: 'var(--ev-indigo)',
          'indigo-fill': 'var(--ev-indigo-fill)',
          'indigo-fill-hover': 'var(--ev-indigo-fill-hover)',
          'indigo-fill-past': 'var(--ev-indigo-fill-past)',
          'indigo-label': 'var(--ev-indigo-label)',
          'indigo-label-past': 'var(--ev-indigo-label-past)',
          'indigo-sub': 'var(--ev-indigo-sub)',
          cyan: 'var(--ev-cyan)',
          'cyan-fill': 'var(--ev-cyan-fill)',
          'cyan-fill-hover': 'var(--ev-cyan-fill-hover)',
          'cyan-fill-past': 'var(--ev-cyan-fill-past)',
          'cyan-label': 'var(--ev-cyan-label)',
          'cyan-label-past': 'var(--ev-cyan-label-past)',
          'cyan-sub': 'var(--ev-cyan-sub)',
          green: 'var(--ev-green)',
          'green-fill': 'var(--ev-green-fill)',
          'green-fill-hover': 'var(--ev-green-fill-hover)',
          'green-fill-past': 'var(--ev-green-fill-past)',
          'green-label': 'var(--ev-green-label)',
          'green-label-past': 'var(--ev-green-label-past)',
          'green-sub': 'var(--ev-green-sub)',
          amber: 'var(--ev-amber)',
          'amber-fill': 'var(--ev-amber-fill)',
          'amber-fill-hover': 'var(--ev-amber-fill-hover)',
          'amber-fill-past': 'var(--ev-amber-fill-past)',
          'amber-label': 'var(--ev-amber-label)',
          'amber-label-past': 'var(--ev-amber-label-past)',
          'amber-sub': 'var(--ev-amber-sub)',
          violet: 'var(--ev-violet)',
          'violet-fill': 'var(--ev-violet-fill)',
          'violet-fill-hover': 'var(--ev-violet-fill-hover)',
          'violet-fill-past': 'var(--ev-violet-fill-past)',
          'violet-label': 'var(--ev-violet-label)',
          'violet-label-past': 'var(--ev-violet-label-past)',
          'violet-sub': 'var(--ev-violet-sub)',
          rose: 'var(--ev-rose)',
          'rose-fill': 'var(--ev-rose-fill)',
          'rose-fill-hover': 'var(--ev-rose-fill-hover)',
          'rose-fill-past': 'var(--ev-rose-fill-past)',
          'rose-label': 'var(--ev-rose-label)',
          'rose-label-past': 'var(--ev-rose-label-past)',
          'rose-sub': 'var(--ev-rose-sub)',
          slate: 'var(--ev-slate)',
          'slate-fill': 'var(--ev-slate-fill)',
          'slate-fill-hover': 'var(--ev-slate-fill-hover)',
          'slate-fill-past': 'var(--ev-slate-fill-past)',
          'slate-label': 'var(--ev-slate-label)',
          'slate-label-past': 'var(--ev-slate-label-past)',
          'slate-sub': 'var(--ev-slate-sub)',
        },
        // Gradient color references
        gradient: {
          'hero-start': 'var(--color-gradient-hero-start)',
          'hero-end': 'var(--color-gradient-hero-end)',
          'cta-start': 'var(--color-gradient-cta-start)',
          'cta-end': 'var(--color-gradient-cta-end)',
          'problem-bg': 'var(--color-gradient-problem-bg)',
        },
      },
      // Background image gradients
      backgroundImage: {
        'hero-gradient': 'linear-gradient(180deg, var(--color-gradient-hero-start), var(--color-gradient-hero-end))',
        'cta-gradient': 'linear-gradient(135deg, var(--color-gradient-cta-start), var(--color-gradient-cta-end))',
        'problem-gradient': 'radial-gradient(circle at top, var(--color-gradient-problem-bg) 0%, var(--color-bg-primary) 100%)',
      },
      backgroundColor: {
        // Shortcuts for common background usage
        primary: 'var(--color-bg-primary)',
        secondary: 'var(--color-bg-secondary)',
        tertiary: 'var(--color-bg-tertiary)',
        elevated: 'var(--color-bg-elevated)',
      },
      textColor: {
        // Shortcuts for common text usage
        primary: 'var(--color-text-primary)',
        secondary: 'var(--color-text-secondary)',
        muted: 'var(--color-text-muted)',
        disabled: 'var(--color-text-disabled)',
        inverse: 'var(--color-text-inverse)',
      },
      borderColor: {
        // Shortcuts for common border usage
        primary: 'var(--color-border-primary)',
        secondary: 'var(--color-border-secondary)',
        tertiary: 'var(--color-border-tertiary)',
        focus: 'var(--color-border-focus)',
      },
    },
  },
  plugins: [],
} satisfies Config;
