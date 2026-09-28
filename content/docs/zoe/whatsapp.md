---
title: WhatsApp
description: Link your WhatsApp so you can message Zoe from your phone; Telegram works the same way
section: zoe
order: 3
icon: IconBrandWhatsapp
sidebarTitle: "WhatsApp & Telegram"
updated: 2026-09-28
---

Link a WhatsApp account and you can message Zoe like any contact: create actions on the go, ask what is due, get a meeting summary. It works like WhatsApp Web: you scan a QR code and your phone stays the source of the session. Telegram is available alongside it with a simpler bot-style connection.

## Where to find it

[Settings → Integrations](/settings/integrations) → **Connect WhatsApp**. The same button is on the Agents page (**Amplify → Agents**). Telegram is next to it: **Connect Telegram**.

> **⚠️ Read before linking a personal account**
>
> - **Your messages pass through a gateway.** Conversation data for the linked account is processed by, and may be stored on, the gateway that runs the connection. Only link an account if you trust the operator of the installation you are using.
> - **WhatsApp's terms.** Automation on personal WhatsApp accounts may breach [WhatsApp's Terms of Service](https://www.whatsapp.com/legal/terms-of-service), and WhatsApp can suspend or ban accounts it detects doing it. This uses the WhatsApp Web protocol for a legitimate assistant, but the risk is yours.
> - **If the gateway were compromised**, an attacker could read synced conversations, send messages as you, and see your contacts and linked devices.
>
> Prefer a separate WhatsApp account rather than your primary one.

## How to connect WhatsApp

1. Click **Connect WhatsApp**. A dialog opens with a QR code that refreshes every 15 seconds.
2. On your phone, open WhatsApp → **Settings** → **Linked Devices** → **Link a Device**, and scan the code.
3. The dialog shows your number with a green **Connected** badge.

You can link more than one account with **Connect Another Account**; each shows as its own session. Disconnect a session with its **X**, and delete abandoned attempts under **Pending sessions** with the trash icon.

## How to use it

Message the linked number as you would message a person. Zoe keeps the thread's context between messages and has the same tools she has in the app:

- "Add an action: call the landlord tomorrow."
- "What is on my plate today?"
- "Summarise this morning's standup."

## How to connect Telegram or Matrix

1. Click **Connect Telegram** on [Settings → Integrations](/settings/integrations), or open [Settings → AI assistant](/settings/assistant), where both **Telegram** and **Matrix** connections live.
2. Choose the **Default agent** that answers there (Zoe or a specialist) and follow the link to start the bot in Telegram, or enter your Matrix ID.

## How it connects

- **Zoe** — the assistant on the other end is the same [Zoe](/docs/zoe/assistant), with the same memory and workspace access.
- **Actions** — anything you ask her to create lands in [Inbox](/inbox) or the project you name.
- **Notifications** — WhatsApp can also be a delivery channel for reminders and summaries: [Notifications](/docs/collaborate/notifications).

## FAQ

**No QR code appears.**
The gateway for this installation is not reachable. Refresh once; if it persists, contact the administrator of your installation (or see [Self-hosting](/docs/self-hosting) if that is you).

**The connection keeps dropping.**
WhatsApp Web needs your phone online. Check the phone's connection and that WhatsApp is not being killed in the background.

**"Maximum sessions reached".**
Disconnect a session you no longer use, then connect again.

**Connected, but replies do not come.**
Disconnect and reconnect the session, and check the phone for a "linked device" notice from WhatsApp.

**What can it not do?**
Business API features (templates, catalogues) are not available; this is the linked-device protocol, subject to WhatsApp's rules for linked devices.
