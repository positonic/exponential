# Infrastructure Map - Todo Application

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         CLIENT LAYER                             │
├─────────────────────────────────────────────────────────────────┤
│  Next.js 15 App Router                                          │
│  - React 18 + Server Components                                 │
│  - Mantine v7 UI Components                                     │
│  - Tailwind CSS                                                 │
│  - tRPC Client (Type-safe API calls)                           │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                      APPLICATION LAYER                           │
├─────────────────────────────────────────────────────────────────┤
│  Next.js API Routes + tRPC Server                              │
│  - Authentication: NextAuth.js v5                               │
│  - API Layer: tRPC Routers                                     │
│  - Business Logic: Service Layer                               │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                        DATA LAYER                                │
├─────────────────────────────────────────────────────────────────┤
│  PostgreSQL Database                                            │
│  - ORM: Prisma                                                  │
│  - 40+ tables (Users, Projects, Actions, etc.)                 │
│  - Complex relationships & indexes                              │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                    EXTERNAL SERVICES                             │
├─────────────────────────────────────────────────────────────────┤
│  Authentication:                                                 │
│  - Discord OAuth                                                │
│  - Google OAuth                                                 │
│  - Notion OAuth                                                 │
│                                                                  │
│  AI Services:                                                    │
│  - OpenAI API (GPT models)                                      │
│  - Mastra AI (Multi-agent system)                              │
│  - Simli API (Avatar generation)                               │
│                                                                  │
│  Other:                                                          │
│  - GitHub API (Issue management)                                │
│  - Vercel Blob Storage                                         │
└─────────────────────────────────────────────────────────────────┘
```

## Core Infrastructure Requirements

### 1. **Compute & Runtime**
- **Node.js 18+** runtime environment
- **Next.js 15** with App Router support
- Server-side rendering (SSR) and static generation (SSG)
- API routes for tRPC endpoints
- WebSocket support for real-time features

### 2. **Database**
- **PostgreSQL** (required)
  - 40+ tables with complex relationships
  - Full-text search capabilities
  - JSON field support
  - Proper indexing for performance
- **Prisma ORM** for database management
  - Migrations support
  - Connection pooling

### 3. **Storage**
- **Blob/Object Storage** for:
  - User uploads
  - Screenshots from transcription sessions
  - Video processing artifacts
- CDN for static assets

### 4. **Authentication & Security**
- **OAuth Providers**:
  - Discord (client ID + secret)
  - Google (client ID + secret)
  - Notion (client ID + secret + redirect URI)
- **JWT** token management
- Secure session handling

### 5. **External API Integrations**
- **OpenAI API** - AI chat, completions
- **Mastra AI** - Multi-agent system (can be self-hosted)
- **GitHub API** - Project management integration
- **Simli API** - Real-time avatar generation

### 6. **Environment Variables Required**
```
# Core
DATABASE_URL              # PostgreSQL connection
AUTH_SECRET              # NextAuth encryption

# OAuth
AUTH_DISCORD_ID
AUTH_DISCORD_SECRET
GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET
NOTION_CLIENT_ID
NOTION_CLIENT_SECRET
NOTION_REDIRECT_URI

# AI Services
OPENAI_API_KEY
MASTRA_API_URL
NEXT_PUBLIC_SIMLI_API_KEY

# Optional
GITHUB_TOKEN
NEXT_PUBLIC_THEME_DOMAIN
```

### 7. **Build & Deployment**
- **Build Process**:
  - TypeScript compilation
  - Next.js optimized production build
  - Prisma client generation
  - Environment validation
- **Pre-deployment**:
  - Linting (`npm run lint`)
  - Type checking (`npm run typecheck`)
  - Database migrations
- **Runtime Requirements**:
  - Node.js process management
  - Automatic restarts on failure
  - Health checks

### 8. **Scalability Considerations**
- Horizontal scaling for Next.js application
- Database connection pooling
- Redis/caching layer (optional but recommended)
- CDN for static assets
- Queue system for background jobs (video processing)

### 9. **Monitoring & Observability**
- Application performance monitoring
- Error tracking
- Database query performance
- API endpoint monitoring
- User analytics (Vercel Analytics included)

## Deployment Platforms Compatibility

### ✅ **Vercel** (Recommended)
- Native Next.js support
- Automatic deployments
- Edge functions
- Built-in analytics
- Environment variable management
- PostgreSQL database options

### ✅ **Railway**
- Full-stack platform
- PostgreSQL included
- Easy environment management
- Good for monolithic deployments

### ✅ **Render**
- Web services + PostgreSQL
- Automatic SSL
- Background workers support
- Good pricing model

### ✅ **AWS (Amplify/ECS/App Runner)**
- Amplify for Next.js hosting
- RDS for PostgreSQL
- S3 for blob storage
- More complex but highly scalable

### ✅ **Google Cloud Platform**
- Cloud Run for containerized apps
- Cloud SQL for PostgreSQL
- Cloud Storage for blobs
- Good autoscaling

### ✅ **Azure**
- App Service for Next.js
- Azure Database for PostgreSQL
- Blob Storage
- Enterprise-ready

### ⚠️ **Heroku**
- Possible but more expensive
- PostgreSQL add-on required
- Limited free tier

### ❌ **Static Hosts** (Netlify, GitHub Pages)
- Not suitable due to server-side requirements
- No database support
- No API route support