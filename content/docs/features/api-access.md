---
title: API Access
description: Generate API tokens for webhooks and external integrations
---

## Overview

API tokens allow external applications to interact with your Exponential account. Use them for webhooks (like Fireflies meeting capture), custom integrations, and automation tools.

## When You Need API Tokens

| Use Case | Token Type | Example |
|----------|------------|---------|
| Webhook authentication | Hex Key | Fireflies sends meeting data |
| API authentication | JWT Token | Custom apps accessing your data |
| Browser extension | JWT Token | Capture actions from any website |
| External automation | Either | Zapier, Make, custom scripts |

## Accessing Tokens

Navigate to **Tokens** in the sidebar to manage your API tokens.

## Token Types

### Hex Key (Recommended for Webhooks)

- **Format:** 32-character hexadecimal string
- **Best for:** Webhook secrets (like Fireflies)
- **Security:** Perfect for validating incoming webhook requests

### JWT Token (For API Access)

- **Format:** JSON Web Token (longer, structured)
- **Best for:** API authentication, custom applications
- **Security:** Contains user identity information

## Creating a Token

1. Navigate to **Tokens** in the sidebar
2. Click **Create API Key**
3. Fill in the details:
   - **Name** - Descriptive name (e.g., "Fireflies Webhook")
   - **Type** - Choose Hex Key or JWT Token
   - **Expires In** - How long the token is valid
   - **Description** - Optional notes about usage
4. Click **Generate API Key**
5. **Copy the token immediately** - it won't be shown again

### Expiration Options

| Duration | Best For |
|----------|----------|
| 1 hour | Testing and development |
| 24 hours | Short-term integrations |
| 7 days | Weekly processes |
| 30 days | Monthly workflows |
| 90 days | Long-term integrations |

## Managing Tokens

### Viewing Your Tokens

The tokens page shows:

| Column | Description |
|--------|-------------|
| **Name** | Token identifier |
| **Type** | Hex or JWT |
| **Expires** | Expiration date and time |
| **Status** | Active or Expired |

### Revoking a Token

1. Find the token in the list
2. Click the trash icon
3. The token is immediately invalidated

**Note:** Revoked tokens cannot be recovered. Any integrations using them will stop working.

## Using Tokens

### With Fireflies

1. Create a Hex Key token
2. In Fireflies settings, add a webhook
3. Use your token as the webhook secret
4. Meeting data will flow into Exponential

See [Fireflies Integration](/docs/features/fireflies) for detailed setup.

### With Custom Applications

For API access:
1. Create a JWT token
2. Include it in your API requests as a Bearer token:

```
Authorization: Bearer your-jwt-token-here
```

### With Webhooks

For webhook validation:
1. Create a Hex Key token
2. Configure the external service to include it
3. Exponential validates incoming requests

## Security Best Practices

### Token Management

- **Use descriptive names** - Know what each token is for
- **Set appropriate expiration** - Don't use longer than needed
- **Revoke unused tokens** - Clean up tokens you're not using
- **One token per integration** - Easier to manage and revoke

### Token Storage

- **Never commit tokens** - Keep them out of version control
- **Use environment variables** - Store in `.env` files
- **Secure transmission** - Only use over HTTPS
- **Don't share tokens** - Create separate tokens per person/service

### When Tokens Expire

- Integrations stop working
- Create a new token
- Update the integration with the new token
- The Workflows page will show "Setup Required" for affected integrations

## Token vs Integration

| Concept | Purpose |
|---------|---------|
| **Token** | Authentication credential for YOUR data |
| **Integration** | Connection TO external service with THEIR credentials |

**Example:** Fireflies integration needs:
1. A **token** (for Fireflies to send data to you)
2. An **integration** (for you to pull data from Fireflies)

## Troubleshooting

### Webhook Not Receiving Data

1. Check that the token hasn't expired
2. Verify the token is entered correctly in the external service
3. Ensure the webhook URL is correct
4. Check the external service's webhook logs

### Token Expired

1. Create a new token with the same settings
2. Update the external service with the new token
3. Test that data flows correctly

### Integration Showing "Setup Required"

This usually means:
1. Token has expired
2. Integration credentials are missing
3. Something needs reconfiguration

Go to [Workflows](/docs/features/workflows) to complete setup.

## Common Questions

### How many tokens can I create?

There's no hard limit. Create as many as you need for different integrations.

### Can I see my token value after creation?

No. Tokens are only shown once at creation time. If you lose it, create a new one.

### What happens when a token expires?

Any integration using it stops working. Create a new token and update the integration.

### Can I extend a token's expiration?

No. Create a new token with a longer expiration instead.

### Are tokens workspace-specific?

Tokens are tied to your user account and work across your workspaces.

## Next Steps

- [Set up Fireflies integration](/docs/features/fireflies)
- [Configure Workflows](/docs/features/workflows)
- [Learn about Integrations](/docs/features/integrations)
