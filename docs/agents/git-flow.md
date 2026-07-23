---
trunk: main
featureBase: main
deployTrigger: main
promotionChain:
  - main
---

# Git flow for this repo

**Model**: trunk-based

**Promotion chain**: `main`

- **featureBase** (`main`) — new feature PRs (the output of `/ship-ticket`) target this branch.
- **deployTrigger** (`main`) — when a PR merges into this branch, the GitHub Action scaffolded by `/setup-merge-hook` acts on any linked Tickets: transitioning them from `QA` to `DONE`, ticking their scope's feature requirements as met, or both.

> Note: a `develop` branch exists on the remote but is stale and intentionally ignored. Work is based on and merged directly into `main`, which is also the deploy trigger.

## How skills use this file

- `/ship-ticket` reads `featureBase` to set the base branch of new PRs.
- `/setup-merge-hook` reads `deployTrigger` to set the `on.pull_request.branches` filter for the GitHub Action.
- The Action scans **Rollup PRs** (PRs that promote work between chain nodes) for child PR references in commit messages so Tickets linked to feature PRs are still promoted when their work reaches the deployTrigger through the chain.
