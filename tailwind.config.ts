import { type Config } from "tailwindcss";
import { fontFamily } from "tailwindcss/defaultTheme";

export default {
  content: ["./src/**/*.{js,ts,jsx,tsx}"],
  darkMode: ['class', '[data-mantine-color-scheme="dark"]'],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-geist-sans)", ...fontFamily.sans],
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
        },
        // Text colors
        text: {
          DEFAULT: 'var(--color-text-primary)',
          primary: 'var(--color-text-primary)',
          secondary: 'var(--color-text-secondary)',
          muted: 'var(--color-text-muted)',
          disabled: 'var(--color-text-disabled)',
          inverse: 'var(--color-text-inverse)',
        },
        // Border colors
        border: {
          DEFAULT: 'var(--color-border-primary)',
          primary: 'var(--color-border-primary)',
          secondary: 'var(--color-border-secondary)',
          tertiary: 'var(--color-border-tertiary)',
          focus: 'var(--color-border-focus)',
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
