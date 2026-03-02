# UX Improvement Plan — New User Experience

> Generated from cognitive walkthrough (Feb 2026). Tracks all friction points, their beads, and recommended sequencing.

## Status Overview

| Status | Count |
|--------|-------|
| Done   | 5 (F1, F2, F6, 7wlo, peyl) |
| Open   | 7 (all unblocked) |

---

## Completed

### F1: Landing Page Hero Screenshot — Placeholder Image
- **Fix**: Rewrote `ProductDemoSection.tsx` as a 23-slide carousel with real product screenshots, auto-cycling, browser chrome, keyboard nav, and framer-motion animations.

### F2: Post-Onboarding Dead End — `exponential-7wlo` CLOSED
- **Fix**: Built welcome checklist at `/welcome` with 7 auto-detected steps, progress bar, AI chat integration, confetti celebration, and banner on `/home`. Redirect flow: onboarding -> /welcome (first 24h) -> /home (with banner).
- **Key files**: `WelcomeChecklist.tsx`, `user.ts` (getWelcomeProgress, getOnboardingProject, completeWelcome), `welcome/page.tsx`, `home/page.tsx`, `CommandCenter.tsx`

### "Learn Exponential" Onboarding Project — `exponential-peyl` CLOSED
- **Fix**: Auto-created Project with 7 onboarding actions synced via `syncOnboardingProgress`. Template in `onboardingProjectTemplate.ts`.

### F6: Dashboard Widgets Show Empty Data
- **Fix**: Addressed via welcome banner and checklist guiding users through setup. Advanced widget hiding tracked separately as F10.

---

## Open — Prioritized Backlog

### Phase 1: Empty States (Biggest Remaining Gap)

#### `exponential-tw9d` [P1] — F3: Redesign empty states across all feature pages
- **Problem**: Empty states show bare text like "No outcomes found" with no illustration, explanation, or CTA
- **Solution**: Create shared `EmptyState` component with illustration/icon, heading, description, and primary CTA button
- **Apply to**: Projects (`Projects.tsx:384`), Goals (`GoalsTable.tsx:42`), Outcomes (`OutcomesTable.tsx:67`), Actions (`ActionList.tsx:1479`), `ProjectStateOverview` (`:56`), `GoalsProgressDashboard`, `HabitsDueToday`, CRM pages
- **Benchmark**: Use `InboxZeroCelebration` as quality reference
- **Dependencies**: None — can start immediately

### Phase 2: Trust & Social Proof (Quick Win)

#### `exponential-91ui` [P2] — F7: Replace placeholder social proof with real logos/testimonials
- **Problem**: Landing page shows fake company names (TechCorp, StartupX, BuildCo, ShipFast)
- **Solution**: Replace with real customer logos or remove entirely until real content exists
- **Files**: `SocialProof.tsx:15-31`, `TestimonialsSection.tsx:8-33`
- **Blocks**: `28ok` (F16)

#### `exponential-28ok` [P3] — F16: Replace fabricated testimonials
- **Problem**: Three testimonials from fake people/companies (Sarah Chen/TechStart, Marcus Rivera/BuildFast, Alex Kim/ShipCo)
- **Solution**: Replace with real testimonials or remove entirely
- **File**: `TestimonialsSection.tsx:8-33`
- **Depends on**: `91ui` (do together)

### Phase 3: Navigation & Discovery

#### `exponential-h7vc` [P2] — F13: Add global create shortcut (Cmd+K or FAB)
- **Problem**: Users must navigate to specific page to create items. No universal create button or keyboard shortcut
- **Solution**: Add Cmd+K palette or global FAB with: New Action, New Project, New Goal, New Outcome
- **Dependencies**: None — can start anytime

### Phase 4: New User Progressive Disclosure (Unblocked After Welcome Ships)

#### `exponential-rlcs` [P2] — F4: Progressive sidebar disclosure for new users
- **Problem**: Sidebar exposes ~20 nav items immediately; new users don't know what Momentum, Wheel of Life, etc. are
- **Solution**: Show simplified sidebar for first 7 days (Home, Today, Projects, Goals) with "More features" expander
- **Files**: `NavLinks.tsx:70-129`, `SidebarContent.tsx:28-247`
- **Depends on**: `7wlo` ✅ (now unblocked)

#### `exponential-2snl` [P2] — F10: Hide advanced dashboard widgets for new users
- **Problem**: Dashboard shows Weekly Review, Daily Plan, OKR widgets to users with no data
- **Solution**: Replace with WelcomeBanner/Getting Started content when `welcomeCompletedAt` not set
- **File**: `CommandCenter.tsx:32-36`
- **Depends on**: `7wlo` ✅ (now unblocked)

#### `exponential-1odq` [P3] — D4: First-week progress tracker widget
- **Problem**: No visible progress indicator on dashboard during first week
- **Solution**: Dashboard widget: "Your first week: 2/5 milestones completed" with progress items
- **Depends on**: `7wlo` ✅ (now unblocked)

---

## Recommended Sequence

```
1. ✅ 7wlo + peyl              ← DONE — welcome checklist + onboarding project
2. tw9d (F3: empty states)    ← Biggest remaining gap, no blockers  ← NEXT
3. 91ui + 28ok (F7/F16)       ← Quick trust win, do together
4. h7vc (F13: global create)  ← Reduces friction across all features
5. rlcs (F4: sidebar)         ← Now unblocked
6. 2snl (F10: widgets)        ← Now unblocked
7. 1odq (D4: progress)        ← Nice-to-have, now unblocked
```

---

## Dependency Graph

```
7wlo (welcome checklist) ──┬──> rlcs (sidebar disclosure)
                           ├──> 2snl (widget hiding)
                           └──> 1odq (progress tracker)

91ui (social proof) ───────> 28ok (testimonials)

tw9d (empty states)         [independent]
h7vc (global create)        [independent]
```

---

## Other Friction Points Noted (Not Yet Beaded)

These were identified in the audit but are lower priority or already partially addressed:

| ID | Issue | Notes |
|----|-------|-------|
| F5 | No feedback after creating first items | Partially addressed by welcome checklist auto-detection |
| F8 | Calendar settings hard to find | Low priority — settings page exists |
| F9 | No explanation of Goals/Outcomes/Actions relationship | Addressed by AI chat in welcome flow |
| F11 | No quick-start templates | Future enhancement |
| F12 | Mobile responsiveness gaps | Separate workstream |
| F14 | Onboarding skippable without fallback | Skip now redirects to /welcome with checklist |
| F15 | No "what's new" or changelog | Future enhancement |

---

## Delight Opportunities (Future)

| ID | Opportunity | Effort |
|----|-------------|--------|
| D1 | Micro-animations on item creation | Small |
| D2 | Personalized dashboard greeting with context | Small (already started in GreetingHeader) |
| D3 | Achievement badges for milestones | Medium |
| D5 | Smart suggestions based on user behavior | Large |
| D6 | Onboarding video walkthrough | Medium |
| D7 | Interactive tutorial overlays | Large |
