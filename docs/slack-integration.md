# Slack Integration Guide

## Overview

The Slack integration allows your team to interact with Exponential directly from Slack channels and DMs. Team members can chat with Paddy (your AI project manager), create tasks, access meeting transcriptions, and manage projects without leaving Slack.

### Key Features

- 🤖 **Chat with Paddy**: Natural language conversations with your AI project manager
- 📋 **Task Management**: Create, list, and manage actions and projects
- 📞 **Meeting Access**: Query meeting transcriptions and project data
- 👥 **Team-Level Access**: All team members can use the integration (not just the installer)
- 🔐 **Secure Authentication**: User-specific authentication with proper team scoping

## Installation & Setup

### Prerequisites

1. **Team Setup**: Ensure your team is properly configured in Exponential
2. **Admin Access**: You need admin permissions in your Slack workspace
3. **Integration Permissions**: Team owner/admin role in Exponential

### Installation Steps

1. **Install Slack App**: 
   - Go to `/integrations` in your Exponential dashboard
   - Click "Add Slack Integration"
   - Follow the OAuth flow to authorize the app

2. **Configure Team Access**:
   - The integration is automatically linked to your team
   - Team members will be authenticated based on their Slack username/email
   - First-time users get automatically mapped when they interact with the bot

3. **Bot Permissions**:
   - The bot needs to be invited to channels where you want to use it
   - For DMs, no additional setup required
   - Use `/invite @Exponential` in any channel

## Available Commands

### Slash Commands

#### `/paddy` or `/p`
Direct shorthand for chatting with Paddy.

```
/paddy How was the meeting with Kane Lee?
/p What should I work on today?
```

#### `/expo` or `/exponential`
Main command with subcommands:

```bash
# Create actions/tasks
/expo create Review the marketing proposal
/expo add Prepare Q3 budget analysis

# List your actions
/expo list

# List your projects  
/expo projects

# Chat with Paddy
/expo chat What goals do I have for this quarter?

# Help
/expo help
```

### Natural Chat

You can also chat naturally with Paddy by:

1. **Direct Messages**: Simply message the bot directly
2. **Channel Mentions**: Use `@Exponential` in any channel
3. **Thread Responses**: Paddy maintains context in threads

#### Example Conversations

```
You: @Exponential What was discussed in yesterday's standup?
Paddy: Let me check your meeting transcriptions... 
       [Provides meeting summary with key decisions and action items]

You: Create a task to follow up on the API integration
Paddy: ✅ Created action: "Follow up on the API integration"
       Added to your Exponential inbox

You: What should I prioritize today?
Paddy: Based on your current projects, here are your high-priority items:
       • Complete user research analysis (Project: Product Launch)
       • Review staging environment (Project: API Upgrade)
       • Prepare client presentation (Project: Q3 Sales)
```

## Authentication & User Mapping

### How It Works

The Slack integration uses a sophisticated multi-layer authentication system:

1. **Integration Discovery**: Maps Slack workspace to your Exponential team
2. **User Resolution**: Identifies the specific team member from Slack user
3. **Authentication**: Creates secure sessions for API access
4. **Permission Scoping**: Ensures users only access their authorized data

### User Mapping Process

1. **First Interaction**: When a team member first uses the integration:
   - System attempts to match their Slack username/email with team membership
   - If match found, creates permanent mapping for future use
   - If no match, falls back to integration installer permissions

2. **Subsequent Interactions**: Direct lookup using stored mapping

3. **Manual Mapping**: Team admins can manage user mappings in the dashboard

### Multi-Workspace Support

If you're in multiple Slack workspaces:
- Each workspace integration is scoped to specific teams
- Your identity is resolved per workspace
- No cross-workspace data leakage

### Troubleshooting Authentication

**"Sorry, you need to be a member of the team"**
- Ensure you're added to the team in Exponential
- Check that your Slack email/username matches your Exponential profile
- Contact team admin to verify mapping

**"I had trouble accessing some features"**
- Authentication token may be expired
- Check `/tokens` page in Exponential dashboard
- Try a simpler query to test basic functionality

## Features & Capabilities

### Meeting Transcriptions

Paddy can access and search through your meeting transcriptions:

```
You: What was the meeting with Qasim about?
Paddy: I found a meeting with Qasim from [date]. Here are the key points:
       • Discussed API integration timeline
       • Reviewed security requirements
       • Action items: [list of follow-ups]

You: Find meetings about the product launch
Paddy: I found 3 meetings about the product launch:
       [Provides summaries with dates, participants, and key decisions]
```

### Project Management

Full project and task management capabilities:

```
You: Show me my active projects
Paddy: Here are your active projects:
       📋 API Integration (High Priority) - 3 tasks
       📋 User Research (Medium Priority) - 1 task
       📋 Q3 Planning (Low Priority) - 5 tasks

You: Create a project called "Website Redesign"
Paddy: ✅ Created project: "Website Redesign"
       You can add tasks and set priorities in your dashboard

You: What's the status of the API project?
Paddy: API Integration project status:
       • Progress: 75% complete
       • Priority: High
       • Next actions: Review security audit, Deploy to staging
       • Due date: End of month
```

### Smart Responses

Paddy provides contextual, intelligent responses:

- **Meeting Queries**: Searches transcriptions and provides summaries
- **Task Management**: Creates, lists, and prioritizes actions
- **Project Insights**: Provides progress updates and next steps
- **Goal Tracking**: Connects daily work to larger objectives
- **Decision History**: Recalls past decisions and rationale

## Technical Architecture

### Components

1. **Webhook Handler** (`/api/webhooks/slack/route.ts`)
   - Processes all Slack events and commands
   - Handles signature verification and authentication
   - Routes to appropriate handlers

2. **User Mapping System** (`IntegrationUserMapping` model)
   - Maps Slack users to Exponential users
   - Supports multi-workspace scenarios
   - Enables team-level access beyond installer

3. **Authentication Layer**
   - Server-side tRPC caller for secure API access
   - JWT token generation for agent communication
   - Session management with proper scoping

4. **Agent Integration**
   - Uses same authentication as web application
   - Full tool access (meeting transcriptions, project data)
   - Unified agent capabilities across all interfaces

### Data Flow

```
Slack User Message
    ↓
Webhook Verification (HMAC signature)
    ↓  
Integration Discovery (team_id → Integration)
    ↓
User Resolution (slack_user_id → User)
    ↓
Authentication (create session context)
    ↓
tRPC Call (server-side with auth)
    ↓
Mastra Agent (with JWT token)
    ↓
Tool Execution (authenticated API calls)
    ↓
Response to Slack
```

### Database Schema

**IntegrationUserMapping**
```sql
CREATE TABLE IntegrationUserMapping (
    id              TEXT PRIMARY KEY,
    integrationId   TEXT NOT NULL,     -- Links to specific Slack integration
    externalUserId  TEXT NOT NULL,     -- Slack user ID (U1234567890)
    userId          TEXT NOT NULL,     -- Exponential user ID
    createdAt       DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(integrationId, externalUserId)
);
```

**Key Relationships**
- `Integration` → `Team` (which team owns the Slack app)
- `Team` → `TeamUser` → `User` (team membership)
- `IntegrationUserMapping` (Slack user → Exponential user)

### Security Features

1. **Request Verification**: All requests verified with HMAC signatures
2. **Team Scoping**: Users can only access their team's data
3. **Session Security**: Temporary sessions with expiration
4. **API Authentication**: Same security as web application
5. **Permission Inheritance**: Users get same permissions as web access

## Development & Customization

### Environment Variables

```bash
# Required
MASTRA_API_URL=https://your-mastra-instance.com
AUTH_SECRET=your-jwt-secret

# Optional for development
TODO_APP_BASE_URL=http://localhost:3000  # For local Mastra instances
```

### Adding New Commands

1. **Slash Commands**: Add cases to `handleSlashCommand()` function
2. **Event Handlers**: Extend `handleSlackEvent()` for new event types
3. **Natural Language**: Paddy automatically handles new capabilities through agent system

### Debugging

Enable detailed logging:

```bash
# View webhook logs
tail -f logs/slack-webhook.log

# Debug authentication
# Check console for "🔐 [Auth]" messages

# Test agent responses
# Look for "🤖 [Paddy]" logs
```

### Testing

1. **Local Development**: 
   - Use ngrok for webhook testing
   - Set `TODO_APP_BASE_URL` for local agent calls
   
2. **Staging Environment**:
   - Create separate Slack app for testing
   - Use staging Mastra instance

3. **Production Deployment**:
   - Ensure all environment variables are set
   - Verify webhook endpoints are accessible
   - Test with small team before full rollout

## Troubleshooting

### Common Issues

**Bot not responding**
- Check if bot is invited to the channel
- Verify webhook URL is correct
- Check server logs for errors

**Authentication failures**
- Verify `AUTH_SECRET` matches across environments
- Check team membership in Exponential
- Review user mapping in database

**Meeting transcription access denied**
- Ensure user is team member, not just Slack workspace member
- Verify integration has proper team association
- Check API token validity

**Generic responses instead of tool usage**
- Verify Mastra agent configuration includes tools
- Check JWT token generation and passing
- Ensure production API endpoints are accessible

### Error Codes

- `401 Unauthorized`: Authentication issue, check tokens
- `403 Forbidden`: Permission issue, verify team membership  
- `404 Not Found`: Integration or user mapping not found
- `500 Internal Server Error`: Check server logs for details

### Support

For additional help:
1. Check server logs for detailed error messages
2. Verify team setup in Exponential dashboard
3. Test with simple commands first (`/expo help`)
4. Contact your team admin for user mapping issues

## Migration & Updates

### Database Migrations

When updating the integration:

```bash
# Create migration for schema changes
npx prisma migrate dev --name add_integration_user_mapping

# Apply to production
npx prisma migrate deploy
```

### Backward Compatibility

The integration maintains backward compatibility with:
- Existing slash commands
- Previous user sessions
- Legacy authentication (falls back to installer)

### Future Enhancements

Planned features:
- Interactive buttons and forms
- Workflow automation
- Custom agent personalities per team
- Enhanced meeting analysis
- Real-time notifications

---

*This documentation covers the complete Slack integration system. For technical implementation details, see the source code in `/src/app/api/webhooks/slack/route.ts` and related files.*