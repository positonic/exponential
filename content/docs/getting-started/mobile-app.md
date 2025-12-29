---
title: Mobile App
description: Install Exponential as a mobile app on your iPhone or Android device
---

## Install on Mobile

Exponential can be installed as a Progressive Web App (PWA) on your mobile device, giving you an app-like experience with offline support.

## iPhone (iOS)

> **Important:** iOS requires Safari for PWA installation. Other browsers (Chrome, Brave, Firefox) cannot install PWAs on iPhone.

### Installation Steps

1. Open **Safari** on your iPhone
2. Navigate to your Exponential app URL
3. Tap the **Share button** (square with arrow pointing up)
4. Scroll down and tap **"Add to Home Screen"**
5. Customize the name if desired (default: "Exponential")
6. Tap **"Add"** in the top right corner

The app icon will appear on your home screen. Tapping it launches Exponential in standalone mode without browser UI.

### iOS Tips

- The app opens in full-screen mode without Safari's address bar
- Your session persists between launches
- Pull down from the top to see the status bar if hidden

## Android

### Chrome (Recommended)

1. Open **Chrome** on your Android device
2. Navigate to your Exponential app URL
3. Tap the **menu** (three dots in the top right)
4. Tap **"Add to Home Screen"** or **"Install App"**
5. Confirm the installation

### Other Browsers

Most Android browsers (Firefox, Edge, Samsung Internet) support PWA installation with similar steps through their menu options.

## Offline Support

When you lose internet connectivity:

- **Offline Banner**: A notification appears at the top of the screen
- **Cached Pages**: Recently visited pages (Today, Inbox) remain accessible
- **Read-Only Mode**: You can view existing data but cannot make changes
- **Auto-Reconnect**: Normal operation resumes when back online

### What Works Offline

- Viewing your Today page (if previously cached)
- Viewing your Inbox (if previously cached)
- Navigating between cached pages

### What Requires Internet

- Creating new tasks or projects
- Updating existing items
- AI assistant features
- Real-time sync with other devices

## Updating the App

PWAs update automatically when you open the app with an internet connection. To force an update, close and reopen the app.

## Troubleshooting

### App Won't Install

**iPhone:** Ensure you're using Safari, not Chrome or Brave.

**Android:** Try using Chrome if other browsers aren't working.

### Offline Mode Not Working

Visit the pages you want cached (`/today`, `/inbox`) while online first. The service worker needs to cache pages on first visit.

### Session Expired

If you're logged out unexpectedly, open the app and sign in again. Your data will sync automatically.
