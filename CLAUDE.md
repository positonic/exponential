# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 🚨🚨🚨 CRITICAL: ABSOLUTELY NO HARDCODED COLORS 🚨🚨🚨

**BEFORE WRITING ANY CODE, YOU MUST UNDERSTAND THIS:**

1. **NEVER USE HARDCODED HEX COLORS** like `#262626`, `#C1C2C5`, `#373A40`, `#1a1b1e`, etc.
2. **NEVER USE RGB/RGBA COLORS** like `rgb(26, 27, 30)` or `rgba(0, 0, 0, 0.5)`
3. **THE BUILD WILL FAIL** if you introduce ANY hardcoded color
4. **ALWAYS READ** `/docs/styling-architecture.md` before ANY styling work

### ✅ CORRECT Color Usage:
```tsx
// Use Tailwind classes
<div className="bg-background-primary text-text-primary border-border-primary">

// Use CSS variables
<div style={{ backgroundColor: 'var(--background-primary)' }}>
```

### ❌ FORBIDDEN Color Usage:
```tsx
// NEVER do this
<div className="bg-[#1a1b1e]" style={{ color: '#C1C2C5' }}>
<div style={{ backgroundColor: '#262626' }}>
```

**Git pre-commit hooks will REJECT your commit if you use hardcoded colors!**

## Development Commands

### Core Development
- `npm run dev` - Start development server with turbo
- `npm run dev:log` - Start development server with logging to todo.log file
- `npm run build` - Build for production
- `npm run start` - Start production server
- `npm run preview` - Build and start production server
- Always use bun to install packages

### Code Quality
- `npm run lint` - Run ESLint
- `npm run lint:fix` - Run ESLint with auto-fix
- `npm run typecheck` - Run TypeScript type checking
- `npm run check` - Run both linting and type checking
- `npm run format:write` - Format code with Prettier
- `npm run format:check` - Check code formatting

### Database Operations
- `npx prisma migrate dev --name <migration_name>` - Create and apply a new migration (ALWAYS use this for schema changes!)
- `npm run db:generate` - Generate Prisma client after migrations
- `npm run db:migrate` - Deploy database migrations (production)
- `npm run db:studio` - Open Prisma Studio for database management
- `bun prisma/seed.ts` - Seed database with initial data

**IMPORTANT**: Always create proper migration files when changing the schema:
1. First, modify the schema.prisma file
2. **ALWAYS ASK THE USER TO RUN MIGRATIONS MANUALLY** - Never attempt to run migrations yourself
3. Ask the user to run: `npx prisma migrate dev --name descriptive_migration_name`
4. This will automatically apply the migration and regenerate the Prisma client

**🚨 CRITICAL DATABASE SAFETY RULES 🚨**

**NEVER RUN MIGRATIONS AUTOMATICALLY** - Always ask the user to run them manually.

**ABSOLUTELY NEVER USE `db:push`** - This command bypasses migrations and CAN CAUSE DATA LOSS. It has already caused database issues in this project before. 

**FORBIDDEN COMMANDS:**
- `npx prisma db push` ❌ 
- `npm run db:push` ❌
- Any variation of database push commands ❌

**ONLY ALLOWED DATABASE COMMANDS:**
- `npx prisma migrate dev --name <descriptive_name>` ✅ (user runs manually)
- `npx prisma generate` ✅ (to regenerate client after migrations)

Migrations are essential for:
- Version control of database changes
- Team collaboration
- Production deployments
- Rollback capabilities

### Testing
- Always run `npm run check` before committing to ensure code quality
- No specific test framework configured - check if tests exist before running

### Deployment
- **Automated Build Checks**: Pre-push git hook automatically runs `Vercel build` before pushing
- **Main Branch Protection**: Additional type checking (`npm run typecheck`) runs when pushing to main
- **Vercel Ready**: Application configured for automatic Vercel deployment

## Architecture Overview

This is a productivity management application built with the T3 Stack (Next.js 15, tRPC, Prisma, NextAuth.js) featuring:

### Tech Stack
- **Frontend**: Next.js 15 with App Router, React 18, [Mantine v7 UI](https://mantine.dev/getting-started/), Tailwind CSS
- **Backend**: tRPC for type-safe APIs, Prisma ORM with PostgreSQL
- **Authentication**: NextAuth.js v5 (Discord, Google, Notion providers)
- **AI Integration**: OpenAI, Langchain, Mastra for intelligent features
- **Deployment**: Vercel-ready configuration

### Key Features
- **Project Management**: Create/track projects with status, priority, progress
- **Action Management**: Task management with flexible priority system
- **Goal & Outcome Tracking**: Hierarchical goal-outcome-action alignment
- **Daily Planning**: Journal system with reflection and planning tools
- **AI Assistant**: Chat interface with semantic video search
- **Video Processing**: YouTube analysis and transcription support

## Directory Structure

```
src/
├── app/                     # Next.js app router
│   ├── (home)/             # Landing page and authentication
│   ├── (sidemenu)/         # Main authenticated application
│   ├── (web3)/             # Web3 integration (Silk wallet integration)
│   ├── _components/        # Shared components
│   │   ├── layout/         # Navigation and shell components
│   │   └── sections/       # Content sections (journal, outcomes, etc.)
│   └── api/                # API routes and tRPC handlers
├── server/                 # Server-side code
│   ├── api/                # tRPC routers and procedures
│   ├── auth/               # Authentication configuration
│   ├── services/           # Business logic layer
│   └── tools/              # AI tools and utilities
├── lib/                    # Shared utilities
└── types/                  # TypeScript type definitions
```

## Development Patterns

### Pull Request Validation
- **ALWAYS use the build-tester agent** when checking if a PR is ready to merge
- The build-tester agent will automatically run all necessary checks (build, typecheck, lint, tests)
- DO NOT manually run `npm run typecheck`, `npm run lint`, etc. for PR validation
- When asked about PR readiness, immediately use: `Task subagent_type="build-tester"` with the PR details

### Code Style (from .cursorrules)
- Use TypeScript for all code with strict type checking
- Prefer interfaces over types for object shapes
- Use descriptive variable names with auxiliary verbs (isLoading, hasError)
- Keep functions small and focused (single responsibility)
- Use [Mantine v7 components](https://mantine.dev/getting-started/) with Tailwind CSS for styling
- Follow Next.js App Router patterns with Server Components preferred
- Always use the latest Next.js best practices and conventions
- Prefer Next.js Link over useRouter.push() for navigation
- Use component={Link} with Mantine components for navigation

### API Development
- All API logic uses tRPC for end-to-end type safety
- Services layer abstracts business logic from routers
- Authentication middleware protects authenticated endpoints
- Database operations use Prisma with proper error handling

### Authentication
- NextAuth.js v5 with JWT strategy
- Multiple OAuth providers (Discord, Google, Notion)
- Custom sign-in page at `/signin`
- Session management with database adapter

### Database Schema
Key entities include:
- `User` - Authentication and user data
- `Project` - Main project container with status/priority
- `Action` - Tasks linked to projects with flexible priority
- `Goal` - Strategic goals linked to life domains
- `Outcome` - Measurable results (daily/weekly/monthly/quarterly)
- `Video` - Media content with transcription and AI analysis

### Component Organization
- **Layout Components**: Navigation, sidebar, header
- **Feature Components**: Actions, Projects, Goals, Outcomes
- **Section Components**: Reusable content sections for different views
- **UI Components**: Base [Mantine components](https://mantine.dev/getting-started/) with custom styling

## Environment Setup

Required environment variables:
- `DATABASE_URL` - PostgreSQL connection string
- `AUTH_SECRET` - NextAuth.js secret
- `AUTH_DISCORD_ID` / `AUTH_DISCORD_SECRET` - Discord OAuth
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` - Google OAuth
- `NOTION_CLIENT_ID` / `NOTION_CLIENT_SECRET` - Notion integration
- `OPENAI_API_KEY` - AI features
- `MASTRA_API_URL` - Mastra AI agent system URL (defaults to http://localhost:4111)

## Key Integrations

### AI Features
- **Mastra AI**: Multi-agent system with semantic agent selection and conversation management
- OpenAI GPT integration for intelligent assistance
- Langchain for AI workflow management
- Custom tools for domain-specific AI operations
- Semantic video search and content analysis

### External Services
- GitHub integration for issue management
- Video processing with transcription
- Browser extension authentication
- [Mastra AI](https://mastra.ai/en/docs) for multi-agent system infrastructure

## Development Notes

### Keyboard Shortcuts
- `Cmd+Enter` in outcome input fields adds new outcomes
- Various modal shortcuts throughout the application

### Data Flow
- React Query for API state management and caching
- Optimistic updates for immediate UI feedback
- Real-time capabilities for collaboration features

### Performance Considerations
- Server Components preferred over Client Components
- Dynamic imports for non-critical components
- Efficient database queries with proper indexing
- Image optimization with Next.js Image component

## Git Workflow & Deployment

We use a hybrid git flow optimized for a small team (2 developers) that balances safety for database migrations with speed for other changes:

- **`main` branch**: Production (auto-deploys via Vercel)
- **`develop` branch**: Integration testing for database migrations (auto-deploys to staging)
- **Smart routing**: PRs without migrations can go directly to main via fast-track

### Quick Workflow Commands
- `/smart-merge` - Intelligently route your PR based on content
- `/fast-track` - Skip develop for safe changes (UI, docs, non-DB fixes)
- `/check-deploy-safety` - Analyze changes and recommend merge strategy
- `/sync-branches` - Keep develop updated with main after fast-track merges

### Database Migration Safety
- All schema changes MUST go through develop branch first
- Test database (Railway) shared by develop and all PR previews
- Weekly batch merge from develop to main for migrations
- See `/docs/DEVELOPMENT_WORKFLOW.md` for complete details

## Styling Architecture Details

**REMINDER: Read `/docs/styling-architecture.md` for complete styling guidelines.**

The application uses a comprehensive styling system with light/dark mode support:

### Color System Implementation
- All colors defined in `/src/styles/colors.ts` as design tokens
- CSS variables in `/src/styles/globals.css` for theme switching
- Tailwind configured to use CSS variables for consistency
- Semantic color names for different UI elements

### Pre-commit Validation
- Git hooks check EVERY commit for hardcoded colors
- ESLint rules enforce color usage patterns
- Build process will FAIL if hardcoded colors are detected

### Component Styling
- Mantine components use theme configuration from `/src/styles/mantineTheme.ts`
- Tailwind for layout and utilities with semantic class names
- No inline styles with hardcoded colors

### Common Patterns
```tsx
// ✅ Correct
<div className="bg-background-primary text-text-primary border-border-primary">
<Button variant="filled" color="brand">

// ❌ Wrong
<div className="bg-[#1a1b1e] text-[#C1C2C5] border-[#373A40]">
<Button styles={{ root: { backgroundColor: '#339af0' } }}>
```

### Quick Reference
- Backgrounds: `bg-background-primary`, `bg-surface-secondary`
- Text: `text-text-primary`, `text-text-secondary`, `text-text-muted`
- Borders: `border-border-primary`, `border-border-focus`
- Interactive: `bg-brand-primary`, `hover:bg-surface-hover`

**See `/docs/styling-architecture.md` for complete styling guidelines.**

Always ensure code follows the project's ESLint rules and TypeScript configuration. Run `npm run check` before committing changes to maintain code quality.

## Debugging & Logs

### Application Logs
- **Log File**: `todo.log` in project root - contains all application logs
- **Dev Logging**: `npm run dev:log` - starts dev server with logging to todo.log
- **JWT Debugging**: Use `mastra.debugToken` endpoint to inspect JWT tokens
- **Agent Logs**: Look for `[mastraRouter]` prefixed logs for agent communication

### Common Log Patterns
- `🔍 [AUTH DEBUG]` - Authentication and JWT verification logs
- `[mastraRouter]` - Agent communication and JWT generation logs  
- `[TRPC]` - API call performance and execution logs
- `❌ tRPC failed` - API errors and failures

## Git Worktree Workflow
For parallel feature development using git worktrees, see the comprehensive guide at `/docs/git-worktree-workflow.md`. This includes:
- Claude Code custom commands for worktree management
- Step-by-step instructions for feature development
- Best practices and common gotchas
- Example implementation (outcomes delete feature)

## IDE Enhancement with Serena MCP

The project uses Serena MCP server for enhanced code intelligence. See `/docs/SERENA_MCP_GUIDE.md` for details.

### Automatic Serena Management

**IMPORTANT**: Claude should proactively manage Serena indexing:

1. **Auto-index on session start**: When starting a new Claude session, check if index is older than 7 days
2. **Post-merge indexing**: After running `git pull` or merging branches, suggest re-indexing
3. **Major change detection**: After creating/moving/deleting multiple files, run `/serena-index`
4. **Performance issues**: If symbol search seems slow or inaccurate, re-index automatically

### Quick Commands
- **Re-index**: `/serena-index` - Updates the symbol cache
- **Check age**: Look for `.serena/cache/typescript/document_symbols_cache_*.pkl` modification time
- **Features**: Enhanced code navigation, symbol search, and contextual awareness

### Serena Workflow Rules
- If `.serena/cache/` doesn't exist → Run indexing immediately
- If cache is older than 7 days → Suggest re-indexing
- After `git pull` with 10+ file changes → Auto re-index
- When user reports "can't find symbol" → Re-index and retry

## Task Master AI Instructions
**Import Task Master's development workflow commands and guidelines, treat as if import is in the main CLAUDE.md file.**
@./.taskmaster/CLAUDE.md

## Rule Improvement Triggers

- New code patterns not covered by existing rules
- Repeated similar implementations across files
- Common error patterns that could be prevented
- New libraries or tools being used consistently
- Emerging best practices in the codebase

# Analysis Process:
- Compare new code with existing rules
- Identify patterns that should be standardized
- Look for references to external documentation
- Check for consistent error handling patterns
- Monitor test patterns and coverage

# Rule Updates:

- **Add New Rules When:**
  - A new technology/pattern is used in 3+ files
  - Common bugs could be prevented by a rule
  - Code reviews repeatedly mention the same feedback
  - New security or performance patterns emerge

- **Modify Existing Rules When:**
  - Better examples exist in the codebase
  - Additional edge cases are discovered
  - Related rules have been updated
  - Implementation details have changed

- **Example Pattern Recognition:**

  ```typescript
  // If you see repeated patterns like:
  const data = await prisma.user.findMany({
    select: { id: true, email: true },
    where: { status: 'ACTIVE' }
  });

  // Consider adding to prisma rules:
  // - Standard select fields
  // - Common where conditions
  // - Performance optimization patterns
  ```

- **Rule Quality Checks:**
- Rules should be actionable and specific
- Examples should come from actual code
- References should be up to date
- Patterns should be consistently enforced

## Continuous Improvement:

- Monitor code review comments
- Track common development questions
- Update rules after major refactors
- Add links to relevant documentation
- Cross-reference related rules

## Rule Deprecation

- Mark outdated patterns as deprecated
- Remove rules that no longer apply
- Update references to deprecated rules
- Document migration paths for old patterns

## Documentation Updates:

- Keep examples synchronized with code
- Update references to external docs
- Maintain links between related rules
- Document breaking changes
