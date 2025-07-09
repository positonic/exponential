# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

### Core Development
- `npm run dev` - Start development server with turbo
- `npm run build` - Build for production
- `npm run start` - Start production server
- `npm run preview` - Build and start production server

### Code Quality
- `npm run lint` - Run ESLint
- `npm run lint:fix` - Run ESLint with auto-fix
- `npm run typecheck` - Run TypeScript type checking
- `npm run check` - Run both linting and type checking
- `npm run format:write` - Format code with Prettier
- `npm run format:check` - Check code formatting

### Database Operations
- `npm run db:push` - Push database schema changes (development)
- `npm run db:generate` - Generate Prisma client and run migrations
- `npm run db:migrate` - Deploy database migrations (production)
- `npm run db:studio` - Open Prisma Studio for database management
- `bun prisma/seed.ts` - Seed database with initial data

### Testing
- Always run `npm run check` before committing to ensure code quality
- No specific test framework configured - check if tests exist before running

## Architecture Overview

This is a productivity management application built with the T3 Stack (Next.js 15, tRPC, Prisma, NextAuth.js) featuring:

### Tech Stack
- **Frontend**: Next.js 15 with App Router, React 18, Mantine v7 UI, Tailwind CSS
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

### Code Style (from .cursorrules)
- Use TypeScript for all code with strict type checking
- Prefer interfaces over types for object shapes
- Use descriptive variable names with auxiliary verbs (isLoading, hasError)
- Keep functions small and focused (single responsibility)
- Use Mantine v7 components with Tailwind CSS for styling
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
- Custom sign-in page at `/use-the-force`
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
- **UI Components**: Base Mantine components with custom styling

## Environment Setup

Required environment variables:
- `DATABASE_URL` - PostgreSQL connection string
- `AUTH_SECRET` - NextAuth.js secret
- `AUTH_DISCORD_ID` / `AUTH_DISCORD_SECRET` - Discord OAuth
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` - Google OAuth
- `NOTION_CLIENT_ID` / `NOTION_CLIENT_SECRET` - Notion integration
- `OPENAI_API_KEY` - AI features

## Key Integrations

### AI Features
- OpenAI GPT integration for intelligent assistance
- Langchain for AI workflow management
- Custom tools for domain-specific AI operations
- Semantic video search and content analysis

### External Services
- GitHub integration for issue management
- Video processing with transcription
- Browser extension authentication
- Mastra for additional AI tooling

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

Always ensure code follows the project's ESLint rules and TypeScript configuration. Run `npm run check` before committing changes to maintain code quality.