# CRM Feature Assessment: Migrating from impactful-events to exponential

## Executive Summary

Adding CRM functionality from impactful-events to exponential would be a **substantial undertaking**. The source CRM has ~5,400 lines of code with 8 database models, 4 pages, and extensive third-party integrations.

---

## Source CRM Inventory (impactful-events)

### Database Models (8 total)
| Model | Purpose | Fields |
|-------|---------|--------|
| `Contact` | Individual people | firstName, lastName, email, phone, linkedIn, telegram, twitter, github, about, skills, lastInteraction |
| `ContactInteraction` | Activity tracking | type, direction, subject, notes (EMAIL, TELEGRAM, PHONE_CALL, MEETING, NOTE) |
| `Sponsor` | Organizations/Companies | name, websiteUrl, logoUrl |
| `EventSponsor` | Sponsor-Event junction | qualified status, event linkage |
| `SponsorVisitRequest` | Meeting scheduling | visitType, status, scheduling |
| `SponsorDeliverable` | Sponsor obligations | category, title, dueDate, time tracking |
| `Communication` | Multi-channel messaging | email/telegram/SMS, templates, engagement tracking |
| `Email` | Legacy email records | backward compatibility |

### Pages/Routes (4 implemented)
1. `/crm/contacts` - Contact list with filtering, search, bulk selection
2. `/crm/contacts/[id]` - Contact detail with tabbed interface (overview, activity, communications)
3. `/crm/organizations` - Organization list with drawer details
4. `/crm/organizations/[id]` - Organization detail page
5. `/crm/communicate` - Bulk Telegram messaging interface

### API Endpoints
**Contact Router (1,663 lines):**
- 6 queries: getContacts, getContact, getContactCommunications
- 14 mutations: create, update, import (Google/Notion/Telegram), merge, assign to sponsor

**Sponsor Router:**
- Queries: getSponsors, getSponsor, getSponsorsByEvent, getSponsorStats
- Mutations: create, update, delete, assignToEvent

### External Integrations
- **Google Contacts API** - Contact sync
- **Gmail API** - Email import/threading
- **Notion API** - Contact database import
- **Telegram** - Message history import, bulk messaging
- **Postmark** - Email delivery tracking

### Key Features
- Multi-source contact import (Google, Notion, Telegram, event applicants)
- Connection strength scoring
- Interaction timeline tracking
- Bulk communication (Telegram)
- Organization-contact relationships
- Engagement metrics (opens, clicks, reads)

---

## What Would Need to Be Added to Exponential

### New Database Models (6-8 models)

**Core CRM Models:**
1. `Contact` - Individual contacts with workspace scoping
2. `Organization` - Companies/accounts (adapting Sponsor model)
3. `ContactInteraction` - Activity/engagement tracking
4. `Communication` - Multi-channel message records

**Optional/Future:**
5. `Deal` - Sales opportunities (if pipeline needed)
6. `DealStage` - Pipeline configuration
7. `ContactTag` - Contact categorization
8. `CommunicationTemplate` - Message templates

### New Pages (4-5 pages)

```
src/app/(sidemenu)/w/[workspaceSlug]/crm/
├── layout.tsx              # CRM layout with sidebar
├── page.tsx                # CRM dashboard
├── contacts/
│   ├── page.tsx            # Contact list
│   └── [id]/page.tsx       # Contact detail
├── organizations/
│   ├── page.tsx            # Organization list
│   └── [id]/page.tsx       # Organization detail
└── communicate/page.tsx    # Bulk messaging (optional)
```

### New tRPC Routers (2-3 routers)

1. **contactRouter** (~800-1,200 lines)
   - CRUD operations
   - Import mutations (if integrations needed)
   - Interaction tracking
   - Search/filter queries

2. **organizationRouter** (~300-500 lines)
   - CRUD operations
   - Contact relationships
   - Statistics queries

3. **communicationRouter** (~400-600 lines, optional)
   - Message sending
   - Template management
   - Engagement tracking

### New Components (10-15 components)

**Layout:**
- `CRMSidebar.tsx` - CRM navigation
- `CRMLayout.tsx` - CRM shell

**Contact Components:**
- `ContactList.tsx` - Table/list view
- `ContactCard.tsx` - Contact summary card
- `ContactDetail.tsx` - Full contact view
- `ContactForm.tsx` - Create/edit form
- `ContactInteractionTimeline.tsx` - Activity history
- `ContactImportModal.tsx` - Import wizard (if needed)

**Organization Components:**
- `OrganizationList.tsx`
- `OrganizationDetail.tsx`
- `OrganizationDrawer.tsx`

**Shared:**
- `ConnectionStrengthBadge.tsx`
- `InteractionTypeIcon.tsx`

### Integration Work

**If full feature parity needed:**
- Google Contacts OAuth + sync
- Gmail API integration
- Notion API integration
- Telegram integration

**Simpler alternative:**
- CSV import only
- Manual entry
- Link to external CRM tools

---

## Effort Estimate

### Minimum Viable CRM (Basic contacts + organizations)

| Component | Effort |
|-----------|--------|
| Database schema (4 models) | Small |
| Contact router + service | Medium |
| Organization router | Small |
| 4 pages (list + detail × 2) | Medium |
| ~10 components | Medium |
| **Total** | **~3,000-4,000 lines of code** |

### Full Feature Parity

| Component | Effort |
|-----------|--------|
| Database schema (8 models) | Medium |
| 3 routers (~2,500 lines) | Large |
| 5 pages | Medium |
| 15+ components | Large |
| External integrations | Very Large |
| **Total** | **~5,000-7,000 lines of code** |

---

## Compatibility Assessment

### Good Fit ✅
- Workspace infrastructure exists and matches CRM needs
- tRPC patterns already established
- Mantine UI + Tailwind matches source styling
- Service layer pattern can be reused
- Role-based access already implemented

### Adaptation Needed ⚠️
- Source uses `Sponsor` model → need to adapt to generic `Organization`
- Event-specific features need generalization
- Telegram integration is tightly coupled to source app

### Challenges 🔴
- External integrations are complex (~1,000+ lines just for Google)
- Communication system has significant infrastructure
- Some features are event-management specific (SponsorVisitRequest, SponsorDeliverable)

---

## Implementation Plan: Full Feature Parity

### Phase 1: Database & Core Infrastructure

**New Prisma Models:**
```prisma
model Contact {
  id                  String    @id @default(cuid())
  workspaceId         String
  firstName           String?
  lastName            String?
  email               String?
  phone               String?
  linkedIn            String?
  telegram            String?
  twitter             String?
  github              String?
  about               String?   @db.Text
  skills              String[]
  lastInteractionAt   DateTime?
  lastInteractionType String?
  organizationId      String?
  createdById         String
  createdAt           DateTime  @default(now())
  updatedAt           DateTime  @updatedAt

  workspace           Workspace @relation(...)
  organization        Organization? @relation(...)
  interactions        ContactInteraction[]
  communications      Communication[]
  createdBy           User @relation(...)
}

model Organization {
  id          String    @id @default(cuid())
  workspaceId String
  name        String
  websiteUrl  String?
  logoUrl     String?
  contacts    Contact[]
  createdById String
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt

  workspace   Workspace @relation(...)
}

model ContactInteraction {
  id        String   @id @default(cuid())
  contactId String
  userId    String
  type      String   // EMAIL, TELEGRAM, PHONE_CALL, MEETING, NOTE
  direction String   // INBOUND, OUTBOUND
  subject   String?
  notes     String?  @db.Text
  createdAt DateTime @default(now())

  contact   Contact @relation(...)
  user      User @relation(...)
}

model Communication {
  id          String   @id @default(cuid())
  contactId   String?
  workspaceId String
  type        String   // EMAIL, TELEGRAM
  fromEmail   String?
  toEmail     String?
  fromTelegram String?
  toTelegram  String?
  subject     String?
  textContent String?  @db.Text
  htmlContent String?  @db.Text
  status      String   // DRAFT, QUEUED, SENT, FAILED
  sentAt      DateTime?
  openedAt    DateTime?
  createdAt   DateTime @default(now())

  contact     Contact? @relation(...)
  workspace   Workspace @relation(...)
}
```

### Phase 2: API Layer

**New Routers to Create:**

| Router | File | Est. Lines | Key Operations |
|--------|------|------------|----------------|
| `contact.ts` | `src/server/api/routers/contact.ts` | ~1,200 | getAll, getById, create, update, delete, importGoogle, importNotion, importTelegram, mergeContacts |
| `organization.ts` | `src/server/api/routers/organization.ts` | ~400 | getAll, getById, create, update, delete, getStats |
| `communication.ts` | `src/server/api/routers/communication.ts` | ~500 | send, getHistory, createTemplate, bulkSend |

**New Services:**
- `src/server/services/ContactService.ts` - Contact business logic
- `src/server/services/CommunicationService.ts` - Messaging logic
- `src/server/services/ContactImportService.ts` - Import orchestration

### Phase 3: External Integrations

**Google Integration (~600 lines):**
- Google Contacts API sync
- Gmail message import
- OAuth token management
- Already have some Google integration in exponential (calendar) - can extend

**Notion Integration (~300 lines):**
- Contact database queries
- Field mapping
- Can leverage existing Notion integration patterns

**Telegram Integration (~400 lines):**
- Contact import
- Message history import
- Bulk messaging
- Session encryption

### Phase 4: Frontend Pages

**New Pages:**
```
src/app/(sidemenu)/w/[workspaceSlug]/crm/
├── layout.tsx              # CRM shell with sidebar
├── page.tsx                # CRM dashboard/home
├── contacts/
│   ├── page.tsx            # Contact list (735 lines in source)
│   └── [id]/
│       └── page.tsx        # Contact detail with tabs
├── organizations/
│   ├── page.tsx            # Organization list (385 lines)
│   └── [id]/
│       └── page.tsx        # Organization detail
└── communicate/
    └── page.tsx            # Bulk messaging (400 lines)
```

### Phase 5: Components

**Components to Create:**
1. `CRMSidebar.tsx` - Navigation (~230 lines)
2. `ContactsClient.tsx` - Sync client component
3. `ContactList.tsx` - Table with filtering
4. `ContactDetail.tsx` - Tabbed detail view
5. `ContactForm.tsx` - Create/edit form
6. `InteractionTimeline.tsx` - Activity history
7. `OrganizationList.tsx` - Org table
8. `OrganizationDrawer.tsx` - Quick view drawer
9. `OrganizationDetail.tsx` - Full detail view
10. `CommunicateForm.tsx` - Bulk message composer
11. `MessageViewerModal.tsx` - View sent messages
12. `ImportModal.tsx` - Import wizard
13. `ConnectionStrengthBadge.tsx` - Visual indicator
14. `ContactCard.tsx` - Summary card

---

## Summary: Full Implementation

| Category | Count | Est. Lines |
|----------|-------|------------|
| Database Models | 4-6 | ~150 |
| tRPC Routers | 3 | ~2,100 |
| Services | 3 | ~600 |
| Pages | 6 | ~2,500 |
| Components | 14 | ~2,000 |
| External Integrations | 3 | ~1,300 |
| Styling (CSS) | 1 | ~250 |
| **TOTAL** | | **~8,900 lines** |

### Files to Modify in Exponential

1. `prisma/schema.prisma` - Add 4-6 new models
2. `src/server/api/root.ts` - Register new routers
3. `src/app/(sidemenu)/layout.tsx` - Add CRM nav link
4. `src/providers/` - May need CRM-specific providers

### Migration Approach

Most code can be adapted from impactful-events with modifications:
- Replace `Sponsor` references with `Organization`
- Add `workspaceId` to all queries
- Update imports for exponential's structure
- Remove event-specific features (EventSponsor, SponsorVisitRequest, SponsorDeliverable)
- Adapt styling to match exponential's Mantine/Tailwind patterns
