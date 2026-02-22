# Licensing

Exponential is licensed under the **GNU Affero General Public License v3.0 (AGPL-3.0)**.

This document explains what the license means in practice, for contributors, users, and anyone considering building on Exponential.

## Why AGPL-3.0?

We chose the AGPL because it balances two goals:

1. **Genuine open source** — anyone can read, run, modify, and contribute to the code. The AGPL is recognized by the Open Source Initiative (OSI) as a true open source license.

2. **Protection against closed forks** — the AGPL's "network interaction" clause (Section 13) means that if someone modifies Exponential and deploys it as a web service, they must make their modified source code available. This prevents competitors from taking the code, making proprietary improvements, and running a closed competing SaaS.

This is the same approach used by GitLab, Grafana, Mattermost, and other successful open source companies.

## What You Can Do

### Run locally or self-host (free, forever)

You can clone this repo and run Exponential on your own machine or server at no cost. This includes all features in the open source codebase. You own your data.

```bash
git clone https://github.com/positonic/exponential.git
cd exponential
npm install
npx prisma migrate dev
npm run dev
```

### Modify the code

You can modify Exponential for your own use. If you deploy your modified version as a network service (i.e., other people access it over the internet), you must make your modified source code available under the AGPL.

### Contribute

Contributions are welcome and encouraged. By submitting a pull request, you agree that your contribution is licensed under the AGPL-3.0, the same license as the project. See [CONTRIBUTING.md](CONTRIBUTING.md) for details.

### Build integrations

You can build tools, agents, plugins, and integrations that communicate with Exponential via its APIs. These are separate works and are not subject to the AGPL — you can license them however you like.

### Use it for your organization

You can run Exponential internally for your team or company. The AGPL only triggers its source-sharing requirement when you provide the software as a service to *others* over a network.

## What You Cannot Do

### Run a competing closed-source SaaS

You cannot take this code (or a modified version), deploy it as a hosted service for third parties, and keep your modifications proprietary. If you deploy it as a service, you must share your source code under the AGPL.

### Remove the license

All copies and modified versions must retain the AGPL-3.0 license and copyright notices.

## Hosted vs. Self-Hosted

| | Self-hosted (free) | Hosted at exponential.im (paid) |
|---|---|---|
| Core features | All open source features | All open source features |
| Infrastructure | You manage it | We manage it |
| Updates | You pull from GitHub | Automatic |
| Support | Community (GitHub Issues/Discussions) | Priority support |
| Premium features | Not included | Managed AI agents, SSO/SAML, team billing, SLAs, advanced analytics |

The hosted version at [exponential.im](https://www.exponential.im) is a paid service that includes managed infrastructure, premium features, and support. It runs the same open source codebase plus additional proprietary features that are specific to the hosted offering.

## For AI Agents and Integrations

Exponential is designed as an AI-native platform. AI agents (like OpenClaw, Mastra agents, or custom tools) can interact with Exponential via its tRPC API. These integrations are separate works communicating over a network boundary and are **not** subject to the AGPL — you can build proprietary agents that talk to Exponential.

## Comparisons

| License | Open source? | Can fork and self-host? | Can run a closed competing SaaS? |
|---|---|---|---|
| MIT | Yes | Yes | Yes |
| Apache 2.0 | Yes | Yes | Yes |
| **AGPL-3.0** | **Yes** | **Yes** | **No — must share source** |
| BSL | No (source-available) | Yes (non-commercial) | No |
| Proprietary | No | No | No |

## FAQ

**Q: Can I use Exponential at my company internally?**
A: Yes. Running it for your own team does not trigger the AGPL's network service clause.

**Q: Can I build a mobile app that connects to my Exponential instance?**
A: Yes. Client applications that communicate with Exponential over an API are separate works.

**Q: Can I contribute a feature and then use it in my own proprietary product?**
A: Your contribution to Exponential is licensed under AGPL. However, if you wrote the code, you retain copyright and can also license it separately for your own use.

**Q: Can I fork Exponential and sell hosting?**
A: You can offer hosting, but you must make all your source code (including modifications) available under the AGPL. You cannot make proprietary modifications.

**Q: Does the AGPL affect my data?**
A: No. The AGPL covers the software, not the data you store in it. Your projects, actions, and other content belong to you.

## Full License Text

See the [LICENSE](LICENSE) file for the complete AGPL-3.0 license text, or read it at [gnu.org/licenses/agpl-3.0](https://www.gnu.org/licenses/agpl-3.0.html).

## Questions?

If you have questions about the license or how it applies to your use case, open a [GitHub Discussion](https://github.com/positonic/exponential/discussions) or email support@exponential.im.
