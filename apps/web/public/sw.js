// =============================================================================
// Service Worker for Quản lý kho vật tư Pro
//
// Strategy:
// - App shell: stale-while-revalidate (instant load, refresh in background)
// - Static assets (JS/CSS): cache-first (Cloudflare CDN already fast, but
//   caching gives instant repeat loads)
// - API + auth: network-only (never serve stale data for mutations)
//
// Install: just serves on /sw.js. No precaching of data — we want fresh
// data from Supabase, not stale app state.
// =============================================================================
const VERSION = "v1";
const SHELL_CACHE = `shell-${VERSION}`;
const ASSETS_CACHE = `assets-${VERSION}`;

const SHELL_URLS = [
  "/",
  "/login",
  "/dashboard",
  "/offline",
];

self.addEventListener("install", (event) => {
  // Pre-cache app shell
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL_URLS).catch(() => {})),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  // Clean up old caches
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== SHELL_CACHE && k !== ASSETS_CACHE)
          .map((k) => caches.delete(k)),
      ),
    ),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Never intercept API/auth — always go to network
  if (url.pathname.startsWith("/functions/") ||
      url.pathname.startsWith("/rest/") ||
      url.pathname.startsWith("/auth/") ||
      url.pathname.startsWith("/api/") ||
      url.hostname.includes("supabase")) {
    return; // pass through to network
  }

  // Skip non-GET
  if (req.method !== "GET") return;

  // Static assets (Next.js _next/static): cache-first
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      caches.open(ASSETS_CACHE).then(async (cache) => {
        const cached = await cache.match(req);
        if (cached) return cached;
        try {
          const res = await fetch(req);
          if (res.ok) cache.put(req, res.clone());
          return res;
        } catch {
          return cached || new Response("Offline", { status: 503 });
        }
      }),
    );
    return;
  }

  // App shell pages: stale-while-revalidate
  if (req.mode === "navigate" || req.headers.get("accept")?.includes("text/html")) {
    event.respondWith(
      caches.open(SHELL_CACHE).then(async (cache) => {
        const cached = await cache.match(req) || await cache.match("/");
        const network = fetch(req).then((res) => {
          if (res.ok) cache.put(req, res.clone()).catch(() => {});
          return res;
        }).catch(() => cached || cache.match("/offline"));
        return cached || network;
      }),
    );
    return;
  }

  // Everything else: network-first
  event.respondWith(
    fetch(req).catch(() => caches.match(req).then((r) => r || new Response("Offline", { status: 503 }))),
  );
});
