# Sovereign deployment experience

## Recommendation

Make self-hosting a product surface, not a README path. Exponential should ship
one portable, versioned deployment artifact and present a deployment ladder:

1. **Use Exponential Cloud** — the zero-operations route.
2. **Deploy to your cloud** — Railway first, for the fastest BYOC proof.
3. **Install on your server** — Docker Compose and Coolify, the strongest
   expression of the sovereignty promise.
4. **Run a production cluster** — Helm plus OpenTofu for regulated and larger
   installations, after the simpler paths are mature.

The homepage should make the first three routes visible in the hero. The core
message is not merely “open source”; it is **your infrastructure, your database,
your keys, and a supported path to leave**.

Railway templates can provision multiple services and prompt for variables from
an embedded deploy button. A deployed service remains linked to the template
author's repository until the owner explicitly ejects it, so Exponential must
make repository and update ownership visible in the flow rather than implying
full independence by default. ([Railway templates](https://docs.railway.com/templates/deploy),
[publishing and ownership](https://docs.railway.com/templates/publish-and-share))

Coolify is the closest current analogue to easy sovereignty: Compose-based
one-click services deploy onto infrastructure controlled by the user, while the
platform supplies TLS, backups, and updates. ([Coolify services](https://coolify.io/docs/services/introduction),
[Coolify overview](https://coolify.io/docs/get-started/introduction))

## What the homepage should say

Suggested hero:

> **The sovereign coordination stack for humans and AI.**
>
> Run it with us or deploy it into infrastructure you control. Your projects,
> agents, database, and encryption keys stay yours.
>
> **[Start on Exponential Cloud] [Deploy your own]**
>
> Open source · AGPL-3.0 · PostgreSQL · No Exponential account required

“Deploy your own” should open a compact chooser rather than immediately sending
everyone to Railway:

| Route | Promise | User supplies | Target time |
| --- | --- | --- | --- |
| Railway | Fastest own-cloud deployment | Railway account and region | Under 3 minutes |
| Coolify | Deploy to a server the user controls | Coolify server and domain | Under 5 minutes |
| Docker | Portable, inspectable installation | Linux server and Docker | Under 10 minutes |
| Kubernetes | HA and policy-controlled | Existing cluster | Advanced |

Below the hero, show a real deployment receipt rather than generic claims:

- App running
- PostgreSQL provisioned
- Encryption keys generated
- Owner account claimed
- Backups configured
- Health checks passing

Never promise a time until the corresponding path is exercised by a clean-room
test on every release.

## Best-in-class lessons

- **Supabase** automates prerequisites, secret generation, image pulls, and
  bootstrap while plainly documenting what the self-hosting operator owns. Its
  Compose setup also explicitly documents telemetry behavior. ([Docker setup](https://supabase.com/docs/guides/self-hosting/docker),
  [operator responsibilities](https://supabase.com/docs/guides/self-hosting))
- **Plane** treats install, configure, monitor, repair, backup, restore, and
  upgrade as one lifecycle rather than stopping when containers start.
  ([Docker installation](https://developers.plane.so/self-hosting/methods/docker-compose),
  [management CLI](https://developers.plane.so/self-hosting/manage/prime-cli))
- **Plausible** offers a small pinned Compose release, generated secrets, TLS,
  and a first-user flow, while clearly explaining that operators own capacity,
  upgrades, backups, and uptime. ([Community Edition](https://github.com/plausible/community-edition/),
  [cloud versus self-hosted](https://plausible.io/self-hosted-web-analytics))
- **Appsmith** explicitly separates Docker quick starts from scalable
  Kubernetes deployments. ([installation matrix](https://docs.appsmith.com/getting-started/setup/installation-guides))
- **Mattermost** similarly distinguishes evaluation, single-server Docker, and
  Kubernetes HA, and calls out Docker's availability limitations.
  ([containers](https://docs.mattermost.com/deployment-guide/server/deploy-containers.html),
  [Kubernetes](https://docs.mattermost.com/deployment-guide/server/deploy-kubernetes.html))

Docker describes Compose as a declarative model for the services, networks, and
volumes in an application, and recommends production-specific overrides for
restart policies, environment, and observability. This makes Compose the right
canonical substrate, with thin provider-specific adapters on top.
([Compose](https://docs.docker.com/compose/),
[production guidance](https://docs.docker.com/compose/how-tos/production/))

## Current Exponential gaps

The repository currently has a healthy starting point—an AGPL license,
PostgreSQL/Prisma, a migration command, and `/api/health`—but it is not yet a
self-hosting distribution:

- no production Dockerfile, Compose stack, OCI release, or provider template;
- deployment documentation is Vercel-oriented;
- sign-in still requires externally registered OAuth or Postmark credentials;
- `AUTH_SECRET`, `DATABASE_ENCRYPTION_KEY`, and `CRON_SECRET` need safe automated
  generation and rotation guidance;
- uploads are coupled to Vercel Blob rather than a portable S3-compatible
  storage interface;
- scheduled work is described through Vercel cron configuration rather than a
  portable scheduler/worker;
- health reports process identity but does not prove database, storage,
  migration, or worker readiness;
- optional AI, email, observability, and integration dependencies are not yet
  separated into explicit capability levels;
- backup, restore, upgrade, rollback, and export are not one supported operator
  workflow.

Authentication bootstrap is the largest obstacle to an honest one-click claim.
A new instance should let the operator claim the first owner with a one-time
setup token and register a passkey or local credential. SMTP and OAuth should
be configured later in the setup wizard, not block first boot.

## Product architecture

Ship these as one tested release contract:

- multi-stage Docker image with immutable version and commit metadata;
- Compose stack containing app, PostgreSQL, S3-compatible object storage, and a
  scheduler/worker where required;
- idempotent entrypoint that runs `prisma migrate deploy` under a migration lock;
- generated secrets and a one-time owner-claim flow;
- storage adapter supporting S3/MinIO plus managed providers;
- SMTP as the portable email contract, with Postmark as an adapter;
- provider-neutral or OpenAI-compatible AI configuration, with AI optional for
  core coordination;
- readiness and diagnostics covering database, schema, object storage, jobs,
  outbound dependencies, version, and backup freshness;
- `expoctl` (or equivalent) commands for `install`, `doctor`, `backup`,
  `restore`, `upgrade`, and `rollback`;
- default-off outbound telemetry in sovereign installations;
- signed versioned releases and documented export/exit paths.

The provider templates should consume this artifact instead of independently
reimplementing the stack. Render's own deploy-button guidance illustrates why:
the repository, automatic-update behavior, and resource plan must be explicit
in the blueprint. ([Render deploy button](https://render.com/docs/deploy-to-render),
[Blueprints](https://render.com/docs/infrastructure-as-code))

Helm should come only after the container, migration, storage, and worker
contracts are stable. Helm packages versioned Kubernetes resources and supports
install/upgrade/rollback, but it does not provision the cluster itself.
([Helm introduction](https://helm.sh/docs/intro/introduction/)) OpenTofu can then
provide the opinionated “deploy a whole Exponential environment in my account”
path using reusable modules. ([OpenTofu workflow](https://opentofu.org/docs/v1.11/intro/core-workflow/),
[modules](https://opentofu.org/docs/language/modules/))

## Where the Agno-style guide fits

The attached Agno prompt is a strong **setup copilot**, but not a deployment
primitive. Its best ideas are:

- ask one question at a time;
- teach concepts when they become relevant;
- ground every action in repository-owned instructions;
- verify the running service, not just command exit codes;
- take the user from installation through their first useful result.

Exponential should adopt that as an optional “Install with an AI agent” route
and as an in-product post-deploy assistant. The deterministic container,
Compose file, migrations, and health contract remain the source of truth. The
assistant can then handle domains, OAuth, SMTP, S3, backups, diagnostics, and
custom infrastructure without turning a long pasted prompt into the product.

## Phased delivery

### Phase 1 — honest one-click foundation

1. Docker image and production Compose stack.
2. Portable storage and scheduler.
3. First-owner bootstrap with generated secrets.
4. Readiness endpoint and clean-room install test.
5. Railway template and homepage deployment chooser.

### Phase 2 — sovereignty lifecycle

1. Coolify template and one-command server installer.
2. Backup, restore, upgrade, rollback, and `doctor` commands.
3. Setup centre showing ownership, health, updates, backup age, and outbound
   services.
4. AI-guided installer grounded in the same manifests and runbooks.

### Phase 3 — organizational deployment

1. Versioned Helm chart.
2. OpenTofu modules for selected cloud environments.
3. SSO/OIDC, external secret managers, HA workers, object storage, and database.
4. Published support matrix and upgrade guarantees.

The launch bar for Phase 1 should be simple: a first-time operator, starting
without OAuth credentials, reaches a claimed workspace with a passing system
check in under three minutes on Railway and under ten minutes on a fresh Docker
host.
