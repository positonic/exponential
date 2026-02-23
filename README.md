# Exponential.im

An open-source productivity and project management platform built with the T3 Stack. Manage projects, track goals and outcomes, plan your day with AI, and collaborate across workspaces.

## Features

- **Project Management** - Create and track projects with status, priority, and progress across workspaces
- **Action Management** - Flexible task system with priorities, tags, and project linking
- **Goals & Outcomes** - Hierarchical goal-outcome-action alignment (daily/weekly/monthly/quarterly)
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
   | OAuth provider | At least one: Discord, Google, Microsoft, or Notion |

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

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start dev server (Turbopack) |
| `npm run build` | Production build |
| `npm run start` | Start production server |
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
│   │       ├── outcomes/       #   Outcome tracking
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
