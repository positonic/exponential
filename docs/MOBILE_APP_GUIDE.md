# Mobile App Installation Guide

Exponential can be installed as a Progressive Web App (PWA) on your mobile device, giving you an app-like experience with offline support.

## Installing on iPhone (iOS)

**Note:** iOS requires Safari for PWA installation. Other browsers (Chrome, Brave, Firefox) cannot install PWAs on iPhone.

### Steps

1. **Open Safari** on your iPhone
2. **Navigate** to your Exponential app URL
3. **Tap the Share button** (square with an arrow pointing up)
4. **Scroll down** and tap **"Add to Home Screen"**
5. **Customize the name** if desired (default: "Exponential")
6. **Tap "Add"** in the top right corner

The app icon will appear on your home screen. Tapping it launches Exponential in standalone mode without browser UI.

### iOS Tips

- The app opens in full-screen mode without Safari's address bar
- Your session persists between launches
- Pull down from the top to see the status bar if hidden

## Installing on Android

### Chrome (Recommended)

1. **Open Chrome** on your Android device
2. **Navigate** to your Exponential app URL
3. **Tap the menu** (three dots in the top right)
4. **Tap "Add to Home Screen"** or "Install App"
5. **Confirm** the installation

### Other Android Browsers

Most Android browsers (Firefox, Edge, Samsung Internet) support PWA installation with similar steps through their menu options.

## Features

### Offline Support

When you lose internet connectivity:

- **Offline Banner**: A notification appears at the top of the screen
- **Cached Pages**: Recently visited pages (`/today`, `/inbox`) remain accessible
- **Read-Only Mode**: You can view your existing data but cannot make changes
- **Auto-Reconnect**: The app automatically resumes normal operation when back online

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

PWAs update automatically when you:

1. Open the app with an internet connection
2. The service worker checks for updates in the background
3. Updates apply on the next app launch

To force an update:
- Close and reopen the app
- Or clear the app's cache in your device settings

## Troubleshooting

### App Won't Install

**iPhone:**
- Ensure you're using Safari (not Chrome/Brave/Firefox)
- Make sure you're on the app URL, not a Google search result

**Android:**
- Try using Chrome instead of other browsers
- Check if your browser supports PWAs

### Offline Mode Not Working

- Visit the pages you want cached (`/today`, `/inbox`) while online first
- The service worker needs time to cache pages on first visit

### App Appears Broken After Update

1. Close the app completely
2. Clear the app's cache (Settings > Safari > Clear History and Website Data on iOS)
3. Reinstall from the browser

### Session Expired

If you're logged out unexpectedly:
1. Open the app
2. Sign in again with your credentials
3. Your data will sync automatically

## Removing the App

### iPhone
1. Long-press the app icon on your home screen
2. Tap "Remove App" or the minus (-) icon
3. Confirm removal

### Android
1. Long-press the app icon
2. Drag to "Uninstall" or tap the info icon
3. Select "Uninstall"

---

**Need Help?**
- Check the main application for support options
- Contact your system administrator
