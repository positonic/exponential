# Contributing to Exponential

Thank you for your interest in contributing to Exponential! This guide will help you get started.

## Table of Contents

- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [Code Style](#code-style)
- [Pull Request Process](#pull-request-process)
- [Claiming Bounties](#claiming-bounties)
- [Reporting Bugs](#reporting-bugs)

## Getting Started

### Prerequisites

- **Node.js** >= 20
- **npm** >= 10
- **PostgreSQL** (local or remote)
- **Git**

### Development Setup

1. **Fork and clone the repository**

   ```bash
   git clone https://github.com/<your-username>/exponential.git
   cd exponential
   ```

2. **Install dependencies**

   ```bash
   npm install
   ```

3. **Configure environment variables**

   ```bash
   cp .env.example .env.local
   ```

   Open `.env.local` and fill in the required values. At minimum you need:
   - `DATABASE_URL` - PostgreSQL connection string
   - `AUTH_SECRET` - generate with `npx auth secret`
   - At least one OAuth provider (Discord, Google, or Microsoft)

4. **Set up the database**

   ```bash
   npx prisma migrate dev
   ```

5. **Start the dev server**

   ```bash
   npm run dev
   ```

   The app will be running at [http://localhost:3000](http://localhost:3000).

## Code Style

### General Rules

- **TypeScript** for all code with strict type checking
- **Interfaces** over types for object shapes
- Descriptive variable names with auxiliary verbs (`isLoading`, `hasError`)
- Small, focused functions (single responsibility)
- Server Components preferred over Client Components

### Styling

We use [Mantine v7](https://mantine.dev/) with Tailwind CSS. **Hardcoded colors are forbidden** - the build will fail if you introduce any.

```tsx
// Use semantic Tailwind classes
<div className="bg-background-primary text-text-primary border-border-primary">

// Use CSS variables
<div style={{ backgroundColor: 'var(--background-primary)' }}>
```

Never use hex codes (`#1a1b1e`), RGB values, or Mantine inline color overrides.

### Linting & Type Checking

Run this before every commit:

```bash
npm run check
```

This runs ESLint and TypeScript type checking. Key enforced rules:

- Use `??` instead of `||` for nullish coalescing
- No `any` types
- All promises must be awaited or handled
- Use `import type {}` for type-only imports
- No unused variables or imports

Auto-fix what you can with:

```bash
npm run lint:fix
npm run format:write
```

### API Development

All APIs use [tRPC](https://trpc.io/) for end-to-end type safety. Business logic goes in the services layer (`src/server/services/`), not directly in routers.

## Pull Request Process

### Branch Strategy

We use a hybrid workflow with smart routing:

| Change Type | Base Branch | Deploy |
|---|---|---|
| UI, bug fixes, docs | `main` | Immediate |
| Database/schema changes | `develop` | Batched weekly |

### Creating a Feature Branch

```bash
# For changes WITHOUT database migrations
git checkout main
git pull origin main
git checkout -b feature/my-feature

# For changes WITH database migrations
git checkout develop
git pull origin develop
git checkout -b feature/my-feature-with-migrations
```

### Commit Messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add bounty claim button
fix: correct date picker reset on time selection
chore: update dependencies
docs: add API documentation
```

### Submitting Your PR

1. Ensure `npm run check` passes with no errors
2. Push your branch and open a PR against the appropriate base (`main` or `develop`)
3. Fill in the PR template with a summary, test plan, and any relevant screenshots
4. A reviewer will be assigned automatically
5. Address any feedback, then the PR will be merged

### Database Migrations

If your changes modify `prisma/schema.prisma`:

1. Create a migration: `npx prisma migrate dev --name descriptive_name`
2. Commit the generated migration files in `prisma/migrations/`
3. Target your PR at `develop` (not `main`)
4. Never use `npx prisma db push` - it bypasses migrations and can cause data loss

## Claiming Bounties

Some issues have bounties attached. To claim one:

1. Browse open bounties on the [project board](https://www.exponential.im)
2. Comment on the issue to claim it
3. Fork the repo and implement the solution
4. Submit a PR referencing the bounty issue
5. Once reviewed and merged, the bounty will be processed

### Bounty Guidelines

- One active bounty claim per contributor at a time
- If you can't complete a bounty within 7 days, let us know so others can pick it up
- Partial work is welcome - open a draft PR and explain what's left
- Bounty amount is paid after the PR is merged and verified

## Reporting Bugs

Open a [GitHub Issue](https://github.com/positonic/exponential/issues) with:

- A clear title describing the bug
- Steps to reproduce
- Expected vs actual behavior
- Browser/OS details if relevant
- Screenshots or screen recordings when helpful

## License

By contributing to Exponential, you agree that your contributions are licensed under the [AGPL-3.0](LICENSE), the same license as the project. See [LICENSING.md](LICENSING.md) for a plain-language explanation.

## Questions?

- Open a [Discussion](https://github.com/positonic/exponential/discussions) for general questions
- Check existing issues before creating new ones

Thank you for contributing!
