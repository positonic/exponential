---
title: Integrations
description: Connect Exponential to external services and tools for enhanced productivity
---

## Overview

Exponential connects to external services to capture data, sync tasks, and automate your workflow. This guide provides an overview of available integrations and how to set them up.

## Integration Types

Integrations work in two directions:

| Type | Description | Examples |
|------|-------------|----------|
| **Inbound** | External services send data to Exponential | Fireflies meeting transcripts, Slack messages |
| **Outbound** | Exponential sends data to external services | Notion sync, Monday.com tasks |

## Available Integrations

### Communication & Capture

| Service | Status | Purpose |
|---------|--------|---------|
| [Fireflies](/docs/features/fireflies) | Available | Capture meeting action items automatically |
| [Slack](/docs/features/slack) | Available | Create tasks from messages, receive notifications |
| [WhatsApp](/docs/features/whatsapp-gateway) | Available | Interact with Exponential via WhatsApp |
| Browser Extension | Active | Capture actions while browsing |

### Task Management Sync

| Service | Status | Purpose |
|---------|--------|---------|
| Notion | Available | Bidirectional task sync with Notion databases |
| Monday.com | Available | Push actions to Monday.com boards |

### Coming Soon

| Service | Status | Purpose |
|---------|--------|---------|
| Google Docs | Coming Soon | Auto-generate meeting summaries |
| Document Import | Coming Soon | Import context from Notion pages and Google Docs |

## Setting Up Integrations

### Quick Setup Process

1. Navigate to **Workflows** in the sidebar
2. Find the integration you want to enable
3. Click **Setup** or **Configure**
4. Follow the service-specific instructions

### Integration Requirements

Most integrations require:
- An account with the external service
- API credentials or authentication
- Appropriate permissions granted

## Using the Workflows Page

The **Workflows** page is your central hub for managing integrations and automation.

### Automated Workflows Tab

View and configure data source integrations:

- **Data Input Sources** - Services that send data TO Exponential
- **Task Management Sync** - Services that receive data FROM Exponential
- **Document Integration** - Upcoming features for document handling

### Guided Processes Tab

Access structured workflows for specific goals:

- **Launch Sprint** - A 3-week plan to validate and launch your idea
- **Elevator Pitch** - Craft a compelling pitch for your product

## API Access

For custom integrations, Exponential provides API tokens.

### When You Need API Tokens

- Setting up webhook integrations (like Fireflies)
- Building custom automations
- Connecting developer tools

### Creating Tokens

1. Navigate to **Tokens** in the sidebar
2. Click **Create Token**
3. Choose an expiration period
4. Copy and store the token securely

See [API Access](/docs/features/api-access) for detailed instructions.

## Integration Best Practices

### Choose One Task Management System

Exponential can sync with either Notion OR Monday.com, but not both simultaneously. This prevents conflicts and data duplication.

**Recommendation:** Choose the tool your team uses most actively.

### Start with One Integration

If you're new to Exponential:
1. Set up Fireflies first to capture meeting action items
2. Add Slack integration for team notifications
3. Consider task sync (Notion/Monday.com) once you have established workflows

### Monitor Integration Status

On the Workflows page, each integration shows its status:

| Status | Meaning |
|--------|---------|
| **Active** | Fully configured and working |
| **Available** | Ready to set up |
| **Setup Required** | Partially configured, needs completion |
| **Coming Soon** | Not yet available |

## Troubleshooting

### Integration Not Working

1. Check that your API credentials are valid
2. Verify the service is accessible (not down)
3. Ensure permissions are correctly configured
4. Try disconnecting and reconnecting

### Missing Data

If data isn't syncing:
1. Check that the integration is marked as "Active"
2. Verify webhook URLs are correct (for inbound integrations)
3. Check for rate limiting or quota issues

### Getting Help

- Review specific integration documentation
- Check the service's status page
- Contact support for persistent issues

## Next Steps

- [Set up Fireflies](/docs/features/fireflies) for meeting capture
- [Configure Slack](/docs/features/slack) for team notifications
- [Learn about API tokens](/docs/features/api-access)
- [Explore Workflows](/docs/features/workflows)
