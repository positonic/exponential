# PRD: Team Weekly Planning - Real Data Implementation

**Status**: Draft  
**Version**: 1.0  
**Date**: January 2025  
**Owner**: Development Team  

## Executive Summary

This PRD outlines the implementation plan to replace mock data in our Team Weekly Planning system with real data from our existing database models. The goal is to provide teams with functional weekly planning tools that integrate seamlessly with their existing projects, actions, and team structures.

## Current State Analysis

### ✅ What We Have (Mock Implementation)
- **TeamWeeklyReview component** (member-centric view) with mock team members
- **WeeklyOutcomes component** (outcome-centric view) with mock weekly objectives
- **ProjectContent integration** showing tabs conditionally for team projects
- **UI/UX patterns** following existing design system
- **Table structures** and expandable row functionality

### 🚧 What We Need (Real Data Integration)
- **Database models** for weekly outcomes and team capacity tracking
- **tRPC API routes** for data fetching and mutations
- **Real team member data** from existing TeamUser/Project relationships
- **Action integration** to show actual tasks in team planning views
- **User authentication** and permission handling for team operations

## Database Schema Requirements

### New Models Needed

#### 1. WeeklyOutcome Model
```prisma
model WeeklyOutcome {
  id            String   @id @default(cuid())
  title         String
  description   String?
  weekStartDate DateTime // Start of the week (Monday)
  status        String   @default("NOT_STARTED") // NOT_STARTED, IN_PROGRESS, COMPLETED, BLOCKED
  priority      String   @default("MEDIUM") // HIGH, MEDIUM, LOW
  teamId        String
  projectId     String
  createdById   String
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  dueDate       DateTime? // Optional specific due date within the week
  
  // Relations
  team          Team     @relation(fields: [teamId], references: [id], onDelete: Cascade)
  project       Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)
  createdBy     User     @relation(fields: [createdById], references: [id])
  assignees     WeeklyOutcomeAssignee[]
  relatedActions Action[] @relation("WeeklyOutcomeActions")
  
  @@index([teamId])
  @@index([projectId])
  @@index([weekStartDate])
  @@index([status])
  @@unique([teamId, projectId, weekStartDate, title])
}

model WeeklyOutcomeAssignee {
  id              String        @id @default(cuid())
  weeklyOutcomeId String
  userId          String
  assignedAt      DateTime      @default(now())
  
  weeklyOutcome   WeeklyOutcome @relation(fields: [weeklyOutcomeId], references: [id], onDelete: Cascade)
  user            User          @relation(fields: [userId], references: [id], onDelete: Cascade)
  
  @@unique([weeklyOutcomeId, userId])
  @@index([weeklyOutcomeId])
  @@index([userId])
}
```

#### 2. Team Member Capacity Tracking
```prisma
model TeamMemberWeeklyCapacity {
  id            String   @id @default(cuid())
  userId        String
  teamId        String
  projectId     String?  // Optional: project-specific capacity
  weekStartDate DateTime
  availableHours Float   @default(40) // Default full-time capacity
  notes         String?  // Vacation, part-time, etc.
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  
  user          User     @relation(fields: [userId], references: [id])
  team          Team     @relation(fields: [teamId], references: [id])
  project       Project? @relation(fields: [projectId], references: [id])
  
  @@unique([userId, teamId, weekStartDate, projectId])
  @@index([userId])
  @@index([teamId])
  @@index([weekStartDate])
}
```

### Schema Updates Needed

#### 1. Add relation to Action model
```prisma
model Action {
  // ... existing fields ...
  weeklyOutcomes WeeklyOutcome[] @relation("WeeklyOutcomeActions")
}
```

#### 2. Add relations to User model
```prisma
model User {
  // ... existing fields ...
  weeklyOutcomeAssignees WeeklyOutcomeAssignee[]
  weeklyOutcomes         WeeklyOutcome[] // Created outcomes
  teamCapacities         TeamMemberWeeklyCapacity[]
}
```

#### 3. Add relations to Team and Project models
```prisma
model Team {
  // ... existing fields ...
  weeklyOutcomes     WeeklyOutcome[]
  memberCapacities   TeamMemberWeeklyCapacity[]
}

model Project {
  // ... existing fields ...
  weeklyOutcomes     WeeklyOutcome[]
  memberCapacities   TeamMemberWeeklyCapacity[]
}
```

## API Requirements

### tRPC Router: `weeklyPlanning`

#### Queries
```typescript
// Get team members with their weekly data
getTeamWeeklyView: {
  input: { projectId: string, weekStartDate: Date }
  output: {
    teamMembers: Array<{
      user: User;
      role: string; // from TeamUser
      capacity: number;
      weeklyOutcomes: WeeklyOutcome[];
      actions: Action[]; // this week's actions
      progress: { completed: number; total: number; percentage: number };
    }>;
  }
}

// Get weekly outcomes for outcome-centric view
getWeeklyOutcomes: {
  input: { projectId: string, weekStartDate: Date }
  output: {
    outcomes: Array<{
      id: string;
      title: string;
      description: string;
      status: string;
      priority: string;
      assignees: User[];
      relatedActions: Action[];
      progress: number;
      dueDate: Date;
    }>;
  }
}

// Get team capacity for a week
getTeamCapacity: {
  input: { teamId: string, projectId?: string, weekStartDate: Date }
  output: {
    capacities: Array<{
      userId: string;
      availableHours: number;
      notes: string;
    }>;
  }
}
```

#### Mutations
```typescript
// Create weekly outcome
createWeeklyOutcome: {
  input: {
    title: string;
    description?: string;
    teamId: string;
    projectId: string;
    weekStartDate: Date;
    priority: "HIGH" | "MEDIUM" | "LOW";
    assigneeIds: string[];
    dueDate?: Date;
  }
  output: WeeklyOutcome;
}

// Update weekly outcome
updateWeeklyOutcome: {
  input: {
    id: string;
    title?: string;
    description?: string;
    status?: "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED" | "BLOCKED";
    priority?: "HIGH" | "MEDIUM" | "LOW";
    assigneeIds?: string[];
    dueDate?: Date;
  }
  output: WeeklyOutcome;
}

// Set team member capacity
setMemberCapacity: {
  input: {
    userId: string;
    teamId: string;
    projectId?: string;
    weekStartDate: Date;
    availableHours: number;
    notes?: string;
  }
  output: TeamMemberWeeklyCapacity;
}

// Assign action to weekly outcome
linkActionToWeeklyOutcome: {
  input: {
    actionId: string;
    weeklyOutcomeId: string;
  }
  output: { success: boolean };
}
```

## Component Updates

### 1. TeamWeeklyReview.tsx Updates

**Current**: Mock team member data  
**New**: Real data from API

```typescript
// Replace mock data with real API calls
const { data: teamWeeklyData, isLoading } = api.weeklyPlanning.getTeamWeeklyView.useQuery({
  projectId,
  weekStartDate: getWeekStart(new Date())
});

// Update team member interface to match real data
type TeamMemberWeekly = {
  user: {
    id: string;
    name: string;
    email: string;
    image?: string;
  };
  role: string;
  capacity: number;
  weeklyOutcomes: WeeklyOutcome[];
  actions: Action[];
  progress: {
    completed: number;
    total: number;
    percentage: number;
  };
};
```

**Key Changes**:
- Replace mock `mockTeamMembers` with `teamWeeklyData?.teamMembers`
- Add loading states and error handling
- Implement real capacity tracking vs. mock random values
- Show actual actions from database with real status
- Add mutation hooks for updating member assignments

### 2. WeeklyOutcomes.tsx Updates

**Current**: Mock weekly outcomes  
**New**: Real data with full CRUD operations

```typescript
// Replace mock data with real API calls
const { data: weeklyOutcomes, isLoading } = api.weeklyPlanning.getWeeklyOutcomes.useQuery({
  projectId,
  weekStartDate: currentWeekStart
});

// Add mutation hooks
const createOutcome = api.weeklyPlanning.createWeeklyOutcome.useMutation({
  onSuccess: () => utils.weeklyPlanning.getWeeklyOutcomes.invalidate()
});

const updateOutcome = api.weeklyPlanning.updateWeeklyOutcome.useMutation({
  onSuccess: () => utils.weeklyPlanning.getWeeklyOutcomes.invalidate()
});
```

**Key Changes**:
- Replace mock `mockWeeklyOutcomes` with real API data
- Enable editing of outcomes (remove `disabled` props)
- Add "Add Weekly Outcome" modal functionality
- Implement real team member assignment (remove mock team members)
- Show actual related actions from database
- Add week navigation with real data fetching

### 3. Additional Components Needed

#### WeeklyOutcomeModal.tsx
```typescript
interface CreateWeeklyOutcomeModalProps {
  projectId: string;
  teamId: string;
  weekStartDate: Date;
  onClose: () => void;
}
```

#### WeekNavigator.tsx
```typescript
interface WeekNavigatorProps {
  currentWeek: Date;
  onWeekChange: (week: Date) => void;
}
```

## Permission & Security Requirements

### Access Control
1. **Team Membership**: Users can only view/edit weekly planning for teams they belong to
2. **Project Access**: Must have access to the specific project
3. **Role-Based Permissions**:
   - **Team Members**: Can view, update their own assignments
   - **Team Leads/Admins**: Can create outcomes, assign members, modify team planning
   - **Project Owners**: Full access to project's team weekly planning

### API Security
```typescript
// Example permission check in tRPC procedure
.use(async ({ ctx, next, input }) => {
  const teamMembership = await ctx.db.teamUser.findFirst({
    where: {
      userId: ctx.session.user.id,
      teamId: input.teamId
    }
  });
  
  if (!teamMembership) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Not a member of this team"
    });
  }
  
  return next();
})
```

## Implementation Phases

### Phase 1: Database Setup (1-2 days)
- [ ] Create migration files for new models
- [ ] Update existing model relations
- [ ] Run migrations and verify schema
- [ ] Seed database with test data

### Phase 2: API Development (3-4 days)
- [ ] Create `weeklyPlanning` tRPC router
- [ ] Implement all query procedures
- [ ] Implement all mutation procedures
- [ ] Add comprehensive error handling
- [ ] Write API tests

### Phase 3: Component Updates (3-4 days)
- [ ] Update `TeamWeeklyReview` component with real data
- [ ] Update `WeeklyOutcomes` component with real data
- [ ] Create `WeeklyOutcomeModal` component
- [ ] Create `WeekNavigator` component
- [ ] Add loading states and error boundaries

### Phase 4: Integration & Testing (2-3 days)
- [ ] Test with real team projects
- [ ] Verify permissions and security
- [ ] Performance testing with larger datasets
- [ ] UI/UX refinements based on real data
- [ ] Documentation updates

### Phase 5: Polish & Launch (1-2 days)
- [ ] Final testing across different team sizes
- [ ] Deploy to production
- [ ] Monitor for issues
- [ ] Gather user feedback

## Success Metrics

### Functionality Metrics
- [ ] Teams can create weekly outcomes for their projects
- [ ] Team members can be assigned to multiple outcomes
- [ ] Capacity tracking reflects actual user availability
- [ ] Actions can be linked to weekly outcomes
- [ ] Week navigation works smoothly
- [ ] All CRUD operations function correctly

### Performance Metrics
- [ ] Page load time < 2 seconds
- [ ] API response time < 500ms
- [ ] Optimistic updates provide immediate feedback
- [ ] No N+1 query problems with team/member data

### User Experience Metrics
- [ ] Teams successfully complete weekly planning sessions
- [ ] Both member-centric and outcome-centric views are used
- [ ] No confusion about permissions or access
- [ ] Mobile experience is fully functional

## Risk Mitigation

### Technical Risks
1. **Database Migration Issues**: Test thoroughly in staging
2. **Performance with Large Teams**: Implement pagination and optimizations
3. **Concurrent Editing**: Add optimistic locking for outcomes
4. **Data Consistency**: Proper transaction handling for related updates

### Product Risks
1. **User Adoption**: Provide clear onboarding and documentation
2. **Complex UI**: Maintain simplicity while adding real functionality
3. **Permission Confusion**: Clear visual indicators of user capabilities

## Future Enhancements (Out of Scope)

- Integration with calendar systems for capacity planning
- Automated weekly outcome suggestions based on project goals
- Weekly retrospective and team feedback features
- Integration with external project management tools
- Advanced analytics and team performance metrics
- Mobile app support for weekly planning sessions

---

**Next Steps**: Await approval to proceed with Phase 1 implementation.