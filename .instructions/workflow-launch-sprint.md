# 🧠 Workflow: Solopreneur Launch Sprint

**Goal:**  
Implement a guided onboarding workflow that helps solo entrepreneurs launch their first project inside Exponential.im. This workflow generates a 3-week plan, injects tasks into their timeline, and tracks progress via Workflow + WorkflowStep models.

---

## 🧱 Step 1: Update Prisma Schema

Add these models:

```ts
model Workflow {
  id          String         @id @default(cuid())
  title       String
  description String?        @db.Text
  type        String         // e.g., "launch_sprint"
  createdBy   User           @relation(fields: [createdById], references: [id])
  createdById String
  createdAt   DateTime       @default(now())
  updatedAt   DateTime       @updatedAt

  steps       WorkflowStep[]
  projects    Project[]
}

model WorkflowStep {
  id          String     @id @default(cuid())
  workflow    Workflow   @relation(fields: [workflowId], references: [id], onDelete: Cascade)
  workflowId  String
  order       Int
  title       String
  actionId    String?    // optional—link to generated action
  action      Action?    @relation(fields: [actionId], references: [id])
  status      String     @default("PENDING") // PENDING | DONE | SKIPPED
}
```

Tasks:
 Add models above to schema.prisma

 Run npx prisma migrate dev --name add-workflows

 Run prisma generate command and Update Prisma client

## 🧠 Step 2: Build AI-Driven Launch Flow

Prompt Template:

```txt
You are a startup co-pilot for a solo entrepreneur.

Given:
- Product description: "{{product_description}}"
- Differentiators: {{[differentiators]}}
- Goals: {{[goals]}}
- Target audience: {{[audience]}}

Generate a 3-week lean launch plan with:
- 3–5 tasks per week
- A suggested project name
- One measurable outcome
- Clear task names and short descriptions

Output as JSON for downstream use.
```

Tasks:
 Create prompt file: prompts/launch-sprint.txt

 Implement handler that accepts onboarding inputs and calls AI

 Parse and store results into:

A Project

An Outcome

Multiple Actions (spread across 3 weeks)

A Workflow and linked WorkflowSteps

## 🧑‍🎓 Step 3: Build the Onboarding UI
Flow:
Step 1: Select launch goals (checkbox)

Step 2: Describe your product + pick differentiators

Step 3: Select your target audience

Submit → triggers AI + generates project + tasks

Tasks:
 Create pages/onboarding/launch

 Build a 3-step UI form

 On submit, call launch plan generator

 Display final screen:

“🎯 Your launch sprint is ready”

[Start Working Now] → opens Today

[View Project]

[Reflect] → opens Journal

## 🧩 Step 4: System Output Example
Project:
Name: Launch Exponential.im

Description: Launch plan to get first 10 users

Status: ACTIVE

Outcome:
Description: Have 10 users using the product by April 15

Type: monthly

Actions:
Write your founder story

Create landing page

DM 10 people

Launch to 1 community

Collect feedback + iterate

WorkflowSteps:
Each task above becomes a step in the workflow with order + status tracking.

## 🔁 Step 5: Post-Launch Flow
Tasks:
 Auto-schedule follow-up prompt after 7 days:

“How’s your launch going?”

Suggest Journal entry or next sprint

 Add future sprints (e.g. “Grow your Twitter,” “Build your audience”)

🔚 End of Instructions