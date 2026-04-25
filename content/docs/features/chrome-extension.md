---
title: Chrome Extension
description: Capture voice notes, screenshots, and transcriptions from any browser tab
---

## Overview

The Exponential Chrome Extension turns your browser into a voice-powered capture tool. Speak naturally while you work, and your words are transcribed in real time — attached to the project of your choosing. You can also annotate any webpage and take screenshots, all without leaving your current tab.

Whether you're narrating thoughts during research, capturing meeting notes on the fly, or logging observations as you browse, the extension keeps everything organised inside Exponential so nothing slips through the cracks.

### Key Capabilities

| Feature | What It Does |
|---------|-------------|
| **Voice Dictation** | Continuous speech-to-text transcription, saved automatically |
| **Screenshots** | Capture the visible tab with a button click or voice command |
| **Annotations** | Draw arrows and freehand marks on any webpage before screenshotting |
| **Session Links** | Every recording session gets a shareable link you can send to teammates |
| **Two Speech Engines** | Choose between on-device Whisper AI or cloud-based Google transcription |

## What You'll Need

Before you begin, make sure you have:

- **Google Chrome** (or a Chromium-based browser like Edge or Brave)
- **An Exponential account** — sign up at [exponential.im](https://exponential.im) if you haven't already
- **A microphone** — your laptop's built-in mic works fine, though a headset gives better results

## Installation

The extension is installed directly into Chrome from a folder on your computer. Don't worry — it only takes a minute.

### Step 1: Get the Extension Files

Download or copy the extension folder to a location on your computer that you'll remember (for example, your Desktop or Documents folder). The folder you need is called **exponential**.

### Step 2: Open Chrome Extensions

1. Open Chrome
2. Type `chrome://extensions` into the address bar and press **Enter**
3. You'll see the Extensions management page

### Step 3: Enable Developer Mode

In the top-right corner of the Extensions page, you'll see a toggle labelled **Developer mode**. Turn it **on**. This allows Chrome to load extensions from a folder — it's completely safe and is how many extensions are installed during development.

### Step 4: Load the Extension

1. Click the **Load unpacked** button that appears in the top-left area
2. A file browser will open — navigate to the **exponential** folder you saved earlier
3. Select the folder and click **Open**

That's it. You should now see **Exponential Whisper** appear in your list of extensions, and its icon will show in your Chrome toolbar.

**Tip:** If the icon doesn't appear in your toolbar, click the puzzle-piece icon (Extensions menu) in Chrome's toolbar and pin **Exponential Whisper** so it's always visible.

## Connect Your Account

Before you can start recording, the extension needs to know who you are. You'll do this by creating an API key in your Exponential account and pasting it into the extension.

### Step 1: Generate an API Key

1. Open [exponential.im/settings/api-keys](https://exponential.im/settings/api-keys) in your browser
2. Click the button to **create a new API key**
3. Your key will appear on screen — **copy it** to your clipboard

Keep this key private. It connects the extension to your personal account.

### Step 2: Enter the Key in the Extension

1. Click the **Exponential Whisper** icon in your Chrome toolbar — a side panel will open
2. You'll see a card titled **API Key Required** with a text field
3. Paste your API key into the field
4. Click **Save API Key**

The extension will validate your key by checking your account. If everything looks good, the key card will disappear and you'll move to the next step.

### Step 3: Select a Project

Once your key is accepted, a **Select Project** dropdown will appear showing all of your Exponential projects.

1. Choose the project you'd like transcriptions to be saved to
2. The extension is now ready to use

You can change your project later from the **Settings** menu inside the extension.

## Your First Recording

With everything set up, here's how to capture your first voice note:

1. **Click the extension icon** in your toolbar to open the side panel
2. Click **Start Recording** — Chrome may ask for microphone permission the first time; click **Allow**
3. **Speak naturally** — you'll see your words appear in the transcription area in real time
4. When you're finished, click **Stop Recording**
5. A **session link** will appear beneath the transcription — click it to view the full session in Exponential

Your transcription is automatically saved to the project you selected. You can find it in Exponential at any time.

## Features

### Speech Engines

The extension offers two transcription engines. You can switch between them at any time using the toggle at the top of the side panel.

| Engine | How It Works | Best For |
|--------|-------------|----------|
| **Local (Whisper)** | Runs AI directly on your computer — no internet needed after first load | Privacy-conscious users; offline use |
| **Google** | Sends audio to Google's cloud for fast, real-time transcription | Speed and accuracy; always-on internet |

**First time using Whisper?** The AI model needs to download once (this may take a moment). You'll see a progress bar while it loads. After that, it's cached on your device and loads instantly.

### Screenshots

You can capture a screenshot of whatever you're looking at in two ways:

- **Click the Screenshot button** in the side panel
- **Say "take screenshot"** while recording — the extension will hear the command, snap the image, and insert a `[SCREENSHOT]` marker in your transcription

Screenshots are saved both to your computer (as a downloaded image) and to your Exponential session, so you can review them alongside your notes later.

### Annotations

Before taking a screenshot, you might want to highlight something on the page.

1. Click the **Draw** button in the side panel (or press **Ctrl+Shift+D** on Windows, **Cmd+Shift+D** on Mac)
2. Choose your tool:
   - **Arrow** — click and drag to draw directional arrows
   - **Freehand** — draw freely with your mouse
3. Mark up the page as needed
4. Take your screenshot — annotations will be included in the capture
5. Annotations are automatically cleared after the screenshot is taken

You can also click **Clear** at any time to remove your annotations without taking a screenshot.

### Session Links

Every recording session is stored in Exponential with its own unique link. After you stop recording, the link appears in the side panel. Share it with teammates so they can review your transcription and screenshots in context.

## Settings & Management

Click the **Settings** button in the top-right corner of the side panel to:

- **View your API key** (shown partially masked for security)
- **See your current project**
- **Change project** — switch which project receives your transcriptions
- **Clear API Key** — disconnect the extension from your account (you can reconnect at any time)

## Tips for Best Results

- **Use a quiet environment** when possible — background noise can reduce transcription accuracy
- **Speak at a natural pace** — you don't need to slow down or enunciate unnaturally
- **Position your microphone well** — a headset or external mic positioned close to your mouth gives the clearest audio
- **Use Whisper for sensitive work** — since it runs entirely on your device, your audio never leaves your computer
- **Use Google for speed** — if you need the fastest real-time feedback and are comfortable with cloud processing

## Troubleshooting

### Extension Not Appearing in Toolbar

- Go to `chrome://extensions` and confirm **Exponential Whisper** is listed and enabled
- Click the puzzle-piece icon in Chrome's toolbar and **pin** the extension
- If the extension isn't listed, try clicking **Load unpacked** again and re-selecting the folder

### Microphone Permission Denied

- Chrome needs explicit permission to access your microphone
- When prompted, click **Allow**
- If you previously denied permission, click the lock icon in Chrome's address bar, find **Microphone**, and set it to **Allow**

### "Invalid API key" or "No projects found"

- Double-check that you copied the full API key from [exponential.im/settings/api-keys](https://exponential.im/settings/api-keys)
- Make sure the key hasn't expired — generate a fresh one if needed
- Confirm you have at least one project created in Exponential

### No Transcription Appearing

- Check that your microphone is working (try a voice memo app or online mic test)
- If using **Whisper**, wait for the model to finish loading (the progress bar should reach 100%)
- If using **Google**, ensure you have an active internet connection
- Try switching between engines to see if one works better in your setup

### Extension Feels Slow

- If **Whisper** is slow on first use, this is normal — the AI model is downloading. Subsequent uses will be much faster
- Close other resource-heavy tabs if Whisper transcription lags
- Switch to **Google** for lighter resource usage

## Next Steps

- [Explore all integrations](/docs/features/integrations) available in Exponential
- [Learn about API Access](/docs/features/api-access) for custom workflows
- [Set up Slack notifications](/docs/features/slack) so your team stays in the loop
