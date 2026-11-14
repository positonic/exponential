# Self-host scheduler image: the HTTP clock that calls the app's cron routes on
# vercel.json's schedule (ADR-0077). No Next build and nothing from src/: just
# vercel.json, the two scheduler files, node-cron and tsx.
#
#   docker build -f docker/scheduler.Dockerfile -t exponential-scheduler .
#   docker run -e CRON_SECRET=… -e SCHEDULER_TARGET_URL=http://app:3000 exponential-scheduler
#
# Build from the repo root (the context needs vercel.json and package-lock.json).

FROM node:22-bookworm-slim
WORKDIR /app

# node-cron and tsx at exactly the versions the app's lockfile resolves, read
# from package-lock.json at build time so the two can never drift. "type":
# "module" because the scheduler is ESM (it uses import.meta.url), as the
# repo's own package.json declares.
COPY package-lock.json /tmp/package-lock.json
RUN node -e ' \
      const lock = require("/tmp/package-lock.json").packages; \
      const pin = (name) => { \
        const entry = lock["node_modules/" + name]; \
        if (!entry) throw new Error(name + " is not in package-lock.json"); \
        return entry.version; \
      }; \
      const pkg = { \
        name: "exponential-scheduler", private: true, type: "module", \
        dependencies: { "node-cron": pin("node-cron"), tsx: pin("tsx") }, \
      }; \
      require("fs").writeFileSync("package.json", JSON.stringify(pkg, null, 2)); \
    ' \
 && npm install --omit=dev --no-audit --no-fund \
 && rm -rf /tmp/package-lock.json /root/.npm

COPY vercel.json ./
COPY scripts/selfhost/scheduler.ts scripts/selfhost/cronPlan.ts ./scripts/selfhost/

ENV NODE_ENV=production
USER node
CMD ["node_modules/.bin/tsx", "scripts/selfhost/scheduler.ts"]
