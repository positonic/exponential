/**
 * Type-safe theme helpers to prevent hardcoded colors
 */

// Define allowed color tokens
export const colorTokens = {
  background: {
    primary: 'var(--color-bg-primary)',
    secondary: 'var(--color-bg-secondary)',
    tertiary: 'var(--color-bg-tertiary)',
    elevated: 'var(--color-bg-elevated)',
  },
  surface: {
    primary: 'var(--color-surface-primary)',
    secondary: 'var(--color-surface-secondary)',
    hover: 'var(--color-surface-hover)',
  },
  text: {
    primary: 'var(--color-text-primary)',
    secondary: 'var(--color-text-secondary)',
    muted: 'var(--color-text-muted)',
    inverse: 'var(--color-text-inverse)',
  },
  border: {
    primary: 'var(--color-border-primary)',
    secondary: 'var(--color-border-secondary)',
    focus: 'var(--color-border-focus)',
  },
  brand: {
    primary: 'var(--color-brand-primary)',
    success: 'var(--color-brand-success)',
    warning: 'var(--color-brand-warning)',
    error: 'var(--color-brand-error)',
  }
} as const;

// Type-safe Mantine styles helper
export function mantineStyles(styles: {
  backgroundColor?: keyof typeof colorTokens.background | keyof typeof colorTokens.surface;
  color?: keyof typeof colorTokens.text;
  borderColor?: keyof typeof colorTokens.border;
}) {
  const result: Record<string, string> = {};
  
  if (styles.backgroundColor) {
    const bgToken = colorTokens.background[styles.backgroundColor as keyof typeof colorTokens.background] 
      || colorTokens.surface[styles.backgroundColor as keyof typeof colorTokens.surface];
    if (bgToken) result.backgroundColor = bgToken;
  }
  
  if (styles.color) {
    const colorToken = colorTokens.text[styles.color];
    if (colorToken) result.color = colorToken;
  }
  
  if (styles.borderColor) {
    const borderToken = colorTokens.border[styles.borderColor];
    if (borderToken) result.borderColor = borderToken;
  }
  
  return result;
}

// Utility to check if a color is hardcoded
export function isHardcodedColor(value: string): boolean {
  return /^#[0-9A-Fa-f]{3,8}$/.test(value) || 
         /^rgb\(/.test(value) || 
         /^rgba\(/.test(value);
}

// Development-only warning
if (process.env.NODE_ENV === 'development') {
  const originalCreateElement = document.createElement;
  document.createElement = function(...args: Parameters<typeof document.createElement>) {
    const element = originalCreateElement.apply(document, args);
    const originalSetAttribute = element.setAttribute;
    
    element.setAttribute = function(name: string, value: string) {
      if (name === 'style' && value.includes('#')) {
        console.warn('⚠️ Hardcoded color detected in style attribute:', value);
        console.warn('See docs/styling-architecture.md for proper color usage');
      }
      return originalSetAttribute.call(this, name, value);
    };
    
    return element;
  };
}