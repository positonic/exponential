---
title: Self-hosting
description: What an operator of their own Exponential installation needs to know; nothing on this page applies to exponential.im
section: self-hosting
order: 1
icon: IconSettings
sidebarTitle: Overview
updated: 2026-11-14
---

Exponential is open source and can run on your own infrastructure. Everything in the rest of these docs describes the product as a user sees it; this page is for the person operating an installation. If you use exponential.im, you can skip it.

## Deploy on Railway

[![Deploy on Railway](https://railway.com/button.svg)](https://railway.com/deploy/exponential)

The [Railway template](https://railway.com/deploy/exponential) runs your own installation in one click: Postgres with pgvector, the app and the scheduler, with every secret generated for you. When the deploy finishes, open the **app** service's logs, find the block that starts `This install has no admin yet`, and redeem the setup token at the `/setup` link it gives. You become the instance admin and sign-up turns invite-only. Until you add email (SMTP or Postmark), your sign-in codes are written to the same logs, so keep them to yourself. If you add only an OAuth provider instead, also set `AUTH_LOG_SIGN_IN_CODES=false`: OAuth alone doesn't stop codes going to the logs.

## Where to find it

The code is at [github.com/positonic/exponential](https://github.com/positonic/exponential). The README's "Self-hosting" section covers Railway, Docker Compose and running from source; the deeper operator guides live under `dev-docs/`, starting with `PRODUCTION_DEPLOYMENT_GUIDE.md`.

## What an installation consists of

| Part | What it is |
|---|---|
| The web app | Next.js on any Node host or container platform, backed by PostgreSQL with pgvector. It applies database migrations when it starts. |
| The scheduler | Runs the background jobs (notifications, syncs, agent runs) by calling the app's job routes on a timer. Included in the Railway template and Docker Compose. |
| The agent service | Optional. Runs Zoe and the specialist agents; the web app talks to it over `MASTRA_API_URL`. Without it the Assistant is off. |
| The WhatsApp gateway | Optional; holds linked WhatsApp sessions and relays messages to the agent service |

## Environment variables that affect what users see

The complete list is validated in `src/env.js` in the repository. These are the ones that change which features appear:

| Variable | Effect |
|---|---|
| `DATABASE_URL`, `AUTH_SECRET`, `DATABASE_ENCRYPTION_KEY` | Required. Credentials and PII are encrypted with the key; rotate it with the documented procedure, never by replacing it. |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`, `AUTH_DISCORD_ID` / `AUTH_DISCORD_SECRET` | Each configured provider adds a button to the sign-in page. |
| `SMTP_HOST` and `EMAIL_FROM` (plus `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`), or `AUTH_POSTMARK_KEY` | Email sign-in codes and other email. Postmark wins when both are set. |
| `AUTH_LOG_SIGN_IN_CODES` | Writes the instance admin's sign-in codes to the server log instead of emailing them; nobody else gets one. Ignored once email is set up, but not when only OAuth is: set it to `false` then. Anyone who can read the log can sign in as the admin. |
| `OPENAI_API_KEY` | Optional. Meeting summaries and extraction, semantic search and the knowledge base, digests. |
| `ANTHROPIC_API_KEY` | Optional. Claude meeting summaries and workspace updates. |
| `MASTRA_API_URL` | Optional. The agent service's URL; turns on the Assistant (Zoe chat, Assign to Assistant). |
| `WHATSAPP_GATEWAY_URL` | Enables **Connect WhatsApp**. The gateway must share the app's `AUTH_SECRET`, which signs the short-lived tokens the two exchange. Without it users see "Gateway not configured". |
| `SLACK_BOT_TOKEN` on the agent service | Gives Zoe Slack tools for installations that connect one shared Slack app; users on exponential.im connect their own app from Settings → Integrations instead. |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | Web push notifications. |
| `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` | Rate limiting for public endpoints. |
| `NEXT_PUBLIC_SENTRY_DSN` | Error reporting. |
| The GitHub App credentials | Enable the **GitHub Repositories** card in workspace settings. |

With no AI variable set the app is a plain project and task tool: each AI feature is hidden or says how to turn it on, and the startup log lists what is on.

## Sovereign installation

An installation that operates without any Exponential-controlled account or control plane, where the operator controls compute, data, keys, identity, backups and update timing. The docs use this term rather than "self-hosted" when the control boundary matters.

## How it connects

- Users' guides for the features these variables switch on: [Chat gateways](/docs/zoe/chat-gateways), [Slack](/docs/integrations/slack), [Integrations](/docs/integrations), [Notifications](/docs/collaborate/notifications).
