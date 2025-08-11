# 🎨 Styling Quick Reference

## ❌ NEVER DO THIS
```tsx
// Hardcoded colors
<div style={{ backgroundColor: '#262626' }}>
<div className="bg-[#1a1b1e]">
<TextInput styles={{ input: { color: '#C1C2C5' } }}>
```

## ✅ ALWAYS DO THIS
```tsx
// CSS Variables
<div style={{ backgroundColor: 'var(--color-bg-elevated)' }}>
<div className="bg-surface-secondary">
<TextInput /> // Let Mantine theme handle it
```

## Color Mapping Cheat Sheet

| ❌ Old (Forbidden) | ✅ New (Required) | Usage |
|-------------------|-------------------|--------|
| `#1a1b1e` | `bg-background-primary` | Main page background |
| `#25262b` | `bg-background-secondary` | Sidebar background |
| `#262626` | `bg-surface-secondary` | Card/modal backgrounds |
| `#2c2e33` | `bg-surface-tertiary` | Elevated surfaces |
| `#373A40` | `border-border-primary` | Main borders |
| `#C1C2C5` | `text-text-primary` | Primary text |
| `#909296` | `text-text-muted` | Muted/placeholder text |
| `#228be6` | `bg-brand-primary` | Primary buttons/actions |

## Quick Commands

```bash
# Check for hardcoded colors
npm run lint

# Auto-fix some issues
npm run lint:fix

# Check before commit
git diff --staged | grep -E "#[0-9A-Fa-f]{3,8}"
```

## IDE Tips

### VSCode/Cursor
- Install ESLint extension
- Use snippets: type `modal-themed` or `card-themed`
- Hover over hardcoded colors to see lint errors

### AI Assistants (Claude, Copilot)
- Always mention "use semantic colors from styling-architecture.md"
- Reference this guide in prompts
- Check generated code for hex colors

## Common Patterns

### Modal
```tsx
<Modal styles={{
  content: {
    backgroundColor: 'var(--color-bg-elevated)',
    color: 'var(--color-text-primary)',
  }
}}>
```

### Card
```tsx
<div className="bg-surface-secondary rounded-lg border border-border-primary p-4">
```

### Button (Mantine)
```tsx
<Button variant="filled" color="brand">
```

### Input (let theme handle it)
```tsx
<TextInput placeholder="Enter text" />
```

## Need Help?
1. Read `/docs/styling-architecture.md`
2. Check similar components in codebase
3. Use ESLint auto-fix: `npm run lint:fix`
4. Ask in team chat with link to this guide