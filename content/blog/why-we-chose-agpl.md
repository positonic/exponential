---
title: "Why We Chose AGPL-3.0 (And What It Means for You)"
description: "We open-sourced Exponential under the AGPL. Here's why we picked the most protective open source license, what you can and can't do with the code, and how it fits our vision for AI-native collaboration."
date: "2026-02-23"
author: "Exponential Team"
tags: ["open-source", "licensing", "building-in-public"]
---

## The short version

Exponential is open source under the AGPL-3.0. You can read the code, run it, modify it, self-host it, and contribute to it. The one thing you can't do is take our code, make proprietary improvements, and run a competing closed-source SaaS.

That's it. That's the license.

If you want the longer version — why we chose this license over MIT, what it means in practice, and how it connects to what we're building — keep reading.

## Why not MIT?

We started with MIT. It's the default for a reason: simple, permissive, everyone understands it. Ship your code, let people do whatever they want with it.

The problem is that "whatever they want" includes something specific: a well-funded company can fork your project, add proprietary features, deploy it as a hosted service, and compete directly with you — using your own code. They benefit from your work. You get nothing back. Their improvements stay closed.

This isn't theoretical. It's happened to Redis, Elasticsearch, MongoDB, and dozens of other open source projects. The playbook is well-documented: wait for a project to gain traction, fork it, add enterprise features behind a proprietary license, and offer a competing hosted service with better distribution.

We didn't want to build something genuinely useful and then watch it get captured.

## Why AGPL specifically?

The AGPL-3.0 is the GPL with one additional clause: if you modify the software and let people use it over a network (i.e., you run it as a web service), you must make your modified source code available.

This is the exact protection we need. Exponential is a web application. The primary way people will use it is through a browser, talking to a server. Without the AGPL's network clause, someone could take the code, make it better, deploy it as a SaaS, and keep all their improvements proprietary — because they never "distributed" a binary.

The AGPL closes that loophole.

Here's how it compares:

| License | Open source? | Can self-host? | Can run a closed competing SaaS? |
|---------|-------------|----------------|----------------------------------|
| MIT | Yes | Yes | Yes |
| Apache 2.0 | Yes | Yes | Yes |
| **AGPL-3.0** | **Yes** | **Yes** | **No — must share source** |
| BSL | No (source-available) | Limited | No |
| Proprietary | No | No | No |

We're in good company. GitLab, Grafana, Mattermost, and Nextcloud all use the AGPL for the same reasons.

## What you can do

**Run it locally or self-host it.** Clone the repo, run it on your machine or your server, use every feature in the codebase. Free, forever. You own your data.

```bash
git clone https://github.com/positonic/exponential.git
cd exponential
npm install
npx prisma migrate dev
npm run dev
```

**Modify it.** Change anything you want. If you deploy your modified version as a service that other people access over a network, you need to make your source code available under the AGPL. If you're just running it internally for your own team, no sharing required.

**Build integrations.** AI agents, plugins, mobile apps, CLI tools — anything that talks to Exponential over its API is a separate work. License it however you want. The AGPL doesn't reach across network boundaries.

This matters especially for us. Exponential is designed as an AI-native platform. We want people building agents that create tasks, manage bounties, and orchestrate work through our APIs. Those agents are yours. The AGPL doesn't touch them.

**Contribute.** We actively welcome contributions. See our [Contributing Guide](https://github.com/positonic/exponential/blob/main/CONTRIBUTING.md). Your contributions are licensed under the AGPL, same as the rest of the project.

**Use it for your company.** Running Exponential internally for your team doesn't trigger the source-sharing requirement. The AGPL only kicks in when you provide the software as a service to *third parties* over a network.

## What you can't do

**Run a closed-source competing SaaS.** You can't take this code, add proprietary features, and offer it as a hosted product without sharing your source. If you deploy it as a service, your modifications must be available under the AGPL.

That's the only real restriction. And honestly, if someone wants to fork Exponential and offer hosting with all their modifications open-sourced — we're fine with that. More open source is more better.

## The business model

Open source is the product. The hosted version at [exponential.im](https://www.exponential.im) is a paid service that runs the same open source codebase plus managed infrastructure, premium features (managed AI agents, SSO/SAML, team billing, advanced analytics), and priority support.

| | Self-hosted (free) | Hosted (paid) |
|---|---|---|
| Core features | ✅ Everything | ✅ Everything |
| Infrastructure | You manage it | We manage it |
| Updates | Pull from GitHub | Automatic |
| Support | Community | Priority |
| Premium features | — | Managed AI, SSO, analytics |

This is the same model that works for GitLab, Grafana, and others. The open source version is complete and useful on its own. The paid version adds convenience and enterprise features.

## Why this matters for AI

We wrote in [our first post](/blog/why-we-are-building-exponential) that we're building an operating system where humans and AI collaborate as equals. The license choice is directly connected to that vision.

AI agents are going to become the primary consumers of productivity infrastructure. They'll create tasks, claim bounties, manage projects, and orchestrate workflows through APIs. When that happens, the platforms they operate on need to be open and trustworthy. Nobody wants their AI agent locked into a proprietary platform they can't inspect, modify, or leave.

The AGPL guarantees that Exponential stays open. Not just source-available — genuinely open source, with real protections against capture. If you build your agent workflows on Exponential, you can always see exactly what the code does, run it yourself, and leave if you want to.

That's not a marketing position. It's a legal guarantee.

## FAQ

**Can I use Exponential at my company internally?**
Yes. Running it for your own team doesn't trigger the AGPL's network service clause.

**Can I build a mobile app or AI agent that connects to Exponential?**
Yes. Applications that communicate over an API are separate works and aren't subject to the AGPL.

**Can I fork Exponential and sell hosting?**
You can offer hosting, but all your source code — including modifications — must be available under the AGPL.

**Does the AGPL affect my data?**
No. The license covers the software, not the data you store in it.

---

The full license text is in the [LICENSE](https://github.com/positonic/exponential/blob/main/LICENSE) file. For a plain-language breakdown of every scenario, see [LICENSING.md](https://github.com/positonic/exponential/blob/main/LICENSING.md).

Questions? Open a [GitHub Discussion](https://github.com/positonic/exponential/discussions) or reach out at support@exponential.im.

*Exponential is open source at [github.com/positonic/exponential](https://github.com/positonic/exponential).*
