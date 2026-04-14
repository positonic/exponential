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
      funTicketIds: true, estimationScale: "fibonacci",
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
      funTicketIds: true, estimationScale: "tshirt",
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
  await db.list.deleteMany({ where: { workspaceId: workspace.id, slug: { startsWith: "test-cycle" } } });
  const now = new Date();
  const monday = new Date(now);
  monday.setDate(now.getDate() - now.getDay() + 1);
  monday.setHours(0, 0, 0, 0);

  const cycleData = [
    { name: "Sprint 1", status: "ACTIVE" as const, startOff: -7, endOff: 7 },
    { name: "Sprint 2", status: "PLANNED" as const, startOff: 7, endOff: 21 },
    { name: "Sprint 3", status: "PLANNED" as const, startOff: 21, endOff: 35 },
  ];
  const cycles: Record<string, string> = {};
  for (const c of cycleData) {
    const start = new Date(monday); start.setDate(start.getDate() + c.startOff);
    const end = new Date(monday); end.setDate(end.getDate() + c.endOff);
    const cycle = await db.list.create({
      data: { workspaceId: workspace.id, createdById: user.id, name: c.name, slug: `test-cycle-${c.name.toLowerCase().replace(/\s/g, "-")}`, listType: "SPRINT", status: c.status, startDate: start, endDate: end },
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

  // ── Research (Product 1) ──
  const researchData = [
    { title: "User Interview: Onboarding Pain Points", type: "INTERVIEW" as const, notes: "Users struggle with the 5-step signup flow. 3/5 participants abandoned at step 3 (email verification)." },
    { title: "Competitor Analysis: Auth Flows", type: "DESK_RESEARCH" as const, notes: "Linear uses magic links. Notion uses Google OAuth primarily. Both have < 2 step signups." },
    { title: "Analytics Review: Drop-off Rates", type: "ANALYTICS" as const, notes: "40% drop-off between signup start and first login. Highest drop at email verification step." },
  ];
  for (const r of researchData) {
    const research = await db.research.create({
      data: { productId: product1.id, createdById: user.id, title: r.title, type: r.type, notes: r.notes, conductedAt: new Date() },
    });
    // Add insights
    await db.insight.create({ data: { researchId: research.id, type: "PAIN_POINT", description: "Email verification step causes 40% abandonment", status: "TRIAGED" } });
    await db.insight.create({ data: { researchId: research.id, type: "OPPORTUNITY", description: "Switch to magic link or social-first auth", status: "INBOX" } });
  }
  console.log(`Research: ${researchData.length} items with insights`);

  // ── Retrospectives (Product 1) ──
  await db.retrospective.create({
    data: {
      workspaceId: workspace.id, productId: product1.id, createdById: user.id,
      title: "Sprint 0 Retro", conductedAt: new Date(),
      wentWell: "- Fast iteration on auth flows\n- Good team communication",
      wentPoorly: "- Underestimated OAuth complexity\n- No design review before dev",
      actionItems: "- Add design review step to workflow\n- Spike OAuth providers early",
    },
  });
  console.log("Retrospectives: 1 created");

  // ── Tickets ──
  async function createTickets(productId: string, productName: string, ticketList: Array<{
    title: string; type: "BUG"|"FEATURE"|"CHORE"|"IMPROVEMENT"|"SPIKE"|"RESEARCH";
    status: "BACKLOG"|"NEEDS_REFINEMENT"|"READY_TO_PLAN"|"COMMITTED"|"IN_PROGRESS"|"QA"|"DONE"|"DEPLOYED"|"ARCHIVED";
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
    { title: "Fix login redirect on Safari", type: "BUG", status: "IN_PROGRESS", priority: 1, points: 3, feature: "User Authentication", epic: "Q2 Launch", cycle: "Sprint 1", labels: [] },
    { title: "Add Google OAuth", type: "FEATURE", status: "COMMITTED", priority: 2, points: 5, feature: "User Authentication", epic: "Q2 Launch", cycle: "Sprint 1", labels: ["customer-request"], body: "<h2>Requirements</h2><p>Support Google OAuth for signup and login.</p><ul><li>Google consent screen</li><li>Token exchange</li><li>Account linking</li></ul>" },
    { title: "Rate limit login attempts", type: "IMPROVEMENT", status: "BACKLOG", priority: 2, points: 3, feature: "User Authentication", cycle: "Sprint 2", labels: ["Security"] },
    { title: "Password strength indicator", type: "IMPROVEMENT", status: "DONE", priority: 3, points: 2, feature: "User Authentication", epic: "Q2 Launch", cycle: "Sprint 1", labels: ["quick-win"] },
    { title: "Session timeout bug", type: "BUG", status: "QA", priority: 1, points: 2, feature: "User Authentication", cycle: "Sprint 1", labels: [] },
    { title: "Implement SAML SSO", type: "FEATURE", status: "BACKLOG", priority: 2, points: 8, feature: "User Authentication", epic: "Q2 Launch", labels: ["customer-request"] },
    { title: "Dashboard slow on large datasets", type: "BUG", status: "COMMITTED", priority: 0, points: 8, feature: "Dashboard", epic: "Performance", cycle: "Sprint 1", labels: ["tech-debt"] },
    { title: "Add weekly trends widget", type: "FEATURE", status: "IN_PROGRESS", priority: 2, points: 5, feature: "Dashboard", epic: "Q2 Launch", cycle: "Sprint 1", labels: ["needs-design"] },
    { title: "Export dashboard as PDF", type: "FEATURE", status: "BACKLOG", priority: 3, points: 5, feature: "Dashboard", cycle: "Sprint 2", labels: ["customer-request"] },
    { title: "WebSocket real-time updates", type: "SPIKE", status: "BACKLOG", priority: 2, points: 8, feature: "Dashboard", epic: "Performance", cycle: "Sprint 3", labels: [] },
    { title: "Custom date range picker", type: "IMPROVEMENT", status: "READY_TO_PLAN", priority: 3, points: 3, feature: "Dashboard", cycle: "Sprint 2", labels: ["quick-win"] },
    { title: "Email delivery failures", type: "BUG", status: "IN_PROGRESS", priority: 0, points: 5, feature: "Notifications", cycle: "Sprint 1", labels: [] },
    { title: "Push notification support", type: "FEATURE", status: "BACKLOG", priority: 2, points: 8, feature: "Notifications", epic: "Mobile App", cycle: "Sprint 3", labels: ["needs-design"] },
    { title: "Notification preferences UI", type: "FEATURE", status: "NEEDS_REFINEMENT", priority: 2, points: 5, feature: "Notifications", epic: "Mobile App", cycle: "Sprint 2", labels: ["needs-design"] },
    { title: "Batch digest for alerts", type: "IMPROVEMENT", status: "BACKLOG", priority: 3, points: 3, feature: "Notifications", labels: ["quick-win"] },
    { title: "Design API v2 schema", type: "SPIKE", status: "DONE", priority: 1, points: 5, feature: "API v2", epic: "Q2 Launch", labels: [] },
    { title: "Rate limiting middleware", type: "FEATURE", status: "DEPLOYED", priority: 1, points: 5, feature: "API v2", epic: "Q2 Launch", labels: [] },
    { title: "Migrate endpoints to v2", type: "CHORE", status: "IN_PROGRESS", priority: 2, points: 13, feature: "API v2", epic: "Q2 Launch", cycle: "Sprint 1", labels: ["tech-debt"] },
    { title: "API v2 documentation", type: "CHORE", status: "BACKLOG", priority: 3, points: 5, feature: "API v2", cycle: "Sprint 2", labels: [] },
    { title: "v1 deprecation warnings", type: "IMPROVEMENT", status: "READY_TO_PLAN", priority: 2, points: 3, feature: "API v2", cycle: "Sprint 2", labels: [] },
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
