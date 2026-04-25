---
title: OKRs (Objectives & Key Results)
description: Track objectives and measurable key results aligned with your goals
---

## Overview

The OKRs plugin helps you track Objectives and Key Results - a goal-setting framework used by companies like Google and Intel to align teams around measurable outcomes.

In Exponential, OKRs integrate with your existing Goals, using them as Objectives. You then define measurable Key Results for each Objective to track progress throughout a period.

## Key Concepts

### Objectives
Objectives are your existing Goals in Exponential. They represent what you want to achieve - ambitious, qualitative statements that inspire and direct your work.

**Examples:**
- Launch a successful product
- Build a world-class engineering team
- Improve customer satisfaction

### Key Results
Key Results are specific, measurable outcomes that indicate whether you've achieved your Objective. Each Objective can have multiple Key Results.

**Examples:**
- Acquire 1,000 new users (count)
- Achieve 95% customer satisfaction score (percentage)
- Reduce average response time to under 2 hours (time)

## Getting Started

### Enabling the OKR Plugin

1. Go to **Settings > Plugins** in your workspace
2. Ensure the **OKRs** plugin is enabled
3. Click **OKRs** in the sidebar to access the dashboard

### Creating Your First Key Result

1. Navigate to the **OKRs** page from the sidebar
2. Select a period (e.g., Q1 2025)
3. Click **Add Key Result**
4. Fill in the details:
   - **Title**: What you're measuring
   - **Objective**: Link to an existing Goal
   - **Target Value**: Your goal number
   - **Unit**: How you measure it (percent, count, currency, hours, custom)
5. Click **Create** to save

## Period-Based Tracking

OKRs are organized by time periods to help you stay focused:

| Period Type | Format | Example |
|-------------|--------|---------|
| Quarterly | Q1-Q4 | Q1 2025, Q2 2025 |
| Half-Yearly | H1-H2 | H1 2025, H2 2025 |
| Annual | Annual | Annual 2025 |

### Switching Periods

Use the period dropdown at the top of the OKR dashboard to filter by:
- Current quarter
- Upcoming quarters
- Half-year periods
- Full year view

## Progress Tracking

### Updating Progress

1. Find the Key Result you want to update
2. Click on the progress bar or edit button
3. Enter the new current value
4. The system automatically calculates the percentage

### Progress Calculation

Progress is calculated as:

```
Progress % = ((Current Value - Start Value) / (Target Value - Start Value)) * 100
```

For example, if your target is 100 users and you currently have 45:
- Progress = (45 - 0) / (100 - 0) * 100 = 45%

### Status Indicators

Key Results are automatically assigned a status based on progress:

| Status | Progress | Color |
|--------|----------|-------|
| Achieved | 100%+ | Green |
| On Track | 70-99% | Green |
| At Risk | 40-69% | Yellow |
| Off Track | 0-39% | Red |

## Unit Types

Choose the right unit type for your Key Result:

| Unit | Use Case | Example |
|------|----------|---------|
| **Percent** | Completion rates, scores | 95% customer satisfaction |
| **Count** | Quantity metrics | 1,000 new users |
| **Currency** | Financial goals | $50,000 revenue |
| **Hours** | Time-based metrics | 2 hours response time |
| **Custom** | Any other metric | 5 new features |

For custom units, you can specify a label like "$", "users", "features", etc.

## Dashboard Widget

When the OKR plugin is enabled, a progress widget appears on your main dashboard showing:

- Overall progress across all active Key Results
- Status breakdown (On Track, At Risk, Off Track, Achieved)
- Quick link to the full OKR dashboard

## Quick Metrics

The OKR dashboard displays key metrics at a glance:

| Metric | Description |
|--------|-------------|
| **Total Objectives** | Number of Goals with Key Results |
| **Key Results** | Total number of Key Results |
| **Avg Progress** | Average progress across all KRs |
| **Status Breakdown** | Count of KRs in each status |

## Creating Objectives

If you need to create a new Objective (Goal) while working on OKRs:

1. Click **Create New Goal** from the OKR dashboard
2. Fill in the goal details
3. The goal becomes available as an Objective for Key Results

## Best Practices

### Writing Good Objectives
- Make them inspirational and ambitious
- Focus on outcomes, not outputs
- Limit to 3-5 Objectives per period

### Writing Good Key Results
- Make them specific and measurable
- Set challenging but achievable targets
- Include 2-5 Key Results per Objective

### Regular Check-ins
- Update Key Results weekly
- Review status and adjust plans as needed
- Celebrate progress and learn from setbacks

## Integration with Goals

The OKR plugin enhances your existing Goals system:

- Goals serve as your Objectives
- Key Results provide measurable milestones
- Progress on Key Results shows Goal completion
- Life Domains help categorize Objectives

## Next Steps

- [Learn about Goals & Outcomes](/docs/features/goals-outcomes)
- [Return to Plugins overview](/docs/features/plugins)
