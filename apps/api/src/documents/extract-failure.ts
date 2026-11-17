/**
 * Extract outcome classes. Backoff stays in BullMQ, not in a new AIJob status (D-011).
 * A parser exception is never reported as timed_out.
 */
export const PERMANENT_EXTRACT_CODES = new Set([
  "NO_TEXT_LAYER",
  "EMPTY_TEXT",
  "UNSUPPORTED_MIME",
  "TOO_MANY_PAGES",
  "TEXT_TOO_LARGE",
  "DOCX_MISSING_DOCUMENT",
  "DOCX_PARSE_FAILED",
  "PDF_PARSE_FAILED",
  "DOCUMENT_NOT_FOUND",
  "VERSION_MISSING",
  "STORAGE_KEY_INVALID",
]);

export const PARSER_ERROR = "PARSER_ERROR";
export const STORAGE_UNAVAILABLE = "STORAGE_UNAVAILABLE";

export class ExtractRetryError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.name = "ExtractRetryError";
    this.code = code;
  }
}

export function isPermanentExtractCode(code: string): boolean {
  return PERMANENT_EXTRACT_CODES.has(code);
}

/**
 * Maps an unexpected throw to a stable code. Storage misses can be retried.
 * Anything else is a parser failure, not a timeout.
 */
export function classifyThrownExtractError(error: unknown): string {
  if (error instanceof Error) {
    if (
      error.message === "Invalid storage key" ||
      error.message === "Storage key escapes root"
    ) {
      return "STORAGE_KEY_INVALID";
    }
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT" || code === "ECONNRESET" || code === "EIO") {
      return STORAGE_UNAVAILABLE;
    }
  }
  return PARSER_ERROR;
}
