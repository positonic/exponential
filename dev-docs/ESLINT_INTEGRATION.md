# ESLint Integration & Code Quality Enforcement

**CRITICAL: All generated code must pass these ESLint rules to deploy successfully.**

This document outlines our comprehensive approach to preventing non-compliant code generation through enhanced documentation, automated validation hooks, and build-time enforcement.

## 🚨 Mandatory Code Standards

The following ESLint rules are enforced at build time and will prevent deployment if violated:

### 1. Nullish Coalescing (`@typescript-eslint/prefer-nullish-coalescing`)

Use `??` operator for nullish values instead of `||` for better type safety.

```typescript
// ❌ WRONG - fails build
const value = input || 'default';
const name = user.name || 'Anonymous';
const count = data.count || 0; // Issues if count is 0

// ✅ CORRECT - passes build
const value = input ?? 'default';
const name = user.name ?? 'Anonymous';
const count = data.count ?? 0; // Only null/undefined trigger default
```

**Why**: The `||` operator treats falsy values (0, '', false) as needing defaults, while `??` only handles null/undefined.

### 2. No Explicit Any (`@typescript-eslint/no-explicit-any`)

Avoid `any` types that bypass TypeScript's type checking.

```typescript
// ❌ WRONG - fails build
const data: any = response;
function process(input: any): any { }
const items: any[] = [];

// ✅ CORRECT - passes build
const data: unknown = response;
function process(input: unknown): string { }
interface ResponseData { id: string; name: string; }
const data: ResponseData = response;
const items: string[] = [];
```

**Why**: TypeScript's value comes from type safety. Using `any` defeats this purpose and can hide runtime errors.

### 3. Promise Handling (`@typescript-eslint/no-floating-promises`)

All promises must be properly awaited or handled.

```typescript
// ❌ WRONG - fails build
saveData(formData);
processUser();
fetch('/api/data');

// ✅ CORRECT - passes build
await saveData(formData);
void processUser(); // If fire-and-forget is intended
saveData(formData).catch(console.error);
const response = await fetch('/api/data');
```

**Why**: Unhandled promises can cause silent failures and memory leaks.

### 4. Proper Async/Await Usage (`@typescript-eslint/await-thenable`)

Only await actual promises.

```typescript
// ❌ WRONG - fails build
await someNonPromiseValue;
await 42;
await user.name;

// ✅ CORRECT - passes build
await somePromise;
await fetch('/api/data');
const value = someNonPromiseValue; // Don't await non-promises
```

**Why**: Awaiting non-promises is misleading and can indicate misunderstanding of async code.

### 5. Promise Misuse Prevention (`@typescript-eslint/no-misused-promises`)

Prevent promises in contexts that expect synchronous values.

```typescript
// ❌ WRONG - fails build
if (fetchData()) { } // Promise in boolean context
array.forEach(async item => await process(item)); // Async callback issues
button.onclick = async () => await save(); // Event handler issues

// ✅ CORRECT - passes build
if (await fetchData()) { }
await Promise.all(array.map(async item => await process(item)));
button.onclick = () => { void save(); }; // Or handle properly
```

**Why**: Promises in wrong contexts can cause race conditions and unexpected behavior.

### 6. TypeScript Comment Usage (`@typescript-eslint/ban-ts-comment`)

Avoid suppressing TypeScript errors without explanation.

```typescript
// ❌ WRONG - fails build
// @ts-ignore
const result = someApi();

// ✅ CORRECT - passes build
const result = someApi() as ExpectedType;
// @ts-expect-error: Legacy API compatibility - remove when updated
const result = legacyApi();
```

**Why**: Suppressing errors should be intentional and documented, not a quick fix.

### 7. Consistent Type Imports (`@typescript-eslint/consistent-type-imports`)

Separate type imports from value imports for better bundling.

```typescript
// ❌ WRONG - fails build
import { User, createUser } from './user';
import { ComponentProps } from 'react';

// ✅ CORRECT - passes build
import { type User, createUser } from './user';
import type { ComponentProps } from 'react';
import { createUser } from './user';
```

**Why**: Helps bundlers eliminate type-only imports and improves build performance.

### 8. Remove Unused Variables (`@typescript-eslint/no-unused-vars`)

Clean up unused imports and variables.

```typescript
// ❌ WRONG - fails build
import { Button, Card } from '@library'; // Card unused
function process(data, unusedParam) { return data; }

// ✅ CORRECT - passes build
import { Button } from '@library';
function process(data, _unusedParam) { return data; } // Prefix with _
```

**Why**: Reduces bundle size and improves code clarity.

## Triple Protection System

Our approach uses three layers of protection:

1. **Prevention (Documentation)**: This guide prevents violations before they occur
2. **Immediate Feedback (Hooks)**: Post-edit hooks catch violations instantly
3. **Comprehensive Validation (Agent)**: Build-tester agent ensures deployment readiness

## Pre-Deployment Validation Commands

**ALWAYS run these commands before considering any implementation complete:**

```bash
npm run check    # Fast validation: lint + typecheck (PRIMARY)
npm run build    # Full validation: complete production build (for major features)
npm run test     # Run test suite if available
```

### Command Priority

1. **Primary Validation**: `npm run check` for immediate feedback
2. **Full Validation**: `npm run build` for comprehensive features only
3. **Test Validation**: `npm run test` for behavioral correctness

If any linting errors appear, they MUST be fixed before deployment.

## Next.js Specific Rules

Since this project uses Next.js, also follow these patterns:

```typescript
// ✅ Prefer Server Components
export default async function Page() {
  const data = await fetchData();
  return <div>{data}</div>;
}

// ✅ Use 'use client' only when needed
'use client';
import { useState } from 'react';

// ✅ Proper Next.js imports
import Link from 'next/link';
import Image from 'next/image';
import { redirect } from 'next/navigation';
```

## Mantine Integration Rules

When using Mantine components:

```typescript
// ✅ Use proper Mantine + Next.js navigation
import { Button } from '@mantine/core';
import Link from 'next/link';

<Button component={Link} href="/path">Navigate</Button>

// ✅ Use CSS variables for colors (never hardcoded)
<Button styles={{ root: { backgroundColor: 'var(--brand-primary)' } }}>
```

## Emergency Fixes

If you encounter ESLint errors during development:

1. **Fix, don't disable**: Address the root cause rather than suppressing
2. **Use proper escape hatches**: If suppression is needed, document why
3. **Test thoroughly**: ESLint violations often indicate real bugs

```typescript
// If you MUST suppress (rare cases):
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Legacy API compatibility, will be fixed in ticket #123
const data: any = legacyApiCall();
```

## Integration with Development Workflow

This ESLint integration works seamlessly with:

- **Husky pre-commit hooks**: Prevent commits with violations
- **Vercel builds**: Automatic failure on ESLint errors
- **Claude Code hooks**: Immediate feedback on file edits
- **Build-tester agent**: Comprehensive validation before task completion

## Common Patterns

### API Route Handlers

```typescript
// ✅ Proper Next.js API pattern
export async function POST(request: Request) {
  try {
    const data = await request.json();
    // Process data
    return Response.json({ success: true });
  } catch (error) {
    console.error('API Error:', error);
    return Response.json({ error: 'Internal Error' }, { status: 500 });
  }
}
```

### React Components

```typescript
// ✅ Proper component pattern
interface Props {
  title: string;
  children?: React.ReactNode;
}

export function MyComponent({ title, children }: Props) {
  return (
    <div className="bg-background-primary">
      <h1 className="text-text-primary">{title}</h1>
      {children}
    </div>
  );
}
```

### Database Operations

```typescript
// ✅ Proper Prisma pattern
export async function getUser(id: string) {
  try {
    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        name: true,
      },
    });
    
    return user;
  } catch (error) {
    console.error('Database error:', error);
    throw new Error('Failed to fetch user');
  }
}
```

Remember: ESLint errors are not suggestions—they prevent deployment. Fix them immediately to maintain code quality and ensure successful builds.