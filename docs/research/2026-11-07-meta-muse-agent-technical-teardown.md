# Meta Muse (personal agent): technical teardown and open-source replication

Researched 2026-11-07. About Meta's Muse agent and the Muse Spark models, not the video product formerly at muse.ai (see `2026-11-07-muse-ai-technical-teardown.md`).

## Summary

1. Meta has published far more than expected: its launch security post documents the agent's internals, down to process boundaries. **Confirmed**.
2. Muse is one persistent Linux VM per user. The agent runs in a `systemd-nspawn` cell; credentials, connector logic, safety classifiers and the approval authority (Sentinel) run outside it. **Confirmed**.
3. The product is an agent harness (internal name Hatch) plus Muse Spark 1.3, with CLI tools, skills, sub-agents, crons and a browser sub-agent. **Confirmed**. No separate planner model is documented.
4. Most of the safety value sits in the harness, and that is replicable: Meta's own numbers show browser injection success falling from 17.5% (API model) to 10.0% (full Muse). **Confirmed**, not independently verified.
5. The weak spot of an open stack is model-level injection resistance: Meta measured Kimi K3 at 59–62% attack success, and I found no published data for GLM-5.3. **Unknown** until measured.
6. Recommended stack: GLM-5.3 (planner) and GLM-5.3-Flash (worker, vision), hosted first, later vLLM; Hermes Agent inside a Firecracker microVM with an nspawn cell.
7. Also in that stack: Temporal, a OneCLI-style credential gateway, Cedar, Playwright MCP behind a broker, neko for takeover, Postgres with pgvector, Telegram plus own app.
8. Unmeasured cost estimate: about $12–33 per active user per month, so a $20 plan loses money at my assumed typical usage (20M tokens a week).
9. WhatsApp is not replicable: a general-purpose assistant is barred from the Business Platform outside markets where Meta must allow it. Muse's WhatsApp surface is first-party. **Confirmed** from search excerpts.
10. Not determinable from public sources: task success rates, Sentinel's model, the hypervisor, Mac control internals, true token usage. Build the eval harness and red-team gates first.

## Access notes

**Evidence labels:** **Confirmed** = Meta source. **Confirmed (excerpt)** = Meta page I did not fetch, seen only as WebSearch output. **Reported** = named third party. **Inferred** = my reasoning, stated. **Unknown** = not publicly documented.

| Domain | robots.txt / notice | What I did |
|---|---|---|
| muse.ai and subdomains | Off limits per brief | No requests. `security.muse.ai`, `introducing.muse.ai`, `muse.ai/blog/securing-muse` and `muse.ai/platform` are unread; their content appears here only via third parties. Excluded muse.ai from the one search aimed at its "How We Designed Muse" post. |
| about.fb.com, research.meta.ai, dev.meta.ai | No prohibition notice; generic agents allowed | Fetched. These are the main primary sources. |
| ai.meta.com, developer.meta.com, developers.facebook.com, www.meta.com, www.llama.com | Rules allow generic agents, but each file carries a notice prohibiting automated collection without written permission | **Not fetched**, including the named starting URL `developer.meta.com/ai/resources/blog/build-with-muse-spark/`. Used WebSearch output only. Judgement call: the notice's wording says "on Facebook", so a broader reading is arguable; I took the strict one. |
| www.meta.ai | Disallow all for `*` | Not fetched. |
| www.whatsapp.com, business.whatsapp.com, transparency.meta.com | Disallow ClaudeBot | Not fetched. WhatsApp terms come from WebSearch excerpts. |
| faq.whatsapp.com | robots.txt redirected to an error page | Treated as off limits. |

Failed or blocked sources:

- Wired and Ars Technica: fetch tool refused.
- CNN: HTTP 451.
- MarkTechPost: HTTP 403.
- EC case page: rendered empty.
- Hetzner: no plan specs on page.
- Muse Spark Open `LICENSE`: HTTP 401, gated behind a form asking for legal name and date of birth. Not retried or worked around. Licence terms below come from the public model card and VentureBeat.

No accounts, sign-ins, API probing or app downloads.

### Checking the starting context

| Blog claim | Finding | Label |
|---|---|---|
| Announced around 2026-09-08 | [Newsroom post](https://about.fb.com/news/2026/09/introducing-muse-personal-ai-agent/) dated Sep 8, updated Sep 30 | Confirmed |
| Plans and acts, opens a browser, fills forms | Same post | Confirmed |
| App, muse.ai, WhatsApp | Same post; WhatsApp omits the feed and ideas tool per [CNBC](https://www.cnbc.com/2026/09/08/meta-personal-ai-agents-public-reckoning-privacy-safety.html) | Confirmed; detail Reported |
| Mac app around Sep 17 | [TechCrunch](https://techcrunch.com/2026/09/18/metas-muse-hits-mac-letting-the-ai-take-actions-on-your-computer/): announced Sep 17 | Reported |
| $20 and $100 tiers | Alexandr Wang via [CNBC](https://www.cnbc.com/2026/09/08/meta-personal-ai-agents-public-reckoning-privacy-safety.html); [Reuters via AOL](https://www.aol.com/articles/meta-launches-ai-agent-access-190442000.html) | Reported (on record) |
| US only vs US/Canada/Japan/Singapore | Conflict resolved by date: US at launch, [US and Canada by Sep 29](https://about.fb.com/news/2026/09/introducing-muse-small-business/), [Japan Oct 23](https://about.fb.com/ja/news/2026/10/muse-personal-ai-agent-launches-in-japan/), [Singapore Oct 27](https://about.fb.com/news/2026/10/muse-is-now-available-in-singapore-the-worlds-first-personal-ai-agent-built-for-everyone/) | Confirmed |

## Part 1: how Muse works

### 1.1 Product experience

| Topic | Finding | Label and source |
|---|---|---|
| End-to-end flow | State a goal; Muse builds a plan and advances it, keeps working after the app closes, returns when something changes or approval is needed | Confirmed, [Newsroom](https://about.fb.com/news/2026/09/introducing-muse-personal-ai-agent/) |
| Information architecture | Feed, Ideas, Goals, Library; activity log per task showing tool calls and scripts | Reported, [Lenny's Newsletter](https://www.lennysnewsletter.com/p/how-i-ai-metas-muse-review-how-warp); Ideas tab Confirmed, [small business post](https://about.fb.com/news/2026/09/introducing-muse-small-business/) |
| Surfaces live | iOS, Android, web, Mac, WhatsApp; iPad since v10.0 | Confirmed, [App Store](https://apps.apple.com/us/app/muse-from-meta/id6760173601); Mac via [voice post](https://about.fb.com/news/2026/11/introducing-muse-ai-voice-expressive-avatars/) |
| Surfaces planned | AI glasses, Muse Charm device; Muse's own email address announced | Confirmed, [Connect recap](https://about.fb.com/news/2026/09/the-biggest-news-from-connect-2026/) |
| Background and scheduled work | VM handles concurrent sub-agents and crons; recurring tasks described for the earlier Meta AI agentic mode; Spaces can be scheduled | Confirmed, [security post](https://research.meta.ai/blog/security-and-safety-for-ai-agents-our-approach-with-muse), [July post](https://about.fb.com/news/2026/07/meta-ai-muse-spark-doesnt-just-think-it-acts/), [Spaces](https://about.fb.com/news/2026/11/introducing-spaces-customize-muse-app/) |
| Notifications | Background monitoring with notifications | Confirmed, [App Store](https://apps.apple.com/us/app/muse-from-meta/id6760173601) |
| Spaces (Nov 6) | User-described mini-apps inside Muse, refined by chat, updated in the background from connected apps. Generation mechanism undisclosed | Confirmed, [Spaces](https://about.fb.com/news/2026/11/introducing-spaces-customize-muse-app/) |
| Tiers | Free 100M tokens/week; Power $20, 500M; Maximum $100, 3B. Same features, usage differs. At the limit the agent pauses | Reported, [The Batch](https://www.deeplearning.ai/the-batch/how-to-secure-agents-for-the-masses), [Carly](https://www.usecarly.com/blog/meta-muse-pricing/) (attributes to Meta's help page and Zuckerberg) |
| Top-ups | Extra tokens purchasable since v12.0 (Oct 17) | Confirmed, [App Store](https://apps.apple.com/us/app/muse-from-meta/id6760173601) |
| Age and regions | 18+. Japan lacks advanced voice, avatar and Muse email for now | Confirmed, [Japan post](https://about.fb.com/ja/news/2026/10/muse-personal-ai-agent-launches-in-japan/) |

Observed behaviour, all third-party:

- **Works:** multi-step planning, calendar and newsletter tasks, movers' quotes, a fantasy football waiver claim ([Yahoo Finance](https://finance.yahoo.com/technology/article/metas-muse-is-an-impressively-capable-ai-agent-despite-some-hiccups-173310662.html), [Lenny's](https://www.lennysnewsletter.com/p/how-i-ai-metas-muse-review-how-warp)).
- **Fails:** browser purchasing was the weakest area for one reviewer. Another saw a closed restaurant recommended and a phone number it admitted making up.
- **Purchases:** the Nintendo purchase was slower than buying directly and needed the user to press buy.

No published task-completion rate exists. Meta's only headline figure is an internal Personal Superintelligence Index of 47% versus 38% for the previous model ([research post](https://research.meta.ai/blog/specialized-models-for-muse-and-metaai)). **Unknown** what that index measures.

### 1.2 Model layer

| Model | Date | Facts | Label |
|---|---|---|---|
| Muse Spark | Apr 8 | First MSL model; [safety report](https://arxiv.org/abs/2606.12429) | Confirmed |
| Muse Spark 1.1 / 1.2 | Jul 9 / Aug 5 | API launch; Muse Code launch | Confirmed, [sitemap](https://research.meta.ai/sitemap.xml) |
| **Muse Spark 1.3** | Sep 2 | "Trained for long-horizon, agentic workflows"; 1M context; video, image and document input; OpenAI-compatible API at $1.25/$4.25 per 1M | Confirmed, [model page](https://dev.meta.ai/models/muse-spark), [blog](https://research.meta.ai/blog/introducing-muse-spark-1-3) |
| Muse Spark 1.3 contributor | Sep | $0.10/$0.20, and Meta may train on your content | Confirmed, [pricing](https://dev.meta.ai/docs/pricing-rate-limits) |
| Muse Glimmer 30B | Aug 10 | Apache 2.0 open weights, 24–32 GB quantized | Confirmed, [card](https://huggingface.co/meta-models/Muse-Glimmer-30B) |
| Muse Wonder / Wonder Full | Oct 12 | Frontier tier, $4/$20; "coming soon" to Muse, subscribers first | Confirmed, [Newsroom](https://about.fb.com/news/2026/10/introducing-muse-wonder-models/) |
| Muse Spark Open | Oct 15 | 816B total, 42B active; custom licence | Confirmed, [card](https://huggingface.co/meta-models/Muse-Spark-Open-816B-A42B) |
| Specialized Muse models | Nov 6 | Versions trained with Wonder learnings, rolling out to Muse | Confirmed, [post](https://research.meta.ai/blog/specialized-models-for-muse-and-metaai) |

**Which model does what:**

- Muse uses a dedicated 1.3 checkpoint, distinct from the API deployment. Meta's report separates "(Muse Model)" from "(API)". **Confirmed**, [evaluation report](https://research.meta.ai/static/muse-spark-1-3-evaluation-report).
- Which checkpoint runs today, after the Nov 6 rollout, is **Unknown**.
- The browser sub-agent is a harness role; its model is **Unknown**.
- Sentinel's model and the `hatch-safety` models are **Unknown**.
- Voice uses Muse Realtime Voice and Muse Realtime Avatar. **Confirmed**, [voice post](https://about.fb.com/news/2026/11/introducing-muse-ai-voice-expressive-avatars/).

**Published benchmarks for Spark 1.3 versus Opus 5 (max effort), Meta-published:** OSWorld 2.0 partial 66.9 vs 68.3; DeepSearchQA 90.3 vs 90.4; AutomationBench 49.6 vs 50.3; JobBench 64.9 vs 65.7 ([model page](https://dev.meta.ai/models/muse-spark)). Artificial Analysis gave Spark 1.3 a 48 and Wonder Full a 56 on the index version [VentureBeat](https://venturebeat.com/technology/meta-unveils-muse-spark-open-the-new-top-u-s-open-weights-model-and-it-runs-on-two-paired-mac-desktops) quoted in October.

**Open weights:** only Spark Open and Glimmer are open. Spark 1.3, Wonder and the Muse checkpoints are closed. Muse Code runs on macOS and Linux; Meta's API `computer` tool states that [Meta does not host a VM or browser](https://dev.meta.ai/docs/computer-use), so API users bring their own.

### 1.3 Agent architecture

Source for this section unless noted: Meta's [How We Built Safety Into Muse](https://research.meta.ai/blog/security-and-safety-for-ai-agents-our-approach-with-muse). **Confirmed**.

```
Clients (iOS, Android, web) ── secure transport ──► User's dedicated Linux VM
  ┌───────────── runtime cell (systemd-nspawn, Debian rootfs) ─────────────┐
  │ Hatch daemon (agent harness) · workspace files · CLIs · sub-agents     │
  │ root mapped to unprivileged host user · filtered syscalls · virtual NIC│
  └────── Unix sockets with SO_PEERCRED and peer ACLs ─────────────────────┘
  Outside the cell, as separate systemd units:
    hatch-safety  independent models/classifiers on inference traffic
    privsep       sandboxed workers that run built-in connector logic
    hatch-authd   credential store and surrogate-token minting
    Sentinel      sole authority for connector actions and network egress
    Postgres      durable app state · proxies for inference and telemetry
    CDP broker    narrow browser control for the browser sub-agent
```

| Question | Finding | Label |
|---|---|---|
| Planner/executor split | Not described. Harness trained around "zero-shot tool calling using CLIs and skills", long context, instruction following, multi-agent coordination | Confirmed for training focus; split **Unknown** |
| Reasoning loop | 1.3 built for long work in "a single long thread", tracking its own plan ([blog](https://research.meta.ai/blog/introducing-muse-spark-1-3)). Inferred: one long-lived main thread plus sub-agents, rather than a planner service | Inferred |
| Sub-agents | "Swarms"; dedicated browser sub-agent with web-specific instructions | Confirmed |
| Tool interface | Connector CLIs in the cell pass typed arguments and file descriptors over a socket to a worker. Meta had to convert benchmark MCP interfaces into "CLI tools and skills" to test Muse ([report](https://research.meta.ai/static/muse-spark-1-3-evaluation-report)) | Confirmed |
| Self-modification | Muse "builds its own tools, and edits itself"; can write custom connectors | Confirmed |
| Skill surface risk | Skills are a trusted channel; Muse's SkillInject ASR is 3.7% vs 0.6% for the API model ([report](https://research.meta.ai/static/muse-spark-1-3-evaluation-report)) | Confirmed |
| Execution location | Cloud VM. Inference leaves the VM through a proxy. Mac adds a local client (section 1.4) | Confirmed |

### 1.4 Browser and computer use

| Topic | Finding | Label |
|---|---|---|
| Where it runs | Real Chromium "behind a virtualization layer" on the user's VM, not locally | Confirmed |
| Perception | Accessibility-tree snapshot, not raw DOM | Confirmed |
| Hard limits | No page-context JS, no script verbs, no exec in browser process, DevTools disabled | Confirmed |
| Control | Separate broker owns the CDP connection | Confirmed |
| Takeover | User can watch and take over; agent pauses during takeover and during credential fill | Confirmed |
| Logins | Client-side custom UI sends credentials to `authd`, injected at point of need, invisible to main agent; integrates with password managers | Confirmed |
| Browser classifiers | Five: unrelated personal data egress, injection in DOM, injection in images or media, injection in downloaded files, high-risk form submission | Confirmed |
| Bad sites | Meta's malicious-site list matched inside the VM | Confirmed |
| Bot blocking | Target blocked autonomous checkout clicks in one test | Reported, via WebSearch summary of hands-on coverage; low confidence |
| Mac app scope | Files, Messages, Calendar, Notes, Mail | Reported, [TechCrunch](https://techcrunch.com/2026/09/18/metas-muse-hits-mac-letting-the-ai-take-actions-on-your-computer/); Confirmed (excerpt), [download page](https://ai.meta.com/muse/download/) |
| Mac persistence | Keeps running after the window closes | Reported, [VentureBeat](https://venturebeat.com/security/meta-patched-muses-zero-day-but-security-teams-still-lack-visibility-into-what-the-agent-can-access) |
| Mac permissions | Full Disk Access is opt-in; deleting files and sending messages need approval | Reported, [remio](https://www.remio.ai/post/meta-muse-for-mac-can-act-across-your-desktop-but-permission-is-the-product) (lower-tier, cites Meta's X post) |
| Mac control mechanism | Screen control vs AppleScript vs Accessibility API; whether local actions pass through Sentinel | **Unknown** |
| API computer use | `computer` tool: click, drag, keypress, scroll, type, screenshot; screenshots with `pending_safety_checks` | Confirmed, [docs](https://dev.meta.ai/docs/computer-use); link to Muse product **Unknown** |

### 1.5 Connectors and permissions

| Topic | Finding | Label |
|---|---|---|
| Connected services | Gmail, Google Calendar, Instagram, Facebook; Asana, Box, Canva, Dropbox, Figma, Granola, HighLevel, QuickBooks, Klaviyo, Lovable, Notion, Shopify, Slack, Stripe, Zoom; Walmart, Best Buy, Sephora, Wayfair; PayPal; car and home | Confirmed, [small business](https://about.fb.com/news/2026/09/introducing-muse-small-business/), [Connect](https://about.fb.com/news/2026/09/the-biggest-news-from-connect-2026/), [security post](https://research.meta.ai/blog/security-and-safety-for-ai-agents-our-approach-with-muse) |
| Local partners | Shopee, Grab, Singapore Airlines, others; Mercari, Money Forward ME and Ticketpia in progress | Confirmed, [Singapore](https://about.fb.com/news/2026/10/muse-is-now-available-in-singapore-the-worlds-first-personal-ai-agent-built-for-everyone/), [Japan](https://about.fb.com/ja/news/2026/10/muse-personal-ai-agent-launches-in-japan/) |
| How built | Provider API integration plus a Meta-written SKILL per connector | Confirmed |
| Protocol | Muse consumer protocol not stated. The separate [Meta AI Connectors programme](https://dev.meta.ai/products/connectors) offers MCP onboarding and REST/GraphQL with OAuth account linking, in early access | Confirmed for Meta AI; Muse **Unknown**. Inferred: CLI-and-skill natively, with MCP possible behind it |
| OAuth and credentials | Tokens stored in the user's VM, not central Meta infrastructure. Cell sees only surrogates; Sentinel swaps in the real token after authorising the request | Confirmed |
| Worker scoping | Each worker identified by cgroup with explicit credential allowlist. Calendar worker cannot request an email credential | Confirmed |
| Granularity | Read and write separated where possible; controls finer than OAuth scopes (e.g. Gmail read without settings access) | Confirmed |
| Decision flow | Connector request carries connector, method, action class, scope, user context. Sentinel generates a user-visible purpose, evaluates user policy, returns allow, deny or ask | Confirmed |
| Approval UX | Pending approval created, execution stops, dialog in the client UI (not the chat), answer goes straight to Sentinel | Confirmed |
| Grant types | One-time, session, task, time-bounded, perpetual. Sentinel chooses which to offer and enforces exact match | Confirmed |
| Always confirmed | Sending email, purchases. "Nothing publishes, sends, or spends without your approval" | Confirmed, [small business](https://about.fb.com/news/2026/09/introducing-muse-small-business/) |
| WhatsApp approvals | Clients listed as iOS, Android, web. How approvals work from WhatsApp | **Unknown** |
| Coming | 1Password, Shop Pay (Shop Pay later announced at Connect) | Confirmed, [Newsroom](https://about.fb.com/news/2026/09/introducing-muse-personal-ai-agent/) |
| Enterprise | No SIEM export, admin console or DLP integration found; API keys given to Muse create no OAuth grant | Reported, [VentureBeat](https://venturebeat.com/security/meta-patched-muses-zero-day-but-security-teams-still-lack-visibility-into-what-the-agent-can-access) |

### 1.6 Memory and personalisation

| Topic | Finding | Label |
|---|---|---|
| Storage | Files, generated content and memory live in the VM; user can inspect, edit and download | Confirmed, [security post](https://research.meta.ai/blog/security-and-safety-for-ai-agents-our-approach-with-muse) |
| Forgetting | Tell Muse to forget specific things | Confirmed, [Newsroom](https://about.fb.com/news/2026/09/introducing-muse-personal-ai-agent/) |
| Deleted content | May persist in learned memories until forget is used | Reported, [NeoTeo](https://www.neoteo.com/en/a-meta-muse-hands-on-review-found-task-help-and-data-prompts) citing Meta help |
| Disable switch | NeoTeo found no switch to disable memory; Meta's report says "persistent memory where enabled" | **Conflict**, unresolved |
| Model training | Active Memory: trained to classify temporary vs permanent, reason across time, detect stale information; Meta reports 90% vs 76% on its own eval, 2.4× less forgetting | Confirmed, [post](https://research.meta.ai/blog/specialized-models-for-muse-and-metaai); internal numbers |
| Meta data | Instagram and Facebook via connectors; feed of updates from connected accounts | Confirmed; feed Reported, [CNBC](https://www.cnbc.com/2026/09/08/meta-personal-ai-agents-public-reckoning-privacy-safety.html) |
| Ads | Conversations and VM data not shared with ad systems, but browsing and purchases can indirectly influence ads | Confirmed |
| Training use | Trajectories, sanitised of key PII, used by default; opt-out switch. Sanitisation details undisclosed | Confirmed |
| Meta staff access | Limited by policy, not prevented technically | Confirmed |
| Confidential VM | Planned for later in 2026, key held only by user, code shared with external auditors. Whether shipped by today | **Unknown** |
| Backups | VM backed up continuously | Confirmed |
| Retention period | Memory and trajectory retention | **Unknown** |
| App privacy label | Self-reported categories include financial, health, precise location, contacts, some marked for third-party advertising | Confirmed, [App Store](https://apps.apple.com/us/app/muse-from-meta/id6760173601) |

### 1.7 Safety and security

**Defence layers, all Confirmed** ([security post](https://research.meta.ai/blog/security-and-safety-for-ai-agents-our-approach-with-muse)):

- Model trained on injection resistance.
- External data labelled untrusted.
- Classifier ensemble run on all external data entering context, trained separately from the model.
- Human approval for data leaving the VM.
- Deterministic boundaries regardless of model behaviour.
- **Tainted egress:** eBPF cgroup programs plus eBPF on LSM hooks Meta added. A process becomes tainted on reading user data, then loses auto-allow.
- **Egress:** Sentinel inspects L4 and L7, including resolved IP and decoded request; SSRF checks.
- **Email:** one-time codes, reset links and magic links removed by rules and a classifier.
- **Payments:** single-use card tied to merchant, amount and time window through Stripe Link; approval each time.

Meta's stated threat model is compromise-assumed: Muse "isn't immune to attack" and prompt injection remains open.

**Audit:** Newsroom claims a "full audit trail" of past and planned actions. The security post does not describe the log. Retention is **Unknown**.

**Attack success, Meta-reported** ([evaluation report](https://research.meta.ai/static/muse-spark-1-3-evaluation-report), tables and figures; lower is better):

| Eval | Runner | Spark 1.3 API | Muse (full harness) | GPT-5.6 Sol | Opus 5 | Kimi K3 |
|---|---|---|---|---|---|---|
| DTap browser IPI, pass@1 | Meta on public platform | 17.5 | **10.0** | 40.0 | 5.0 | 59.3 |
| DTap tool IPI, pass@1 | Meta | 4.0 | **4.0** | 48.0 | 8.0 | 62.0 |
| DTap direct misuse | Meta | 5.6 | 10.0 | 44.4 | 17.8 | 21.1 |
| SkillInject | Meta | 0.6 | 3.7 | 49.5 | 7.9 | 27.4 |
| Gray Swan ART, ASR@100 | Gray Swan | 4.8 | not run | 18.2 | 4.8 | 46.3 |

Caveats, stated by Meta: third parties tested only the API model, not Muse. Muse was tested through an internal interface with state reset between runs. Meta competes with these vendors. Chart-to-column mapping for tool IPI is my reading of the extracted figure. "Exponential Security Labs", a named evaluator in that report, is unrelated to this product as far as I can tell.

**Published incidents and findings:**

| Date | Event | Label and source |
|---|---|---|
| Launch week | Internal posts: guardrails bypassed and iCloud photos exposed; CTO repeatedly logged out; ticket monitoring silently stopped | Reported, [Reuters via AOL](https://www.aol.com/articles/meta-launches-ai-agent-access-190442000.html) |
| Launch | Release delayed from April for security. Shah: extra work let it cross the threshold | Reported, same |
| Aug 14 | Irregular's misconfigured eval let a pre-release 1.1 exploit a real website | Confirmed, [Meta](https://research.meta.ai/blog/addressing-third-party-testing-misconfiguration-muse-spark-1-1) |
| Sep 21 | Patrick Wardle: hidden preference `endo_voyager_dictation_endpoint` could redirect Mac dictation and leak an account token usable across devices; needs local code execution; hotfixed | Reported, [The Hacker News](https://thehackernews.com/2026/09/one-hidden-meta-muse-setting-could-let.html), [The Register](https://www.theregister.com/ai-and-ml/2026/09/21/meta-muse-ai-app-flaw-lets-local-malware-redirect-dictation-traffic/5297980). Cloud isolation not broken |
| Nov 2 | Meta disclosure: $300k award for auth check that trusted a local proxy header, exposing conversations and tokens on pre-release VMs | Reported, [eWeek](https://www.eweek.com/news/meta-muse-300000-bug-bounty-security-flaw/) |
| Nov 2 | $90k indirect injection: page imitated browsing-tool status messages | Reported, [Audit Commons](https://auditcommons.org/news/meta-muse-bug-bounty-disclosure/) |
| Nov 2 | 64 valid findings from 630+ submissions, about $1.2M paid; others include OTP redaction and Mac privilege escalation | Reported, same; all figures Meta's |

No independent test of Muse's prompt-injection defences at system level was found. **Unknown** whether Sentinel has been bypassed in production.

### 1.8 Infrastructure signals (stated publicly)

- One VM per user, Debian-based, with enough CPU and memory to compile code. Size not stated by Meta. **Confirmed**. A vendor blog reports about 2 vCPU, 8 GB, 100 GB, unverified ([CodeMyPixel](https://codemypixel.com/blog/meta-muse-personal-ai-agent-1-billion-tokens)). **Reported**, low confidence.
- Avatar: about 870 ms end-of-turn to first byte; 12 concurrent real-time sessions per GB200. **Confirmed** ([post](https://research.meta.ai/blog/bringing-your-muse-to-life)).
- Wonder trained at the gigawatt-scale Prometheus data centre. **Confirmed** ([post](https://research.meta.ai/blog/muse-wonder)).
- Over $130B of AI chip and infrastructure spend expected this year. **Reported** ([Reuters via AOL](https://www.aol.com/articles/meta-launches-ai-agent-access-190442000.html)).
- Hypervisor and cloud provider: **Unknown**.

## Part 2: replicating it with open source

**Open-weight vs open source:** every recommended LLM below is open-weight: weights available, training data not. The only fully open candidate I could verify is [Apertus](https://aitopics.org/doc/arxivorg:3E4BDC3F) (8B and 70B); I found no agentic benchmarks for it, and my search did not surface Olmo's current state. Do not call this stack fully open source.

### 2.1 Models

| Role | Model | Licence and commercial use | Hardware | Benchmarks (publisher) |
|---|---|---|---|---|
| **Primary planner** | [GLM-5.3](https://huggingface.co/zai-org/GLM-5.3), 753B / 40B active, text only | Custom [GLM-5.3 License](https://huggingface.co/zai-org/GLM-5.3/raw/main/LICENSE): broadly permissive; security review only for MaaS businesses above $10B revenue | [8× H200 or H20](https://recipes.vllm.ai/zai-org/GLM-5.3.md), FP8; about 465 GB NVFP4 on Blackwell | [AA index 32](https://artificialanalysis.ai/models/glm-5-3), 63 t/s, 105 s to first answer at max (AA). Terminal-Bench 2.1 88.2 (Z.ai). MCP-Atlas 84.2, JobBench 61.4 ([Meta's table](https://venturebeat.com/technology/meta-unveils-muse-spark-open-the-new-top-u-s-open-weights-model-and-it-runs-on-two-paired-mac-desktops)). No injection data found |
| Alternative planner | [Muse Spark Open](https://huggingface.co/meta-models/Muse-Spark-Open-816B-A42B), multimodal | Muse Model License: mandatory "Built with Muse Spark Open" attribution; $20M MaaS clause; usage policy; gated download | [4× B300 NVFP4, 8× B300 BF16, or 2× M5 Ultra](https://dev.meta.ai/docs/muse-spark-open/hardware-platforms) | [AA index 25](https://artificialanalysis.ai/models/muse-spark-open), 154 t/s, 14 s (AA). MCP-Atlas 89.2, OSWorld Verified 80.4 (Meta). No injection figure in card |
| **Primary worker and vision** | [GLM-5.3-Flash](https://huggingface.co/zai-org/GLM-5.3-Flash), 320B / 18B active, image and video | MIT | [About 306 GiB FP8](https://recipes.vllm.ai/zai-org/GLM-5.3-Flash.md); 8× H200, or TP4 on a GB200 tray | [AA index 28](https://artificialanalysis.ai/models/glm-5-3-flash), 57 t/s, 91 s at max (AA). Terminal-Bench 2.1 84.3, DeepSWE 63.4 (Z.ai settings) |
| Alternative worker, pixel desktop | [Qwen3.8-27B](https://huggingface.co/Qwen/Qwen3.8-27B), image and video | Apache-2.0 | [One H200](https://recipes.vllm.ai/Qwen/Qwen3.8-27B.md); measured on 2× RTX 5090 | OSWorld-Verified 84.3, Terminal-Bench 2.1 73.0 (Qwen). [AA index 20](https://artificialanalysis.ai/models/qwen3-8-27b). Recipe warns only text serving was verified |

**Why GLM over Spark Open:** it ranks higher on the independent index, has fewer licence obligations, and no attribution. Spark Open wins Meta-run tool-use tests and is much faster at max effort, so it is the first thing to swap in if the bake-off favours it.

**Index conflict:** VentureBeat's October figures show GLM-5.3 at 45 and Spark Open at 39, against 32 and 25 on AA's pages today. I treat this as an index revision, not a regression, but could not confirm it. Relative order holds in both.

**Why no separate vision model:** the browser path uses accessibility trees as Meta does. Images go to Flash. Desktop pixels go to Qwen3.8-27B after verification.

**Rejected:** [Kimi K3](https://huggingface.co/moonshotai/Kimi-K3). Meta measured 59–62% injection ASR (a competitor's test), AA marks it [deprecated in favour of K3.1 Pro](https://artificialanalysis.ai/models/kimi-k3), and the [licence](https://huggingface.co/moonshotai/Kimi-K3/raw/main/LICENSE) has a $20M MaaS clause and a UI display requirement. K3.1 Pro was not evaluated.

**Latency warning:** AA's times are at maximum reasoning and the vLLM recipe says GLM thinking is always on. Measure at `reasoning_effort: low` before committing. Muse-style chat needs seconds, not 100 s.

**Serving:**

- **Primary:** hosted endpoints first. GLM-5.3 lists at $1.40/$4.40 with $0.26 cached on [Together, Fireworks, Modal, Crusoe and others](https://openrouter.ai/api/v1/models/z-ai/glm-5.3/endpoints). Check each host's data terms; I did not verify any retention commitment. Avoid sending personal data to unknown low-price routes.
- **Self-host primary:** [vLLM](https://github.com/vllm-project/vllm) (Apache-2.0), using parsers `glm47` from the recipes.
- **Alternative:** [SGLang](https://github.com/sgl-project/sglang) (Apache-2.0).
- **Trap:** Flash's multimodal input is [not supported on vLLM's Rust frontend](https://recipes.vllm.ai/zai-org/GLM-5.3-Flash.md); set `VLLM_USE_RUST_FRONTEND=0` for vision. GLM-5.3 needs a vLLM build with a specific PR, not just the version number.

### 2.2 Capabilities

Stars and activity from the GitHub API today. No independent benchmarks exist for most tooling; I say so rather than repeat vendor claims.

| Capability | Primary | Alternative | Reason | Licence | Needs / evidence |
|---|---|---|---|---|---|
| Agent harness (inside cell) | [Hermes Agent](https://github.com/NousResearch/hermes-agent) | Custom loop on [OpenAI Agents SDK](https://github.com/openai/openai-agents-python) | Already has skills, sub-agents, cron, memory, MCP, gateway. Meta's own [cookbook](https://dev.meta.ai/docs/cookbook/multi-agent-orchestration) runs Hermes on Spark 1.3. Treat as untrusted (see below) | MIT; MIT | Python. [Independent audit](https://labs.cloudsecurityalliance.org/research/csa-research-note-hermes-agent-cves-20260504-csa-styled/): 4 critical, 9 high at v0.8.0 |
| Durable execution | [Temporal](https://github.com/temporalio/temporal) | [DBOS](https://github.com/dbos-inc/dbos-transact-ts) | [Durable timers, signals, updates, schedules, event history](https://docs.temporal.io/evaluate/understanding-temporal); a task survives VM loss | MIT; MIT | Postgres, MySQL or Cassandra. Workflows must be deterministic |
| Per-user isolation | [Firecracker](https://github.com/firecracker-microvm/firecracker) + nspawn cell | [gVisor](https://github.com/google/gvisor) | Matches Meta's two-domain design with a hardware boundary. Hypervisor is my choice, as Meta's is Unknown | Apache-2.0 both | KVM hosts. [Snapshot caveats](https://github.com/firecracker-microvm/firecracker/blob/main/docs/snapshotting/snapshot-support.md): network not guaranteed after resume; encrypt snapshot files yourself |
| Browser automation | [Playwright MCP](https://github.com/microsoft/playwright-mcp) behind a broker | [browser-use](https://github.com/browser-use/browser-use) | Uses accessibility tree like Meta. Must hide `browser_evaluate` and `browser_run_code_unsafe`; README says it is not a security boundary | Apache-2.0; MIT | Chromium per VM. browser-use's scores are vendor-published |
| Live view and takeover | [neko](https://github.com/m1k1o/neko) | [noVNC](https://github.com/novnc/noVNC) | Shared browser session in the client | Apache-2.0; MPL-2.0 | Runs in VM. Pause the agent during takeover, as Meta does |
| Desktop use | [cua Driver](https://github.com/trycua/cua) with Qwen3.8-27B | Disposable Linux desktop, per [Meta's recipe](https://dev.meta.ai/docs/computer-use) | Native app control on Mac, Windows, Linux. [Bytebot](https://github.com/bytebot-ai/bytebot) is archived | Mostly MIT; parts FSL and AGPL | Apple Silicon for Lume VMs. No independent results; [MacAgentBench](https://arxiv.org/abs/2606.22557) best Pass@1 73.7% was reported for other agents |
| Connector protocol | [MCP 2026-07-28](https://modelcontextprotocol.io/specification/2026-07-28/changelog), proxied as CLI + skill | Direct REST in sandboxed workers | Ecosystem breadth. This revision is stateless and breaking; dynamic client registration deprecated; `iss` validation required | Spec | Copy Meta's split: thin CLI in cell, logic in worker |
| MCP gateway | [agentgateway](https://github.com/agentgateway/agentgateway) | Custom proxy | Central policy point for many MCP servers | Apache-2.0 | README not reviewed in depth; verify before use |
| Credential isolation | [OneCLI](https://github.com/onecli/onecli) gateway plus own `authd` | [Agent Vault](https://github.com/Infisical/agent-vault) (repo says no longer recommended) | Rust MITM gateway injects secrets by host and path; AES-256-GCM at rest. Add surrogate-token swap and per-worker allowlists | Apache-2.0 core; `ee/` paid | Installing a CA breaks pinned clients. Maturity signal only: about 3.6k stars. No third-party review found |
| OAuth broker | Own OAuth client per MCP authorization rules | [Nango](https://github.com/NangoHQ/nango) | Few moving parts, tokens stay in VM | n/a; Elastic 2.0 | Google restricted-scope verification applies to Gmail; budget for it (not researched here) |
| Permissions and approvals | [Cedar](https://github.com/cedar-policy/cedar) + Temporal Update + native client dialog | [OPA](https://github.com/open-policy-agent/opa) | Grants map to policies; approval goes to the policy service, never through the model | Apache-2.0 both | Implement Meta's five grant types |
| Audit log | Append-only Postgres table with hash chain, plus Temporal history | [Langfuse](https://github.com/langfuse/langfuse) for traces (licence not checked) | User-visible and tamper-evident. Meta's log design is undocumented | PostgreSQL | Separate store from cell |
| Memory (facts) | Editable file memory + Postgres table | [Graphiti](https://github.com/getzep/graphiti) | Meta's model is inspectable files. Graphiti adds real [fact invalidation](https://github.com/getzep/graphiti) but needs Neo4j or FalkorDB and reliable structured output | Own code; Apache-2.0 | Graphiti's reference servers have no auth |
| Memory (episodic) | [pgvector](https://github.com/pgvector/pgvector) + Postgres FTS | [Mem0](https://github.com/mem0ai/mem0) | Mem0's [headline scores](https://github.com/mem0ai/mem0) are vendor-published for its managed platform, not the OSS SDK; ADD-only design fits forget poorly | pgvector: GitHub API reports no SPDX id, licence file not read; Apache-2.0 | One small Postgres per VM, or tenant-scoped central. No published benchmark for this design; measure it (section 2.9) |
| Messaging | Own PWA + [Telegram Bot API](https://core.telegram.org/bots/api) + email | [Matrix](https://matrix.org) or Signal via Hermes | Approval must live in your client; chat surfaces deep-link to it | Varies | See WhatsApp below |
| Scheduling | Temporal Schedules, waking the VM | Hermes cron in VM | Outside the VM a schedule survives suspension | MIT | Keep cron in VM only for user-authored scripts |
| Notifications | APNs and FCM via PWA or wrapper apps | [ntfy](https://github.com/binwiederhier/ntfy) | Meta notifies only on meaningful change; gate with worker model | Proprietary services; Apache-2.0 | Web Push varies by platform |
| Voice (Muse has it) | [LiveKit Agents](https://github.com/livekit/agents) + [Parakeet v3](https://huggingface.co/nvidia/parakeet-tdt-0.6b-v3) + [Kokoro](https://huggingface.co/hexgrad/Kokoro-82M) | [Pipecat](https://github.com/pipecat-ai/pipecat) | Interruptible pipeline, background agent continues | Apache-2.0; CC-BY-4.0; Apache-2.0 | GPU recommended. Parakeet English Fleurs WER 4.85% (NVIDIA). Turn detector is under a separate LiveKit Model License |
| Injection classifier | Worker-model judge plus your own ensemble trained on DTap and red-team data | [Llama Prompt Guard 2](https://huggingface.co/meta-llama/Llama-Prompt-Guard-2-86M) in [LlamaFirewall](https://arxiv.org/abs/2505.03574) | Meta trains classifiers separately from the model; do likewise. I found no maintained Apache or MIT detector: [Protect AI v2](https://huggingface.co/protectai/deberta-v3-base-prompt-injection-v2) is archived and English-only | n/a; custom Llama terms, gated | Protect AI's 95.25% accuracy is self-reported |
| High-stakes flows | [CaMeL](https://arxiv.org/abs/2503.18813) capabilities for send and pay | Approval only | Control flow from trusted query only; 77% vs 84% tasks solved on AgentDojo (authors) | [Apache-2.0](https://github.com/google-research/camel-prompt-injection) (repo inactive since 2025) | Research code; re-implement the idea |
| Egress and taint | [Smokescreen](https://github.com/stripe/smokescreen) for SSRF; deny by default | [Tetragon](https://github.com/cilium/tetragon) for eBPF enforcement | Meta's taint uses custom LSM hooks; no off-the-shelf equivalent found. Start with per-tool taint in the policy service | MIT; Apache-2.0 | Kernel taint is a later milestone |
| Payments | None in MVP; then a card issuer's single-use virtual cards | Hand off to user | Meta relies on Stripe Link, a commercial partner | Commercial | Needs provider research |

**Hermes caution.** Its [security docs](https://hermes-agent.nousresearch.com/docs/user-guide/security) say its denylist does not sandbox a hostile agent and that container backends skip dangerous-command checks. So run it inside the cell with no real secrets and enforce everything outside. Do not rely on its approvals. OpenClaw is rejected for now: opt-in sandbox, [a critical RCE and a stream of CVEs](https://aviatrix.ai/threat-research-center/openclaw-ai-agent-security-vulnerabilities-2026) (vendor source), and malicious skills in its marketplace.

### 2.3 WhatsApp

Policy text comes from WebSearch excerpts of Meta pages I did not fetch; read the live [Business Solution Terms](https://www.whatsapp.com/legal/business-solution-terms) section 4.7 and [AI Providers pricing](https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing/ai-providers.md) before relying on this.

| Route | Status | Label |
|---|---|---|
| Business Platform, general-purpose assistant | Barred where AI is the main function (Meta's discretion), since Jan 15, 2026, except where Meta is legally required to allow it | Confirmed (excerpt) |
| EU/EEA | Commission interim measures of Jun 9, 2026 require free access on pre-October 2025 terms ([Houthoff](https://www.houthoff.com/insights/news/a-rare-show-offorce-commission-deploys-interim-measures-against-meta-to-safeguard-ai-competition/), case AT.41034). Meta stopped charging AI Providers there from May 13 ([changelog](https://developers.facebook.com/documentation/business-messaging/whatsapp/changelog)) | Reported; Confirmed (excerpt) |
| Brazil | Permitted with per-message charges for non-template messages | Confirmed (excerpt) |
| United States | Ban not lifted as of late July per a [Forbes council post](https://forbes.com/councils/forbestechcouncil/2026/11/03/ai-is-making-the-app-optional); current position not independently verified | Reported |
| Task-specific business assistant | Support, booking and notifications generally allowed | Reported, multiple vendor blogs |
| Baileys, whatsmeow, mautrix-whatsapp | Unofficial. [Hermes docs mirror](https://hermes-agent.lzw.me/docs/en/user-guide/messaging/whatsapp) warn of ban risk and protocol breakage. Unsuitable for a product | Reported |
| Muse in WhatsApp | First-party; I found no evidence of a Muse-specific clause. Inferred: this is the competitive asymmetry the EU case targets | Inferred |

**Recommendation:** do not make WhatsApp a launch surface outside the EEA. Launch on your own app with approvals in the client. If the team is in the EEA, treat access as subject to the outcome of an open case.

### 2.4 Target architecture

```
Clients: PWA / iOS / Android · Telegram · email · (later) WhatsApp in EEA · Mac
   │  approvals and credential entry only through own client UI
   ▼
Gateway: auth, device-bound session tokens, channel adapters, push
   ▼
Control plane: Temporal (task workflow, schedules, approval waits)
   │          Postgres (task, step, approval, audit) · Cedar policies
   ▼ wake / resume
Per-user Firecracker microVM  (suspended when idle)
 ├─ Runtime cell (nspawn): Hermes, workspace, CLIs, sub-agents, memory files
 │     │ Unix sockets with peer credentials only
 ├─ policyd ("Sentinel"): allow/deny/ask, grants, taint, generates purpose text
 ├─ authd: OAuth tokens, passwords, surrogate tokens
 ├─ workers: sandboxed connector logic with credential allowlists
 ├─ browser broker: CDP owner, Chromium, a11y snapshots, neko takeover
 ├─ safety: injection ensemble, OTP filter, PII egress checks
 └─ egress proxy: OneCLI + Smokescreen rules (default deny, swap surrogates)
   │                                   │
   ▼ inference proxy                   ▼ internet and connectors
Model router: GLM-5.3 / GLM-5.3-Flash (hosted, later vLLM)
```

**Lessons to build in from Muse's published bugs:**

- Never trust a header because it came from localhost ($300k finding).
- Do not let a client preference redirect traffic (Wardle).
- Bind client tokens to device, with limited scope.
- Treat skills as an injection surface, since Meta's own harness regressed there.

### 2.5 Core data model

| Entity | Key fields |
|---|---|
| **Task** | id, userId, goal, parentTaskId, status (`queued, running, waiting_approval, waiting_user, succeeded, failed, cancelled`), workflowId, schedule, budgetTokens, tokensUsed, summary |
| **Step** | id, taskId, seq, agentRole (`main, browser, worker`), model, reasoningEffort, inputTokens, cachedTokens, outputTokens, startedAt, finishedAt, error |
| **ToolCall** | id, stepId, seq, tool, actionClass (`read, write, send, pay, delete`), argsHash, argsRedacted, resultHash, taintedInput, policyDecision (`allow, deny, ask`), approvalId, connectionId, destination |
| **Approval** | id, toolCallId, userId, purposeText (policy-generated, not model-generated), exactActionJson, status, decidedVia, decidedAt, expiresAt |
| **Grant** | id, approvalId, userId, scopeType (`once, session, task, timed, perpetual`), connector, method, destination, constraints, expiresAt, revokedAt |
| **Connection** | id, userId, provider, authType, scopes, readEnabled, writeEnabled, credentialRef (never the secret), surrogateId, status, lastUsedAt |
| **MemoryItem** | id, userId, kind (`fact, preference, episode`), content, durability (`temporary, permanent`), validFrom, validTo, sourceToolCallId, trust (`user, derived, external`), embedding, deletedAt |
| **AuditEvent** | id, userId, taskId, actor (`agent, user, policy, system`), event, payload, prevHash, hash, at |

`MemoryItem.trust` and `sourceToolCallId` let you trace and purge memory poisoned by injected content. Forget must delete the embedding, and also derived summaries.

### 2.6 Cost: all figures unmeasured

Assumptions, all mine: 7:2:1 cached:input:output (AA's reference mix); 20% of tokens on planner, 80% on worker; 4.33 weeks a month; list hosted prices above.

- Blended rates: GLM-5.3 $0.90, Flash $0.10 per 1M (both match AA); routed $0.26 per 1M.
- Real cache hit rates after idle gaps may be much lower. Reasoning tokens bill as output and could push this up considerably.

| Task type (token count is a guess) | Tokens | LLM cost |
|---|---|---|
| Single connector action | 100k | $0.03 |
| 30-step browser task at 50k context | 1.5M | $0.39 |
| Long research with sub-agents | 10M | $2.61 |

| Active user per month | Tokens/week | LLM | VM | Control plane | Total |
|---|---|---|---|---|---|
| Light | 5M | $5.70 | $5 | $1 | **about $12** |
| Typical | 20M | $22.60 | $8 | $2 | **about $33** |
| At Muse's free cap | 100M | $113 | $12 | $3 | **about $128** |

**VM basis:** a 2 vCPU, 8 GB dedicated server costs roughly [€27–43 a month](https://spendark.com/instances/ccx13/) after Hetzner's June rise (sources conflict); I assume suspension to about 15% duty cycle, plus storage. Residential proxies, Google verification and support are excluded.

**Self-hosting:** an 8× H200 node at the [$6.06 mean GPU-hour](https://www.thundercompute.com/blog/nvidia-h200-pricing) is about $35,400 a month ($22,500 at $3.85). Parity with hosted GLM-5.3 is about 39B tokens a month, or about 2,300 typical users, if one node can serve that, which is untested. Worker parity is about 350B tokens a month, so keep Flash hosted for a long time.

**Inferred from Muse's caps:** at Meta's public rates, the $20 plan's cap (about 2.2B tokens a month) would list at about $1,690 on Spark 1.3 or $90 at the contributor rate. So either most users stay far below caps, Meta's internal cost is far under list, Muse counts tokens differently, or a mix. **Unknown** which.

### 2.7 MVP-first build order

| # | Milestone | Exit test |
|---|---|---|
| 0 | Eval harness and model bake-off (GLM-5.3, Flash, Spark Open, Qwen 27B) | [DTap](https://pypi.org/project/decodingtrust-agent-sdk) and [AgentDojo](https://github.com/ethz-spylab/agentdojo) baselines recorded at low and high effort; model chosen on data |
| 1 | Single-user cell: microVM, nspawn, Hermes, hosted LLM, Gmail read-only | Canary test: the real OAuth token never appears in cell memory, disk, logs or model context; all non-allowed egress is blocked |
| 2 | Policy service, native approval dialog, grants, audit | Injected "the user approved this" email cannot trigger a send; each send has a matching approval and audit chain that verifies |
| 3 | Durable tasks on Temporal | Kill the VM mid-task: it resumes without duplicate side effects; a 3-day approval wait survives; a schedule wakes a suspended VM |
| 4 | Browser sub-agent, broker, takeover, credential fill | 30 scripted tasks on real sites hit the target; no JS tool reachable; agent demonstrably paused during takeover; DTap browser ASR at or below target |
| 5 | Surfaces: PWA and push, Telegram, email | Task started in Telegram; approval only possible in client; push only on meaningful change in a 1-week dogfood |
| 6 | Memory with inspect, edit, forget | Forgotten fact absent from retrieval and summaries; injected "remember" from a web page is stored as low trust and not used for actions |
| 7 | Multi-tenant hardening and limited beta | Cross-tenant test suite passes; external pen test; token budget stops work cleanly |
| 8 | Classifier ensemble, tool-level taint, send-and-pay capabilities | ASR improves over milestone 4 with false-positive target met |
| 9 | Later: Mac client, voice, payments, kernel taint | Mac client threat-modelled against Wardle's attack; voice round trip under about 1 s |

### 2.8 Where an open stack probably falls short

| Area | Assessment | Basis |
|---|---|---|
| Model injection resistance | Likely worse without tuning | Kimi K3 at 59–62%; GLM-5.3 and Flash unmeasured; **cannot assess** until tested |
| Long-horizon reliability | Probably somewhat behind Spark 1.3 and clearly behind Wonder | AA and Meta benchmarks; no neutral personal-agent eval |
| Memory quality | Behind on behaviours Meta trained in (staleness, temporary vs permanent) | Inference from [Meta's post](https://research.meta.ai/blog/specialized-models-for-muse-and-metaai); Meta's evals are internal |
| Kernel taint tracking | Custom engineering | Meta added LSM hooks |
| Partner connectors and purchase protection | Commercial, not technical | Meta negotiated partners and Stripe Link cover |
| Distribution and data | WhatsApp, Instagram and Facebook connectors, malicious-site list | Platform owner advantage |
| Voice and avatar | Behind Meta's 870 ms avatar pipeline | Open components exist, but no comparable combined system verified |
| Unit economics | Likely worse at Muse's generous caps | Section 2.6 |
| Harness safety engineering | **Reachable**: design is published and the primitives are open | Section 1.3 |
| Actual end-user task success | **Cannot assess**: Meta publishes no rate, and independent tests are anecdotal | Section 1.1 |

### 2.9 Evaluation plan

| Measure | Method | Initial target (my proposal, unmeasured) |
|---|---|---|
| Task success | 50 personal tasks with verifiable end states across email, calendar, research, booking; plus OSWorld-Verified, DeepSearchQA, MCP-Atlas subsets. Human-scored sample | 70% unattended, 85% with one clarification |
| Unsafe actions | Irreversible-action canaries: unapproved send, pay, delete; DTap direct misuse | 0 without approval across 500 runs; misuse ASR at or below 10% |
| Injection resistance | DTap IPI, AgentDojo, Gray Swan arena sets if accessible. Test tool output and tool description separately: [44.9% of model pairs reorder](https://neurips.cc/virtual/2026/168185) between surfaces. Report by k attempts | Tool at or below 10%, browser at or below 20% at launch; compare with Muse's 4% and 10%. Exfiltration blocked by design regardless |
| Latency | Time to first token, first action, task completion by reasoning effort | Chat first token under 3 s; approval dialog under 1 s after action |
| Cost | Tokens, cache hit, VM minutes per task and per user | Within 25% of section 2.6, or revise pricing |
| Forget and memory | LoCoMo-style recall, [Mem0's open benchmark](https://github.com/mem0ai/mem0) framework, forget verification | Baseline first; 100% forget propagation |

Run on every model, harness or skill change. Keep a holdout attack set. I did not verify DTap's licence.

### 2.10 Licence traps

- **GLM-5.3 is not MIT**, despite looking like it. Flash and GLM-5.2 are tagged MIT. NVIDIA's NVFP4 build [adds the NVIDIA Open Model Agreement](https://huggingface.co/nvidia/GLM-5.3-NVFP4).
- **Muse Spark Open:** mandatory attribution, usage policy, derivatives defined to include models improved with its outputs ([VentureBeat](https://venturebeat.com/technology/meta-unveils-muse-spark-open-the-new-top-u-s-open-weights-model-and-it-runs-on-two-paired-mac-desktops)), and a personal-data form to download.
- **Kimi K3:** UI display rule above 100M MAU or $20M monthly revenue. K3.1 Pro's licence tag is "other"; unread.
- **MaaS clauses** exclude end-user products with embedded model features, but check before reselling API access. Meta's and Moonshot's thresholds are $20M; Z.ai's is $10B.
- **Source-available, not open source:** [Nango](https://github.com/NangoHQ/nango) (Elastic 2.0), [Inngest](https://github.com/inngest/inngest) (SSPL with future Apache), [Restate](https://github.com/restatedev/restate) (BSL), [FalkorDB](https://github.com/FalkorDB/FalkorDB) (SSPL).
- **Copyleft:** Neo4j Community (GPL-3.0), [Honcho](https://github.com/plastic-labs/honcho) (AGPL, optional in Hermes), mautrix-whatsapp (AGPL), parts of cua (AGPL, FSL).
- **Open-core:** OneCLI and Mastra `ee/`; Agent Vault `ee/`.
- **Model terms:** Llama Guard and Prompt Guard use Llama community licences. PersonaPlex is tagged "other". Parakeet and Moshi need CC-BY attribution.
- **Not licences, but legal:** site terms still apply to browsing agents. Amazon's injunction against Perplexity's Comet was [reported vacated](https://www.retail-insight-network.com/news/us-court-overturns-amazon-injunction-perplexity/) in August, while the case continues; I read no opinion. Get legal advice.

### 2.11 Exponential fit (brief)

No assumption this ships in Exponential. From [AGENT_RUNS.md](../../dev-docs/AGENT_RUNS.md) and a read-only look at `../mastra`.

| Need | Exists | Reuse | Missing |
|---|---|---|---|
| Task/run record | `AgentRun`, `AgentRunEvent`, statuses, transcript | Yes, as Task and Step starting point | Per-tool action class, tokens per step |
| Human wait | `WAITING_ON_OWNER`, `ask-owner`, resume as new run | Partly | Out-of-band dialog; question is a comment, the channel Meta avoids for consent |
| Least-privilege tools | Tool allow-list, per-run JWT, shadow user | Yes, as pattern | Per-connector policy and grants |
| Local execution | `LOCAL_CLI` runner protocol | Yes, for a Mac client shape | Device-bound tokens |
| Inbox and notifications | Delegated tab, `agent_run` notifications | Yes | Mobile push parity not checked |
| Channels | Mastra gateways for Matrix, Telegram, Signal, voice, WhatsApp | Yes, except WhatsApp: it depends on Baileys | Policy-compliant WhatsApp |
| Scheduling | Mastra `proactive/` scheduler, Vercel cron sweep | Partly | Durable multi-day workflows |
| Memory | Mastra thread-scoped observational memory, Postgres | Partly | Cross-thread memory, user-editable store, forget |
| Execution time | 300 s function, `maxSteps: 12` | No | Long-running runtime; Vercel cannot host it |
| Isolation | None per user | No | MicroVM, cell, egress proxy, credential broker, browser |
| Audit | Run events | Partly | Tamper-evident log |

Local mastra checkout is on branch `crisp.vapor-ideate-features-tool` (last commit 2026-07-26) and contains no `assistantRunAgent`, so I could not verify run tools there. The app repo's licence file is AGPL-3.0; check the implications before mixing with proprietary code.

## Open questions

1. Is a strict reading of Meta's robots notice right for `developer.meta.com` and `ai.meta.com`? A person can read those pages, plus Meta's terms, privacy, help pages and the WhatsApp terms.
2. Do `introducing.muse.ai` and `security.muse.ai` add design detail beyond the research post? Unread by rule. A human should check them.
3. Mac app: control mechanism and Sentinel coverage for local actions.
4. How do approvals work from WhatsApp?
5. Has Confidential VM shipped? What is memory and trajectory retention?
6. Which checkpoint runs in Muse after Nov 6? What do Sentinel and `hatch-safety` run on?
7. Actual token use per task and per active user; how Muse counts tokens.
8. GLM-5.3 and Flash injection resistance, and latency at low reasoning effort.
9. Does the team accept Chinese-origin weights and which hosts meet its data terms? This is a business and compliance decision that may change the primary model.
10. Current WhatsApp terms by market, read from the live documents.

## Sources

**Meta, fetched:**
[Muse launch](https://about.fb.com/news/2026/09/introducing-muse-personal-ai-agent/) ·
[How We Built Safety Into Muse](https://research.meta.ai/blog/security-and-safety-for-ai-agents-our-approach-with-muse) ·
[Spark 1.3 blog](https://research.meta.ai/blog/introducing-muse-spark-1-3) ·
[Spark 1.3 evaluation report](https://research.meta.ai/static/muse-spark-1-3-evaluation-report) ·
[Model page](https://dev.meta.ai/models/muse-spark) ·
[Docs](https://dev.meta.ai/docs/) ·
[Computer use](https://dev.meta.ai/docs/computer-use) ·
[Pricing](https://dev.meta.ai/docs/pricing-rate-limits) ·
[Muse Code permissions](https://dev.meta.ai/docs/muse-code/permissions) ·
[Connectors](https://dev.meta.ai/products/connectors) ·
[Multi-agent cookbook](https://dev.meta.ai/docs/cookbook/multi-agent-orchestration) ·
[Spark Open deploy](https://dev.meta.ai/docs/muse-spark-open/deploy) ·
[Spark Open hardware](https://dev.meta.ai/docs/muse-spark-open/hardware-platforms) ·
[Spark Open post](https://research.meta.ai/blog/muse-spark-open) ·
[Glimmer post](https://research.meta.ai/blog/introducing-muse-glimmer-open-agentic-model) ·
[Wonder research post](https://research.meta.ai/blog/muse-wonder) ·
[Wonder Newsroom](https://about.fb.com/news/2026/10/introducing-muse-wonder-models/) ·
[Specialized models](https://research.meta.ai/blog/specialized-models-for-muse-and-metaai) ·
[Realtime avatar](https://research.meta.ai/blog/bringing-your-muse-to-life) ·
[Irregular incident](https://research.meta.ai/blog/addressing-third-party-testing-misconfiguration-muse-spark-1-1) ·
[Voice](https://about.fb.com/news/2026/11/introducing-muse-ai-voice-expressive-avatars/) ·
[Spaces](https://about.fb.com/news/2026/11/introducing-spaces-customize-muse-app/) ·
[Connect recap](https://about.fb.com/news/2026/09/the-biggest-news-from-connect-2026/) ·
[Small business](https://about.fb.com/news/2026/09/introducing-muse-small-business/) ·
[Singapore](https://about.fb.com/news/2026/10/muse-is-now-available-in-singapore-the-worlds-first-personal-ai-agent-built-for-everyone/) ·
[Japan](https://about.fb.com/ja/news/2026/10/muse-personal-ai-agent-launches-in-japan/) ·
[July agentic Meta AI](https://about.fb.com/news/2026/07/meta-ai-muse-spark-doesnt-just-think-it-acts/) ·
[Safety report, arXiv abstract only](https://arxiv.org/abs/2606.12429) ·
[Spark Open card](https://huggingface.co/meta-models/Muse-Spark-Open-816B-A42B) ·
[Glimmer card](https://huggingface.co/meta-models/Muse-Glimmer-30B)

**Meta, WebSearch output only, not fetched:**
[Build with Muse Spark](https://developer.meta.com/ai/resources/blog/build-with-muse-spark/) ·
[Muse page](https://ai.meta.com/muse/) ·
[Download](https://ai.meta.com/muse/download/) ·
[WhatsApp Business Solution Terms](https://www.whatsapp.com/legal/business-solution-terms) ·
[AI Providers pricing](https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing/ai-providers.md) ·
[WhatsApp changelog](https://developers.facebook.com/documentation/business-messaging/whatsapp/changelog)

**App listing:** [App Store](https://apps.apple.com/us/app/muse-from-meta/id6760173601)

**Third party, news and hands-on:**
[CNBC](https://www.cnbc.com/2026/09/08/meta-personal-ai-agents-public-reckoning-privacy-safety.html) ·
[Reuters via AOL](https://www.aol.com/articles/meta-launches-ai-agent-access-190442000.html) ·
[TechCrunch](https://techcrunch.com/2026/09/18/metas-muse-hits-mac-letting-the-ai-take-actions-on-your-computer/) ·
[The Batch](https://www.deeplearning.ai/the-batch/how-to-secure-agents-for-the-masses) ·
[Yahoo Finance](https://finance.yahoo.com/technology/article/metas-muse-is-an-impressively-capable-ai-agent-despite-some-hiccups-173310662.html) ·
[Lenny's Newsletter](https://www.lennysnewsletter.com/p/how-i-ai-metas-muse-review-how-warp) ·
[VentureBeat on security](https://venturebeat.com/security/meta-patched-muses-zero-day-but-security-teams-still-lack-visibility-into-what-the-agent-can-access) ·
[VentureBeat on Spark Open](https://venturebeat.com/technology/meta-unveils-muse-spark-open-the-new-top-u-s-open-weights-model-and-it-runs-on-two-paired-mac-desktops) ·
[The Hacker News](https://thehackernews.com/2026/09/one-hidden-meta-muse-setting-could-let.html) ·
[The Register](https://www.theregister.com/ai-and-ml/2026/09/21/meta-muse-ai-app-flaw-lets-local-malware-redirect-dictation-traffic/5297980) ·
[eWeek](https://www.eweek.com/news/meta-muse-300000-bug-bounty-security-flaw/) ·
[Audit Commons](https://auditcommons.org/news/meta-muse-bug-bounty-disclosure/) ·
[Implicator](https://www.implicator.ai/meta-muse-ai-agent-internal-security-flaws/) ·
[NeoTeo](https://www.neoteo.com/en/a-meta-muse-hands-on-review-found-task-help-and-data-prompts)

**Third party, lower confidence:**
[Carly pricing](https://www.usecarly.com/blog/meta-muse-pricing/) ·
[remio on Mac](https://www.remio.ai/post/meta-muse-for-mac-can-act-across-your-desktop-but-permission-is-the-product) ·
[remio on flaw](https://www.remio.ai/post/meta-muse-security-warning-follows-a-flaw-that-turned-the-agent-into-a-backdoor) ·
[CodeMyPixel](https://codemypixel.com/blog/meta-muse-personal-ai-agent-1-billion-tokens)

**Models and data:**
[GLM-5.3](https://huggingface.co/zai-org/GLM-5.3) ·
[GLM-5.3-Flash](https://huggingface.co/zai-org/GLM-5.3-Flash) ·
[Qwen3.8-27B](https://huggingface.co/Qwen/Qwen3.8-27B) ·
[Kimi K3](https://huggingface.co/moonshotai/Kimi-K3) ·
[vLLM GLM-5.3 recipe](https://recipes.vllm.ai/zai-org/GLM-5.3.md) ·
[vLLM Flash recipe](https://recipes.vllm.ai/zai-org/GLM-5.3-Flash.md) ·
[vLLM Qwen recipe](https://recipes.vllm.ai/Qwen/Qwen3.8-27B.md) ·
[AA GLM-5.3](https://artificialanalysis.ai/models/glm-5-3) ·
[AA Flash](https://artificialanalysis.ai/models/glm-5-3-flash) ·
[AA Spark Open](https://artificialanalysis.ai/models/muse-spark-open) ·
[AA Qwen](https://artificialanalysis.ai/models/qwen3-8-27b) ·
[AA Kimi K3](https://artificialanalysis.ai/models/kimi-k3) ·
[OpenRouter models API](https://openrouter.ai/api/v1/models)

**Security and evaluation:**
[CaMeL](https://arxiv.org/abs/2503.18813) ·
[LlamaFirewall](https://arxiv.org/abs/2505.03574) ·
[PurpleLlama](https://github.com/meta-llama/PurpleLlama) ·
[Protect AI v2](https://huggingface.co/protectai/deberta-v3-base-prompt-injection-v2) ·
[AgentDojo](https://github.com/ethz-spylab/agentdojo) ·
[DTap SDK](https://pypi.org/project/decodingtrust-agent-sdk) ·
[DTap dataset](https://huggingface.co/datasets/AI-Secure/DecodingTrust-Agent-Platform) ·
[Surfaces study](https://neurips.cc/virtual/2026/168185) ·
[Lethal trifecta](https://simonwillison.net/2025/Jun/16/the-lethal-trifecta/) ·
[CSA on Hermes](https://labs.cloudsecurityalliance.org/research/csa-research-note-hermes-agent-cves-20260504-csa-styled/) ·
[Aviatrix on OpenClaw](https://aviatrix.ai/threat-research-center/openclaw-ai-agent-security-vulnerabilities-2026)

**Tooling:**
[Hermes](https://github.com/NousResearch/hermes-agent) and [its security docs](https://hermes-agent.nousresearch.com/docs/user-guide/security) ·
[OpenClaw](https://github.com/openclaw/openclaw) ·
[Temporal docs](https://docs.temporal.io/evaluate/understanding-temporal) ·
[Firecracker](https://github.com/firecracker-microvm/firecracker) ·
[Playwright MCP](https://github.com/microsoft/playwright-mcp) ·
[browser-use](https://github.com/browser-use/browser-use) ·
[Steel](https://github.com/steel-dev/steel-browser) ·
[cua](https://github.com/trycua/cua) ·
[OneCLI](https://github.com/onecli/onecli) ·
[Agent Vault](https://github.com/Infisical/agent-vault) ·
[Nango](https://github.com/NangoHQ/nango) ·
[Mem0](https://github.com/mem0ai/mem0) ·
[Graphiti](https://github.com/getzep/graphiti) ·
[LiveKit Agents](https://github.com/livekit/agents) ·
[Parakeet v3](https://huggingface.co/nvidia/parakeet-tdt-0.6b-v3) ·
[MCP changelog](https://modelcontextprotocol.io/specification/2026-07-28/changelog)

**Policy and cost:**
[Houthoff on the EC order](https://www.houthoff.com/insights/news/a-rare-show-offorce-commission-deploys-interim-measures-against-meta-to-safeguard-ai-competition/) ·
[Forbes council post](https://forbes.com/councils/forbestechcouncil/2026/11/03/ai-is-making-the-app-optional) ·
[Hermes WhatsApp docs mirror](https://hermes-agent.lzw.me/docs/en/user-guide/messaging/whatsapp) ·
[Retail Insight on Comet](https://www.retail-insight-network.com/news/us-court-overturns-amazon-injunction-perplexity/) ·
[Thunder Compute H200](https://www.thundercompute.com/blog/nvidia-h200-pricing) ·
[Spendark CCX13](https://spendark.com/instances/ccx13/)

**Referenced but not read, per the access rules:** `security.muse.ai`, `introducing.muse.ai`, `muse.ai/blog/securing-muse`, `muse.ai/platform`.
