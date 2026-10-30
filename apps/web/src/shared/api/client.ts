import { parseApiError } from "./errors";

/**
 * Browser fetch to Nest via Next rewrite (`/api/v1` → API origin).
 * Uses same-origin credentials so HttpOnly `spectre_sid` is sent.
 * CSRF double-submit / Origin gate remain OPEN (SameSite=Lax only).
 */
export async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body !== undefined && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
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
