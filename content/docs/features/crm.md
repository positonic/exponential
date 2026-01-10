---
title: CRM (Contact Management)
description: Manage contacts, organizations, and interactions with encrypted data storage
---

## Overview

The CRM plugin provides a lightweight contact management system for tracking people and organizations you interact with. It's designed for professionals who need to maintain relationships without the complexity of enterprise CRM systems.

Key features:
- Contact and organization management
- Interaction tracking (calls, emails, meetings, notes)
- Encrypted storage for sensitive information
- Workspace isolation for multi-client use

## Getting Started

### Enabling the CRM Plugin

1. Go to **Settings > Plugins** in your workspace
2. Ensure the **CRM** plugin is enabled
3. Click **CRM** in the sidebar to access the dashboard

### CRM Navigation

The CRM section includes:

| Page | Description |
|------|-------------|
| **Dashboard** | Overview of contacts, organizations, and recent activity |
| **Contacts** | Full list of all your contacts |
| **Organizations** | Companies and groups |

## Managing Contacts

### Creating a Contact

1. Navigate to **CRM > Contacts**
2. Click **Create Contact**
3. Fill in the contact details:
   - **Name**: First and last name
   - **Email**: Primary email address
   - **Phone**: Phone number
   - **Social Links**: LinkedIn, Telegram, Twitter, GitHub
   - **Organization**: Link to an organization (optional)
   - **About**: Notes about the contact
   - **Skills/Tags**: Categorize the contact
4. Click **Create** to save

### Contact Information

Each contact can include:

| Field | Description |
|-------|-------------|
| **Name** | First and last name |
| **Email** | Email address (encrypted) |
| **Phone** | Phone number (encrypted) |
| **LinkedIn** | LinkedIn profile URL (encrypted) |
| **Telegram** | Telegram username (encrypted) |
| **Twitter** | Twitter/X handle (encrypted) |
| **GitHub** | GitHub username (encrypted) |
| **Organization** | Linked company or group |
| **About** | Free-form notes |
| **Skills** | Technical or professional skills |
| **Tags** | Custom categorization |

### Viewing Contact Details

Click on any contact to view their full profile, including:
- All contact information
- Linked organization
- Recent interactions
- Communication history

### Connection Strength

Contacts display a connection strength indicator based on interaction frequency:

| Strength | Description |
|----------|-------------|
| **Strong** | Regular recent interactions |
| **Moderate** | Some recent contact |
| **Weak** | Limited interaction history |

## Managing Organizations

### Creating an Organization

1. Navigate to **CRM > Organizations**
2. Click **Create Organization**
3. Fill in the details:
   - **Name**: Organization name
   - **Website**: Company website URL
   - **Industry**: Business sector
   - **Size**: Number of employees
   - **Description**: About the organization
4. Click **Create** to save

### Organization Information

| Field | Description |
|-------|-------------|
| **Name** | Organization name |
| **Website** | Primary website URL |
| **Logo** | Organization logo (auto-fetched or uploaded) |
| **Industry** | Business sector |
| **Size** | 1-10, 11-50, 51-200, 201-500, 501-1000, 1000+ |
| **Description** | About the organization |

### Linking Contacts to Organizations

When creating or editing a contact, select an organization from the dropdown to link them. This helps you:
- See all contacts at a company
- Track organizational relationships
- Filter contacts by organization

## Interaction Tracking

### Logging Interactions

Track your communications with contacts:

1. Open a contact's profile
2. Click **Add Interaction**
3. Select the interaction type and add notes

### Interaction Types

| Type | Use Case |
|------|----------|
| **Email** | Email correspondence |
| **Phone Call** | Voice calls |
| **Meeting** | In-person or video meetings |
| **LinkedIn** | LinkedIn messages |
| **Telegram** | Telegram messages |
| **Note** | General notes |
| **Other** | Any other interaction |

### Interaction Direction

Mark interactions as:
- **Inbound**: They contacted you
- **Outbound**: You contacted them

## Dashboard

The CRM dashboard provides an overview:

| Metric | Description |
|--------|-------------|
| **Total Contacts** | Number of contacts in this workspace |
| **Organizations** | Number of organizations |
| **With Email** | Contacts with email addresses |
| **Recent Interactions** | Activity in the last 30 days |

### Top Organizations

The dashboard shows organizations with the most contacts, helping you identify key relationships.

## Privacy and Security

### Encrypted Data Storage

Sensitive personal information is encrypted at rest:
- Email addresses
- Phone numbers
- Social media handles

This ensures that even if the database is accessed, personal information remains protected.

### Workspace Isolation

All CRM data is scoped to your workspace:
- Contacts in one workspace are invisible to others
- You can maintain separate contact lists for different clients or projects
- Organization data is also workspace-specific

## Search and Filtering

### Searching Contacts

Use the search bar to find contacts by:
- Name
- Email
- Organization
- Skills or tags

### Filtering Options

Filter contacts by:
- Organization
- Tags
- Last interaction date
- Connection strength

## Best Practices

### Organizing Contacts

1. **Use organizations** to group contacts by company
2. **Add tags** for quick filtering (e.g., "Client", "Vendor", "Partner")
3. **Include skills** for professional contacts
4. **Keep notes updated** in the About field

### Maintaining Relationships

1. **Log interactions** after calls and meetings
2. **Set reminders** using the Actions feature to follow up
3. **Review connection strength** to identify contacts needing attention

### Multi-Workspace Use

1. **Create separate workspaces** for different clients or projects
2. **Keep work and personal contacts separate** with different workspaces
3. **Use organization isolation** to maintain client confidentiality

## Coming Soon

- **Communications**: Track email and message history
- **Templates**: Reusable message templates
- **Import/Export**: CSV and Excel support
- **Advanced Views**: Custom column configurations

## Next Steps

- [Return to Plugins overview](/docs/features/plugins)
- [Learn about Projects](/docs/features/projects)
- [Learn about Actions](/docs/features/actions)
