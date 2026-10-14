/**
 * Where the API lives, relative to wherever the app is served from.
 *
 * In production the browser only ever talks to one origin, and nginx forwards
 * this prefix on to the backend. In development, Vite's proxy stands in for
 * that nginx hop; see vite.config.ts. Either way the requests are
 * same-origin, so no CORS is involved.
 *
 * Override with VITE_API_BASE_URL if nginx exposes the backend under a
 * different prefix, or point it at an absolute URL to develop against a
 * remote backend (which would then need CORS).
 */
const raw = import.meta.env.VITE_API_BASE_URL ?? '/api'

/** Normalized without a trailing slash so joining is unambiguous. */
export const API_BASE_URL = raw.replace(/\/+$/, '')

export function apiUrl(path: string): string {
  return `${API_BASE_URL}${path.startsWith('/') ? path : `/${path}`}`
}

/** Long enough to ride out a slow proxy hop, short enough to not look hung. */
export const REQUEST_TIMEOUT_MS = 15_000

/**
 * How often to re-fetch the trigger list, in seconds.
 *
 * Two minutes by default, the same pace the duty-review catalog polls at:
 * the backend has no caching layer, so each poll is a database round trip.
 * Set VITE_TRIGGERS_POLL_SECONDS to change it, or to 0 to rely on the
 * Refresh button alone. Anything under 15 is treated as a typo.
 */
export const TRIGGERS_POLL_SECONDS = (() => {
  const raw = Number(import.meta.env.VITE_TRIGGERS_POLL_SECONDS ?? '120')
  if (!Number.isFinite(raw) || raw < 0) return 120
  return raw === 0 ? 0 : Math.max(15, raw)
})()
