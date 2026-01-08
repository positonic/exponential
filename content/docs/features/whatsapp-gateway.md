---
title: WhatsApp Integration
description: Connect your WhatsApp account to interact with AI assistants via messaging
---

## Overview

The WhatsApp Integration allows you to connect your personal WhatsApp account to Exponential, enabling:

- Direct messaging with Paddy (AI assistant) via WhatsApp
- Real-time interaction from your phone
- Seamless integration with your existing WhatsApp conversations

This integration uses WhatsApp Web technology, meaning you link your phone's WhatsApp account (similar to using WhatsApp Web on a computer).

## Quick Setup

### Step 1: Access WhatsApp Settings

1. Open the **ManyChat** page in Exponential
2. Click the **WhatsApp icon** in the header (next to other chat options)
3. The WhatsApp Connection modal will open

### Step 2: Scan QR Code

1. Click **Connect WhatsApp** in the modal
2. A QR code will appear on screen
3. On your phone, open WhatsApp
4. Go to **Settings** > **Linked Devices** > **Link a Device**
5. Scan the QR code displayed in Exponential

The QR code automatically refreshes every 15 seconds. If it expires, click the refresh button to get a new code.

### Step 3: Verify Connection

Once successfully connected:

- The modal will show a success message with your phone number
- Your WhatsApp session appears in the sessions list
- A green "Connected" badge indicates active status

## Managing Sessions

### Viewing Connected Accounts

The WhatsApp Connection modal displays all your sessions:

- **Connected sessions** - Active WhatsApp accounts showing phone number and connection date
- **Pending sessions** - Sessions waiting to complete QR code scanning

### Disconnecting a Session

To disconnect a WhatsApp account:

1. Open the WhatsApp Connection modal
2. Find the session you want to disconnect
3. Click the **X** button next to the session
4. The session will be disconnected from the gateway

### Cleaning Up Pending Sessions

If you have abandoned connection attempts:

1. Look for sessions under "Pending sessions"
2. Click the **trash icon** to delete them
3. This cleans up incomplete sessions

### Multiple Accounts

You can connect multiple WhatsApp accounts:

1. Click **Connect Another Account** after your first connection
2. Each account appears as a separate session
3. Manage each independently

Note: The gateway may have a maximum session limit. If you hit the limit, disconnect an existing session first.

## Using WhatsApp

Once connected, you can message your AI assistant directly through WhatsApp. The experience is similar to chatting in the ManyChat interface but through your phone's WhatsApp app.

### Starting a Conversation

- Messages sent to the connected number are processed by Paddy
- You receive responses directly in your WhatsApp chat
- Conversation context is maintained across messages

### Use Cases

- Quick task creation while on the go
- Checking project status from your phone
- Getting meeting summaries and action items
- Natural language queries about your data

## Troubleshooting

### QR Code Not Appearing

- Ensure the gateway service is running and configured
- Check that `WHATSAPP_GATEWAY_URL` environment variable is set
- Try refreshing the modal or the page
- Contact your administrator if the issue persists

### Connection Keeps Dropping

- Ensure your phone has a stable internet connection
- WhatsApp Web requires your phone to be online
- Check that the gateway service is healthy

### "Maximum Sessions Reached" Error

- You've hit the gateway's session limit
- Disconnect an existing session before connecting a new one
- Contact your administrator to increase the limit

### Session Shows Connected but Messages Don't Work

- Try disconnecting and reconnecting the session
- Verify the gateway service is running
- Check the phone's WhatsApp for any notifications about linked devices

### "Gateway Not Configured" Message

This means the WhatsApp Gateway URL is not set up:

- For self-hosted deployments: Set the `WHATSAPP_GATEWAY_URL` environment variable
- Contact your administrator to configure the gateway

## Technical Requirements

### For Self-Hosted Deployments

The WhatsApp integration requires a WhatsApp Gateway service:

1. **Environment Variable**: Set `WHATSAPP_GATEWAY_URL` to point to your gateway instance
2. **Shared Secret**: Both applications must use the same `AUTH_SECRET` for JWT verification
3. **Network Access**: The gateway must be accessible from your Exponential instance

### Security

- JWT tokens authenticate requests between Exponential and the gateway
- Tokens expire after 1 hour for security
- Each user's sessions are isolated and private
- Session data is stored securely in the database

## Limitations

- Requires an active WhatsApp account on your phone
- Phone must remain connected to the internet for messages to sync
- Business API features are not available (this uses WhatsApp Web protocol)
- Subject to WhatsApp's terms of service for linked devices
