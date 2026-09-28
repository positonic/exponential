---
title: Chrome extension
description: Dictate recordings, save pages, create actions, add contacts and track time from a side panel in any browser tab
icon: IconMicrophone
order: 2
sidebarTitle: Chrome extension
---

The Exponential Whisper extension adds a side panel to Chrome so you can capture without leaving the tab you are in: dictate a recording with on-device speech recognition, save the page you are reading, create an action, add a CRM contact or start the timer. Recordings are saved as meetings in Exponential, screenshots included.

## Where to find it

The extension is loaded from a folder rather than the Chrome Web Store. Once installed, click the **Exponential Whisper** icon in the toolbar to open the side panel. Inside Exponential, the extension appears as **Browser Extension Capture** on the [Workflows page](/workflows) (user menu → **Workflows**).

## How to install it

1. Get the extension folder (called **exponential**) and keep it somewhere permanent — Chrome loads it from that location.
2. Open `chrome://extensions` and turn on **Developer mode** (top right).
3. Click **Load unpacked** and choose the **exponential** folder.
4. **Exponential Whisper** appears in your extension list. If its icon is not in the toolbar, open the puzzle-piece menu and pin it.

Chromium browsers such as Edge and Brave work the same way.

## How to connect your account

Open the side panel. If you are already signed in to Exponential in this browser, the extension signs in from that session and you are done.

Otherwise it shows **API Key Required**:

1. Click **Get your API key**, which opens [Settings → API keys](/settings/api-keys). Click **Create API Key**, choose **Hex Key (32 chars)**, click **Generate API Key** and copy the key.
2. Paste it into the field and click **Save API Key**.
3. Under **Select project**, pick the project new recordings and actions should go to. You can change it later, or **Disconnect**, from the panel's **Settings**.

## How to record

1. Open the **Recording** tab and click **Start Recording**. Chrome asks for microphone access the first time — click **Allow**. The first recording also downloads the Whisper speech model once (**Downloading...** then **Loading model...**); it is cached after that.
2. Speak. Your words appear in the panel as they are recognised.
3. Click **Screenshot** to capture the tab, or say "take a screenshot" while recording — a `[SCREENSHOT]` marker is placed in the text where you said it.
4. Click **Stop Recording**. The **View recording** link opens the meeting in Exponential; screenshots are on its **Screenshots** tab.
5. Click **Generate Actions** to turn the recording into draft actions, tick the ones you want in **Review Actions**, and click **Create Actions**.

### Annotate before a screenshot

1. Click **Draw** (or press **Ctrl+Shift+D**; **Cmd+Shift+D** on Mac).
2. Choose **Arrow** or **Freehand** and mark up the page.
3. Take the screenshot — the marks are included and cleared afterwards. **Clear** removes them without capturing.

## How to capture without recording

- **Save Page** — creates an action holding the page's title and link, plus any context you add.
- **Create Action** — type the action name, pick a project and priority if you like, and click **Create Action**.
- **Add Contact** — first name, last name, email, phone and LinkedIn URL go straight into the [CRM](/docs/crm/contacts).
- **Track Time** — type what you are working on and start the timer; **Time Entries** lists what you have logged. The running timer also shows in Exponential's sidebar. See [Time tracking](/docs/do/time-tracking).

Each tab lists your recent items underneath its form.

## How it connects

- [API tokens](/docs/developers/api-tokens) — the key the extension uses; revoke it there to disconnect a browser you no longer use.
- [Time tracking](/docs/do/time-tracking) — timers started in the extension appear on the Time page.
- [Knowledge base](/docs/zoe/knowledge-base) — recordings are searchable there once indexed.
- [iOS shortcut](/docs/capture/ios-shortcut) — the same quick capture from your phone.

## FAQ

**Is my audio sent anywhere?**
No. Speech recognition runs on your computer with Whisper. Only the text, screenshots and things you save reach Exponential.

**Is it in the Chrome Web Store?**
Not yet — install it with **Load unpacked** as above.

**Where do recordings go?**
Each recording is a meeting in the project you selected. Open it from the **View recording** link or from **Amplify → Meetings** in the sidebar.

**The key was rejected.**
Keys expire. Create a new one under [Settings → API keys](/settings/api-keys) and save it again.
