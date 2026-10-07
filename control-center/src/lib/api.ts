/**
 * Thin HTTP client for the TradingAgents FastAPI bridge.
 *
 * All backend state (options / quotes / runs / auth / history) is reachable
 * through these helpers so components never hand-roll ``fetch`` against the
 * API_BASE.
 *
 * The bearer token lives here rather than in React state: ``EventSource`` and
 * one-off fetches outside the component tree need it too, and a module-level
 * value avoids threading it through every call site. ``AuthProvider`` is the
 * only writer (via ``setAuthToken``).
 */

import type {
  AnalysisDetail,
  AnalysisListResponse,
  AuthUser,
  DashboardResponse,
  OptionsResponse,
  Quote,
  TokenResponse,
} from '../types'

export const API_BASE = 'http://localhost:8000'

const TOKEN_KEY = 'trading-agent-auth-token'

let cachedToken: string | null | undefined

/** Read the token (localStorage is consulted once, then cached). */
export function getAuthToken(): string | null {
  if (cachedToken === undefined) {
    try {
      cachedToken = localStorage.getItem(TOKEN_KEY)
    } catch {
      cachedToken = null // private mode / storage disabled
    }
  }
  return cachedToken
}

/** Persist or clear the token. Pass ``null`` to log out. */
export function setAuthToken(token: string | null): void {
  cachedToken = token
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token)
    else localStorage.removeItem(TOKEN_KEY)
  } catch {
    /* ignore quota/security errors — the in-memory value still works */
  }
}

/** An API failure carrying the HTTP status so callers can branch on 401. */
export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

/**
 * Called whenever an authenticated request comes back 401 — an expired or
 * revoked token. ``AuthProvider`` registers a handler here so the recovery
 * (drop the token, reopen the login dialog) lives in one place rather than
 * being re-implemented at every call site.
 */
let unauthorizedHandler: (() => void) | null = null

export function setUnauthorizedHandler(handler: (() => void) | null): void {
  unauthorizedHandler = handler
}

/**
 * Signal that the session is no longer valid. Exported for the few call sites
 * that cannot go through ``request`` — notably the raw ``fetch`` that kicks off
 * an agent run.
 */
export function notifyUnauthorized(): void {
  unauthorizedHandler?.()
}

interface RequestOptions {
  method?: 'GET' | 'POST'
  body?: unknown
  /** Attach the bearer token. Defaults to true for everything but login/register. */
  auth?: boolean
  /**
   * Don't run the global 401 recovery for this request. Set it where a 401 is
   * an expected outcome rather than a dead session — signing out with an
   * already-expired token would otherwise pop the login dialog at the user.
   */
  quiet401?: boolean
}

async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, auth = true, quiet401 = false } = opts
  const headers: Record<string, string> = {}
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  const token = getAuthToken()
  if (auth && token) headers.Authorization = `Bearer ${token}`

  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  })

  if (!res.ok) {
    // FastAPI puts human-readable reasons in ``detail`` (e.g. "Username already
    // taken"); surface those instead of a bare status code where present.
    let detail = `HTTP ${res.status}`
    try {
      const payload = (await res.json()) as { detail?: unknown }
      if (typeof payload?.detail === 'string') detail = payload.detail
      else if (Array.isArray(payload?.detail) && payload.detail.length > 0) {
        // Pydantic validation errors arrive as a list of {msg, loc} objects.
        const first = payload.detail[0] as { msg?: string }
        if (first?.msg) detail = first.msg
      }
    } catch {
      /* non-JSON error body — keep the status text */
    }
    if (res.status === 401 && auth && !quiet401) notifyUnauthorized()
    throw new ApiError(res.status, detail)
  }

  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}

/* ------------------------------------------------------------------ *
 * Anonymous endpoints
 * ------------------------------------------------------------------ */

/** Provider / model / language catalog for the config pickers. */
export function fetchOptions(): Promise<OptionsResponse> {
  return request<OptionsResponse>('/options', { auth: false })
}

/** Live price + indicator preview for a ticker (real yfinance data). */
export function fetchQuote(ticker: string): Promise<Quote> {
  return request<Quote>(`/quote/${encodeURIComponent(ticker)}`, { auth: false })
}

/** Full real-market dashboard (price-anchored paper portfolio), no LLM. */
export function fetchDashboard(ticker: string, range: string): Promise<DashboardResponse> {
  return request<DashboardResponse>(
    `/dashboard/${encodeURIComponent(ticker)}?range=${encodeURIComponent(range)}`,
    { auth: false },
  )
}

/* ------------------------------------------------------------------ *
 * Auth
 * ------------------------------------------------------------------ */

export function register(
  username: string,
  password: string,
  displayName?: string,
): Promise<TokenResponse> {
  return request<TokenResponse>('/auth/register', {
    method: 'POST',
    body: { username, password, display_name: displayName || null },
    auth: false,
  })
}

export function login(username: string, password: string): Promise<TokenResponse> {
  return request<TokenResponse>('/auth/login', {
    method: 'POST',
    body: { username, password },
    auth: false,
  })
}

/** Validate the stored token and return the current user. */
export function fetchMe(): Promise<AuthUser> {
  return request<AuthUser>('/auth/me')
}

/**
 * Sign out server-side: the token's ``jti`` goes on a Redis denylist for the
 * rest of its life, so a copy of the token stops working immediately instead
 * of at expiry. ``revoked: false`` means Redis was unavailable and the token
 * will simply live out its normal lifetime.
 *
 * Must run *before* ``setAuthToken(null)`` — ``request`` reads the token
 * synchronously when it is called, so the header is captured either way, but
 * the ordering keeps that dependency visible.
 */
export function logout(): Promise<{ ok: boolean; revoked: boolean }> {
  return request<{ ok: boolean; revoked: boolean }>('/auth/logout', {
    method: 'POST',
    // An expired token 401s here; that is not a dead session to recover from.
    quiet401: true,
  })
}

/* ------------------------------------------------------------------ *
 * Analysis history
 * ------------------------------------------------------------------ */

/** The caller's own past runs, newest first. */
export function fetchAnalyses(limit = 50, ticker?: string): Promise<AnalysisListResponse> {
  const params = new URLSearchParams({ limit: String(limit) })
  if (ticker) params.set('ticker', ticker)
  return request<AnalysisListResponse>(`/analyses?${params.toString()}`)
}

export function fetchAnalysis(id: number): Promise<AnalysisDetail> {
  return request<AnalysisDetail>(`/analyses/${id}`)
}

/** The caller's most recent run for a ticker, or ``null``. */
export function fetchLatestAnalysis(ticker: string): Promise<AnalysisDetail | null> {
  return request<AnalysisDetail | null>(`/analyses/latest/${encodeURIComponent(ticker)}`)
}
