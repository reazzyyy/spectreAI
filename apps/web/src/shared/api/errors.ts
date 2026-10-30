/**
 * Normalized API error for UI. Never put document/prompt/token content here.
 * Maps Nest `{ error: { code, message, requestId } }` from `docs/11`.
 */
export class ApiError extends Error {
  readonly code: string;
  readonly requestId: string | undefined;
  readonly status: number;

  constructor(status: number, code: string, message: string, requestId?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.requestId = requestId;
  }
}

export function isApiError(value: unknown): value is ApiError {
  return value instanceof ApiError;
}

/** Parse error JSON from the API; fall back to a generic message without leaking bodies. */
export async function parseApiError(response: Response): Promise<ApiError> {
  let code = "HTTP_ERROR";
  let message = "Request failed";
  let requestId: string | undefined;

  try {
    const body: unknown = await response.json();
    if (
      typeof body === "object" &&
      body !== null &&
      "error" in body &&
      typeof body.error === "object" &&
      body.error !== null
    ) {
      const err = body.error as Record<string, unknown>;
      if (typeof err.code === "string") code = err.code;
      if (typeof err.message === "string") message = err.message;
      if (typeof err.requestId === "string") requestId = err.requestId;
    }
  } catch {
    // Non-JSON error body — keep generic fields.
  }

  return new ApiError(response.status, code, message, requestId);
}
