/* eslint-disable no-restricted-syntax */
// Design System Color Tokens
// This file defines all color values for both light and dark themes
// These tokens are the single source of truth for colors in the application

export const colorTokens = {
  light: {
    background: {
      primary: '#ffffff',
      secondary: '#f8f9fa',
      tertiary: '#e9ecef',
      elevated: '#ffffff',
      overlay: 'rgba(0, 0, 0, 0.5)',
    },
    surface: {
      primary: '#ffffff',
      secondary: '#f8f9fa',
      tertiary: '#e9ecef',
      hover: '#e9ecef',
      active: '#dee2e6',
    },
    text: {
      primary: '#212529',
      secondary: '#495057',
      muted: '#6c757d',
      disabled: '#adb5bd',
      inverse: '#ffffff',
    },
    border: {
      primary: '#dee2e6',
      secondary: '#e9ecef',
      tertiary: '#f1f3f5',
      focus: '#339af0',
    },
    brand: {
      primary: '#339af0',
      primaryHover: '#228be6',
      primaryActive: '#1c7ed6',
      secondary: '#868e96',
      success: '#40c057',
      warning: '#fab005',
      error: '#fa5252',
      info: '#339af0',
    },
  },
  dark: {
    background: {
      primary: '#1a1b1e',
      secondary: '#25262b',
      tertiary: '#2C2E33',
      elevated: '#25262b',
      overlay: 'rgba(0, 0, 0, 0.7)',
    },
    surface: {
      primary: '#25262b',
      secondary: '#2C2E33',
      tertiary: '#373A40',
      hover: '#373A40',
      active: '#495057',
    },
    text: {
      primary: '#ffffff',
      secondary: '#C1C2C5',
      muted: '#909296',
      disabled: '#5C5F66',
      inverse: '#1a1b1e',
    },
    border: {
      primary: '#373A40',
      secondary: '#2C2E33',
      tertiary: '#25262b',
      focus: '#339af0',
    },
    brand: {
      primary: '#339af0',
      primaryHover: '#4dabf7',
      primaryActive: '#228be6',
      secondary: '#adb5bd',
      success: '#51cf66',
      warning: '#ffd43b',
      error: '#ff6b6b',
      info: '#4dabf7',
    },
  },
} as const;

// Semantic color mappings
export const semanticColors = {
  // Form inputs
  input: {
    background: 'background.secondary',
    border: 'border.primary',
    text: 'text.primary',
    placeholder: 'text.muted',
    hoverBorder: 'border.focus',
    focusBorder: 'brand.primary',
  },
  // Modals and overlays
  modal: {
    background: 'background.elevated',
    overlay: 'background.overlay',
    header: 'background.secondary',
    border: 'border.primary',
  },
  // Buttons
  button: {
    primary: {
      background: 'brand.primary',
      text: 'text.inverse',
      hover: 'brand.primaryHover',
      active: 'brand.primaryActive',
    },
    secondary: {
      background: 'surface.secondary',
      text: 'text.primary',
      hover: 'surface.hover',
      active: 'surface.active',
      border: 'border.primary',
    },
    ghost: {
      background: 'transparent',
      text: 'text.secondary',
      hover: 'surface.hover',
      active: 'surface.active',
    },
  },
  // Navigation
  nav: {
    background: 'background.secondary',
    item: {
      text: 'text.secondary',
      hover: 'surface.hover',
      active: 'brand.primary',
      activeBackground: 'surface.active',
    },
  },
  // Calendar specific
  calendar: {
    background: 'background.primary',
    header: {
      background: 'background.primary',
      text: 'text.primary',
      control: {
        text: 'text.primary',
        hover: 'surface.hover',
      },
    },
    weekday: {
      text: 'text.muted',
    },
    day: {
      text: 'text.primary',
      hover: 'surface.hover',
      selected: 'brand.primary',
      selectedText: 'text.inverse',
      outside: 'text.disabled',
      today: 'brand.success',
    },
    month: {
      background: 'background.primary',
      text: 'text.primary',
      hover: 'surface.hover',
      selected: 'brand.primary',
    },
  },
  // Popover
  popover: {
    background: 'background.elevated',
    border: 'border.primary',
    shadow: 'rgba(0, 0, 0, 0.1)',
  },
} as const;

// Helper function to get color value from token path
export function getColorValue(
  path: string,
  theme: 'light' | 'dark'
): string {
  const keys = path.split('.');
  let value: any = colorTokens[theme];
  
  for (const key of keys) {
    value = value?.[key];
    if (!value) {
      console.warn(`Color token not found: ${path} in ${theme} theme`);
      return '#000000';
    }
  }
  
  return value as string;
}

// Type-safe color token paths
export type ColorTokenPath = 
  | `background.${keyof typeof colorTokens.light.background}`
  | `surface.${keyof typeof colorTokens.light.surface}`
  | `text.${keyof typeof colorTokens.light.text}`
  | `border.${keyof typeof colorTokens.light.border}`
  | `brand.${keyof typeof colorTokens.light.brand}`;