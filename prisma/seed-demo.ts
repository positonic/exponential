/**
 * Demo Seed Script
 *
 * Creates a fully populated demo account with 3 workspaces:
 * 1. Personal — personal goals, habits, projects
 * 2. Lightward Labs — AI-for-good software company
 * 3. Democracy Now — grassroots political campaign
 *
 * Run with: bun prisma/seed-demo.ts
 * Requires base seed to have run first: npx prisma db seed
 */

import * as nextEnv from "@next/env";
nextEnv.loadEnvConfig(process.cwd());

import type { ActionStatus } from "@prisma/client";
import { PrismaClient } from "@prisma/client";
import type { Priority } from "../src/types/priority";

const prisma = new PrismaClient();

interface SeedAction {
  name: string;
  description?: string;
  kanbanStatus: ActionStatus;
  priority: Priority;
  completedAt?: Date;
  duration?: number;
}

const DEMO_EMAIL = process.env.DEMO_EMAIL ?? "demo@example.com";
const DEMO_NAME = process.env.DEMO_NAME ?? "Alex Morgan";

async function main() {
  console.log("Starting demo seed...\n");

  // ──────────────────────────────────────────────
  // 1. Create demo user
  // ──────────────────────────────────────────────

  const demoUser = await prisma.user.upsert({
    where: { email: DEMO_EMAIL },
    update: { name: DEMO_NAME },
    create: {
      email: DEMO_EMAIL,
      name: DEMO_NAME,
      emailVerified: new Date(),
      onboardingCompletedAt: new Date(),
      onboardingStep: 5,
      isAdmin: true,
      lastLogin: new Date(),
    },
  });

  console.log(`Demo user: ${demoUser.email} (id: ${demoUser.id})`);

  // Create a couple of teammate users
  const teammate1 = await prisma.user.upsert({
    where: { email: "sam.rivera@lightwardlabs.dev" },
    update: {},
    create: {
      email: "sam.rivera@lightwardlabs.dev",
      name: "Sam Rivera",
      emailVerified: new Date(),
      onboardingCompletedAt: new Date(),
      onboardingStep: 5,
      lastLogin: new Date(),
    },
  });

  const teammate2 = await prisma.user.upsert({
    where: { email: "jordan.chen@lightwardlabs.dev" },
    update: {},
    create: {
      email: "jordan.chen@lightwardlabs.dev",
      name: "Jordan Chen",
      emailVerified: new Date(),
      onboardingCompletedAt: new Date(),
      onboardingStep: 5,
      lastLogin: new Date(),
    },
  });

  const volunteer1 = await prisma.user.upsert({
    where: { email: "maria.santos@democracynow.org" },
    update: {},
    create: {
      email: "maria.santos@democracynow.org",
      name: "Maria Santos",
      emailVerified: new Date(),
      onboardingCompletedAt: new Date(),
      onboardingStep: 5,
      lastLogin: new Date(),
    },
  });

  // ──────────────────────────────────────────────
  // 2. Create workspaces
  // ──────────────────────────────────────────────

  // 2a. Personal workspace
  const personalWs = await prisma.workspace.upsert({
    where: { slug: `personal-${demoUser.id}` },
    update: {},
    create: {
      name: "Personal",
      slug: `personal-${demoUser.id}`,
      type: "personal",
      ownerId: demoUser.id,
      members: { create: { userId: demoUser.id, role: "owner" } },
    },
  });
  console.log(`Workspace: ${personalWs.name} (${personalWs.slug})`);

  // 2b. Lightward Labs workspace
  const lightwardWs = await prisma.workspace.upsert({
    where: { slug: "lightward-labs" },
    update: {},
    create: {
      name: "Lightward Labs",
      slug: "lightward-labs",
      type: "team",
      description:
        "Building AI tools for good — empowering people and communities through ethical technology.",
      ownerId: demoUser.id,
      enableAdvancedActions: true,
      enableDetailedActions: true,
    },
  });
  // Add members
  for (const member of [
    { userId: demoUser.id, role: "owner" },
    { userId: teammate1.id, role: "admin" },
    { userId: teammate2.id, role: "member" },
  ]) {
    await prisma.workspaceUser.upsert({
      where: {
        userId_workspaceId: {
          userId: member.userId,
          workspaceId: lightwardWs.id,
        },
      },
      update: {},
      create: { ...member, workspaceId: lightwardWs.id },
    });
  }
  console.log(`Workspace: ${lightwardWs.name} (${lightwardWs.slug})`);

  // 2c. Democracy Now workspace
  const democracyWs = await prisma.workspace.upsert({
    where: { slug: "democracy-now" },
    update: {},
    create: {
      name: "Democracy Now",
      slug: "democracy-now",
      type: "team",
      description:
        "Grassroots organizing for a more participatory democracy. Campaigns, fundraising, and community tech.",
      ownerId: demoUser.id,
      enableAdvancedActions: true,
    },
  });
  for (const member of [
    { userId: demoUser.id, role: "owner" },
    { userId: volunteer1.id, role: "member" },
  ]) {
    await prisma.workspaceUser.upsert({
      where: {
        userId_workspaceId: {
          userId: member.userId,
          workspaceId: democracyWs.id,
        },
      },
      update: {},
      create: { ...member, workspaceId: democracyWs.id },
    });
  }
  console.log(`Workspace: ${democracyWs.name} (${democracyWs.slug})`);

  // Set default workspace
  await prisma.user.update({
    where: { id: demoUser.id },
    data: { defaultWorkspaceId: personalWs.id },
  });

  // ──────────────────────────────────────────────
  // 3. Personal workspace data
  // ──────────────────────────────────────────────

  // Personal projects
  const learnRust = await prisma.project.upsert({
    where: { slug: "learn-rust" },
    update: {},
    create: {
      name: "Learn Rust",
      slug: "learn-rust",
      description:
        "Work through the Rust Book and build a CLI tool to solidify systems programming skills.",
      status: "ACTIVE",
      priority: "MEDIUM",
      progress: 0.35,
      createdById: demoUser.id,
      workspaceId: personalWs.id,
    },
  });

  const homeReno = await prisma.project.upsert({
    where: { slug: "home-renovation" },
    update: {},
    create: {
      name: "Home Renovation",
      slug: "home-renovation",
      description:
        "Kitchen and bathroom remodel — sourcing contractors, materials, and managing timeline.",
      status: "ACTIVE",
      priority: "HIGH",
      progress: 0.15,
      createdById: demoUser.id,
      workspaceId: personalWs.id,
    },
  });

  // Personal actions
  const personalActions = [
    {
      name: "Complete Rust Book Chapter 8 — Collections",
      status: "ACTIVE",
      kanbanStatus: "IN_PROGRESS" as const,
      priority: "1st Priority",
      projectId: learnRust.id,
      duration: 90,
    },
    {
      name: "Build a CLI to-do app in Rust",
      status: "ACTIVE",
      kanbanStatus: "TODO" as const,
      priority: "Scheduled",
      projectId: learnRust.id,
    },
    {
      name: "Practice ownership & borrowing exercises",
      status: "ACTIVE",
      kanbanStatus: "DONE" as const,
      priority: "Quick",
      projectId: learnRust.id,
      completedAt: new Date(Date.now() - 2 * 86400000),
    },
    {
      name: "Get quotes from 3 contractors",
      status: "ACTIVE",
      kanbanStatus: "IN_PROGRESS" as const,
      priority: "Scheduled",
      projectId: homeReno.id,
    },
    {
      name: "Choose kitchen countertop material",
      status: "ACTIVE",
      kanbanStatus: "TODO" as const,
      priority: "Scheduled",
      projectId: homeReno.id,
    },
    {
      name: "Review permit requirements with city",
      status: "ACTIVE",
      kanbanStatus: "DONE" as const,
      priority: "Quick",
      projectId: homeReno.id,
      completedAt: new Date(Date.now() - 5 * 86400000),
    },
    {
      name: "Measure bathroom dimensions for new vanity",
      status: "ACTIVE",
      kanbanStatus: "TODO" as const,
      priority: "Quick",
      projectId: homeReno.id,
    },
  ];

  for (const action of personalActions) {
    await prisma.action.create({
      data: {
        ...action,
        createdById: demoUser.id,
        workspaceId: personalWs.id,
      },
    });
  }
  console.log(`  Created ${personalActions.length} personal actions`);

  // Personal goals
  const careerDomain = await prisma.lifeDomain.findFirst({
    where: { title: "Career/Business" },
  });
  const healthDomain = await prisma.lifeDomain.findFirst({
    where: { title: "Health/Fitness" },
  });
  const personalGrowthDomain = await prisma.lifeDomain.findFirst({
    where: { title: "Personal Growth" },
  });

  const personalGoals = [
    {
      title: "Become proficient in systems programming",
      description:
        "Build deep expertise in Rust and low-level programming to expand career options into infrastructure and performance-critical domains.",
      lifeDomainId: personalGrowthDomain?.id,
      period: "Q1-2026",
    },
    {
      title: "Complete home renovation by summer",
      description:
        "Transform the kitchen and bathroom into modern, functional spaces that increase quality of life and home value.",
      lifeDomainId: null,
      period: "Q2-2026",
    },
    {
      title: "Run a half marathon",
      description:
        "Train consistently and complete a half marathon by June to build endurance and discipline.",
      lifeDomainId: healthDomain?.id,
      period: "Q2-2026",
    },
  ];

  for (const goal of personalGoals) {
    await prisma.goal.create({
      data: {
        ...goal,
        userId: demoUser.id,
        workspaceId: personalWs.id,
      },
    });
  }
  console.log(`  Created ${personalGoals.length} personal goals`);

  // Personal habits
  const habits = [
    {
      title: "Morning run",
      description: "30-minute run before work",
      frequency: "3x_week",
      daysOfWeek: [1, 3, 5],
      timeOfDay: "06:30",
    },
    {
      title: "Read for 30 minutes",
      description: "Technical books or long-form articles",
      frequency: "daily",
      daysOfWeek: [1, 2, 3, 4, 5, 6, 0],
      timeOfDay: "21:00",
    },
    {
      title: "Meditate",
      description: "10 minutes mindfulness meditation",
      frequency: "daily",
      daysOfWeek: [1, 2, 3, 4, 5, 6, 0],
      timeOfDay: "07:00",
    },
  ];

  for (const habit of habits) {
    await prisma.habit.create({
      data: { ...habit, userId: demoUser.id },
    });
  }
  console.log(`  Created ${habits.length} habits`);

  // ──────────────────────────────────────────────
  // 4. Lightward Labs workspace data
  // ──────────────────────────────────────────────

  // Team
  const lightwardTeam = await prisma.team.upsert({
    where: { slug: "lightward-engineering" },
    update: {},
    create: {
      name: "Engineering",
      slug: "lightward-engineering",
      description: "Core engineering team building Lightward products.",
      workspaceId: lightwardWs.id,
    },
  });
  for (const userId of [demoUser.id, teammate1.id, teammate2.id]) {
    await prisma.teamUser.upsert({
      where: { userId_teamId: { userId, teamId: lightwardTeam.id } },
      update: {},
      create: { userId, teamId: lightwardTeam.id, role: userId === demoUser.id ? "admin" : "member" },
    });
  }

  // Projects
  const aiAssistant = await prisma.project.upsert({
    where: { slug: "open-source-ai-assistant" },
    update: {},
    create: {
      name: "Open Source AI Assistant",
      slug: "open-source-ai-assistant",
      description:
        "A privacy-first, open-source AI assistant for nonprofits and community organizations. Built with local-first LLMs.",
      status: "ACTIVE",
      priority: "HIGH",
      progress: 0.45,
      createdById: demoUser.id,
      workspaceId: lightwardWs.id,
      teamId: lightwardTeam.id,
    },
  });

  const communityPlatform = await prisma.project.upsert({
    where: { slug: "community-platform" },
    update: {},
    create: {
      name: "Community Platform",
      slug: "community-platform",
      description:
        "Web platform connecting volunteers with local orgs. Event management, skill matching, and impact tracking.",
      status: "ACTIVE",
      priority: "MEDIUM",
      progress: 0.2,
      createdById: demoUser.id,
      workspaceId: lightwardWs.id,
      teamId: lightwardTeam.id,
    },
  });

  // AI Assistant actions
  const aiActions = [
    {
      name: "Implement RAG pipeline with local embeddings",
      kanbanStatus: "DONE" as const,
      priority: "1st Priority",
      completedAt: new Date(Date.now() - 3 * 86400000),
      description: "Set up retrieval-augmented generation using Ollama + ChromaDB for document Q&A.",
    },
    {
      name: "Add streaming response support",
      kanbanStatus: "DONE" as const,
      priority: "Scheduled",
      completedAt: new Date(Date.now() - 1 * 86400000),
    },
    {
      name: "Build conversation memory with sliding window",
      kanbanStatus: "IN_PROGRESS" as const,
      priority: "1st Priority",
      description: "Implement conversation history with configurable context window for multi-turn chats.",
    },
    {
      name: "Create plugin system for custom tools",
      kanbanStatus: "IN_PROGRESS" as const,
      priority: "Scheduled",
    },
    {
      name: "Write integration tests for RAG pipeline",
      kanbanStatus: "TODO" as const,
      priority: "Scheduled",
    },
    {
      name: "Design permissions model for multi-tenant usage",
      kanbanStatus: "TODO" as const,
      priority: "Someday Maybe",
      description: "Each org should have isolated data with configurable sharing between orgs.",
    },
    {
      name: "Implement rate limiting and usage tracking",
      kanbanStatus: "BACKLOG" as const,
      priority: "Someday Maybe",
    },
    {
      name: "Set up CI/CD pipeline with GitHub Actions",
      kanbanStatus: "DONE" as const,
      priority: "Quick",
      completedAt: new Date(Date.now() - 7 * 86400000),
    },
  ];

  for (const action of aiActions) {
    await prisma.action.create({
      data: {
        name: action.name,
        description: action.description,
        kanbanStatus: action.kanbanStatus,
        priority: action.priority,
        completedAt: action.completedAt,
        status: "ACTIVE",
        createdById: demoUser.id,
        workspaceId: lightwardWs.id,
        projectId: aiAssistant.id,
        teamId: lightwardTeam.id,
      },
    });
  }

  // Community Platform actions
  const platformActions = [
    {
      name: "Design database schema for events and organizations",
      kanbanStatus: "DONE" as const,
      priority: "1st Priority",
      completedAt: new Date(Date.now() - 4 * 86400000),
    },
    {
      name: "Build event creation and RSVP flow",
      kanbanStatus: "IN_PROGRESS" as const,
      priority: "1st Priority",
    },
    {
      name: "Implement volunteer skill matching algorithm",
      kanbanStatus: "TODO" as const,
      priority: "Scheduled",
      description: "Match volunteers to opportunities based on skills, availability, and location.",
    },
    {
      name: "Create organization onboarding wizard",
      kanbanStatus: "TODO" as const,
      priority: "Scheduled",
    },
    {
      name: "Add impact metrics dashboard",
      kanbanStatus: "BACKLOG" as const,
      priority: "Someday Maybe",
      description: "Track volunteer hours, events attended, and community impact over time.",
    },
    {
      name: "Set up email notifications for event reminders",
      kanbanStatus: "BACKLOG" as const,
      priority: "Someday Maybe",
    },
  ];

  for (const action of platformActions) {
    await prisma.action.create({
      data: {
        name: action.name,
        description: action.description,
        kanbanStatus: action.kanbanStatus,
        priority: action.priority,
        completedAt: action.completedAt,
        status: "ACTIVE",
        createdById: teammate1.id,
        workspaceId: lightwardWs.id,
        projectId: communityPlatform.id,
        teamId: lightwardTeam.id,
      },
    });
  }

  console.log(
    `  Created ${aiActions.length + platformActions.length} Lightward Labs actions`
  );

  // Lightward goals + key results
  const lightwardGoal = await prisma.goal.create({
    data: {
      title: "Launch AI Assistant v1.0 to 10 nonprofit partners",
      description:
        "Ship a production-ready version of the AI assistant and onboard 10 nonprofits as design partners by end of Q1.",
      period: "Q1-2026",
      userId: demoUser.id,
      workspaceId: lightwardWs.id,
      lifeDomainId: careerDomain?.id,
    },
  });

  await prisma.goal.create({
    data: {
      title: "Grow community platform to 500 active volunteers",
      description:
        "Build traction for the community platform with active volunteer signups and regular event participation.",
      period: "Q2-2026",
      userId: demoUser.id,
      workspaceId: lightwardWs.id,
    },
  });

  // Key results for the AI goal
  const krData = [
    {
      title: "Onboard 10 nonprofit design partners",
      targetValue: 10,
      currentValue: 4,
      startValue: 0,
      unit: "count",
      status: "on-track",
      confidence: 75,
    },
    {
      title: "Achieve 95% uptime for hosted instances",
      targetValue: 95,
      currentValue: 97,
      startValue: 85,
      unit: "percent",
      status: "achieved",
      confidence: 95,
    },
    {
      title: "Reduce average response latency to under 2 seconds",
      targetValue: 2,
      currentValue: 2.8,
      startValue: 5,
      unit: "custom",
      unitLabel: "seconds",
      status: "at-risk",
      confidence: 55,
    },
  ];

  for (const kr of krData) {
    await prisma.keyResult.create({
      data: {
        ...kr,
        period: "Q1-2026",
        goalId: lightwardGoal.id,
        workspaceId: lightwardWs.id,
        userId: demoUser.id,
        driUserId: demoUser.id,
      },
    });
  }
  console.log(`  Created 2 Lightward goals + ${krData.length} key results`);

  // ──────────────────────────────────────────────
  // 5. Democracy Now workspace data
  // ──────────────────────────────────────────────

  // Team
  const democracyTeam = await prisma.team.upsert({
    where: { slug: "democracy-now-core" },
    update: {},
    create: {
      name: "Core Team",
      slug: "democracy-now-core",
      description: "Campaign leadership and coordination.",
      workspaceId: democracyWs.id,
    },
  });
  for (const userId of [demoUser.id, volunteer1.id]) {
    await prisma.teamUser.upsert({
      where: { userId_teamId: { userId, teamId: democracyTeam.id } },
      update: {},
      create: { userId, teamId: democracyTeam.id, role: userId === demoUser.id ? "admin" : "member" },
    });
  }

  // Projects
  const voterReg = await prisma.project.upsert({
    where: { slug: "voter-registration-drive" },
    update: {},
    create: {
      name: "Voter Registration Drive",
      slug: "voter-registration-drive",
      description:
        "Door-to-door and digital voter registration campaign targeting underrepresented communities ahead of November elections.",
      status: "ACTIVE",
      priority: "HIGH",
      progress: 0.3,
      createdById: demoUser.id,
      workspaceId: democracyWs.id,
      teamId: democracyTeam.id,
    },
  });

  const campaignSite = await prisma.project.upsert({
    where: { slug: "campaign-website" },
    update: {},
    create: {
      name: "Campaign Website",
      slug: "campaign-website",
      description:
        "Public-facing website with volunteer signup, donation processing, and campaign updates.",
      status: "ACTIVE",
      priority: "MEDIUM",
      progress: 0.6,
      createdById: demoUser.id,
      workspaceId: democracyWs.id,
      teamId: democracyTeam.id,
    },
  });

  // Fundraising pipeline
  const fundraising = await prisma.project.upsert({
    where: { slug: "fundraising-pipeline" },
    update: {},
    create: {
      name: "Fundraising Pipeline",
      slug: "fundraising-pipeline",
      description:
        "Track donor outreach, grant applications, and fundraising events.",
      status: "ACTIVE",
      priority: "HIGH",
      progress: 0.25,
      type: "pipeline",
      createdById: demoUser.id,
      workspaceId: democracyWs.id,
      teamId: democracyTeam.id,
    },
  });

  // Pipeline stages
  const stages = [
    { name: "Prospect", color: "gray", order: 0, type: "active" },
    { name: "Outreach", color: "blue", order: 1, type: "active" },
    { name: "Proposal Sent", color: "yellow", order: 2, type: "active" },
    { name: "Negotiation", color: "orange", order: 3, type: "active" },
    { name: "Won", color: "green", order: 4, type: "won" },
    { name: "Lost", color: "red", order: 5, type: "lost" },
  ];

  const createdStages: Record<string, string> = {};
  for (const stage of stages) {
    const s = await prisma.pipelineStage.upsert({
      where: {
        projectId_order: { projectId: fundraising.id, order: stage.order },
      },
      update: {},
      create: { ...stage, projectId: fundraising.id },
    });
    createdStages[stage.name] = s.id;
  }

  // Deals
  const deals = [
    {
      title: "Community Foundation Grant",
      value: 25000,
      probability: 80,
      stageName: "Negotiation",
      expectedCloseDate: new Date("2026-04-15"),
    },
    {
      title: "Local Business Sponsorship — Main St. Coffee",
      value: 2500,
      probability: 90,
      stageName: "Won",
      closedAt: new Date(Date.now() - 10 * 86400000),
    },
    {
      title: "State Democratic Party Allocation",
      value: 15000,
      probability: 60,
      stageName: "Proposal Sent",
      expectedCloseDate: new Date("2026-05-01"),
    },
    {
      title: "Individual Donor — Pat Williams",
      value: 5000,
      probability: 40,
      stageName: "Outreach",
    },
    {
      title: "Tech Workers for Democracy Sponsorship",
      value: 10000,
      probability: 30,
      stageName: "Prospect",
    },
  ];

  for (const deal of deals) {
    const stageId = createdStages[deal.stageName]!;
    await prisma.deal.create({
      data: {
        title: deal.title,
        value: deal.value,
        probability: deal.probability,
        expectedCloseDate: deal.expectedCloseDate,
        closedAt: deal.closedAt,
        stageId,
        projectId: fundraising.id,
        workspaceId: democracyWs.id,
        createdById: demoUser.id,
      },
    });
  }
  console.log(`  Created ${deals.length} fundraising deals`);

  // Voter registration actions
  const voterActions = [
    {
      name: "Recruit 20 canvassing volunteers for March push",
      kanbanStatus: "IN_PROGRESS" as const,
      priority: "1st Priority",
      description: "Post on social media, reach out to college groups and community orgs.",
    },
    {
      name: "Print 5,000 voter registration flyers",
      kanbanStatus: "DONE" as const,
      priority: "Quick",
      completedAt: new Date(Date.now() - 6 * 86400000),
    },
    {
      name: "Set up voter registration table at farmer's market (Saturdays)",
      kanbanStatus: "IN_PROGRESS" as const,
      priority: "Scheduled",
    },
    {
      name: "Partner with local churches for Sunday registration drives",
      kanbanStatus: "TODO" as const,
      priority: "Scheduled",
    },
    {
      name: "Create social media content calendar for voter awareness",
      kanbanStatus: "TODO" as const,
      priority: "Scheduled",
    },
    {
      name: "Train volunteers on voter registration procedures",
      kanbanStatus: "DONE" as const,
      priority: "1st Priority",
      completedAt: new Date(Date.now() - 2 * 86400000),
    },
    {
      name: "Submit bulk voter registrations to county clerk",
      kanbanStatus: "BACKLOG" as const,
      priority: "Someday Maybe",
    },
  ];

  for (const action of voterActions) {
    await prisma.action.create({
      data: {
        name: action.name,
        description: action.description,
        kanbanStatus: action.kanbanStatus,
        priority: action.priority,
        completedAt: action.completedAt,
        status: "ACTIVE",
        createdById: demoUser.id,
        workspaceId: democracyWs.id,
        projectId: voterReg.id,
        teamId: democracyTeam.id,
      },
    });
  }

  // Campaign website actions
  const siteActions = [
    {
      name: "Deploy donation page with Stripe integration",
      kanbanStatus: "DONE" as const,
      priority: "1st Priority",
      completedAt: new Date(Date.now() - 8 * 86400000),
    },
    {
      name: "Build volunteer signup form with skill selection",
      kanbanStatus: "DONE" as const,
      priority: "Scheduled",
      completedAt: new Date(Date.now() - 5 * 86400000),
    },
    {
      name: "Add campaign updates blog section",
      kanbanStatus: "IN_PROGRESS" as const,
      priority: "1st Priority",
    },
    {
      name: "Implement event calendar with RSVP",
      kanbanStatus: "TODO" as const,
      priority: "Scheduled",
    },
    {
      name: "Set up analytics and conversion tracking",
      kanbanStatus: "TODO" as const,
      priority: "Someday Maybe",
    },
  ];

  for (const action of siteActions as SeedAction[]) {
    await prisma.action.create({
      data: {
        name: action.name,
        description: action.description,
        kanbanStatus: action.kanbanStatus,
        priority: action.priority,
        completedAt: action.completedAt,
        status: "ACTIVE",
        createdById: demoUser.id,
        workspaceId: democracyWs.id,
        projectId: campaignSite.id,
        teamId: democracyTeam.id,
      },
    });
  }

  console.log(
    `  Created ${voterActions.length + siteActions.length} Democracy Now actions`
  );

  // Democracy Now goals
  await prisma.goal.create({
    data: {
      title: "Register 5,000 new voters before November",
      description:
        "Focus on underrepresented communities with door-to-door and digital registration campaigns.",
      period: "Annual-2026",
      userId: demoUser.id,
      workspaceId: democracyWs.id,
    },
  });

  await prisma.goal.create({
    data: {
      title: "Raise $75,000 for campaign operations",
      description:
        "Secure funding through grants, individual donors, and community fundraising events to sustain operations through election season.",
      period: "Q2-2026",
      userId: demoUser.id,
      workspaceId: democracyWs.id,
    },
  });

  await prisma.goal.create({
    data: {
      title: "Build a volunteer network of 200 active members",
      description:
        "Recruit, train, and retain volunteers across 5 districts for canvassing, phone banking, and event support.",
      period: "Q1-2026",
      userId: demoUser.id,
      workspaceId: democracyWs.id,
    },
  });
  console.log(`  Created 3 Democracy Now goals`);

  // ──────────────────────────────────────────────
  // 6. Outcomes (daily/weekly)
  // ──────────────────────────────────────────────

  const outcomes = [
    {
      description: "Complete RAG pipeline integration tests",
      type: "daily",
      workspaceId: lightwardWs.id,
    },
    {
      description: "Finalize contractor shortlist for kitchen remodel",
      type: "daily",
      workspaceId: personalWs.id,
    },
    {
      description: "Ship volunteer signup form to production",
      type: "weekly",
      workspaceId: democracyWs.id,
    },
    {
      description: "Close Community Foundation grant negotiation",
      type: "weekly",
      workspaceId: democracyWs.id,
    },
  ];

  for (const outcome of outcomes) {
    await prisma.outcome.create({
      data: { ...outcome, userId: demoUser.id },
    });
  }
  console.log(`  Created ${outcomes.length} outcomes`);

  // ──────────────────────────────────────────────
  // Summary
  // ──────────────────────────────────────────────
  console.log("\n" + "=".repeat(50));
  console.log("Demo seed complete!");
  console.log(`  Email: ${DEMO_EMAIL}`);
  console.log(`  Login: Google OAuth`);
  console.log(`  Workspaces: Personal, Lightward Labs, Democracy Now`);
  console.log("=".repeat(50));
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Demo seed failed:", error);
    process.exit(1);
  })
  .finally(() => void prisma.$disconnect());
