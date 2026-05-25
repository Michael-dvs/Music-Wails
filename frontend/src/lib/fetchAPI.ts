/**
 * fetchAPI — Production-safe external API fetcher.
 *
 * In `wails dev`, uses native browser `fetch()` (works fine with CORS).
 * In `wails build` (wails:// protocol), routes through the Go backend
 * via FetchExternalAPI() to completely bypass WebView2 CORS restrictions.
 *
 * Usage:
 *   const data = await fetchAPI<MyType>(`https://itunes.apple.com/...`);
 */

import { FetchExternalAPI } from '../../wailsjs/go/main/App';

// Detect whether we are running inside a packaged Wails app (wails:// or file://)
// vs. the dev server (http://localhost:xxxxx)
const IS_WAILS_PRODUCTION = !window.location.href.startsWith('http://localhost');

export async function fetchAPI<T = unknown>(url: string): Promise<T> {
  if (IS_WAILS_PRODUCTION) {
    // ── Production path: Go handles the HTTP request (no CORS) ──
    const jsonStr = await FetchExternalAPI(url);
    return JSON.parse(jsonStr) as T;
  } else {
    // ── Dev path: native browser fetch is fine ──
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    return res.json() as Promise<T>;
  }
}
