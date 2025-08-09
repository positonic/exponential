

# PRD: Calendar Integration for Today Page

**Date**: 2025-08-08  
**Status**: Draft  
**Priority**: High  
**Estimated Timeline**: 3-4 weeks

## Problem Statement

Exponential users currently have no visibility into their scheduled meetings and calendar events while planning their day. This creates context switching between the productivity app and their calendar, reducing efficiency and making it harder to plan realistic daily schedules. Users need to see their calendar events alongside their tasks and goals to make informed decisions about their day.

## Success Criteria

- [ ] Users can view their Google Calendar events directly within Exponential
- [ ] Calendar integration reduces context switching by 80% (measured via user feedback)
- [ ] 70%+ of users who connect their calendar use it daily within 30 days
- [ ] Zero calendar data security incidents
- [ ] Calendar loads within 2 seconds on /today page

## User Stories

### Primary User Flow
As a productivity-focused user, I want to see my calendar events on the /today page so that I can plan my tasks around my scheduled meetings without switching between applications.

### Secondary User Flows
- As a new user, I want to easily connect my Google Calendar so that I can start seeing my events immediately
- As a privacy-conscious user, I want to disconnect my calendar integration if needed
- As a busy professional, I want to see upcoming meetings for today so I can prepare accordingly

### Edge Cases
- What happens when calendar API is down or rate-limited
- How do we handle users with multiple Google accounts
- What if user revokes calendar permissions externally
- How do we handle all-day events and multi-day events
- What about calendar events in different timezones

## Technical Requirements

### Frontend Changes
- [ ] Add calendar drawer component that slides in from right side of /today page
- [ ] Calendar toggle button on /today page header
- [ ] Google Calendar-style calendar view component (day/week view for today focus)
- [ ] Calendar configuration section in user settings/profile
- [ ] Loading states and error handling for calendar data
- [ ] Responsive design for mobile calendar drawer

### Backend Changes  
- [ ] Google Calendar API integration endpoints
- [ ] OAuth 2.0 flow for Google Calendar authorization
- [ ] Calendar event data models and database schema
- [ ] Caching layer for calendar events (reduce API calls)
- [ ] Rate limiting and error handling for Google API
- [ ] Calendar sync background job (refresh events periodically)

### Third-party Integrations
- [ ] Google Calendar API setup and credentials
- [ ] OAuth 2.0 consent screen configuration
- [ ] Google API client library integration
- [ ] Webhook support for real-time calendar updates (future enhancement)

## Design Considerations

### UI/UX Requirements
- **Calendar Drawer**: Right-side sliding drawer, 400px width on desktop
- **Calendar View**: Day view showing hourly slots with events
- **Visual Design**: Clean, minimal design matching existing Exponential UI
- **Event Display**: Show event title, time, duration, attendees (optional)
- **Accessibility**: Keyboard navigation, screen reader support
- **Mobile**: Bottom sheet or full-screen modal on mobile devices

### Performance Requirements
- **Load Time**: Calendar drawer opens in <300ms
- **API Response**: Initial calendar load <2 seconds
- **Caching**: Cache events for 15-30 minutes to reduce API calls
- **Background Sync**: Refresh calendar data every 30 minutes when user is active

## Implementation Plan

### Phase 1: Backend Foundation (Week 1)
- [ ] Set up Google Calendar API credentials and OAuth
- [ ] Create calendar integration database tables
- [ ] Build OAuth flow endpoints for Google Calendar
- [ ] Implement basic calendar event fetching
- [ ] Add calendar configuration to user settings API

### Phase 2: Frontend Integration (Week 2)
- [ ] Build calendar drawer component
- [ ] Create calendar settings page
- [ ] Implement Google Calendar OAuth flow in frontend
- [ ] Add calendar toggle button to /today page
- [ ] Build basic day view calendar component

### Phase 3: Calendar Display & UX (Week 3)
- [ ] Implement Google Calendar-style event display
- [ ] Add loading states and error handling
- [ ] Implement responsive design for mobile
- [ ] Add event details and hover states
- [ ] Polish animations and transitions

### Phase 4: Optimization & Testing (Week 4)
- [ ] Implement caching layer for performance
- [ ] Add background sync for calendar events
- [ ] Comprehensive testing of OAuth flows
- [ ] Performance optimization and monitoring
- [ ] User acceptance testing and feedback

## Testing Strategy

- [ ] Unit tests for calendar API integration functions
- [ ] Integration tests for OAuth flow and Google API calls
- [ ] E2E tests for calendar connection and display workflow
- [ ] Manual testing with different Google account types
- [ ] Performance testing for calendar loading times
- [ ] Security testing for OAuth implementation
- [ ] Cross-browser testing for calendar drawer functionality

## Deployment Plan

- [ ] Set up Google API project and OAuth credentials
- [ ] Add environment variables for Google Calendar integration
- [ ] Database migration for calendar-related tables
- [ ] Feature flag for calendar integration (gradual rollout)
- [ ] Monitor Google API usage and rate limits
- [ ] Documentation for users on connecting calendars

## Risks & Mitigation

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| Google API rate limits | High | Medium | Implement caching, request batching, and usage monitoring |
| OAuth security vulnerabilities | High | Low | Follow OAuth best practices, security audit, use proven libraries |
| Calendar data privacy concerns | Medium | Medium | Clear privacy policy, minimal data storage, user consent |
| Poor calendar UI performance | Medium | Medium | Lazy loading, virtualization for large calendars, performance monitoring |
| Google API changes breaking integration | Medium | Low | Use stable API versions, automated testing, fallback handling |

## Open Questions

- [ ] Should we support other calendar providers (Outlook, Apple) in v1? - Owner: Product
- [ ] Do we want to show calendar events from multiple Google accounts? - Owner: UX
- [ ] Should users be able to create calendar events from within Exponential? - Owner: Product
- [ ] What level of calendar event details should we display (attendees, location, etc.)? - Owner: UX
- [ ] Do we need calendar notifications/reminders integration? - Owner: Product
- [ ] Should we allow users to link tasks to calendar events? - Owner: Product

## Technical Architecture

### Database Schema Changes
```sql
-- Calendar integrations table
CREATE TABLE calendar_integrations (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  provider VARCHAR(50) NOT NULL, -- 'google'
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  expires_at TIMESTAMP,
  calendar_id VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Cached calendar events
CREATE TABLE calendar_events (
  id UUID PRIMARY KEY,
  integration_id UUID REFERENCES calendar_integrations(id),
  external_id VARCHAR(255) NOT NULL,
  title VARCHAR(500),
  description TEXT,
  start_time TIMESTAMP NOT NULL,
  end_time TIMESTAMP NOT NULL,
  is_all_day BOOLEAN DEFAULT FALSE,
  attendees JSONB,
  location VARCHAR(500),
  cached_at TIMESTAMP DEFAULT NOW()
);
```

### API Endpoints
- `GET /api/calendar/auth/google` - Initialize Google OAuth flow
- `POST /api/calendar/auth/callback` - Handle OAuth callback
- `GET /api/calendar/events` - Fetch user's calendar events
- `DELETE /api/calendar/integration` - Disconnect calendar
- `GET /api/calendar/status` - Check integration status

## References

- [Google Calendar API Documentation](https://developers.google.com/calendar/api/guides/overview)
- [OAuth 2.0 for Web Server Applications](https://developers.google.com/identity/protocols/oauth2/web-server)
- [NextAuth.js Google Provider](https://next-auth.js.org/providers/google)
- [Mantine Date Components](https://mantine.dev/dates/getting-started/)
- Existing Exponential UI patterns and components