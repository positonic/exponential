export type DarkThemeVariant = 'navy' | 'slate';
export const DEFAULT_DARK_THEME: DarkThemeVariant = 'navy';

const STORAGE_KEY = 'dark-theme';

export function getDarkTheme(): DarkThemeVariant {
  if (typeof window === 'undefined') return DEFAULT_DARK_THEME;
  return (localStorage.getItem(STORAGE_KEY) as DarkThemeVariant) ?? DEFAULT_DARK_THEME;
}

export function setDarkTheme(variant: DarkThemeVariant) {
  localStorage.setItem(STORAGE_KEY, variant);
  if (variant === DEFAULT_DARK_THEME) {
    document.documentElement.removeAttribute('data-dark-theme');
  } else {
    document.documentElement.setAttribute('data-dark-theme', variant);
  }
}
