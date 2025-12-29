/// <reference lib="webworker" />

import { defaultCache } from "@serwist/next/worker";
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import {
  Serwist,
  NetworkFirst,
  CacheFirst,
  StaleWhileRevalidate,
  NetworkOnly,
  ExpirationPlugin,
  CacheableResponsePlugin
} from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: WorkerGlobalScope & typeof globalThis;

// Custom runtime caching rules
const runtimeCaching = [
  // Never cache auth routes
  {
    matcher: ({ url }: { url: URL }) =>
      url.pathname.startsWith('/api/auth') ||
      url.pathname.startsWith('/signin'),
    handler: new NetworkOnly(),
  },

  // tRPC API calls - network first with fallback for queries (GET requests)
  {
    matcher: ({ url, request }: { url: URL; request: Request }) =>
      url.pathname.startsWith('/api/trpc') && request.method === 'GET',
    handler: new NetworkFirst({
      cacheName: 'trpc-cache',
      plugins: [
        new ExpirationPlugin({
          maxEntries: 100,
          maxAgeSeconds: 60 * 5, // 5 minutes
        }),
        new CacheableResponsePlugin({
          statuses: [0, 200],
        }),
      ],
    }),
  },

  // tRPC mutations - always network only (POST requests)
  {
    matcher: ({ url, request }: { url: URL; request: Request }) =>
      url.pathname.startsWith('/api/trpc') && request.method === 'POST',
    handler: new NetworkOnly(),
  },

  // Static assets (images, icons)
  {
    matcher: ({ url }: { url: URL }) =>
      url.pathname.match(/\.(png|jpg|jpeg|svg|ico|webp)$/),
    handler: new CacheFirst({
      cacheName: 'static-assets',
      plugins: [
        new ExpirationPlugin({
          maxEntries: 60,
          maxAgeSeconds: 60 * 60 * 24 * 30, // 30 days
        }),
      ],
    }),
  },

  // Fonts
  {
    matcher: ({ url }: { url: URL }) =>
      url.pathname.match(/\.(woff2?|ttf|otf|eot)$/) ||
      url.origin === 'https://fonts.googleapis.com' ||
      url.origin === 'https://fonts.gstatic.com',
    handler: new StaleWhileRevalidate({
      cacheName: 'fonts',
      plugins: [
        new ExpirationPlugin({
          maxEntries: 30,
          maxAgeSeconds: 60 * 60 * 24 * 365, // 1 year
        }),
      ],
    }),
  },

  // Default cache for other navigation requests
  ...defaultCache,
];

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching,
});

serwist.addEventListeners();
