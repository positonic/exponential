/* eslint-disable */
/**
 * Comprehensive test seed: 2 products, full data for each.
 * Run: npx tsx prisma/seed-test.ts
 */
import { PrismaClient } from "@prisma/client";
import { generateFunId } from "../src/lib/fun-ids";

const db = new PrismaClient();

async function main() {
  const user = await db.user.findFirst({ select: { id: true, name: true } });
  if (!user) { console.log("No user found."); return; }
  const workspace = await db.workspace.findFirst({
    where: { members: { some: { userId: user.id } } },
    select: { id: true, slug: true },
  });
  if (!workspace) { console.log("No workspace found."); return; }
  console.log(`User: ${user.name} (${user.id})\nWorkspace: ${workspace.slug}\n`);

  // Enable product plugin
  await db.pluginConfig.upsert({
    where: { pluginId_workspaceId_userId: { workspaceId: workspace.id, pluginId: "product", userId: user.id } },
    update: { enabled: true },
    create: { workspaceId: workspace.id, pluginId: "product", userId: user.id, enabled: true },
  });
  console.log("Product plugin enabled");

  // Create Product 1
  await db.product.deleteMany({ where: { slug: "horizon-platform", workspaceId: workspace.id } });
  const product1 = await db.product.create({
    data: {
      workspaceId: workspace.id, createdById: user.id,
      name: "Horizon Platform", slug: "horizon-platform",
      description: "Core platform product for user-facing features, authentication, and data infrastructure.",
      funTicketIds: false, estimationScale: "fibonacci",
    },
  });
  console.log(`Product 1: ${product1.name} (${product1.id})`);

  // Create Product 2
  await db.product.deleteMany({ where: { slug: "pulse-analytics", workspaceId: workspace.id } });
  const product2 = await db.product.create({
    data: {
      workspaceId: workspace.id, createdById: user.id,
      name: "Pulse Analytics", slug: "pulse-analytics",
      description: "Real-time analytics and reporting platform for business intelligence.",
      funTicketIds: false, estimationScale: "tshirt",
    },
  });
  console.log(`Product 2: ${product2.name} (${product2.id})\n`);

  // ── Tags ──
  const tagData = [
    { name: "Platform", color: "avatar-blue", category: "area" },
    { name: "Growth", color: "avatar-green", category: "area" },
    { name: "Security", color: "avatar-red", category: "area" },
    { name: "Data", color: "avatar-plum", category: "area" },
    { name: "tech-debt", color: "avatar-orange", category: "label" },
    { name: "needs-design", color: "avatar-lavender", category: "label" },
    { name: "customer-request", color: "avatar-teal", category: "label" },
    { name: "quick-win", color: "avatar-yellow", category: "label" },
  ];
  const tags: Record<string, string> = {};
  for (const t of tagData) {
    const slug = t.name.toLowerCase().replace(/\s+/g, "-");
    const existing = await db.tag.findFirst({ where: { slug, workspaceId: workspace.id } });
    if (existing) { tags[t.name] = existing.id; }
    else {
      const tag = await db.tag.create({ data: { name: t.name, slug, color: t.color, category: t.category, workspaceId: workspace.id, createdById: user.id } });
      tags[t.name] = tag.id;
    }
  }
  console.log(`Tags: ${Object.keys(tags).join(", ")}`);

  // ── Epics ──
  await db.epic.deleteMany({ where: { workspaceId: workspace.id, name: { in: ["Q2 Launch", "Mobile App", "Performance", "Data Pipeline", "Self-Service"] } } });
  const epicData = [
    { name: "Q2 Launch", status: "IN_PROGRESS" as const },
    { name: "Mobile App", status: "OPEN" as const },
    { name: "Performance", status: "OPEN" as const },
    { name: "Data Pipeline", status: "IN_PROGRESS" as const },
    { name: "Self-Service", status: "OPEN" as const },
  ];
  const epics: Record<string, string> = {};
  for (const e of epicData) {
    const epic = await db.epic.create({ data: { workspaceId: workspace.id, name: e.name, status: e.status, priority: "MEDIUM", ownerId: user.id } });
    epics[e.name] = epic.id;
  }
  console.log(`Epics: ${Object.keys(epics).join(", ")}`);

  // ── Cycles (for Product 1 only) ──
  await db.list.deleteMany({ where: { workspaceId: workspace.id, slug: { startsWith: "demo-cycle" } } });
  const now = new Date();
  const monday = new Date(now);
  monday.setDate(now.getDate() - now.getDay() + 1);
  monday.setHours(0, 0, 0, 0);

  const cycleData = [
    { name: "Cycle 1", status: "ACTIVE" as const, startOff: -7, endOff: 7 },
    { name: "Cycle 2", status: "PLANNED" as const, startOff: 7, endOff: 21 },
    { name: "Cycle 3", status: "PLANNED" as const, startOff: 21, endOff: 35 },
  ];
  const cycles: Record<string, string> = {};
  for (const c of cycleData) {
    const start = new Date(monday); start.setDate(start.getDate() + c.startOff);
    const end = new Date(monday); end.setDate(end.getDate() + c.endOff);
    const cycle = await db.list.create({
      data: { workspaceId: workspace.id, createdById: user.id, name: c.name, slug: `demo-cycle-${c.name.toLowerCase().replace(/\s/g, "-")}`, listType: "SPRINT", status: c.status, startDate: start, endDate: end },
    });
    cycles[c.name] = cycle.id;
  }
  console.log(`Cycles: ${Object.keys(cycles).join(", ")}`);

  // ── Features ──
  const featureData = [
    // Product 1
    { product: product1.id, name: "User Authentication", desc: "Login, signup, SSO, password reset", status: "IN_PROGRESS" as const, area: "Platform" },
    { product: product1.id, name: "Dashboard", desc: "Main workspace dashboard with widgets", status: "DEFINED" as const, area: "Platform" },
    { product: product1.id, name: "Notifications", desc: "Email, push, and in-app notifications", status: "IDEA" as const, area: "Growth" },
    { product: product1.id, name: "API v2", desc: "REST API redesign with versioning", status: "SHIPPED" as const, area: "Platform" },
    // Product 2
    { product: product2.id, name: "Real-time Charts", desc: "Live-updating chart components", status: "IN_PROGRESS" as const, area: "Data" },
    { product: product2.id, name: "Report Builder", desc: "Drag-and-drop report creation", status: "DEFINED" as const, area: "Data" },
    { product: product2.id, name: "Data Connectors", desc: "Import from Postgres, MySQL, BigQuery", status: "IDEA" as const, area: "Platform" },
    { product: product2.id, name: "Alerts", desc: "Threshold-based alerting system", status: "IDEA" as const, area: "Growth" },
  ];
  const features: Record<string, string> = {};
  for (const f of featureData) {
    const feature = await db.feature.create({ data: { productId: f.product, createdById: user.id, name: f.name, description: f.desc, status: f.status } });
    features[f.name] = feature.id;
    if (tags[f.area]) await db.featureTag.create({ data: { featureId: feature.id, tagId: tags[f.area]! } });
  }
  console.log(`Features: ${Object.keys(features).join(", ")}`);

  // ── Insights (Product 1) ──
  const insightData: Array<{ title: string; type: "PAIN_POINT" | "OPPORTUNITY" | "FEEDBACK" | "PERSONA" | "JOURNEY" | "OBSERVATION" | "COMPETITIVE"; body?: string; source?: string; sentiment?: string; status: "INBOX" | "TRIAGED" | "LINKED" | "DISMISSED" }> = [
    { title: "Email verification causes 40% drop-off", type: "PAIN_POINT", body: "Users struggle with the 5-step signup flow. 3/5 participants abandoned at step 3.", source: "User interview - March 2026", status: "TRIAGED" },
    { title: "Switch to magic link or social-first auth", type: "OPPORTUNITY", body: "Linear uses magic links. Notion uses Google OAuth primarily. Both have < 2 step signups.", source: "Competitor analysis", status: "INBOX" },
    { title: "Dashboard too slow for enterprise accounts", type: "FEEDBACK", body: "Multiple reports from Acme Corp and BuildFast about dashboard loading > 5s on datasets with 10k+ rows.", source: "Zendesk tickets #4231, #4298", sentiment: "negative", status: "TRIAGED" },
    { title: "Love the new API v2 rate limiting", type: "FEEDBACK", body: "Several customers mentioned they appreciate the transparent rate limit headers.", source: "G2 reviews", sentiment: "positive", status: "DISMISSED" },
    { title: "Developer Dave", type: "PERSONA", body: "Mid-level engineer at a 50-person startup. Builds internal tools. Frustrated by slow APIs and unclear docs. Needs reliable webhooks and good error messages. Values speed and simplicity over configurability.", status: "LINKED" },
    { title: "Product Manager Pat", type: "PERSONA", body: "PM at a growth-stage company. Manages a backlog of 200+ tickets. Needs clear prioritization, stakeholder reporting, and research-backed decisions. Frustrated by context-switching between tools.", status: "LINKED" },
    { title: "First-time user onboarding flow", type: "JOURNEY", body: "1. Lands on marketing page\n2. Clicks 'Get Started'\n3. Google OAuth (smooth)\n4. Workspace creation (confused by 'slug')\n5. Empty dashboard (lost - no guidance)\n6. Tries to create a project (finds it)\n7. Adds first task (satisfied)", status: "TRIAGED" },
    { title: "Notion has real-time collaboration on docs", type: "COMPETITIVE", body: "Notion's collaborative editing is a key differentiator. Users can see each other's cursors and edits in real-time. We don't offer this for ticket descriptions.", source: "Competitor analysis - Q2 2026", status: "INBOX" },
    { title: "Users want keyboard shortcuts for status changes", type: "OBSERVATION", body: "Watched 3 users navigate the backlog. All reached for keyboard shortcuts that don't exist. They expected 1-9 number keys to change status.", source: "Usability testing session", status: "INBOX" },
    { title: "Mobile experience is unusable", type: "PAIN_POINT", body: "The backlog table doesn't render properly on mobile. Columns overflow and there's no responsive layout.", source: "Internal QA", status: "TRIAGED" },
  ];
  for (const i of insightData) {
    await db.insight.create({
      data: {
        productId: product1.id,
        createdById: user.id,
        type: i.type,
        title: i.title,
        body: i.body,
        source: i.source,
        sentiment: i.sentiment,
        description: i.title,
        status: i.status,
      },
    });
  }
  console.log(`Insights: ${insightData.length} items`);

  // ── Retrospectives (Product 1) ──
  await db.retrospective.create({
    data: {
      workspaceId: workspace.id, productId: product1.id, createdById: user.id,
      title: "Cycle 0 Retro", conductedAt: new Date(),
      wentWell: "- Fast iteration on auth flows\n- Good team communication",
      wentPoorly: "- Underestimated OAuth complexity\n- No design review before dev",
      actionItems: "- Add design review step to workflow\n- Spike OAuth providers early",
    },
  });
  console.log("Retrospectives: 1 created");

  // ── Tickets ──
  async function createTickets(productId: string, productName: string, ticketList: Array<{
    title: string; type: "BUG"|"FEATURE"|"CHORE"|"IMPROVEMENT"|"SPIKE"|"RESEARCH";
    status: "BACKLOG"|"NEEDS_REFINEMENT"|"READY_TO_PLAN"|"COMMITTED"|"IN_PROGRESS"|"BLOCKED"|"QA"|"DONE"|"DEPLOYED"|"ARCHIVED";
    priority: number; points: number; feature: string; epic?: string; cycle?: string; labels?: string[];
    body?: string;
  }>) {
    const existingIds = new Set<string>();
    let counter = 0;
    const product = await db.product.findUnique({ where: { id: productId }, select: { ticketCounter: true } });
    counter = product?.ticketCounter ?? 0;

    for (const t of ticketList) {
      counter++;
      const shortId = generateFunId(existingIds);
      existingIds.add(shortId);
      const ticket = await db.ticket.create({
        data: {
          productId, number: counter, shortId, title: t.title, body: t.body,
          type: t.type, status: t.status, priority: t.priority, points: t.points,
          featureId: features[t.feature] ?? null,
          epicId: t.epic ? epics[t.epic] ?? null : null,
          cycleId: t.cycle ? cycles[t.cycle] ?? null : null,
          assigneeId: user.id, createdById: user.id,
        },
      });
      for (const l of t.labels ?? []) {
        if (tags[l]) await db.ticketTag.create({ data: { ticketId: ticket.id, tagId: tags[l]! } });
      }
    }
    await db.product.update({ where: { id: productId }, data: { ticketCounter: counter } });
    console.log(`${productName}: ${ticketList.length} tickets created`);
  }

  // Product 1 tickets
  await createTickets(product1.id, "Horizon Platform", [
    { title: "Fix login redirect on Safari", type: "BUG", status: "IN_PROGRESS", priority: 1, points: 3, feature: "User Authentication", epic: "Q2 Launch", cycle: "Cycle 1", labels: [] },
    { title: "Add Google OAuth", type: "FEATURE", status: "COMMITTED", priority: 2, points: 5, feature: "User Authentication", epic: "Q2 Launch", cycle: "Cycle 1", labels: ["customer-request"], body: "<h2>Requirements</h2><p>Support Google OAuth for signup and login.</p><ul><li>Google consent screen</li><li>Token exchange</li><li>Account linking</li></ul>" },
    { title: "Rate limit login attempts", type: "IMPROVEMENT", status: "BACKLOG", priority: 2, points: 3, feature: "User Authentication", cycle: "Cycle 2", labels: ["Security"] },
    { title: "Password strength indicator", type: "IMPROVEMENT", status: "DONE", priority: 3, points: 2, feature: "User Authentication", epic: "Q2 Launch", cycle: "Cycle 1", labels: ["quick-win"] },
    { title: "Session timeout bug", type: "BUG", status: "QA", priority: 1, points: 2, feature: "User Authentication", cycle: "Cycle 1", labels: [] },
    { title: "Implement SAML SSO", type: "FEATURE", status: "BLOCKED", priority: 2, points: 8, feature: "User Authentication", epic: "Q2 Launch", labels: ["customer-request"] },
    { title: "Dashboard slow on large datasets", type: "BUG", status: "COMMITTED", priority: 0, points: 8, feature: "Dashboard", epic: "Performance", cycle: "Cycle 1", labels: ["tech-debt"] },
    { title: "Add weekly trends widget", type: "FEATURE", status: "IN_PROGRESS", priority: 2, points: 5, feature: "Dashboard", epic: "Q2 Launch", cycle: "Cycle 1", labels: ["needs-design"] },
    { title: "Export dashboard as PDF", type: "FEATURE", status: "BACKLOG", priority: 3, points: 5, feature: "Dashboard", cycle: "Cycle 2", labels: ["customer-request"] },
    { title: "WebSocket real-time updates", type: "SPIKE", status: "BACKLOG", priority: 2, points: 8, feature: "Dashboard", epic: "Performance", cycle: "Cycle 3", labels: [] },
    { title: "Custom date range picker", type: "IMPROVEMENT", status: "READY_TO_PLAN", priority: 3, points: 3, feature: "Dashboard", cycle: "Cycle 2", labels: ["quick-win"] },
    { title: "Email delivery failures", type: "BUG", status: "IN_PROGRESS", priority: 0, points: 5, feature: "Notifications", cycle: "Cycle 1", labels: [] },
    { title: "Push notification support", type: "FEATURE", status: "BACKLOG", priority: 2, points: 8, feature: "Notifications", epic: "Mobile App", cycle: "Cycle 3", labels: ["needs-design"] },
    { title: "Notification preferences UI", type: "FEATURE", status: "NEEDS_REFINEMENT", priority: 2, points: 5, feature: "Notifications", epic: "Mobile App", cycle: "Cycle 2", labels: ["needs-design"] },
    { title: "Batch digest for alerts", type: "IMPROVEMENT", status: "BACKLOG", priority: 3, points: 3, feature: "Notifications", labels: ["quick-win"] },
    { title: "Design API v2 schema", type: "SPIKE", status: "DONE", priority: 1, points: 5, feature: "API v2", epic: "Q2 Launch", labels: [] },
    { title: "Rate limiting middleware", type: "FEATURE", status: "DEPLOYED", priority: 1, points: 5, feature: "API v2", epic: "Q2 Launch", labels: [] },
    { title: "Migrate endpoints to v2", type: "CHORE", status: "IN_PROGRESS", priority: 2, points: 13, feature: "API v2", epic: "Q2 Launch", cycle: "Cycle 1", labels: ["tech-debt"] },
    { title: "API v2 documentation", type: "CHORE", status: "BACKLOG", priority: 3, points: 5, feature: "API v2", cycle: "Cycle 2", labels: [] },
    { title: "v1 deprecation warnings", type: "IMPROVEMENT", status: "READY_TO_PLAN", priority: 2, points: 3, feature: "API v2", cycle: "Cycle 2", labels: [] },
  ]);

  // Product 2 tickets
  await createTickets(product2.id, "Pulse Analytics", [
    { title: "Chart rendering performance", type: "BUG", status: "IN_PROGRESS", priority: 0, points: 8, feature: "Real-time Charts", epic: "Performance", labels: ["tech-debt"] },
    { title: "Add candlestick chart type", type: "FEATURE", status: "COMMITTED", priority: 2, points: 5, feature: "Real-time Charts", labels: ["customer-request"] },
    { title: "Chart tooltip accessibility", type: "CHORE", status: "BACKLOG", priority: 3, points: 3, feature: "Real-time Charts", labels: [] },
    { title: "WebSocket data streaming", type: "FEATURE", status: "IN_PROGRESS", priority: 1, points: 8, feature: "Real-time Charts", epic: "Data Pipeline", labels: [] },
    { title: "Chart export as PNG/SVG", type: "FEATURE", status: "BACKLOG", priority: 3, points: 3, feature: "Real-time Charts", labels: ["quick-win"] },
    { title: "Drag-and-drop report canvas", type: "FEATURE", status: "NEEDS_REFINEMENT", priority: 1, points: 13, feature: "Report Builder", epic: "Self-Service", labels: ["needs-design"] },
    { title: "Report template library", type: "FEATURE", status: "BACKLOG", priority: 2, points: 8, feature: "Report Builder", epic: "Self-Service", labels: ["customer-request"] },
    { title: "Schedule report emails", type: "FEATURE", status: "BACKLOG", priority: 3, points: 5, feature: "Report Builder", labels: [] },
    { title: "Report sharing permissions", type: "IMPROVEMENT", status: "READY_TO_PLAN", priority: 2, points: 5, feature: "Report Builder", epic: "Self-Service", labels: ["Security"] },
    { title: "PDF export for reports", type: "FEATURE", status: "DONE", priority: 2, points: 5, feature: "Report Builder", labels: [] },
    { title: "PostgreSQL connector", type: "FEATURE", status: "DEPLOYED", priority: 1, points: 5, feature: "Data Connectors", epic: "Data Pipeline", labels: [] },
    { title: "MySQL connector", type: "FEATURE", status: "IN_PROGRESS", priority: 1, points: 5, feature: "Data Connectors", epic: "Data Pipeline", labels: [] },
    { title: "BigQuery connector", type: "FEATURE", status: "BACKLOG", priority: 2, points: 8, feature: "Data Connectors", epic: "Data Pipeline", labels: [] },
    { title: "Connection health monitoring", type: "IMPROVEMENT", status: "COMMITTED", priority: 2, points: 3, feature: "Data Connectors", labels: [] },
    { title: "Data sync scheduling", type: "FEATURE", status: "BACKLOG", priority: 2, points: 5, feature: "Data Connectors", labels: [] },
    { title: "Threshold-based alerts", type: "FEATURE", status: "COMMITTED", priority: 1, points: 8, feature: "Alerts", labels: ["customer-request"] },
    { title: "Slack alert integration", type: "FEATURE", status: "BACKLOG", priority: 2, points: 5, feature: "Alerts", labels: [] },
    { title: "Alert history and audit log", type: "IMPROVEMENT", status: "BACKLOG", priority: 3, points: 3, feature: "Alerts", labels: [] },
    { title: "Alert rule templates", type: "FEATURE", status: "BACKLOG", priority: 3, points: 3, feature: "Alerts", labels: ["quick-win"] },
    { title: "Custom alert channels", type: "FEATURE", status: "BACKLOG", priority: 3, points: 5, feature: "Alerts", labels: [] },
  ]);

  console.log("\nDone! Full test environment ready.");
  console.log(`  Product 1: /w/${workspace.slug}/products/horizon-platform`);
  console.log(`  Product 2: /w/${workspace.slug}/products/pulse-analytics`);
}

main().catch(console.error).finally(() => db.$disconnect());
