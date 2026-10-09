---
title: Desktop app & Local wiki
description: Exponential in a window of its own, and the desktop-only Local wiki, a git-backed folder of Markdown on your machine
section: capture
order: 4
icon: IconDeviceMobile
updated: 2026-09-28
---

Exponential runs in the browser, and it also runs as a desktop app that wraps the same web app in a native window: its own dock icon, sign-in that hands off to your system browser and comes back, and, in the newer shell, a **Local wiki** that lives on your disk rather than in the cloud. The desktop app changes where Exponential runs, not what it does; every guide on this site applies unchanged.

## Where to find it

There are two shells, both in the open-source repository ([github.com/positonic/exponential](https://github.com/positonic/exponential)):

- **Exponential** (Electron) for macOS, Windows and Linux: the established desktop app, with an overlay title bar on macOS.
- **Exponential Beta** (Tauri, macOS only): a newer, lighter shell that adds the Local wiki and native macOS window tabs. It installs beside the first, with its own icon and bundle.

Neither is offered as a download inside the app yet; they are built from the repository (`npm run electron:build` and `npm run tauri:build`). If you are not building software, use the web app or install it as a [mobile app](/docs/capture/mobile-app).

## How sign-in works on the desktop

Click **Sign in**; the app opens your default browser, you sign in there as usual, and the browser asks whether to **Open Exponential** to hand the session back. Allow it once and the window is signed in. Nothing about your password passes through the shell.

## How to use the Local wiki

The Local wiki appears as **Local wiki** at the top of the sidebar only inside the Beta shell; a browser never shows it. It is a folder of Markdown files on your machine, `~/Documents/exponential-wiki` by default, kept under git so every change has a history, and maintained by Zoe's librarian agent as well as by you.

1. Open **Local wiki** in the sidebar. The list shows every page; **Search the wiki…** filters it.
2. Open a page to read it, or edit it in place. Write Markdown; `[[wikilinks]]` point at other pages and become links.
3. **Page actions** lets you **Rename** a page (give it a **New path**); **History** shows the commits that touched it.
4. Ask Zoe to add to the wiki ("write up what we know about the onboarding funnel"); she writes files into the same folder and commits them.

The wiki belongs to the device, not to a workspace: it is the same whichever workspace you are in, and it never syncs to the server. Point a build at a different folder with `EXPONENTIAL_WIKI_ROOT` when you start it.

## How it connects

- **Mobile app** — the phone equivalent, installed from the browser: [Mobile app](/docs/capture/mobile-app).
- **Knowledge base** — the cloud-side store Zoe searches; the Local wiki is deliberately separate: [Knowledge base](/docs/zoe/knowledge-base).
- **Pages** — workspace documents that live on the server and can be published: [Pages](/docs/do/pages).
- **Self-hosting** — building either shell against your own installation: [Self-hosting](/docs/self-hosting).

## FAQ

**Is there a download?**
Not yet. Both shells are built from the repository; release builds point at exponential.im.

**Will the wiki sync between my laptop and desktop?**
No. It is a local folder under git; sync it yourself (push the repository somewhere) if you want it on two machines.

**Can the web app read my Local wiki?**
No. The wiki is only reachable through the desktop shell's own bridge, and nothing on a remote page can read files outside the wiki folder.
