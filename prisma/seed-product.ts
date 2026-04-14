/* eslint-disable */
/**
 * Seeds a complete product environment for testing the Product plugin.
 * Run: npx tsx prisma/seed-product.ts
 *
 * Creates: 1 product, 4 areas, 4 labels, 4 features, 3 epics, 3 cycles, 30 tickets
 */
import { PrismaClient } from "@prisma/client";
import { generateFunId } from "../src/lib/fun-ids";

const db = new PrismaClient();

async function main() {
  // Find user and workspace
  const user = await db.user.findFirst({ select: { id: true } });
  if (!user) { console.log("No user found. Sign in first."); return; }

  const workspace = await db.workspace.findFirst({
    where: { members: { some: { userId: user.id } } },
    select: { id: true, slug: true },
  });
  if (!workspace) { console.log("No workspace found."); return; }

  console.log(`User: ${user.id}`);
  console.log(`Workspace: ${workspace.slug} (${workspace.id})\n`);

  // Clean existing test data
  const existingProduct = await db.product.findFirst({ where: { workspaceId: workspace.id, slug: "demo-product" } });
  if (existingProduct) {
    console.log("Cleaning existing demo product...");
    await db.product.delete({ where: { id: existingProduct.id } });
  }
  // Clean demo cycles
  await db.list.deleteMany({ where: { workspaceId: workspace.id, slug: { startsWith: "demo-cycle" } } });
  // Clean demo epics
  await db.epic.deleteMany({ where: { workspaceId: workspace.id, name: { in: ["Q2 Launch", "Mobile App", "Performance"] } } });

  // ── Product ──
  const product = await db.product.create({
    data: {
      workspaceId: workspace.id,
      createdById: user.id,
      name: "Demo Product",
      slug: "demo-product",
      description: "A fully seeded product for testing all features of the Product plugin.",
      funTicketIds: true,
      estimationScale: "fibonacci",
    },
  });
  console.log(`Product: ${product.name} (${product.id})`);

  // ── Tags: Areas ──
  const areaNames = [
    { name: "Platform", color: "avatar-blue" },
    { name: "Growth", color: "avatar-green" },
    { name: "Security", color: "avatar-red" },
    { name: "Data", color: "avatar-plum" },
  ];
  const areas: Array<{ id: string; name: string }> = [];
  for (const a of areaNames) {
    const slug = a.name.toLowerCase();
    const existing = await db.tag.findFirst({ where: { slug, workspaceId: workspace.id } });
    if (existing) {
      areas.push(existing);
      console.log(`  Area (existing): ${a.name}`);
    } else {
      const tag = await db.tag.create({
        data: { name: a.name, slug, color: a.color, category: "area", workspaceId: workspace.id, createdById: user.id },
      });
      areas.push(tag);
      console.log(`  Area: ${a.name}`);
    }
  }

  // ── Tags: Labels ──
  const labelNames = [
    { name: "tech-debt", color: "avatar-orange" },
    { name: "needs-design", color: "avatar-lavender" },
    { name: "customer-request", color: "avatar-teal" },
    { name: "quick-win", color: "avatar-yellow" },
  ];
  const labels: Array<{ id: string; name: string }> = [];
  for (const l of labelNames) {
    const slug = l.name.toLowerCase();
    const existing = await db.tag.findFirst({ where: { slug, workspaceId: workspace.id } });
    if (existing) {
      labels.push(existing);
      console.log(`  Label (existing): ${l.name}`);
    } else {
      const tag = await db.tag.create({
        data: { name: l.name, slug, color: l.color, category: "label", workspaceId: workspace.id, createdById: user.id },
      });
      labels.push(tag);
      console.log(`  Label: ${l.name}`);
    }
  }

  // ── Epics ──
  const epicData = [
    { name: "Q2 Launch", description: "Everything needed for the Q2 product launch", status: "IN_PROGRESS" as const },
    { name: "Mobile App", description: "React Native mobile application", status: "OPEN" as const },
    { name: "Performance", description: "Speed and scalability improvements", status: "OPEN" as const },
  ];
  const epics: Array<{ id: string; name: string }> = [];
  for (const e of epicData) {
    const epic = await db.epic.create({
      data: { workspaceId: workspace.id, name: e.name, description: e.description, status: e.status, priority: "MEDIUM", ownerId: user.id },
    });
    epics.push(epic);
    console.log(`  Epic: ${e.name}`);
  }

  // ── Features ──
  const featureData = [
    { name: "User Authentication", desc: "Login, signup, password reset, SSO", status: "IN_PROGRESS" as const, areaIdx: 0 },
    { name: "Dashboard Analytics", desc: "Charts, metrics, real-time visualization", status: "DEFINED" as const, areaIdx: 3 },
    { name: "Notification System", desc: "Email, push, and in-app notifications", status: "IDEA" as const, areaIdx: 0 },
    { name: "API v2", desc: "RESTful API redesign with rate limiting", status: "SHIPPED" as const, areaIdx: 0 },
  ];
  const features: Array<{ id: string; name: string }> = [];
  for (const f of featureData) {
    const feature = await db.feature.create({
      data: {
        productId: product.id, createdById: user.id,
        name: f.name, description: f.desc, status: f.status,
      },
    });
    features.push(feature);
    // Tag with area
    await db.featureTag.create({ data: { featureId: feature.id, tagId: areas[f.areaIdx]!.id } });
    console.log(`  Feature: ${f.name} [${areas[f.areaIdx]!.name}]`);
  }

  // ── Cycles ──
  const now = new Date();
  const monday = new Date(now);
  monday.setDate(now.getDate() - now.getDay() + 1); // This Monday
  monday.setHours(0, 0, 0, 0);

  const cycleData = [
    { name: "Cycle 1", status: "ACTIVE" as const, startOffset: -7, endOffset: 7 },
    { name: "Cycle 2", status: "PLANNED" as const, startOffset: 7, endOffset: 21 },
    { name: "Cycle 3", status: "PLANNED" as const, startOffset: 21, endOffset: 35 },
  ];
  const cycles: Array<{ id: string; name: string }> = [];
  for (const c of cycleData) {
    const start = new Date(monday);
    start.setDate(start.getDate() + c.startOffset);
    const end = new Date(monday);
    end.setDate(end.getDate() + c.endOffset);
    const slug = `demo-${c.name.toLowerCase().replace(/\s+/g, "-")}`;

    const cycle = await db.list.create({
      data: {
        workspaceId: workspace.id, createdById: user.id,
        name: c.name, slug, listType: "SPRINT", status: c.status,
        startDate: start, endDate: end,
      },
    });
    cycles.push(cycle);
    console.log(`  Cycle: ${c.name} (${c.status})`);
  }

  // ── Tickets ──
  const existingShortIds = new Set<string>();
  let counter = 0;

  const ticketData: Array<{
    title: string; type: "BUG"|"FEATURE"|"CHORE"|"IMPROVEMENT"|"SPIKE"|"RESEARCH";
    status: "BACKLOG"|"TODO"|"IN_PROGRESS"|"IN_REVIEW"|"DONE"|"CANCELLED";
    priority: number; points: number;
    featureIdx: number; epicIdx: number|null; cycleIdx: number|null;
    labelIdxs: number[];
  }> = [
    // Auth feature - Cycle 1
    { title: "Fix login redirect loop on mobile Safari", type: "BUG", status: "IN_PROGRESS", priority: 1, points: 3, featureIdx: 0, epicIdx: 0, cycleIdx: 0, labelIdxs: [] },
    { title: "Add Google OAuth provider", type: "FEATURE", status: "TODO", priority: 2, points: 5, featureIdx: 0, epicIdx: 0, cycleIdx: 0, labelIdxs: [2] },
    { title: "Rate limit login attempts", type: "IMPROVEMENT", status: "BACKLOG", priority: 2, points: 3, featureIdx: 0, epicIdx: null, cycleIdx: 1, labelIdxs: [] },
    { title: "Password strength indicator", type: "IMPROVEMENT", status: "DONE", priority: 3, points: 2, featureIdx: 0, epicIdx: 0, cycleIdx: 0, labelIdxs: [3] },
    { title: "Session timeout not working", type: "BUG", status: "IN_REVIEW", priority: 1, points: 2, featureIdx: 0, epicIdx: null, cycleIdx: 0, labelIdxs: [] },
    { title: "Implement SSO with SAML", type: "FEATURE", status: "BACKLOG", priority: 2, points: 8, featureIdx: 0, epicIdx: 0, cycleIdx: null, labelIdxs: [2] },
    // Analytics feature - Cycle 1 & 2
    { title: "Dashboard loads too slowly on large datasets", type: "BUG", status: "TODO", priority: 0, points: 8, featureIdx: 1, epicIdx: 2, cycleIdx: 0, labelIdxs: [0] },
    { title: "Add weekly trends chart", type: "FEATURE", status: "IN_PROGRESS", priority: 2, points: 5, featureIdx: 1, epicIdx: 0, cycleIdx: 0, labelIdxs: [1] },
    { title: "Export dashboard as PDF", type: "FEATURE", status: "BACKLOG", priority: 3, points: 5, featureIdx: 1, epicIdx: null, cycleIdx: 1, labelIdxs: [2] },
    { title: "Real-time data via WebSocket", type: "SPIKE", status: "BACKLOG", priority: 2, points: 8, featureIdx: 1, epicIdx: 2, cycleIdx: 2, labelIdxs: [] },
    { title: "Custom date range picker", type: "IMPROVEMENT", status: "TODO", priority: 3, points: 3, featureIdx: 1, epicIdx: null, cycleIdx: 1, labelIdxs: [3] },
    { title: "Chart accessibility (screen readers)", type: "CHORE", status: "BACKLOG", priority: 3, points: 3, featureIdx: 1, epicIdx: null, cycleIdx: null, labelIdxs: [0] },
    // Notifications feature - Cycle 2
    { title: "Email delivery failures", type: "BUG", status: "IN_PROGRESS", priority: 0, points: 5, featureIdx: 2, epicIdx: null, cycleIdx: 0, labelIdxs: [] },
    { title: "Add push notification support", type: "FEATURE", status: "BACKLOG", priority: 2, points: 8, featureIdx: 2, epicIdx: 1, cycleIdx: 2, labelIdxs: [1] },
    { title: "Notification preferences UI", type: "FEATURE", status: "TODO", priority: 2, points: 5, featureIdx: 2, epicIdx: 1, cycleIdx: 1, labelIdxs: [1] },
    { title: "Batch digest for low-priority alerts", type: "IMPROVEMENT", status: "BACKLOG", priority: 3, points: 3, featureIdx: 2, epicIdx: null, cycleIdx: null, labelIdxs: [3] },
    { title: "Research notification fatigue", type: "RESEARCH", status: "DONE", priority: 3, points: 2, featureIdx: 2, epicIdx: null, cycleIdx: null, labelIdxs: [] },
    // API v2 feature - mixed cycles
    { title: "Design API v2 schema", type: "SPIKE", status: "DONE", priority: 1, points: 5, featureIdx: 3, epicIdx: 0, cycleIdx: null, labelIdxs: [] },
    { title: "Implement rate limiting middleware", type: "FEATURE", status: "DONE", priority: 1, points: 5, featureIdx: 3, epicIdx: 0, cycleIdx: null, labelIdxs: [] },
    { title: "Migrate existing endpoints to v2", type: "CHORE", status: "IN_PROGRESS", priority: 2, points: 13, featureIdx: 3, epicIdx: 0, cycleIdx: 0, labelIdxs: [0] },
    { title: "Write API v2 documentation", type: "CHORE", status: "BACKLOG", priority: 3, points: 5, featureIdx: 3, epicIdx: null, cycleIdx: 1, labelIdxs: [] },
    { title: "Deprecation warnings for v1 callers", type: "IMPROVEMENT", status: "TODO", priority: 2, points: 3, featureIdx: 3, epicIdx: null, cycleIdx: 1, labelIdxs: [] },
    // Unassigned to feature - backlog
    { title: "Set up CI/CD pipeline for staging", type: "CHORE", status: "BACKLOG", priority: 2, points: 5, featureIdx: 0, epicIdx: null, cycleIdx: null, labelIdxs: [0] },
    { title: "Audit npm dependencies for vulnerabilities", type: "CHORE", status: "TODO", priority: 1, points: 3, featureIdx: 0, epicIdx: null, cycleIdx: null, labelIdxs: [] },
    { title: "Dark mode contrast issues on forms", type: "BUG", status: "TODO", priority: 2, points: 2, featureIdx: 1, epicIdx: null, cycleIdx: 0, labelIdxs: [3] },
    { title: "Add Sentry error tracking", type: "CHORE", status: "BACKLOG", priority: 3, points: 3, featureIdx: 0, epicIdx: null, cycleIdx: null, labelIdxs: [] },
    { title: "User onboarding flow", type: "FEATURE", status: "BACKLOG", priority: 1, points: 8, featureIdx: 0, epicIdx: 0, cycleIdx: 2, labelIdxs: [1, 2] },
    { title: "Implement webhook retry logic", type: "IMPROVEMENT", status: "BACKLOG", priority: 2, points: 5, featureIdx: 3, epicIdx: null, cycleIdx: null, labelIdxs: [0] },
    { title: "Load test API endpoints", type: "SPIKE", status: "BACKLOG", priority: 3, points: 3, featureIdx: 3, epicIdx: 2, cycleIdx: null, labelIdxs: [] },
    { title: "Refactor database connection pooling", type: "IMPROVEMENT", status: "CANCELLED", priority: 2, points: 5, featureIdx: 0, epicIdx: 2, cycleIdx: null, labelIdxs: [0] },
  ];

  console.log("\nCreating tickets...");
  for (const t of ticketData) {
    counter++;
    const shortId = generateFunId(existingShortIds);
    existingShortIds.add(shortId);

    const ticket = await db.ticket.create({
      data: {
        productId: product.id,
        number: counter,
        shortId,
        title: t.title,
        type: t.type,
        status: t.status,
        priority: t.priority,
        points: t.points,
        featureId: features[t.featureIdx]!.id,
        epicId: t.epicIdx != null ? epics[t.epicIdx]!.id : null,
        cycleId: t.cycleIdx != null ? cycles[t.cycleIdx]!.id : null,
        createdById: user.id,
      },
    });

    // Add labels
    for (const li of t.labelIdxs) {
      await db.ticketTag.create({ data: { ticketId: ticket.id, tagId: labels[li]!.id } });
    }

    console.log(`  #${counter} ${shortId} - ${t.title}`);
  }

  // Update product counter
  await db.product.update({
    where: { id: product.id },
    data: { ticketCounter: counter },
  });

  console.log(`\nDone! Created:`);
  console.log(`  1 product (${product.name})`);
  console.log(`  ${areas.length} areas, ${labels.length} labels`);
  console.log(`  ${epics.length} epics`);
  console.log(`  ${features.length} features`);
  console.log(`  ${cycles.length} cycles`);
  console.log(`  ${counter} tickets`);
  console.log(`\nVisit: /w/${workspace.slug}/products/demo-product`);
}

main().catch(console.error).finally(() => db.$disconnect());
