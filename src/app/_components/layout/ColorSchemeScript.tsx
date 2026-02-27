// This component initializes the color scheme before React hydration
// to prevent flash of incorrect theme

export function ColorSchemeScript() {
  const script = `
    try {
      const stored = localStorage.getItem('color-scheme');
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      const colorScheme = stored || (prefersDark ? 'dark' : 'light');
      
      // Set Mantine color scheme attribute
      document.documentElement.setAttribute('data-mantine-color-scheme', colorScheme);
      
      // Set Tailwind dark class
      if (colorScheme === 'dark') {
        document.documentElement.classList.add('dark');
      }

      // Apply dark theme variant (navy is default, no attribute needed)
      var darkTheme = localStorage.getItem('dark-theme') || 'navy';
      if (darkTheme !== 'navy') {
        document.documentElement.setAttribute('data-dark-theme', darkTheme);
      }
    } catch (e) {
      // Default to dark if there's an error
      document.documentElement.setAttribute('data-mantine-color-scheme', 'dark');
      document.documentElement.classList.add('dark');
    }
  `;
  
  return <script dangerouslySetInnerHTML={{ __html: script }} />;
}