/**
 * Seed a small, self-contained fixture for visual verification of the product
 * feature views: one workspace, one product, one feature carrying tickets in
 * assorted statuses. Everything hangs off the `dev-fixture` workspace slug so
 * it is obviously disposable and deletable in one cascade.
 *
 * Idempotent: stable slugs/numbers, upserts throughout - safe to re-run.
 *
 * The ticket spread is deliberate, not decorative:
 *   - statuses span BACKLOG → DONE so status badges exercise their palette
 *   - one IN_PROGRESS ticket depends on an open ticket → BlockedIndicator fires
 *   - one ticket is attached to a scope ONLY (scopeId set, featureId null) -
 *     the feature Tickets accordion excludes it by design (it scopes by
 *     featureId, same as feature._count.tickets), so the fixture makes that
 *     design decision observable: 6 tickets exist, the accordion shows 5.
 */
import type { PrismaClient } from "@prisma/client";

export const FIXTURE = {
  userEmail: "dev-fixture@exponential.test",
  userName: "Dev Fixture",
  workspaceSlug: "dev-fixture",
  workspaceName: "Dev Fixture",
  otherWorkspaceSlug: "dev-fixture-other",
  otherWorkspaceName: "Dev Fixture Other",
  // Deliberately unlike anything in the main workspace, so a search for it
  // returning nothing is proof that scoping held.
  otherWorkspaceActionName: "Zarquon cross-workspace beacon",
  productSlug: "fixture",
  productName: "Fixture Product",
  featureName: "Tickets accordion fixture",
  objectiveTitle: "Fixture objective for OKR execution links",
  keyResultTitle: "Linked work renders under the KR accordion",
  okrPeriod: "Annual-2026",
  projectName: "Fixture Linked Project",
  projectSlug: "fixture-linked-project",
  // A second project, kept separate from the OKR one so each fixture stays
  // legible: this one carries the goal hierarchy the Goals tab renders.
  goalProjectSlug: "goal-hierarchy-fixture",
  goalProjectName: "Goal hierarchy fixture",
  parentGoalTitle: "Grow the fixture business",
  childGoalTitle: "Ship the goal hierarchy affordance",
  offProjectParentGoalTitle: "Company-wide alignment (not on this project)",
  detachedChildGoalTitle: "Sub-goal whose parent is off-project",
  // Ceremonies (ADR-0059) and Decisions (ADR-0060): one Daily Standup, one
  // occurrence, a recorded meeting attached to it, one confirmed decision.
  ceremonySlug: "daily-standup",
  ceremonyName: "Daily Standup",
  meetingSessionId: "dev-fixture-daily-standup-2026-09-08",
  meetingTitle: "Daily Standup",
  decisionStatement: "Park prioritisation debates for the prioritisation ceremony",
} as const;

export interface SeededFixture {
  userId: string;
  workspaceSlug: string;
  /** A second workspace the fixture user owns, for cross-workspace cases. */
  otherWorkspaceSlug: string;
  otherWorkspaceName: string;
  /** Action living only in `otherWorkspaceSlug`. */
  otherWorkspaceActionName: string;
  productSlug: string;
  featureId: string;
  /** App-relative URL of the seeded feature's detail page. */
  featureUrl: string;
  /** App-relative URL of the features list with the seeded feature peeked. */
  peekUrl: string;
  /** Tickets linked to the feature (visible in the accordion). */
  featureTicketCount: number;
  /** Total tickets seeded, including the scope-only one the accordion hides. */
  totalTicketCount: number;
  /** App-relative URL of the OKR dashboard holding the seeded objective. */
  okrUrl: string;
  /** App-relative URL of the seeded project's Goals tab (the goal hierarchy). */
  projectGoalsUrl: string;
  /** Goals on that project: a parent, its sub-goal, and a detached sub-goal. */
  goalIds: { parent: number; child: number; offProjectParent: number; detachedChild: number };
  /** The seeded Daily Standup ceremony and its one occurrence. */
  ceremonyId: string;
  occurrenceId: string;
  /** App-relative URL of the recorded meeting attached to that occurrence. */
  meetingUrl: string;
  /** The confirmed decision logged against that meeting. */
  decisionId: string;
  /** Its rendered label (`D-0001` on a fresh workspace). */
  decisionLabel: string;
  /** App-relative URL of the workspace Decision Log. */
  decisionsUrl: string;
}

interface TicketSpec {
  number: number;
  title: string;
  status: "BACKLOG" | "IN_PROGRESS" | "BLOCKED" | "QA" | "DONE";
  priority: number | null;
  assign: boolean;
  /** Attach to the scope INSTEAD of the feature (the excluded case). */
  scopeOnly?: boolean;
}

const TICKETS: TicketSpec[] = [
  { number: 1, title: "Render ticket rows in the accordion", status: "DONE", priority: 1, assign: true },
  { number: 2, title: "Wire blocked indicator through ticket.list", status: "IN_PROGRESS", priority: 0, assign: true },
  { number: 3, title: "Empty state copy for ticketless features", status: "BACKLOG", priority: 3, assign: false },
  { number: 4, title: "Peek drawer keyboard navigation", status: "QA", priority: 2, assign: true },
  { number: 5, title: "Ticket row hover affordances", status: "BACKLOG", priority: null, assign: false },
  { number: 6, title: "Scope-only ticket (must NOT appear in the feature accordion)", status: "BACKLOG", priority: null, assign: false, scopeOnly: true },
];

export async function seedDevFixture(db: PrismaClient): Promise<SeededFixture> {
  const user = await db.user.upsert({
    where: { email: FIXTURE.userEmail },
    update: {},
    create: {
      email: FIXTURE.userEmail,
      name: FIXTURE.userName,
      emailVerified: new Date(),
    },
  });

  const workspace = await db.workspace.upsert({
    where: { slug: FIXTURE.workspaceSlug },
    update: {},
    create: {
      slug: FIXTURE.workspaceSlug,
      name: FIXTURE.workspaceName,
      type: "team",
      ownerId: user.id,
    },
  });

  await db.workspaceUser.upsert({
    where: { userId_workspaceId: { userId: user.id, workspaceId: workspace.id } },
    update: { role: "owner" },
    create: { userId: user.id, workspaceId: workspace.id, role: "owner" },
  });

  // Pin the default explicitly. Routes outside `/w/…` (e.g. `/wiki`) resolve
  // their workspace through `workspace.getDefault`, which without this falls
  // back to "first by type, then by createdAt" — a tie-break that only stayed
  // stable while the fixture had exactly one workspace to choose from.
  await db.user.update({
    where: { id: user.id },
    data: { defaultWorkspaceId: workspace.id },
  });

  // A second workspace, so the fixture can express anything that only exists
  // for people who belong to more than one — the command palette's
  // "All workspaces" toggle, for one, hides itself below that threshold. Kept
  // deliberately thin: one action, whose name is the thing cross-workspace
  // search looks for and which must NOT surface in a `dev-fixture`-scoped
  // search.
  const otherWorkspace = await db.workspace.upsert({
    where: { slug: FIXTURE.otherWorkspaceSlug },
    update: {},
    create: {
      slug: FIXTURE.otherWorkspaceSlug,
      name: FIXTURE.otherWorkspaceName,
      type: "team",
      ownerId: user.id,
    },
  });

  await db.workspaceUser.upsert({
    where: { userId_workspaceId: { userId: user.id, workspaceId: otherWorkspace.id } },
    update: { role: "owner" },
    create: { userId: user.id, workspaceId: otherWorkspace.id, role: "owner" },
  });

  const existingOtherAction = await db.action.findFirst({
    where: { workspaceId: otherWorkspace.id, name: FIXTURE.otherWorkspaceActionName },
    select: { id: true },
  });
  if (!existingOtherAction) {
    await db.action.create({
      data: {
        name: FIXTURE.otherWorkspaceActionName,
        workspaceId: otherWorkspace.id,
        createdById: user.id,
        status: "ACTIVE",
        priority: "Quick",
      },
    });
  }

  const product = await db.product.upsert({
    where: { workspaceId_slug: { workspaceId: workspace.id, slug: FIXTURE.productSlug } },
    update: {},
    create: {
      workspaceId: workspace.id,
      slug: FIXTURE.productSlug,
      name: FIXTURE.productName,
      createdById: user.id,
      // Linear-style IDs (FP-1 ...) rather than fun shortIds: exercises the
      // generateLinearId branch of the accordion's display-ID logic.
      funTicketIds: false,
      ticketCounter: TICKETS.length,
    },
  });

  let feature = await db.feature.findFirst({
    where: { productId: product.id, name: FIXTURE.featureName },
  });
  feature ??= await db.feature.create({
    data: {
      productId: product.id,
      name: FIXTURE.featureName,
      description:
        "Seeded by scripts/seed-dev-fixture.ts for visual verification of the feature Tickets accordion.",
      status: "IN_PROGRESS",
      createdById: user.id,
    },
  });

  let scope = await db.featureScope.findFirst({
    where: { featureId: feature.id, version: "v1.0" },
  });
  scope ??= await db.featureScope.create({
    data: {
      featureId: feature.id,
      version: "v1.0",
      description: "First slice - carries the scope-only ticket.",
      status: "IN_PROGRESS",
    },
  });

  const byNumber = new Map<number, string>();
  for (const spec of TICKETS) {
    const ticket = await db.ticket.upsert({
      where: { productId_number: { productId: product.id, number: spec.number } },
      update: {
        status: spec.status,
        featureId: spec.scopeOnly ? null : feature.id,
        scopeId: spec.scopeOnly ? scope.id : null,
      },
      create: {
        productId: product.id,
        number: spec.number,
        title: spec.title,
        type: "FEATURE",
        status: spec.status,
        priority: spec.priority,
        featureId: spec.scopeOnly ? null : feature.id,
        scopeId: spec.scopeOnly ? scope.id : null,
        createdById: user.id,
        assigneeId: spec.assign ? user.id : null,
      },
    });
    byNumber.set(spec.number, ticket.id);
  }

  // Ticket 2 (IN_PROGRESS) depends on open ticket 3 → derived isBlocked=true,
  // so the accordion's BlockedIndicator renders.
  await db.ticketDependency.upsert({
    where: {
      ticketId_dependsOnId: {
        ticketId: byNumber.get(2)!,
        dependsOnId: byNumber.get(3)!,
      },
    },
    update: {},
    create: {
      ticketId: byNumber.get(2)!,
      dependsOnId: byNumber.get(3)!,
      createdById: user.id,
    },
  });

  // OKR execution links (ADR-0050): one objective → one KR carrying BOTH a
  // linked Project and a linked Feature, so the KR accordion on the OKRs tab
  // renders one row of each kind (Project pill / Feature pill).
  // Project.workspace, Goal.workspace and KeyResult.workspace are all optional
  // relations with no explicit onDelete, so Prisma defaults them to SetNull:
  // dropping the `dev-fixture` workspace orphans these rows with a null
  // workspaceId rather than cascading them away. Every path below therefore
  // re-attaches `workspaceId`, so a seed → delete-workspace → seed cycle
  // converges instead of resurrecting a workspace-less fixture the OKR
  // dashboard (which queries by workspaceId) can't see.
  const project = await db.project.upsert({
    where: { slug: FIXTURE.projectSlug },
    update: { workspaceId: workspace.id },
    create: {
      name: FIXTURE.projectName,
      slug: FIXTURE.projectSlug,
      status: "ACTIVE",
      createdById: user.id,
      workspaceId: workspace.id,
    },
  });

  // A second project carrying a goal hierarchy, so the Goals tab's nesting
  // affordance is observable: a parent with a sub-goal under it, plus a
  // sub-goal whose parent is NOT on this project (it can't nest under anything
  // on screen, so it stays at the root and names its parent instead).
  // Same SetNull caveat as above — the Goals tab is reached through a
  // workspace-scoped route, so re-assert the workspace on every seed.
  const goalProject = await db.project.upsert({
    where: { slug: FIXTURE.goalProjectSlug },
    update: { workspaceId: workspace.id, status: "ACTIVE" },
    create: {
      slug: FIXTURE.goalProjectSlug,
      name: FIXTURE.goalProjectName,
      description: "Seeded for visual verification of sub-goal nesting on the project Goals tab.",
      status: "ACTIVE",
      priority: "HIGH",
      createdById: user.id,
      workspaceId: workspace.id,
    },
  });

  const upsertGoal = async (
    title: string,
    opts: { description?: string; parentGoalId?: number; onProject: boolean; displayOrder: number },
  ) => {
    const existing = await db.goal.findFirst({ where: { userId: user.id, title } });
    const data = {
      description: opts.description ?? null,
      status: "active",
      parentGoalId: opts.parentGoalId ?? null,
      displayOrder: opts.displayOrder,
      workspaceId: workspace.id,
      ...(opts.onProject ? { projects: { connect: { id: goalProject.id } } } : {}),
    };
    return existing
      ? await db.goal.update({ where: { id: existing.id }, data })
      : await db.goal.create({
          data: { title, userId: user.id, ...data },
        });
  };

  const parentGoal = await upsertGoal(FIXTURE.parentGoalTitle, {
    description: "Root objective — the sub-goal below nests under it.",
    onProject: true,
    displayOrder: 0,
  });
  const childGoal = await upsertGoal(FIXTURE.childGoalTitle, {
    description: "Nested one level under its parent.",
    parentGoalId: parentGoal.id,
    onProject: true,
    displayOrder: 1,
  });
  const offProjectParentGoal = await upsertGoal(FIXTURE.offProjectParentGoalTitle, {
    onProject: false,
    displayOrder: 2,
  });
  const detachedChildGoal = await upsertGoal(FIXTURE.detachedChildGoalTitle, {
    description: "Its parent isn't on this project, so the row names the parent.",
    parentGoalId: offProjectParentGoal.id,
    onProject: true,
    displayOrder: 3,
  });

  // Matched on title alone (not workspaceId) so an orphaned goal is found and
  // re-homed rather than duplicated.
  const existingObjective = await db.goal.findFirst({
    where: { title: FIXTURE.objectiveTitle, userId: user.id },
  });
  const objective = existingObjective
    ? await db.goal.update({
        where: { id: existingObjective.id },
        data: { workspaceId: workspace.id, period: FIXTURE.okrPeriod },
      })
    : await db.goal.create({
        data: {
          title: FIXTURE.objectiveTitle,
          period: FIXTURE.okrPeriod,
          userId: user.id,
          driUserId: user.id,
          workspaceId: workspace.id,
        },
      });

  const existingKeyResult = await db.keyResult.findFirst({
    where: { goalId: objective.id, title: FIXTURE.keyResultTitle },
  });
  const keyResult = existingKeyResult
    ? await db.keyResult.update({
        where: { id: existingKeyResult.id },
        data: { workspaceId: workspace.id, period: FIXTURE.okrPeriod },
      })
    : await db.keyResult.create({
        data: {
          title: FIXTURE.keyResultTitle,
          targetValue: 100,
          currentValue: 40,
          startValue: 0,
          unit: "percent",
          period: FIXTURE.okrPeriod,
          goalId: objective.id,
          userId: user.id,
          driUserId: user.id,
          workspaceId: workspace.id,
        },
      });

  await db.keyResultProject.upsert({
    where: {
      keyResultId_projectId: { keyResultId: keyResult.id, projectId: project.id },
    },
    update: {},
    create: { keyResultId: keyResult.id, projectId: project.id },
  });

  await db.keyResultFeature.upsert({
    where: {
      keyResultId_featureId: { keyResultId: keyResult.id, featureId: feature.id },
    },
    update: {},
    create: { keyResultId: keyResult.id, featureId: feature.id },
  });

  // Ceremonies (ADR-0059): one Daily Standup definition, one occurrence that
  // has already been captured, and a recorded meeting attached to it - the
  // data behind the "Part of" rail row on /recording/[id] and the ceremony
  // filter on the meetings list. The ceremony cascades with the workspace;
  // the meeting (TranscriptionSession.workspace is SetNull) is re-homed on
  // every seed the same way the OKR rows above are.
  const ceremony = await db.ceremony.upsert({
    where: { workspaceId_slug: { workspaceId: workspace.id, slug: FIXTURE.ceremonySlug } },
    update: { ownerId: user.id, isActive: true },
    create: {
      workspaceId: workspace.id,
      slug: FIXTURE.ceremonySlug,
      name: FIXTURE.ceremonyName,
      aliases: ["Daily Standup", "Standup"],
      kind: "STANDUP",
      purpose: "Surface blockers and align on today's priorities in fifteen minutes.",
      notFor: "Prioritisation debates - park them for the prioritisation ceremony.",
      inputs: "Yesterday's completed Actions and anything flagged as blocked.",
      outputs: "Blockers assigned an owner; parking-lot items carried to the next occurrence.",
      cadenceRule: "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR",
      timezone: "Europe/Berlin",
      startsOn: new Date("2026-09-01T00:00:00.000Z"),
      durationMinutes: 15,
      leadTimeHours: 12,
      ownerId: user.id,
      createdById: user.id,
      agendaTemplate: [
        { key: "blockers", type: "blockers", title: "Blockers", minutes: 5, config: {} },
        { key: "carried", type: "carried_over", title: "Carried over", minutes: 5, config: {} },
        { key: "free", type: "free_text", title: "Anything else", minutes: 5, config: {} },
      ],
    },
  });

  await db.ceremonyParticipant.upsert({
    where: { ceremonyId_userId: { ceremonyId: ceremony.id, userId: user.id } },
    update: {},
    create: { ceremonyId: ceremony.id, userId: user.id },
  });

  // 09:00 Europe/Berlin on Monday 8 September 2026 (CEST, UTC+2).
  const occurrenceStart = new Date("2026-09-08T07:00:00.000Z");
  const occurrenceEnd = new Date(occurrenceStart.getTime() + ceremony.durationMinutes * 60_000);
  const occurrence = await db.ceremonyOccurrence.upsert({
    where: {
      ceremonyId_scheduledStart: { ceremonyId: ceremony.id, scheduledStart: occurrenceStart },
    },
    update: { workspaceId: workspace.id, status: "CAPTURED" },
    create: {
      ceremonyId: ceremony.id,
      workspaceId: workspace.id,
      scheduledStart: occurrenceStart,
      scheduledEnd: occurrenceEnd,
      status: "CAPTURED",
      definitionSnapshot: {
        name: ceremony.name,
        slug: ceremony.slug,
        kind: ceremony.kind,
        cadenceRule: ceremony.cadenceRule,
        timezone: ceremony.timezone,
        durationMinutes: ceremony.durationMinutes,
        agendaTemplate: ceremony.agendaTemplate,
      },
    },
  });

  // Plain `Name: text` lines - the labelled-turns parser (ADR-0032) turns each
  // into one Transcript turn, so the decision's evidence `turnIndex` below
  // resolves to a real turn on the recording page.
  const transcriptTurns = [
    "Dev Fixture: Morning. Blockers first - anything stuck?",
    "Pat Reviewer: The accordion PR is waiting on a review, otherwise clear.",
    "Dev Fixture: Before we go on, can we talk about whether the peek drawer should ship before the hover affordances?",
    "Pat Reviewer: That is a prioritisation call, not a standup one. Let's park it for the prioritisation ceremony.",
    "Dev Fixture: Agreed. Decision: prioritisation debates get parked and go to the prioritisation ceremony.",
    "Pat Reviewer: Noted. I'll take the accordion review today.",
  ];
  const meetingSummary =
    "Short standup. One blocker (accordion review, picked up by Pat). Agreed to park prioritisation debates for the prioritisation ceremony.";
  const meeting = await db.transcriptionSession.upsert({
    where: { sessionId: FIXTURE.meetingSessionId },
    // The update branch refreshes the content too: the decision's evidence
    // `turnIndex` values are computed against `transcriptTurns` as written
    // here, so a stale transcript would deep-link to the wrong turn.
    update: {
      workspaceId: workspace.id,
      occurrenceId: occurrence.id,
      userId: user.id,
      title: FIXTURE.meetingTitle,
      meetingDate: occurrenceStart,
      transcription: transcriptTurns.join("\n"),
      summary: meetingSummary,
    },
    create: {
      sessionId: FIXTURE.meetingSessionId,
      title: FIXTURE.meetingTitle,
      meetingDate: occurrenceStart,
      userId: user.id,
      workspaceId: workspace.id,
      occurrenceId: occurrence.id,
      transcription: transcriptTurns.join("\n"),
      summary: meetingSummary,
      processedAt: occurrenceStart,
      durationSeconds: 9 * 60,
      participantCount: 2,
    },
  });

  // Decisions (ADR-0060): one confirmed decision logged from that meeting with
  // two quoted transcript turns as evidence. The label comes from the
  // workspace sequence, advanced inside the create transaction the way the
  // decision service will (like Product.ticketCounter), so the fixture shows
  // `D-0001`. Matched on statement so a re-seed re-attaches rather than
  // duplicates; the row cascades with the workspace.
  const existingDecision = await db.decision.findFirst({
    where: { workspaceId: workspace.id, statement: FIXTURE.decisionStatement },
  });
  // Every state-carrying field is re-asserted on re-seed so a decision that
  // was edited in a dev session converges back on the declared fixture.
  const decisionState = {
    body: [
      "## Context",
      "Standups were drifting into prioritisation debates.",
      "",
      "## Decision",
      "Prioritisation topics raised in a standup are parked and taken to the prioritisation ceremony.",
      "",
      "## Consequences",
      "Standups stay inside fifteen minutes; the parking lot carries the topic forward.",
    ].join("\n"),
    status: "ACCEPTED",
    reviewState: "CONFIRMED",
    source: "MEETING",
    decidedAt: occurrenceStart,
    ownerId: user.id,
    confirmedById: user.id,
    confirmedAt: occurrenceStart,
    transcriptionSessionId: meeting.id,
    occurrenceId: occurrence.id,
    productId: product.id,
    evidence: [
      { turnIndex: 3, speaker: "Pat Reviewer", startTime: null, text: transcriptTurns[3]!.replace(/^Pat Reviewer: /, "") },
      { turnIndex: 4, speaker: "Dev Fixture", startTime: null, text: transcriptTurns[4]!.replace(/^Dev Fixture: /, "") },
    ],
  } as const;
  const decision = existingDecision
    ? await db.decision.update({
        where: { id: existingDecision.id },
        data: decisionState,
      })
    : await db.$transaction(async (tx) => {
        const counter = await tx.workspace.update({
          where: { id: workspace.id },
          data: { decisionCounter: { increment: 1 } },
          select: { decisionCounter: true },
        });
        return tx.decision.create({
          data: {
            ...decisionState,
            workspaceId: workspace.id,
            number: counter.decisionCounter,
            statement: FIXTURE.decisionStatement,
            createdById: user.id,
            deciders: {
              create: [
                { userId: user.id, name: FIXTURE.userName, email: FIXTURE.userEmail },
                { name: "Pat Reviewer", email: "pat.reviewer@exponential.test" },
              ],
            },
          },
        });
      });

  const base = `/w/${FIXTURE.workspaceSlug}/products/${FIXTURE.productSlug}`;
  return {
    ceremonyId: ceremony.id,
    occurrenceId: occurrence.id,
    meetingUrl: `/recording/${meeting.id}`,
    decisionId: decision.id,
    decisionLabel: `D-${String(decision.number).padStart(4, "0")}`,
    decisionsUrl: `/w/${FIXTURE.workspaceSlug}/decisions`,
    projectGoalsUrl: `/w/${FIXTURE.workspaceSlug}/projects/${goalProject.slug}?tab=goals`,
    goalIds: {
      parent: parentGoal.id,
      child: childGoal.id,
      offProjectParent: offProjectParentGoal.id,
      detachedChild: detachedChildGoal.id,
    },
    userId: user.id,
    workspaceSlug: FIXTURE.workspaceSlug,
    otherWorkspaceSlug: FIXTURE.otherWorkspaceSlug,
    otherWorkspaceName: FIXTURE.otherWorkspaceName,
    otherWorkspaceActionName: FIXTURE.otherWorkspaceActionName,
    productSlug: FIXTURE.productSlug,
    featureId: feature.id,
    featureUrl: `${base}/features/${feature.id}`,
    peekUrl: `${base}/features?peek=${feature.id}`,
    featureTicketCount: TICKETS.filter((t) => !t.scopeOnly).length,
    totalTicketCount: TICKETS.length,
    okrUrl: `/w/${FIXTURE.workspaceSlug}/goals?tab=okrs&year=${FIXTURE.okrPeriod.split("-")[1]}&period=Annual`,
  };
}
