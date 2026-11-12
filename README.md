# Exponential.im

[![License: AGPL-3.0](https://img.shields.io/badge/License-AGPL--3.0-blue.svg)](https://github.com/positonic/exponential/blob/main/LICENSE)
[![GitHub stars](https://img.shields.io/github/stars/positonic/exponential)](https://github.com/positonic/exponential)
[![Open Source](https://img.shields.io/badge/Open%20Source-%E2%9D%A4-green)](https://github.com/positonic/exponential)

An open-source productivity and project management platform built with the T3 Stack. Manage projects, track goals and key results, plan your day with AI, and collaborate across workspaces.

## Features

- **Project Management** - Create and track projects with status, priority, and progress across workspaces
- **Action Management** - Flexible task system with priorities, tags, and project linking
- **Goals & OKRs** - Hierarchical goal-key-result-action alignment
- **Daily Planning** - Journal system with reflection, planning tools, and daily scoring
- **AI Assistant** - Chat interface powered by Mastra agents with semantic video search
- **Meetings** - Calendar integration with transcription and auto-generated action items
- **CRM** - Contact/organization management, deal pipeline (Kanban), Gmail/Calendar import
- **Workspaces** - Organize everything by team or client (personal, team, organization)
- **Bounty System** - Attach bounties to actions for open-source contributors *(coming soon)*

<img width="1709" alt="image" src="https://github.com/user-attachments/assets/bbc16660-53c9-4bf1-ac87-af756ad3ec8c" />

<img width="1713" alt="image" src="https://github.com/user-attachments/assets/5a7fd477-64f2-4e4a-9768-5bf237b3ce28" />

## Tech Stack

- **Framework**: [Next.js 15](https://nextjs.org/) with App Router
- **Language**: TypeScript (strict mode)
- **Authentication**: [NextAuth.js v5](https://authjs.dev/) (Discord, Google, Microsoft, Notion, Email)
- **Database**: PostgreSQL with [Prisma ORM](https://prisma.io)
- **API**: [tRPC](https://trpc.io) for end-to-end type-safe APIs
- **UI**: [Mantine v7](https://mantine.dev/) + [Tailwind CSS](https://tailwindcss.com)
- **AI**: OpenAI, Langchain, [Mastra](https://mastra.ai/) multi-agent system
- **Testing**: Vitest with Testcontainers for integration tests
- **Deployment**: [Vercel](https://vercel.com)

## Getting Started

### Prerequisites

- **Node.js** >= 20
- **npm** >= 10
- **PostgreSQL** (local or remote)

### Setup

1. **Clone the repository**

   ```bash
   git clone https://github.com/positonic/exponential.git
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

   Edit `.env.local` and fill in the required values. At minimum:

   | Variable | Description |
   |----------|-------------|
   | `DATABASE_URL` | PostgreSQL connection string |
   | `AUTH_SECRET` | Generate with `npx auth secret` |
   | `DATABASE_ENCRYPTION_KEY` | Generate with `openssl rand -base64 32` (required in production) |
   | A way to sign in | An OAuth pair (Google or Discord), SMTP or Postmark for emailed sign-in codes, or `AUTH_LOG_SIGN_IN_CODES=true` to print codes to the server log |

   See [.env.example](.env.example) for all available configuration options.

4. **Set up the database**

   ```bash
   npx prisma migrate dev
   ```

5. **Start the development server**

   ```bash
   npm run dev
   ```

   Open [http://localhost:3000](http://localhost:3000).

### Self-hosting

A production install needs three variables (`DATABASE_URL` for a Postgres with
pgvector, `AUTH_SECRET`, `DATABASE_ENCRYPTION_KEY`) and one way to sign in. No
OAuth app, Postmark account or LLM key is required: AI is optional, and
`OPENAI_API_KEY`, `ANTHROPIC_API_KEY` or `MASTRA_API_URL` (the Assistant) each
turn on their features after a restart. Start from
[.env.selfhost.example](.env.selfhost.example), which lists only what an
install needs, then:

```bash
SKIP_ENV_VALIDATION=1 npm run build
npm run start:selfhost      # checks env and pgvector, applies migrations, serves
npm run scheduler:selfhost  # in a second process: runs the scheduled jobs (reads the same .env)
```

#### Docker Compose

The whole stack on any Docker host (a VPS or a laptop), from a checkout of
this repo. Nothing needs setting first:

```bash
docker compose up -d --build                      # Postgres, the app and the scheduler
docker compose logs app | grep "Sign-in code"     # your sign-in code, after you ask for one
```

Open <http://localhost:3000>, enter your email, and read the sign-in code from
the app's log. What starts:

- **`postgres`**: `pgvector/pgvector:pg16` with its data in the `postgres`
  volume. Not published on the host.
- **`secrets-init`**: a one-shot job that generates `AUTH_SECRET`,
  `DATABASE_ENCRYPTION_KEY` and `CRON_SECRET` into the `secrets` volume on the
  first start and never overwrites them, so `docker compose down` / `up` keeps
  everyone signed in. **Back up both volumes**: losing `secrets` signs everyone
  out and makes stored integration credentials unreadable. `docker compose
  down -v` deletes them.
- **`app`**: built from `Dockerfile`; applies migrations, then serves on
  `APP_PORT` (default 3000).
- **`scheduler`**: built from `docker/scheduler.Dockerfile`; runs the
  scheduled jobs against the app.

Settings go in a `.env` file next to `docker-compose.yml` (Compose reads it)
or in your shell. None is required:

| Variable | Default | What it does |
|---|---|---|
| `APP_PORT` | `3000` | The host port the app is published on. |
| `NEXTAUTH_URL` | `http://localhost:$APP_PORT` | The URL people use. Set it when the install is reached by another name. |
| `OPENAI_API_KEY`, `ANTHROPIC_API_KEY` | unset | Turn on the AI features (see the table below). |
| `AUTH_LOG_SIGN_IN_CODES` | `true` | Sign-in codes go to the app's log. Ignored once SMTP or Postmark is set; anyone who can read the log can sign in. |
| `SMTP_*`, `EMAIL_FROM`, `AUTH_POSTMARK_KEY`, `GOOGLE_CLIENT_*`, `AUTH_DISCORD_*` | unset | Other ways in, as in the table below. |
| `POSTGRES_PASSWORD` | `exponential` | Letters and digits only. Set it before the first start: the database keeps the password it was created with. |
| `MASTRA_BUILD_CONTEXT` | positonic/mastra `main` | Where the Assistant builds from. |

**The Assistant is opt-in.** Mastra (chat, Assign to Assistant) needs an
Anthropic key, so it sits behind the `assistant` profile:

```bash
ANTHROPIC_API_KEY=… OPENAI_API_KEY=… docker compose --profile assistant up -d --build
```

With the profile on, the app finds the `mastra` service and points
`MASTRA_API_URL` at it; without it, the Assistant stays off. Mastra builds
from [positonic/mastra](https://github.com/positonic/mastra)'s
`docker/Dockerfile` and shares the database (schema `mastra`).

**Memory.** Building the app image needs a Docker host with at least 10 GB of
memory (see below). On a smaller server, build elsewhere and run the images.

**Prebuilt images.** Compose builds every image from source. If you have
images in a registry, point Compose at them with a
`docker-compose.override.yml` next to `docker-compose.yml`, which Compose
merges in automatically:

```yaml
services:
  app:
    image: registry.example.com/exponential-app:latest
    build: !reset null
  scheduler:
    image: registry.example.com/exponential-scheduler:latest
    build: !reset null
```

TLS, a reverse proxy, backups and upgrades are up to you. To update, pull the
repo and run `docker compose up -d --build`: the app applies new migrations
when it starts.

`.github/workflows/selfhost-smoke.yml` boots this stack nightly with no
settings at all, signs in and checks the scheduler, and opens an issue when it
fails.

#### Container images

Two images, both built from the repo root. Neither bakes in any
configuration: every variable is read when the container starts.

```bash
docker build -t exponential-app .                                          # the app
docker build -f docker/scheduler.Dockerfile -t exponential-scheduler .      # the scheduler
```

- **App** (`Dockerfile`): starts with `npm run start:selfhost`, so the
  container checks its environment and pgvector, applies pending migrations,
  then serves on port 3000. Health check: `GET /api/health`. The build needs
  a builder with **at least 10 GB of memory**: measured in a container, its
  working set peaks at about 9.2 GB, it completes under a 10 GB limit, and it
  is killed for running out of memory under 8 GB (with 4 CPUs or 14).
- **Scheduler** (`docker/scheduler.Dockerfile`): a small Node image with no
  Next build. It calls the app's cron routes on `vercel.json`'s schedule, so
  point `SCHEDULER_TARGET_URL` at the app's address on the network they share.

A full install is four services: Postgres with pgvector, the app, the
scheduler, and the [Mastra agent service](https://github.com/positonic/mastra)
(agent runs and chat; optional, like every AI key). The scheduler and Mastra reach the app over the
private network; only the app needs a public address.

| Variable | Service | Needed | Value |
|---|---|---|---|
| `DATABASE_URL` | app, mastra | required | Postgres 16 with pgvector 0.5.0+, e.g. the `pgvector/pgvector:pg16` image. Mastra shares the database (it keeps its tables in schema `mastra`). |
| `AUTH_SECRET` | app, mastra | required | `openssl rand -base64 32`. The same value on both: Mastra verifies the app's tokens with it. |
| `DATABASE_ENCRYPTION_KEY` | app | required | 32 bytes, raw or base64: `openssl rand -base64 32`. |
| `OPENAI_API_KEY` | app, mastra | optional (AI) | Turns on meeting summaries, extraction, semantic search and indexing, digests, AI workflow steps and size suggestions. Without it those features are off and say how to turn them on. |
| `ANTHROPIC_API_KEY` | app, mastra | optional (AI) | On the app: Claude-written summaries and workspace updates, YouTube articles. Mastra needs it for agent runs and chat. |
| `NEXTAUTH_URL` | app | recommended | The public URL, no trailing slash, e.g. `https://exponential.example.com`. Links in email and callbacks are built from it. Default: `http://localhost:${PORT}`. |
| `CRON_SECRET` | app, scheduler | required for scheduled jobs | `openssl rand -base64 32`. The same value on both: the cron routes reject calls without it. |
| `SCHEDULER_TARGET_URL` | scheduler | required in a container | The app's private address, e.g. `http://app:3000`. Default: `http://localhost:3000`. |
| `MASTRA_API_URL` | app | optional (Assistant) | The Mastra service's private address, e.g. `http://mastra:4111`. Unset means no Assistant: chat, Assign to Assistant and voice are hidden. |
| `TODO_APP_BASE_URL` | mastra | required for agents | The app's private address, e.g. `http://app:3000`. Mastra's tools call back into the app here. |
| `PORT` | app, mastra | optional | The port to listen on. Default: 3000 for the app; Mastra uses 4111. |
| `AUTH_LOG_SIGN_IN_CODES` | app | one way in | `true` writes each sign-in code to the app's log instead of emailing it. Single-user installs only: anyone who can read the log can sign in. |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_SECURE`, `EMAIL_FROM` | app | one way in | Email sign-in codes over any SMTP server. `SMTP_HOST` counts only together with a sender (`EMAIL_FROM`). |
| `AUTH_POSTMARK_KEY` | app | one way in | Email sign-in codes over Postmark (wins over SMTP). |
| `SCHEDULER_TIMEOUT_MS` | scheduler | optional | How long one cron call may run. Default 300000 (5 minutes), minimum 270000. |

A way in means at least one of: log delivery, SMTP, Postmark, or an OAuth
provider (Google, Discord, Notion). With none, `/signin` shows a setup error
naming these variables. Every other optional variable, and the feature each
one turns on, is in [.env.selfhost.example](.env.selfhost.example). Variables
starting `NEXT_PUBLIC_` (Sentry, web push, the support address) are fixed when
the image is built, so a prebuilt image goes without them.

Sign-up is open: anyone who can reach the install and complete a sign-in gets
an account, as on exponential.im. There is no allowlist yet, so keep a private
install off the public internet or choose a way in that strangers can't use.

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start dev server (Turbopack) |
| `npm run build` | Production build |
| `npm run start` | Start production server |
| `npm run start:selfhost` | Self-host start: preflight, apply migrations, serve |
| `npm run scheduler:selfhost` | Self-host scheduler: calls the `vercel.json` crons |
| `npm run check` | Lint + type check (run before committing) |
| `npm run lint:fix` | Auto-fix ESLint issues |
| `npm run format:write` | Format with Prettier |
| `npm run test` | Run unit tests |
| `npm run test:integration` | Run integration tests (requires Docker) |
| `npm run test:all` | Run all tests |
| `npx prisma migrate dev` | Create/apply database migrations |
| `npx prisma studio` | Open Prisma Studio GUI |

## Project Structure

```
src/
├── app/                        # Next.js App Router
│   ├── (home)/                 # Landing page & auth
│   ├── (sidemenu)/             # Main authenticated app
│   │   └── w/[workspaceSlug]/  # Workspace-scoped routes
│   │       ├── projects/       #   Project management
│   │       ├── actions/        #   Action/task tracking
│   │       ├── goals/          #   Goal setting
│   │       ├── crm/            #   CRM pipeline
│   │       ├── meetings/       #   Meeting notes
│   │       └── settings/       #   Workspace settings
│   ├── _components/            # Shared components
│   └── api/                    # API routes & tRPC
├── providers/                  # React context providers
├── server/                     # Server-side code
│   ├── api/                    # tRPC routers
│   ├── auth/                   # Authentication config
│   ├── services/               # Business logic layer
│   └── tools/                  # AI tools
├── lib/                        # Shared utilities
├── styles/                     # Global styles & theme
└── types/                      # TypeScript definitions
```

## CLI & Integrations

### Exponential CLI

Manage actions, projects, and workspaces from the command line:

```bash
npm install -g exponential-cli
exponential auth login --token <your-jwt> --api-url https://www.exponential.im
exponential actions list
exponential actions create -n "My task" -p <project-id>
```

See [exponential-cli](https://github.com/positonic/exponential-cli) for full docs.

### OpenClaw (AI Agent)

Give your AI agent access to Exponential via [OpenClaw](https://github.com/openclaw/openclaw):

```bash
npx clawhub install exponential
```

Your agent can then create tasks, manage kanban boards, and track projects through natural conversation.

### Bounty API

All bounties are machine-readable — no auth required to browse:

- **REST API:** [`GET /api/bounties`](https://www.exponential.im/api/bounties)
- **LLMs.txt:** [`/llms.txt`](https://www.exponential.im/llms.txt)
- **RSS Feed:** [`/api/bounties/feed.xml`](https://www.exponential.im/api/bounties/feed.xml)

## Contributing

We welcome contributions! Please read our [Contributing Guide](CONTRIBUTING.md) for details on:

- Development setup
- Code style and linting rules
- Pull request process
- Claiming bounties
- Database migration safety

Please also review our [Code of Conduct](CODE_OF_CONDUCT.md).

## License

[AGPL-3.0](LICENSE) — see [LICENSING.md](LICENSING.md) for a plain-language explanation of what this means for users, contributors, and integrations.

## Acknowledgments

Built with [create-t3-app](https://create.t3.gg/) and the T3 Stack ecosystem.
