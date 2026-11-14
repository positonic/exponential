# Exponential app image for a self-host install (your own Railway project or
# Docker host). exponential.im does not use it: Vercel builds from vercel.json.
#
#   docker build -t exponential-app .
#   docker run -p 3000:3000 --env-file .env exponential-app
#
# Configuration is runtime-only; see .env.selfhost.example and the README's
# "Self-hosting" section. The start command (npm run start:selfhost) checks the
# environment and pgvector, applies migrations, then serves on PORT (3000).

# Node 22: what exponential.im runs on Vercel, and the floor @mastra/core and
# @mastra/client-js declare (>=22.13). Node 20 is past end of life.

# --- deps: the full dependency tree, Prisma client generated ----------------
FROM node:22-bookworm AS deps
WORKDIR /app
# Electron and Husky are developer tooling: skip the Electron binary download
# and the git-hooks install, which have no use in an image.
ENV ELECTRON_SKIP_BINARY_DOWNLOAD=1 \
    HUSKY=0
COPY .npmrc package.json package-lock.json ./
COPY prisma ./prisma
# postinstall runs `prisma generate`.
RUN npm ci --no-audit --no-fund

# --- build: next build -------------------------------------------------------
FROM deps AS build
COPY . .
# SKIP_ENV_VALIDATION: the real environment arrives at runtime, where
# start:selfhost validates it. NEXT_PUBLIC_APP_URL is deliberately never set:
# Next inlines NEXT_PUBLIC_* at build time, and the app resolves its public URL
# at runtime from NEXTAUTH_URL instead.
ENV SKIP_ENV_VALIDATION=1 \
    NEXT_TELEMETRY_DISABLED=1
# No LLM key at build time: no module builds an LLM client at module scope
# (guarded by noModuleScopeLlmClients.test.ts), and AI keys are optional at
# runtime too. .next/cache is build-only.
# Memory: this step needs a builder with at least 10 GB. Measured in a
# container: working set peaks near 9.2 GB; OOM-killed under an 8 GB limit.
RUN npm run build \
 && rm -rf .next/cache

# --- runtime -----------------------------------------------------------------
FROM node:22-bookworm AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000
# The whole node_modules, devDependencies included: start:selfhost runs under
# tsx and applies migrations with the prisma CLI.
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json /app/next.config.js /app/vercel.json /app/tsconfig.json ./
# next start writes its cache under .next, so the runtime user owns it.
COPY --from=build --chown=node:node /app/.next ./.next
COPY --from=build /app/public ./public
COPY --from=build /app/prisma ./prisma
# Read at runtime through process.cwd(): docs, learn and blog pages.
COPY --from=build /app/content ./content
# next.config.js and start:selfhost import src/env.js, the preflight imports
# src/server/auth/signInMethods.ts, and the CRM agreement templates are read
# from the source tree at runtime, so the source tree ships with the build.
COPY --from=build /app/src ./src
COPY --from=build /app/scripts/selfhost ./scripts/selfhost
USER node
EXPOSE 3000
CMD ["npm", "run", "start:selfhost"]
