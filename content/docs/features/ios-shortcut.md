---
title: iOS Shortcut
description: Add actions to Exponential by voice or text from your iPhone, iPad, or Mac using Apple Shortcuts
---

Quickly capture tasks using your voice or keyboard — straight from your iPhone, iPad, or Mac — without opening the app.

Once set up, just say **"Hey Siri, Add to Exponential"** and dictate your task. It gets added instantly.

Exponential understands natural language, so you can say things like:

- "Call John tomorrow"
- "Review the proposal next Friday"
- "Send invoice for Sales project"

Dates and project names are picked up automatically.

---

## What You'll Need

- An Exponential account
- An iPhone, iPad, or Mac with the **Shortcuts** app (built in)
- 5 minutes

---

## Step 1: Create an API Key

Your API key lets the shortcut securely add actions to your account.

1. Open Exponential and go to **Settings > API Keys**
2. Click **Create API Key**
3. Fill in the form:
   - **Name**: `iOS Shortcut` (or anything you'll recognize)
   - **Token Type**: select **Hex Key (32 chars)**
   - **Expires In**: choose **90 days** (you can always create a new one later)
4. Click **Generate API Key**
5. **Copy the key immediately** — you won't be able to see it again after closing this window
6. Keep it somewhere safe for the next step (e.g., paste it in Notes temporarily)

---

## Step 2: Install the Shortcut

Tap the link below on your iPhone, iPad, or Mac to install the shortcut:

**[Install Exponential Shortcut](https://www.icloud.com/shortcuts/89def083f3b14f0083bc176a8b96fcd1)**

When prompted, tap **Add Shortcut** to confirm.

---

## Step 3: Add Your API Key

Now you'll paste your API key into the shortcut so it can connect to your account.

1. Open the **Shortcuts** app
2. Find the **Exponential** shortcut
3. Tap the **three dots** (`...`) in the top-right corner to edit it
4. Scroll down to the **"Get contents of URL"** block
5. Expand the **Headers** section
6. Find the row with **x-api-key** — the value will be a placeholder like `YOUR_API_KEY_HERE`
7. **Replace it** with the API key you copied in Step 1
8. Tap **Done** to save

![Where to find the x-api-key header in the shortcut](/docs/ios-shortcut-config.png)

---

## How to Use It

### With Siri (voice)
Say: **"Hey Siri, Add to Exponential"**

Siri will ask what you'd like to add. Just speak your task naturally.

### From the Shortcuts app
Open the Shortcuts app and tap the **Exponential** shortcut. Type or dictate your task.

### From your Home Screen
Long-press the shortcut in the Shortcuts app and tap **Add to Home Screen** for one-tap access.

### Examples

| What you say | What gets created |
|---|---|
| "Buy groceries" | Action: **Buy groceries** |
| "Call John tomorrow" | Action: **Call John**, due **tomorrow** |
| "Review proposal next Friday" | Action: **Review proposal**, due **next Friday** |
| "Send invoice for Sales project" | Action: **Send invoice**, added to **Sales** project |

---

## Troubleshooting

**"Invalid or expired API key"**
Your API key may have expired. Go to **Settings > API Keys** in Exponential and create a new one, then update it in the shortcut (Step 3).

**Nothing happens when I run the shortcut**
- Make sure you pasted the API key correctly — no extra spaces before or after
- Check that the key hasn't expired
- Make sure you have an internet connection

**The action was created but the date wasn't picked up**
Try being more specific. "Tomorrow", "next Monday", and "Friday" work well. Vague phrases like "soon" or "later" won't be parsed as dates.

**I want to change the default priority**
Edit the shortcut and find the **Request Body** section. Change the `priority` value. Options: `Quick`, `Scheduled`, `Urgent`, `Important`.
