import { parseApiError } from "./errors";

const CSRF_COOKIE_NAME = "spectre_csrf";
const CSRF_HEADER_NAME = "X-CSRF-Token";

/**
 * Browser fetch to Nest via Next rewrite (`/api/v1` → API origin).
 * Uses same-origin credentials so HttpOnly `spectre_sid` is sent.
 * Mutating requests send double-submit `X-CSRF-Token` from `spectre_csrf` (W-014).
 */
export async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body !== undefined && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const method = (init.method ?? "GET").toUpperCase();
  if (method !== "GET" && method !== "HEAD" && method !== "OPTIONS") {
    const csrf = readBrowserCookie(CSRF_COOKIE_NAME);
    if (csrf && !headers.has(CSRF_HEADER_NAME)) {
      headers.set(CSRF_HEADER_NAME, csrf);
    }
  }

  const response = await fetch(`/api/v1${path}`, {
    ...init,
    credentials: "same-origin",
    headers,
  });

  if (!response.ok) {
    throw await parseApiError(response);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

function readBrowserCookie(name: string): string | undefined {
  if (typeof document === "undefined") {
    return undefined;
  }
  const prefix = `${encodeURIComponent(name)}=`;
  for (const part of document.cookie.split(";")) {
    const trimmed = part.trim();
    if (trimmed.startsWith(prefix)) {
      return decodeURIComponent(trimmed.slice(prefix.length));
    }
  }
  return undefined;
}
