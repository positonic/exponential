# Force Flow

A personal productivity and project management system built with the T3 Stack.

## Features

- 🚀 Project Management
  - Create and track projects with status, priority, and progress
  - Set review dates and next action dates
  - Organize projects with custom priorities

- ⚡ Action Management
  - Create and track actions linked to projects
  - Flexible priority system (Quick, Scheduled, Priority levels 1-5, etc.)
  - Smart action organization and filtering
    
<img width="1709" alt="image" src="https://github.com/user-attachments/assets/bbc16660-53c9-4bf1-ac87-af756ad3ec8c" />

- 🤖 AI Assistant
  - Built-in chat interface for task management
  - Semantic video search capabilities
  - YouTube video processing and analysis
    
<img width="1713" alt="image" src="https://github.com/user-attachments/assets/5a7fd477-64f2-4e4a-9768-5bf237b3ce28" />

## Tech Stack

- **Framework**: [Next.js 15](https://nextjs.org/)
- **Authentication**: [NextAuth.js](https://next-auth.js.org/) with Discord provider
- **Database**: PostgreSQL with [Prisma](https://prisma.io)
- **API**: [tRPC](https://trpc.io) for end-to-end typesafe APIs
- **UI**: 
  - [Mantine](https://mantine.dev/) for components
  - [Tailwind CSS](https://tailwindcss.com) for styling
- **Deployment**: Ready for [Vercel](https://vercel.com)

## Getting Started

1. Clone the repository
2. Install dependencies:

```bash
npm install
```

3. Copy `.env.example` to `.env` and fill in the required environment variables:
```
DATABASE_URL=
AUTH_SECRET=
AUTH_DISCORD_ID=
AUTH_DISCORD_SECRET=
```

4. Initialize the database:
```bash
npm run db:push
```

5. Start the development server:
```bash
npm run dev
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `AUTH_SECRET` | NextAuth.js secret |
| `AUTH_DISCORD_ID` | Discord OAuth client ID |
| `AUTH_DISCORD_SECRET` | Discord OAuth client secret |

## Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run start` - Start production server
- `npm run db:push` - Push database schema changes
- `npm run db:studio` - Open Prisma Studio
- `npm run lint` - Run ESLint
- `npm run format:write` - Format code with Prettier

## Project Structure

```
src/
├── app/                 # Next.js app directory
│   ├── _components/    # Shared components
│   ├── actions/        # Actions page
│   ├── projects/       # Projects page
│   └── api/           # API routes
├── server/             # Server-side code
│   ├── api/           # tRPC routers
│   ├── auth/          # Authentication configuration
│   └── db.ts          # Database client
├── styles/            # Global styles
└── utils/             # Utility functions
```

## Contributing

1. Fork the repository
2. Create a new branch
3. Make your changes
4. Submit a pull request

## License

MIT License

## Acknowledgments

This project was bootstrapped with [create-t3-app](https://create.t3.gg/).
