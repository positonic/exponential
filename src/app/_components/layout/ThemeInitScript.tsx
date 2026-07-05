// Pre-hydration theme bootstrap. The color scheme itself is owned entirely by
// Mantine (<ColorSchemeScript /> in the layout head + MantineProvider), which
// persists to the "mantine-color-scheme-value" localStorage key. This script
// only handles what Mantine doesn't know about:
// 1. One-shot migration of the retired "color-scheme" key. Two competing keys
//    caused toggles to be reverted across tabs (flash-and-revert loop).
// 2. Applying the navy/slate dark variant attribute before first paint.

export function ThemeInitScript() {
  const script = `
    try {
      var legacy = localStorage.getItem('color-scheme');
      if (legacy) {
        if (!localStorage.getItem('mantine-color-scheme-value') &&
            (legacy === 'light' || legacy === 'dark' || legacy === 'auto')) {
          localStorage.setItem('mantine-color-scheme-value', legacy);
        }
        localStorage.removeItem('color-scheme');
      }

      // Apply dark theme variant (navy is default, no attribute needed)
      var darkTheme = localStorage.getItem('dark-theme') || 'navy';
      if (darkTheme !== 'navy') {
        document.documentElement.setAttribute('data-dark-theme', darkTheme);
      }
    } catch (e) {}
  `;

  return <script dangerouslySetInnerHTML={{ __html: script }} />;
}
