---
title: Chat gateways
description: Talk to Zoe from WhatsApp, Telegram or Matrix, with the same memory and tools she has in the app
section: zoe
order: 3
icon: IconBrandWhatsapp
sidebarTitle: Chat gateways
updated: 2026-09-28
---

A chat gateway puts Zoe in a messaging app you already have open: WhatsApp, Telegram or Matrix. Whichever you use, it is the same assistant with the same workspace access, so "add an action: call the landlord tomorrow" or "what is on my plate?" works the same way from your phone as from the Zoe drawer. Each gateway also doubles as a delivery channel for reminders and summaries.

## Where to find it

- WhatsApp and Telegram: [Settings → Integrations](/settings/integrations) (**Connect WhatsApp**, **Connect Telegram**). **Connect WhatsApp** is also on the Agents page (**Amplify → Agents**).
- Telegram and Matrix: [Settings → AI assistant](/settings/assistant), where each has a card with its **Default agent**.
- Where notifications go: [Settings → Notifications](/settings/notifications).

## WhatsApp

WhatsApp works like WhatsApp Web: you scan a QR code and your phone stays the source of the session.

> **⚠️ Read before linking a personal account**
>
> - **Your messages pass through a gateway.** Conversation data for the linked account is processed by, and may be stored on, the gateway that runs the connection. Only link an account if you trust the operator of the installation you are using.
> - **WhatsApp's terms.** Automation on personal WhatsApp accounts may breach [WhatsApp's Terms of Service](https://www.whatsapp.com/legal/terms-of-service), and WhatsApp can suspend or ban accounts it detects doing it. This uses the WhatsApp Web protocol for a legitimate assistant, but the risk is yours.
> - **If the gateway were compromised**, an attacker could read synced conversations, send messages as you, and see your contacts and linked devices.
>
> Prefer a separate WhatsApp account rather than your primary one.

### How to connect WhatsApp

1. Click **Connect WhatsApp**. A dialog opens with a QR code that refreshes every 15 seconds.
2. On your phone, open WhatsApp → **Settings** → **Linked Devices** → **Link a Device**, and scan the code.
3. The dialog shows your number with a green **Connected** badge.

You can link more than one account with **Connect Another Account**; each shows as its own session with **Disconnect** and **Delete** controls. Then message the linked number as you would message a person; Zoe keeps the thread's context between messages.

## Telegram

1. Click **Connect Telegram** on [Settings → Integrations](/settings/integrations) or open the **Telegram** card on [Settings → AI assistant](/settings/assistant).
2. Choose the **Default agent** that answers there (Zoe or a specialist) and click **Update Assistant** if the card asks for it.
3. Follow the link to open the bot in Telegram and start the chat.

## Matrix

Matrix pairing is started from your side and completed in your Matrix client, so nobody can pair your account for you.

1. On [Settings → AI assistant](/settings/assistant), open the **Matrix** card and enter **Your Matrix ID** (for example `@you:example.org`).
2. The bot invites you to a direct chat. Accept the invite in your Matrix client (Element or any other).
3. Send the pairing code the card shows you into that chat; the code expires after a few minutes. The card polls and switches to **Connected**.
4. Chat with Zoe in that direct message. `!agent NAME` switches to a specialist agent; the **Default agent** on the card sets who answers first.

Matrix is also a notification channel: a **Matrix (Zoe DM)** column appears on [Settings → Notifications](/settings/notifications) once you are paired, and workspaces can circulate ceremony agendas to a Matrix room.

## How it connects

- **Zoe** — the assistant on the other end, with the same memory and tools: [Zoe](/docs/zoe/assistant).
- **Actions** — anything you ask her to create lands in [Inbox](/inbox) or the project you name: [Actions](/docs/do/actions).
- **Notifications** — reminders, the daily summary and agenda-ready notices can be delivered to these channels: [Notifications](/docs/collaborate/notifications).
- **Ceremonies** — agendas can be sent to a Matrix room: [Ceremonies & occurrences](/docs/meet/ceremonies).
- **Slack** — a different kind of connection: Zoe reads and posts in your Slack rather than chatting with you there: [Slack](/docs/integrations/slack).

## FAQ

**No QR code appears for WhatsApp.**
The gateway for this installation is not reachable. Refresh once; if it persists, contact the administrator of your installation (or see [Self-hosting](/docs/self-hosting) if that is you).

**The WhatsApp connection keeps dropping.**
WhatsApp Web needs your phone online. Check the phone's connection and that WhatsApp is not being killed in the background.

**"Maximum sessions reached".**
Disconnect a session you no longer use, then connect again.

**The Matrix pairing code expired.**
Start again from the card; a new invite and code are issued.

**What can WhatsApp not do?**
Business API features (templates, catalogues) are not available; this is the linked-device protocol, subject to WhatsApp's rules for linked devices.
