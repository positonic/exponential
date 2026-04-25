# PRD: Public Bounty Board & Open Contributor Platform

**Author**: James
**Date**: 2026-02-18
**Status**: Draft
**Project**: Exponential MVP

---

## 1. Problem Statement

Software projects on Exponential are currently closed systems — only workspace members can see and work on tasks. Project owners who want to outsource specific functionality have no way to expose tasks publicly, attract external contributors, or compensate them. This creates a bottleneck: all development depends on the core team.

The broader ecosystem also lacks a project management tool that natively integrates bounty-based open contribution. Existing bounty platforms (Gitcoin, Bount.ing) are separate from where work is actually tracked, creating friction and context-switching.

## 2. Vision

Transform Exponential into a self-sovereign development platform where any organization or project on the platform can open up specific tasks as paid bounties, attract pseudonymous contributors via wallet identity, and pay them in crypto — all without leaving their existing project management workflow.

## 3. Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Scope | Platform-wide (any org/project) | Maximizes network effects, not just internal use |
| Payment | Crypto (wallet-based) | Aligns with self-sovereign identity, borderless payments |
| Identity | Pseudonymous via wallet | Lower barrier to entry, privacy-respecting |
| Governance | Project owner decides what's open | Simple starting point, DAO governance is future work |

## 4. User Personas

### 4.1 Project Owner (Poster)
- Already uses Exponential for project management
- Wants to outsource specific, well-defined tasks
- Has crypto to fund bounties
- Needs quality control over contributions

### 4.2 Contributor (Worker)
- Developer/designer looking for paid work
- May or may not have an Exponential account
- Connects via wallet (Silk SDK)
- Wants to build reputation through completed work
- May be pseudonymous

### 4.3 Platform Visitor (Browser)
- Unauthenticated user browsing available bounties
- Evaluating whether to contribute
- Needs to see project context, bounty details, and requirements without signing up

## 5. Feature Specification

### Phase 1: Public Bounty Board (Core MVP)

#### 5.1 Public Project & Task Visibility

**Existing foundation**: `Project.isPublic` field already exists and is integrated into access control. Currently only grants view access to authenticated users.

**Changes needed**:
- Create unauthenticated public routes (`/explore`, `/explore/[projectSlug]`, `/explore/[projectSlug]/bounties/[actionId]`)
- Public project listing page showing all `isPublic` projects that have open bounties
- Public project detail page showing project description, team, and open bounty tasks
- Public bounty detail page showing task requirements, reward amount, and application instructions
- Respect that only actions explicitly marked as bounties are shown publicly (not all project actions)

**Data exposed publicly** (no auth required):
- Project: name, description, slug, tags, team size, bounty count
- Bounty actions: name, description, requirements, reward amount, status, skills needed, difficulty level
- Contributor stats: number of completed bounties (aggregated, not individual)

**Data NOT exposed publicly**:
- Internal actions (non-bounty tasks)
- Team member identities (unless they opt in)
- Project financials beyond individual bounty amounts
- Private discussions or comments

#### 5.2 Bounty System on Actions

**New fields on Action model**:
- `isBounty: Boolean` (default false) — marks this action as an open bounty
- `bountyAmount: Decimal?` — reward amount
- `bountyToken: String?` — token/currency (e.g., "ETH", "USDC", "MATIC")
- `bountyStatus: BountyStatus?` — enum: OPEN, CLAIMED, IN_REVIEW, APPROVED, PAID, DISPUTED, CANCELLED
- `bountyDifficulty: String?` — "beginner", "intermediate", "advanced", "expert"
- `bountySkills: String[]` — required skills (e.g., ["TypeScript", "React", "Prisma"])
- `bountyDeadline: DateTime?` — optional deadline for bounty completion
- `bountyMaxClaimants: Int?` — how many people can claim simultaneously (default 1)
- `bountyExternalUrl: String?` — link to GitHub issue, spec doc, etc.

**New BountyStatus enum**:
```
OPEN        — accepting claims
CLAIMED     — someone is working on it
IN_REVIEW   — work submitted, under review
APPROVED    — work accepted, pending payment
PAID        — payment sent
DISPUTED    — disagreement on completion
CANCELLED   — bounty withdrawn
```

**Bounty lifecycle**:
1. Project owner creates an action, toggles `isBounty`, sets amount/token/skills
2. Action appears on public bounty board
3. Contributor claims the bounty (creates a `BountyClaim`)
4. Contributor works on it, submits deliverable
5. Owner reviews submission
6. Owner approves → triggers payment flow
7. Bounty marked as PAID, contributor reputation updated

#### 5.3 Contributor Identity (Wallet-Based)

**Existing foundation**: Silk Wallet SDK already in `package.json`, `HumanButton` component handles login.

**Extend User model**:
- `walletAddress: String?` (unique, indexed) — Ethereum address from Silk SDK
- `walletVerified: Boolean` (default false) — verified ownership via signature
- `displayName: String?` — pseudonymous display name (optional)
- `bio: String?` — short bio
- `contributorSkills: String[]` — self-reported skills
- `isContributor: Boolean` (default false) — opted into contributor profile

**Authentication flow for contributors**:
1. Visitor browses `/explore` — no auth needed
2. Clicks "Claim Bounty" → prompted to connect wallet (Silk SDK)
3. Signs a message to verify wallet ownership
4. Account created (or linked if wallet already known) — no email/OAuth required
5. Can now claim bounties, submit work, receive payments

**Existing users can also link wallets**:
- Settings page gets "Connect Wallet" option
- Links wallet to existing OAuth-authenticated account
- Can then both post and claim bounties

#### 5.4 Bounty Claim & Submission Flow

**New BountyClaim model**:
- `id: String` (cuid)
- `actionId: String` — the bounty action
- `contributorId: String` — the claiming user
- `status: ClaimStatus` — ACTIVE, SUBMITTED, APPROVED, REJECTED, WITHDRAWN
- `claimedAt: DateTime`
- `submittedAt: DateTime?`
- `reviewedAt: DateTime?`
- `submissionUrl: String?` — PR link, deployment URL, etc.
- `submissionNotes: String?` — contributor's description of work done
- `reviewNotes: String?` — owner's review feedback
- `transactionHash: String?` — payment transaction reference

**Claim flow**:
1. Contributor clicks "Claim" on a bounty
2. System checks: bounty is OPEN, contributor hasn't exceeded max active claims, max claimants not reached
3. BountyClaim created with status ACTIVE
4. Bounty status changes to CLAIMED (if maxClaimants = 1) or stays OPEN
5. Contributor gets a deadline (bountyDeadline or default 14 days)
6. If deadline expires without submission, claim auto-expires, bounty reopens

**Submission flow**:
1. Contributor submits via the bounty detail page
2. Provides: submission URL (e.g., PR link), notes
3. Claim status → SUBMITTED, bounty status → IN_REVIEW
4. Owner gets notification
5. Owner reviews: approve or request changes
6. If approved: claim → APPROVED, bounty → APPROVED, then payment triggered

#### 5.5 Project Owner Controls

Project owners need fine-grained control over what's exposed:

- **Per-action bounty toggle** — not all public project tasks are bounties
- **Approval required before claim starts** — optional "application" mode where contributors apply and owner selects
- **Bounty templates** — save common configurations (amount, skills, difficulty)
- **Auto-close on PR merge** — if GitHub integration exists, auto-approve when linked PR is merged
- **Contributor blocklist** — block problematic contributors from claiming

### Phase 2: Crypto Payments

#### 5.6 Wallet Integration (Silk SDK)

**Existing foundation**: Silk Wallet SDK already in `package.json`, `HumanButton` component handles login.

**Extend to support**:
- Wallet address persistence to User model
- Signature verification for wallet ownership
- Transaction signing for bounty payments
- Multi-chain support (Ethereum, Polygon, Base — start with one)

**Recommended starting chain**: Base (Coinbase L2)
- Low gas fees (fractions of a cent)
- USDC native support (stable payments)
- Good developer tooling
- Growing ecosystem

#### 5.7 Payment Flow

**Option A: Direct Payment (Phase 2 MVP)**
- Owner approves bounty → UI prompts owner to send payment
- Owner signs transaction via their connected wallet
- Transaction hash recorded on BountyClaim
- System monitors for confirmation
- Bounty marked PAID on confirmation

**Option B: Escrow Contract (Phase 2.5)**
- Owner funds bounty upfront → tokens held in smart contract
- On approval, contract releases funds to contributor
- On dispute, funds held until resolution
- More trust for contributors, but requires smart contract development

**Start with Option A** — simpler, no smart contract needed. The platform facilitates but doesn't custody funds.

#### 5.8 Payment Tracking

**New PaymentRecord model**:
- `id: String`
- `bountyClaimId: String`
- `fromAddress: String` — payer wallet
- `toAddress: String` — recipient wallet
- `amount: Decimal`
- `token: String` — "ETH", "USDC", etc.
- `chain: String` — "base", "ethereum", "polygon"
- `transactionHash: String`
- `status: PaymentStatus` — PENDING, CONFIRMED, FAILED
- `confirmedAt: DateTime?`

### Phase 3: Reputation System

#### 5.9 Contributor Reputation

**Reputation score** derived from:
- Bounties completed (weighted by difficulty and amount)
- Approval rate (% of submissions approved on first review)
- Timeliness (completed before deadline)
- Repeat engagement (returning to same project)
- Streak bonuses (consecutive successful bounties)

**Trust tiers**:
| Tier | Name | Requirements | Privileges |
|------|------|-------------|------------|
| 0 | New | Just joined | Claim beginner bounties only |
| 1 | Verified | 1 bounty completed | Claim intermediate bounties |
| 2 | Trusted | 5 bounties, >80% approval | Claim advanced bounties, skip application |
| 3 | Expert | 20 bounties, >90% approval | Claim expert bounties, can review others |
| 4 | Core | Invited by project owner | Full project access, can post bounties |

**Public reputation display**:
- Contributor profile shows tier, stats, completed bounties
- Visible on bounty claims so owners can assess applicants
- Portable across all projects on the platform

#### 5.10 Project Reputation

Projects also build reputation:
- Payment reliability (% of approved bounties actually paid)
- Response time (how quickly they review submissions)
- Bounty clarity (% of bounties completed without disputes)
- Displayed on public project page to attract contributors

### Phase 4: Future — DAO Governance (Out of Scope for Now)

Noted for future consideration:
- Token-gated project access
- Community voting on which tasks to bounty
- Budget allocation through governance
- Revenue sharing for contributors
- Soul-bound tokens for verified contributions

## 6. Technical Architecture

### 6.1 New Routes (Unauthenticated)

```
/explore                              — Public bounty board (browse all)
/explore/[projectSlug]                — Public project page with bounties
/explore/[projectSlug]/bounties/[id]  — Individual bounty detail
/contributors/[identifier]            — Public contributor profile
```

### 6.2 New tRPC Routes

```
bounty.listPublic          — List open bounties (no auth)
bounty.getPublic           — Get bounty details (no auth)
bounty.claim               — Claim a bounty (wallet auth)
bounty.submit              — Submit work (wallet auth)
bounty.review              — Review submission (project owner)
bounty.approve             — Approve and trigger payment (project owner)
bounty.cancel              — Cancel bounty (project owner)
contributor.getProfile     — Public contributor profile (no auth)
contributor.updateProfile  — Update own profile (wallet auth)
project.listPublic         — List public projects with bounties (no auth)
project.getPublic          — Get public project details (no auth)
```

### 6.3 Public API Consideration

Some routes must work without authentication. Options:
- tRPC public procedures (no `protectedProcedure`, just `publicProcedure`)
- Separate REST API for public endpoints
- **Recommended**: Use tRPC `publicProcedure` for consistency

### 6.4 Middleware Changes

- Update Next.js middleware to allow `/explore` and `/contributors` routes without auth
- Add wallet-based auth as alternative to OAuth (Silk SDK signature verification)
- Create `walletAuthProcedure` for tRPC routes that accept wallet auth

### 6.5 Database Schema Changes Summary

**Modified models**:
- `User` — add wallet fields
- `Action` — add bounty fields

**New models**:
- `BountyClaim` — claim/submission tracking
- `PaymentRecord` — crypto payment tracking

**New enums**:
- `BountyStatus`
- `ClaimStatus`
- `PaymentStatus`

## 7. Non-Functional Requirements

### 7.1 Security
- Wallet signature verification must use EIP-191 or EIP-4361 (Sign-In with Ethereum)
- Public endpoints must be rate-limited
- No private data leaks through public APIs
- Input validation on all public-facing endpoints
- CSRF protection on state-changing operations

### 7.2 Performance
- Public bounty listing must load <2s
- Paginated queries for bounty listings (cursor-based)
- Cache public project/bounty data (ISR or SWR)
- Index all query-critical fields

### 7.3 Privacy
- Contributors can be fully pseudonymous (wallet + optional display name)
- No email required for wallet-only accounts
- Wallet addresses are public by nature (blockchain)
- Contributor can delete profile but on-chain payment history persists

## 8. Success Metrics

- Number of projects with active bounties
- Number of bounties claimed / completed
- Contributor sign-ups (wallet connections)
- Average time from bounty posted → completed
- Payment completion rate
- Contributor retention (return rate)

## 9. Implementation Priority

| Priority | Feature | Phase |
|----------|---------|-------|
| P0 | Public bounty listing pages | Phase 1 |
| P0 | Bounty fields on Action model | Phase 1 |
| P0 | Wallet auth (Silk SDK persistence) | Phase 1 |
| P0 | Claim/submit/review flow | Phase 1 |
| P1 | Crypto payment flow (direct, Base/USDC) | Phase 2 |
| P1 | Payment tracking | Phase 2 |
| P2 | Contributor reputation/tiers | Phase 3 |
| P2 | Project reputation | Phase 3 |
| P3 | Escrow smart contract | Phase 2.5 |
| P3 | DAO governance | Phase 4 |

## 10. Open Questions

1. **Platform fee**: Should Exponential take a % of bounty payments? If so, how much?
2. **Dispute resolution**: Who arbitrates disputes between owners and contributors? (Manual for now?)
3. **KYC/AML**: At what payment threshold (if any) do we need identity verification?
4. **Multi-chain**: Start with Base only, or support multiple chains from day 1?
5. **Notifications**: How do contributors get notified of new bounties matching their skills? (Email? Push? On-platform only?)