---
title: Self-hosting
description: What an operator of their own Exponential installation needs to know; nothing on this page applies to exponential.im
section: self-hosting
order: 1
icon: IconSettings
sidebarTitle: Overview
updated: 2026-09-28
---

Exponential is open source and can run on your own infrastructure. Everything in the rest of these docs describes the product as a user sees it; this page is for the person operating an installation. If you use exponential.im, you can skip it.

## Where to find it

The code is at [github.com/positonic/exponential](https://github.com/positonic/exponential). The operator guides live in the repository under `dev-docs/`, starting with `PRODUCTION_DEPLOYMENT_GUIDE.md`.

## What an installation consists of

| Part | What it is |
|---|---|
| The web app | Next.js, deployed to Vercel or any Node host, backed by PostgreSQL with pgvector |
| The agent service | Runs Zoe and the specialist agents; the web app talks to it over `MASTRA_API_URL` |
| The WhatsApp gateway | Optional; holds linked WhatsApp sessions and relays messages to the agent service |

## Environment variables that affect what users see

The complete list is validated in `src/env.js` in the repository. These are the ones that change which features appear:

| Variable | Effect |
|---|---|
| `DATABASE_URL`, `AUTH_SECRET`, `DATABASE_ENCRYPTION_KEY` | Required. Credentials and PII are encrypted with the key; rotate it with the documented procedure, never by replacing it. |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`, `AUTH_DISCORD_ID` / `AUTH_DISCORD_SECRET`, `MICROSOFT_ENTRA_ID_*`, `AUTH_POSTMARK_KEY` | Each configured provider adds a button to the sign-in page; Postmark powers the email sign-in code. |
| `OPENAI_API_KEY`, `MASTRA_API_URL` | Zoe, meeting processing and the knowledge base need both. |
| `WHATSAPP_GATEWAY_URL` | Enables **Connect WhatsApp**. The gateway must share the app's `AUTH_SECRET`, which signs the short-lived tokens the two exchange. Without it users see "Gateway not configured". |
| `SLACK_BOT_TOKEN` on the agent service | Gives Zoe Slack tools for installations that connect one shared Slack app; users on exponential.im connect their own app from Settings → Integrations instead. |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | Web push notifications. |
| `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` | Rate limiting for public endpoints. |
| `NEXT_PUBLIC_SENTRY_DSN` | Error reporting. |
| The GitHub App credentials | Enable the **GitHub Repositories** card in workspace settings. |

## Sovereign installation

An installation that operates without any Exponential-controlled account or control plane, where the operator controls compute, data, keys, identity, backups and update timing. The docs use this term rather than "self-hosted" when the control boundary matters.

## How it connects

- Users' guides for the features these variables switch on: [WhatsApp](/docs/zoe/whatsapp), [Slack](/docs/integrations/slack), [Integrations](/docs/integrations), [Notifications](/docs/collaborate/notifications).
