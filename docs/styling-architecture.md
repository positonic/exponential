# Styling Architecture Guide

This document outlines the styling architecture for the Todo application, providing guidelines for developers and AI assistants (like Claude Code) when making style changes.

## Overview

The application uses a dual-styling approach:
- **Mantine UI** - For complex UI components (modals, date pickers, forms)
- **Tailwind CSS** - For layout and utility styling
- **CSS Variables** - For theme-aware colors that work across both systems

## Directory Structure

```
src/
├── styles/
│   ├── colors.ts          # Color token definitions
│   ├── globals.css        # CSS variables and global styles
│   └── mantineTheme.ts    # Mantine theme configuration
├── config/
│   └── themes.ts          # Domain-specific theme configurations
└── app/_components/
    └── layout/
        ├── ColorSchemeScript.tsx    # Prevents theme flash on load
        ├── ColorSchemeProvider.tsx  # Syncs color scheme on mount
        └── MantineRootProvider.tsx  # Mantine provider wrapper
```

## Core Principles

### 1. Never Hard-Code Colors

❌ **Wrong:**
```tsx
<div className="bg-[#262626] text-[#C1C2C5]">
<Button styles={{ root: { backgroundColor: '#339af0' } }}>
```

✅ **Correct:**
```tsx
<div className="bg-surface-secondary text-text-primary">
<Button variant="filled" color="brand">
```

### 2. Use Design Tokens

All colors are defined in `/src/styles/colors.ts` and exposed as CSS variables:

```typescript
// Color token structure
colorTokens = {
  light: {
    background: { primary, secondary, tertiary, elevated },
    surface: { primary, secondary, hover, active },
    text: { primary, secondary, muted, disabled, inverse },
    border: { primary, secondary, focus },
    brand: { primary, success, warning, error, info }
  },
  dark: {
    // Same structure with dark theme values
  }
}
```

### 3. CSS Variables

CSS variables are defined in `/src/styles/globals.css`:

```css
/* Light theme (default) */
:root {
  --color-bg-primary: #ffffff;
  --color-text-primary: #212529;
  /* ... other variables */
}

/* Dark theme */
[data-mantine-color-scheme="dark"] {
  --color-bg-primary: #1a1b1e;
  --color-text-primary: #ffffff;
  /* ... other variables */
}
```

### 4. Tailwind Usage

Tailwind is configured to use CSS variables in `tailwind.config.ts`:

```javascript
colors: {
  background: {
    primary: 'var(--color-bg-primary)',
    secondary: 'var(--color-bg-secondary)',
    // ...
  },
  text: {
    primary: 'var(--color-text-primary)',
    secondary: 'var(--color-text-secondary)',
    // ...
  }
}
```

## Component Guidelines

### Mantine Components

For Mantine components, rely on the theme configuration in `/src/styles/mantineTheme.ts`:

```tsx
// ✅ Good - Uses theme
<TextInput 
  label="Name"
  placeholder="Enter name"
/>

// ❌ Bad - Hardcoded styles
<TextInput 
  styles={{
    input: {
      backgroundColor: '#262626',
      color: '#C1C2C5'
    }
  }}
/>
```

### Layout & Utilities

Use Tailwind classes with semantic color names:

```tsx
// ✅ Good - Semantic classes
<div className="bg-background-primary border-border-primary">
  <p className="text-text-secondary">Content</p>
</div>

// ❌ Bad - Hardcoded colors
<div className="bg-[#1a1b1e] border-[#373A40]">
  <p className="text-[#C1C2C5]">Content</p>
</div>
```

### Common Patterns

**Card/Panel:**
```tsx
<div className="bg-surface-secondary rounded-lg border border-border-primary p-4">
  {/* Content */}
</div>
```

**Hover States:**
```tsx
<button className="hover:bg-surface-hover transition-colors">
  Click me
</button>
```

**Text Hierarchy:**
```tsx
<h1 className="text-text-primary">Main heading</h1>
<p className="text-text-secondary">Secondary content</p>
<span className="text-text-muted">Muted text</span>
```

## Theme Switching

The theme toggle is handled by the `ThemeToggle` component:

1. Updates Mantine's color scheme via `useMantineColorScheme`
2. Toggles Tailwind's `dark` class on the HTML element
3. Persists preference to localStorage

```tsx
import { ThemeToggle } from '~/app/_components/ThemeToggle';

// Add to navigation or header
<ThemeToggle />
```

## Adding New Colors

To add new colors:

1. Add to `/src/styles/colors.ts`:
```typescript
export const colorTokens = {
  light: {
    // ... existing colors
    newCategory: {
      primary: '#hexvalue',
    }
  },
  dark: {
    // ... existing colors
    newCategory: {
      primary: '#hexvalue',
    }
  }
}
```

2. Add CSS variables in `/src/styles/globals.css`:
```css
:root {
  --color-newCategory-primary: #hexvalue;
}

[data-mantine-color-scheme="dark"] {
  --color-newCategory-primary: #hexvalue;
}
```

3. Update Tailwind config if needed:
```javascript
colors: {
  newCategory: {
    primary: 'var(--color-newCategory-primary)',
  }
}
```

## Common Issues & Solutions

### Issue: Date picker appears white in dark mode
**Solution:** Ensure all layout files import `@mantine/dates/styles.css` and use the global Mantine theme.

### Issue: Component doesn't respond to theme changes
**Solution:** Check that:
1. Component uses CSS variables or theme tokens
2. No hardcoded colors are present
3. Component is wrapped in proper providers

### Issue: Flash of wrong theme on page load
**Solution:** Ensure `ColorSchemeScript` is in the `<head>` of layout files.

## Best Practices for AI/Claude Code

When making style changes:

1. **Check existing patterns** - Look for similar components and follow their styling approach
2. **Use semantic names** - Choose `text-text-muted` over `text-gray-500`
3. **Avoid inline styles** - Use Tailwind classes or Mantine theme props
4. **Test both themes** - Ensure changes work in light and dark modes
5. **Update consistently** - If changing a color pattern, update all instances

## Quick Reference

### Background Colors
- `bg-background-primary` - Main page background
- `bg-background-secondary` - Sidebar, elevated sections
- `bg-surface-primary` - Cards, panels
- `bg-surface-hover` - Hover states

### Text Colors
- `text-text-primary` - Main content
- `text-text-secondary` - Secondary content
- `text-text-muted` - Disabled/muted text
- `text-text-inverse` - Text on colored backgrounds

### Border Colors
- `border-border-primary` - Main borders
- `border-border-secondary` - Subtle borders
- `border-border-focus` - Focus states

### Interactive Elements
- `bg-brand-primary` - Primary buttons/actions
- `bg-brand-success` - Success states
- `bg-brand-error` - Error states
- `bg-brand-warning` - Warning states

## Migration Checklist

When updating old components:

- [ ] Remove all hardcoded hex colors
- [ ] Replace with semantic Tailwind classes or CSS variables
- [ ] Remove inline Mantine styles
- [ ] Test in both light and dark modes
- [ ] Update any related components for consistency

---

This architecture ensures consistent theming, easy maintenance, and proper light/dark mode support across the entire application.