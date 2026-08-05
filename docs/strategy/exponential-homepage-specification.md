# Exponential Homepage Specification

**Status:** Proposed  
**Audience:** Product, design, engineering, and go-to-market  
**Strategic source of truth:** [Exponential Product Strategy — One Page](./exponential-product-strategy-one-pager.md)  
**Category:** The open control plane for AI-native companies  
**Operating method:** The Exponential Steering Loop

## 1. Purpose

The homepage must make one idea clear within five seconds:

> Exponential gives a company one place to turn its goals into accountable weekly work for people and AI agents.

The page should sell a new operating method, not the breadth of a project-management suite. Its job is to help the right visitor recognize their problem, understand the Exponential Steering Loop, see credible product evidence, and take one next step.

### Primary visitor

A founder or technical/product leader at a 5–50 person, AI-native product company that already delegates meaningful work to multiple coding, research, support, or operations agents.

They arrive with three beliefs:

- agents can already execute useful work;
- their company's direction and context are fragmented across tools and conversations;
- adding more agents without stronger accountability will create drift, not leverage.

### Conversion goal

The primary conversion is **starting a first Exponential Steering Loop**. In the current product this may begin with account creation; the CTA must land on the shortest available path to creating a company goal and connecting or assigning an agent.

The secondary conversion is **evaluating the open-source product** through GitHub and the deployment documentation.

### Non-goals

The homepage is not:

- a catalogue of every Exponential module;
- a generic pitch to all teams, organizations, or knowledge workers;
- an agent marketplace or a promise that Exponential supplies all the agents;
- a conventional project-management comparison page;
- a place for unverified customer logos, testimonials, usage counts, or savings claims.

## 2. Message architecture

The page should answer these questions in order:

1. **What is it?** The open control plane for AI-native companies.
2. **Why now?** AI made execution abundant; direction and accountability became the constraint.
3. **How does it work?** The five-stage Exponential Steering Loop.
4. **Can I see it?** A real goal-to-review workflow in the product.
5. **Will I keep control?** Named agents, governed access, attributable work, and human judgment.
6. **Will it fit my stack?** Open interfaces, open source, and a choice of deployment.
7. **Is it for me?** A narrow fit statement for companies already using agents.
8. **What do I do next?** Start a loop or inspect the source.

The page should feel calm, operational, and specific. Avoid futuristic spectacle, anthropomorphic agent imagery, and generic claims about transformation.

## 3. Language system

### Required terms

| Concept | Use | Do not lead with |
| --- | --- | --- |
| Category | **The open control plane for AI-native companies** | OS, operating system, workspace, coordination layer |
| Operating method | **The Exponential Steering Loop** | workflow, flywheel, management cycle |
| Direction | company goals | outcomes as the top-level marketing noun |
| Near-term intent | weekly priorities or weekly commitments | task list, sprint backlog |
| Execution | delegated work | AI does everything, autonomous workforce |
| Human role | steer exceptions; apply judgment | keep an eye on AI, supervise every task |
| Evidence | progress, artifacts, decisions, review | productivity, activity volume |
| Openness | open source; AGPL-3.0; run on your infrastructure | free software as the main value proposition |

“Control plane” must always be translated on the same screen into plain language. It describes the stable layer that holds company direction, delegation, authority, evidence, and review while the mix of agents changes.

“Self-hosted” is acceptable as a familiar deployment keyword, but it must not be used as shorthand for sovereignty. Where space permits, prefer: **“Run Exponential on your own infrastructure and control your data, updates, and integrations.”** Only use **“sovereign installation”** when the documented deployment actually meets the definition in `CONTEXT.md`.

### Voice

- Direct: “Set company goals,” not “Unlock goal-setting capabilities.”
- Concrete: name the object, actor, action, and evidence.
- Assured, not absolute: “surface the work that needs judgment,” not “eliminate coordination overhead.”
- Human-centered: agents execute; accountable humans own direction and decisions.
- Technical enough to be credible, but intelligible to a founder who does not use infrastructure jargon.

### Claims to avoid

Remove or do not introduce:

- “The OS for AI-native organizations.”
- “Where humans and AI build together.”
- “AI handles execution” without describing delegation, boundaries, and human responsibility.
- “No status meetings” or “no coordination overhead.”
- “Trusted by 50+ AI-first teams” unless the number and definition are documented.
- placeholder company logos or invented testimonials.
- “$0/month, full platform access” while the hosted product is described elsewhere as paid.
- native MCP, universal agent compatibility, an attention queue, approvals, cost controls, or other capabilities before they are demonstrably shipped.

## 4. Page structure and draft copy

### 4.1 Header

**Purpose:** Orient visitors and preserve one dominant action.

**Desktop navigation:** Product · Steering Loop · Open Source · Docs · Pricing (only when current and truthful)  
**Right side:** Sign in · **Start your steering loop**  
**Mobile:** The same destinations in an accessible menu; keep the primary CTA visible.

Do not use feature mega-menus on the first version. “Product” may anchor to the product-proof section. “Open Source” should lead to the repository or a focused open-source page, not a generic resources menu.

### 4.2 Hero

**Purpose:** Establish category, promise, mechanism, and trust above the fold.

**Eyebrow**  
THE OPEN CONTROL PLANE FOR AI-NATIVE COMPANIES

**H1**  
Run your company with AI agents—without losing the plot.

**Supporting copy**  
Set company goals, commit the week, delegate work to people or agents, and see exactly where human judgment is needed.

**Primary CTA**  
Start your steering loop

**Secondary CTA**  
See how it works

**Developer link**  
View on GitHub

**Trust line**  
AGPL-3.0 open source · Managed cloud or your infrastructure · API and CLI

**Visual:** A real, legible product composition showing one company goal, its current weekly commitment, work assigned to a named agent, and a human decision or review. The connection between objects matters more than the number of objects. Do not use a decorative dashboard, stock illustration, or autonomous-agent animation.

**Behavior:** On desktop, the visual may reveal the chain in three short steps. On reduced-motion or mobile, show a static composition. Every label must remain readable without zooming.

**Truth gate:** If “Start your steering loop” still lands on a generic sign-in screen, carry the visitor's intent through authentication and open the first-loop onboarding flow afterward. Until that path exists, use **“Try Exponential”** but retain “Start your steering loop” as the destination's heading.

### 4.3 Honest proof strip

**Purpose:** Replace fabricated social proof with inspectable facts.

Use up to four items, each linked to evidence:

- Open source under AGPL-3.0
- Deploy on your infrastructure
- Connect through the Exponential CLI
- Built in public on GitHub

Repository stars, contributors, releases, customers, or completed loops may be added only from a live or routinely verified source. Do not render empty logo slots.

### 4.4 Problem and market shift

**Eyebrow**  
WHY NOW

**H2**  
Execution is abundant. Direction is scarce.

**Body**  
Your agents can write code, research a market, and operate workflows. But every new executor creates more delegation, more handoffs, and more chances to drift from what the company actually needs. Project trackers record activity. Agent platforms run agents. Neither gives the company a shared way to set direction, govern the work, and learn each week.

**Visual:** A restrained contrast: fragmented goals, agent conversations, and task tools converging into one connected company loop. Prefer a product-derived diagram over floating logos.

### 4.5 The Exponential Steering Loop

**Eyebrow**  
THE EXPONENTIAL STEERING LOOP

**H2**  
A weekly operating loop for humans and agents.

**Supporting copy**  
The cadence is weekly. Attention is continuous. Every commitment connects to a company goal, every delegated action has a responsible human, and every review improves the next loop.

Show five stages as one continuous sequence:

1. **Set goals** — Make the company's direction explicit.
2. **Commit the week** — Choose a small set of priorities and accountable owners.
3. **Delegate work** — Assign linked work to people or named agents with clear boundaries.
4. **Steer exceptions** — Bring blockers, ambiguity, approvals, and risk to the humans who can decide.
5. **Review progress** — Examine evidence, record what moved, and steer the next week.

**Interaction:** Selecting a stage updates one shared product visual and a short explanation. The controls must be buttons, keyboard accessible, and usable without auto-advance. Do not turn this into a five-slide marketing carousel.

**Capability gate:** A stage may be shown as a product claim only when the corresponding workflow is usable. If exception handling is not yet a distinct surface, show it as the operating method and label the current mechanism accurately—for example, “blockers and decisions stay attached to the work”—rather than depicting an unshipped queue.

### 4.6 One undeniable product workflow

**Eyebrow**  
FROM DIRECTION TO EVIDENCE

**H2**  
Every action traces back to a company goal.

**Body**  
Follow the work from the reason it exists to the evidence that it moved. People and agents share the same direction without becoming interchangeable.

Use one real, dogfooded scenario throughout:

> **Company goal:** Make the first Exponential Steering Loop undeniable  
> **Weekly commitment:** Let a founder connect an agent and complete a first loop within 24 hours  
> **Delegated work:** Improve agent onboarding  
> **Executor:** A named external coding agent  
> **Evidence:** Pull request, activity update, or shipped artifact  
> **Human decision:** Accept, redirect, or resolve an exception  
> **Review:** Record progress and the lesson for next week

**Presentation:** Use either a scroll-linked sequence of real screenshots or one interactive product frame. Limit the story to 4–6 frames. Each frame must show the relationship to the same goal; do not use the current broad, 24-slide feature tour.

**CTA beneath proof:** Explore the product

### 4.7 Human control and agent accountability

**Eyebrow**  
HUMANS STEER BY EXCEPTION

**H2**  
Your agents do the work. Your team keeps control.

**Supporting copy**  
Give every external agent its own identity and the access it needs. See what it changed, revoke access when the work is done, and keep a responsible human attached to every commitment.

Use four concrete proof cards:

- **Named identity** — Agent work appears under the agent, not as an impersonated human.
- **Governed access** — Agent access is limited to chosen workspaces, and keys can be revoked individually.
- **Attributable activity** — Updates and artifacts retain who or what produced them.
- **Human responsibility** — Direction and consequential decisions remain owned by people.

Only describe fine-grained scopes, approval policies, cost controls, or full audit retention when those controls are released and documented.

### 4.8 Open and agent-agnostic

**Eyebrow**  
ANY AGENT. ONE COMPANY.

**H2**  
Bring your agents. Keep your company context.

**Body**  
Exponential is the stable company layer beneath a changing agent stack. Connect external agents through open interfaces, keep work and decisions in one inspectable system, and change execution tools without rebuilding company memory.

**Current proof:** Link the CLI, API documentation that external agents can actually use, the OpenClaw integration, and the source repository.

**Compatibility display:** Show only verified paths as “Available.” Put documented work that is not released—such as a native MCP interface—under “Planned” or omit it. Logos for Codex, Claude Code, Agno, CrewAI, or Hermes must mean a tested connection path, not merely theoretical API compatibility.

**CTAs**  
Read the agent docs · View the CLI

### 4.9 Fit statement

**H2**  
Built for companies already working with agents.

**Body**  
Exponential is for founder-led product teams that have moved beyond experimenting with AI. You already delegate real work to multiple agents. Now you need company goals, agent work, evidence, and human decisions to stay connected.

**Positive fit signals:** 5–50 people; multiple agents in real workflows; fragmented context; a need for APIs, source access, or deployment control.

**Not the acquisition story:** personal productivity, teams looking for their first chatbot, traditional PMO portfolio management, or buyers primarily comparing generic task-management features.

Avoid multiple persona cards. One narrow fit statement makes the positioning stronger.

### 4.10 Category boundary

**H2**  
Not another agent framework. Not another project tracker.

Use a compact three-column comparison:

| | Agent platforms | Project trackers | Exponential |
| --- | --- | --- | --- |
| Primary job | Build and run agents | Organize projects and tasks | Direct and govern company work |
| Stable object | Agent runtime | Project or issue | Company goal and weekly commitment |
| Human role | Developer/operator | Assignee/manager | Sets direction and steers exceptions |
| Loop closes at | Agent output | Task completion | Evidence, decision, and weekly review |

Keep the comparison categorical. Do not name competitors or claim they lack individual features without a maintained comparison page and evidence.

### 4.11 Open source and deployment

**Eyebrow**  
OPEN BY DESIGN

**H2**  
Inspect it. Extend it. Run it where you choose.

**Body**  
Exponential's core is open source under AGPL-3.0. Run it on your own infrastructure and control your data and update timing, or use the managed service for hosting, upgrades, backups, integrations, and support.

**CTAs**  
View the source · Read the deployment guide

**Proof:** Show the real license, repository, deployment documentation, release activity, and export capabilities. Do not describe a deployment as sovereign until identity, storage, keys, backups, exports, update timing, and optional external services satisfy the project definition.

### 4.12 Pricing or engagement model

Show pricing only when the hosted offer, limits, billing state, and licensing page agree. Until then, replace the current `$0/month` card with one of:

- **Start with the open-source product** / **Talk to us about managed Exponential**, or
- a design-partner invitation for teams already using multiple agents.

Do not use “free forever” for the hosted service unless that plan is operationally committed and documented.

### 4.13 Final CTA

**H2**  
Give your agents a company to work for.

**Body**  
Set the direction, commit the week, and keep people and agents accountable to the same goals.

**Primary CTA**  
Start your steering loop

**Secondary CTA**  
View on GitHub

### 4.14 Footer

Keep the footer compact and confidence-building:

- Product: Steering Loop, agent access, changelog
- Developers: Docs, API, CLI, GitHub
- Company: About, contact, security, privacy, terms
- Deployment: Managed, deployment guide, licensing

Show the AGPL-3.0 license and current repository link. Do not add empty social channels or resource pages.

## 5. Proof policy

Every proof item must have:

1. a named owner;
2. a source URL or product state;
3. a definition and “as of” date for quantitative claims;
4. a review cadence if it can become stale.

Use this order of preference:

1. live product evidence from Exponential's own Steering Loop;
2. inspectable technical evidence—source, docs, releases, APIs;
3. named customer evidence with explicit permission;
4. measured aggregate claims with a documented query.

If evidence is unavailable, remove the block. Never fill it with fictional names, logos, or numbers.

## 6. Visual and interaction direction

- The visual grammar should be connected objects and explicit lineage, not feature tiles.
- Use one accent to show the active stage and one treatment to show items requiring human judgment.
- People and agents need visibly distinct but equally attributable identities.
- Screenshots must contain representative, internally consistent data and be refreshed when the product UI materially changes.
- Animation should explain state change. Respect `prefers-reduced-motion` and never require animation to understand the loop.
- Avoid carousels that auto-advance, tiny UI montages, chat bubbles as the dominant product metaphor, humanoid robots, and generic glowing-orb imagery.

## 7. SEO and distribution

### Metadata

**Title**  
Exponential — The Open Control Plane for AI-Native Companies

**Description**  
Turn company goals into accountable weekly work for people and AI agents. Set direction, delegate work, steer exceptions, and review progress in one open system.

**Suggested H1:** exactly one, using the hero copy above.

### Search themes

Use naturally in body copy and supporting pages, not as a keyword list:

- run a company with AI agents;
- AI agent governance;
- human-agent work management;
- open-source AI work management;
- self-hosted AI project management;
- AI agent accountability.

Add `Organization` and `SoftwareApplication` structured data with truthful license, pricing, operating-system, and offer fields. The homepage should link to machine-readable agent documentation (`llms.txt`) and the repository.

## 8. Analytics and success criteria

### Events

- `home_primary_cta_clicked` with placement and destination;
- `home_github_clicked` with placement;
- `home_loop_stage_viewed` with stage and interaction source;
- `home_product_story_completed`;
- `home_agent_docs_clicked`;
- `home_deployment_clicked`;
- `home_signup_started` and `home_signup_completed` with preserved acquisition source;
- product-side `first_goal_created`, `first_agent_connected`, and `first_loop_completed`.

Do not measure scroll depth as the primary signal. The meaningful funnel is:

> qualified visit → start intent → account or deployment → first goal → first connected agent → first completed Steering Loop → consecutive weekly loops

### Initial success criteria

- In a five-second test, target visitors can state what Exponential is, who it is for, and why it differs from an agent framework or tracker.
- The hero primary CTA produces a measurable increase in qualified start intent without reducing GitHub evaluation.
- New users can complete a first loop and connect an agent within 24 hours.
- The product records growth in companies completing the Steering Loop in consecutive weeks.

Set numeric conversion targets only after a clean baseline exists; do not invent targets from contaminated traffic.

## 9. Delivery process and review gates

Use this process for the homepage redesign:

### Gate 1 — Decision brief

Agree on the primary visitor, their existing behavior, the one problem, the promise, the primary conversion, and explicit non-goals. Any section that serves a different buyer is removed or moved to a supporting page.

**Output:** one-page decision brief.  
**Approvers:** product/founder and go-to-market.

### Gate 2 — Evidence inventory

Classify every desired claim as **shipped and evidenced**, **shipped but needs proof**, **planned**, or **unsupported**. Resolve pricing and deployment language before copy approval.

**Output:** claim ledger with source, owner, and status.  
**Approvers:** product and engineering.

### Gate 3 — Message architecture

Test the category, problem, promise, mechanism, proof, trust, and CTA as plain text before visual design. Conduct five interviews or message tests with companies that already use multiple agents.

**Output:** approved messaging hierarchy and vocabulary.  
**Approvers:** product/founder.

### Gate 4 — Narrative wireframe

Create a low-fidelity page using the section order in this specification. Test whether a visitor can explain the Steering Loop and reach the primary CTA without encountering the feature catalogue.

**Output:** desktop and mobile wireframes.  
**Approvers:** product and design.

### Gate 5 — Product-proof capture

Run one real Exponential goal through a complete weekly loop. Capture consistent screenshots, agent activity, artifact evidence, and the human review. Any gap exposed here becomes a product decision, not a copywriting workaround.

**Output:** approved demo dataset and proof assets.  
**Approvers:** product and engineering.

### Gate 6 — Copy and visual design

Write final copy within the approved architecture, then design around the product proof. Review at 360, 768, 1280, and 1536 pixel widths. Test keyboard navigation and reduced motion before implementation sign-off.

**Output:** content-complete design with responsive states.  
**Approvers:** product, design, and engineering.

### Gate 7 — Implementation and instrumentation

Build semantic, server-rendered content where possible. Optimize screenshots and motion, implement analytics, preserve campaign attribution through sign-in, and ensure every CTA has an owned destination.

**Output:** production candidate and analytics QA sheet.  
**Approvers:** engineering and product.

### Gate 8 — Validation and iteration

Before broad launch, run moderated comprehension tests and recruit a small number of ICP design partners. After launch, review qualitative objections alongside the first-loop funnel every week. Change one major message variable at a time.

**Output:** weekly homepage learning log.  
**Approvers:** product/founder.

## 10. Launch acceptance criteria

The homepage is ready when:

- the exact category and operating-method names appear prominently;
- the hero explains the value of the control plane in plain language;
- one complete goal → commitment → delegation → evidence → decision → review story appears before broad features;
- no placeholder logos, invented testimonials, or unsupported numbers remain;
- all product, compatibility, deployment, and pricing claims pass the evidence inventory;
- open source and deployment choice are visible above the fold;
- the primary CTA has one consistent label and a continuation path after authentication;
- navigation and interactions are keyboard accessible and meet WCAG 2.2 AA contrast and focus requirements;
- motion has a reduced-motion alternative;
- the page works from 360 px upward without clipped product evidence;
- images have useful alternative text and decorative images are ignored by assistive technology;
- production LCP is below 2.5 seconds and CLS below 0.1 at the 75th percentile;
- metadata, canonical URL, social cards, structured data, and analytics are verified;
- the current 24-frame feature carousel and fabricated social-proof sections are removed;
- the hosted offer and licensing language are consistent across the homepage, pricing, and `LICENSING.md`.

## 11. Open decisions before design starts

These are dependencies, not reasons to weaken the positioning:

1. What exact product flow does **Start your steering loop** open before and after authentication?
2. Which parts of the five-stage loop are demonstrably shipped, and how should unshipped stages be represented?
3. Which agent connection paths are tested enough to name publicly?
4. Is the managed service generally available, design-partner only, or not yet sold—and what is its real price?
5. Which deployment properties are currently supported: data location, object storage, encryption keys, identity, backups, exports, and update control?
6. What real customer, community, or dogfooding proof can be published with permission?

Until these are answered, use the conservative copy in this specification and omit unsupported details.
