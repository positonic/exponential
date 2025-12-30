# PWA Implementation Notes

## Status: DISABLED (Dec 30, 2025)

PWA functionality has been temporarily disabled due to Vercel build issues with Next.js 15 + Bun.

## Problem Summary

Adding PWA-related files causes Vercel builds to hang indefinitely at the "Linting and checking validity of types" phase. Builds that normally complete in 3 minutes hang for 45+ minutes before timing out.

### Root Cause

Vercel support confirmed this is a compatibility issue between:
- Next.js 15.0.5
- Bun 1.3.4
- PWA manifest/service worker files

The issue is **not** with the code itself - local builds complete successfully in <30 seconds.

### Affected Files

These files cause the build to hang when present:

| File | Impact |
|------|--------|
| `public/manifest.webmanifest` | **Primary culprit** - JSON manifest file |
| `public/sw.js` | Service worker (116 lines) |
| `src/app/_components/ServiceWorkerRegistration.tsx` | Registers sw.js |
| `src/app/_components/OfflineBanner.tsx` | Shows offline notification |
| `src/hooks/useOnlineStatus.ts` | Detects online/offline state |

### What We Tried

1. **Commenting out imports** - Did not work (files still type-checked)
2. **Excluding public/** in tsconfig - Already excluded, didn't help
3. **Using static sw.js instead of Serwist** - Still caused hangs
4. **Adding files incrementally** - Manifest alone causes the issue
5. **Redeploying without cache** - Intermittent success

### Build Behavior Pattern

```
Clean state (no PWA files) → 3 min build ✅
Add manifest.webmanifest  → 45+ min hang ❌
Add meta tags only        → Sometimes works, sometimes hangs
```

## Current State

All PWA functionality has been removed:

```tsx
// src/app/(sidemenu)/layout.tsx - Current state
<head>
  <ColorSchemeScript />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, maximum-scale=1" />
</head>
```

No PWA files exist in the codebase.

## What Users Lose Without PWA

| Feature | Status |
|---------|--------|
| Manual "Add to Home Screen" | ✅ Still works (browser feature) |
| Automatic install prompt (Android) | ❌ Lost |
| Offline page access | ❌ Lost |
| Custom app icon | ❌ Lost |
| Standalone mode (no browser UI) | ❌ Lost |
| Custom splash screen | ❌ Lost |
| Offline banner notification | ❌ Lost |

## Re-implementation Steps

When Vercel fixes the issue, restore PWA with these steps:

### Step 1: Add Meta Tags
```tsx
// src/app/(sidemenu)/layout.tsx
<head>
  <ColorSchemeScript />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, maximum-scale=1" />
  <meta name="theme-color" content="#1a1b1e" media="(prefers-color-scheme: dark)" />
  <meta name="theme-color" content="#ffffff" media="(prefers-color-scheme: light)" />
  <meta name="apple-mobile-web-app-capable" content="yes" />
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
  <meta name="apple-mobile-web-app-title" content="Exponential" />
  <link rel="manifest" href="/manifest.webmanifest" />
</head>
```

### Step 2: Create Manifest
```json
// public/manifest.webmanifest
{
  "name": "Exponential",
  "short_name": "Exponential",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#1a1b1e",
  "theme_color": "#1a1b1e",
  "icons": [
    { "src": "/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icon-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

### Step 3: Create Service Worker
```javascript
// public/sw.js
const CACHE_NAME = 'exponential-v1';
const PRECACHE_URLS = ['/', '/today', '/inbox'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS))
  );
});

self.addEventListener('fetch', (event) => {
  // Network-first for API, cache-first for assets
});
```

### Step 4: Create Components
- `src/app/_components/ServiceWorkerRegistration.tsx`
- `src/app/_components/OfflineBanner.tsx`
- `src/hooks/useOnlineStatus.ts`

### Step 5: Test Build
```bash
npm run check  # Local validation
vercel --force  # Deploy without cache
```

## Vercel Support Case

A support case has been opened with Vercel engineering to investigate the root cause. Reference the build logs from:
- `exponential-4i8tfx3er` (hung with manifest)
- `exponential-ed11nbhff` (succeeded without manifest)

## Related Links

- [Vercel Support Ticket](#) - Add ticket number when available
- [Next.js PWA Discussion](https://github.com/vercel/next.js/discussions)
- [Serwist Issue #142](https://github.com/serwist/serwist/issues/142) - Related Bun compatibility issue

## Workarounds (Not Recommended)

If PWA is critical before the fix:

1. **Disable type checking in builds** (risky):
```js
// next.config.js
typescript: { ignoreBuildErrors: true }
```

2. **Use npm instead of Bun** - May work but untested

3. **Deploy to different provider** - Netlify/Railway may not have this issue

---

*Last updated: December 30, 2025*
