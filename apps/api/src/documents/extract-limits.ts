/** Scaffold extract caps — CONFIRMED D-030 (not product tariffs / O-007). */
export const MAX_PDF_PAGES = 300;
export const MAX_EXTRACT_CHARS = 2_000_000;
export const EXTRACT_TIMEOUT_MS = 120_000;
/**
 * How long an extract attempt may stay `running` before the next delivery
 * reclaims it or marks `timed_out` (D-011 / D-030). Matches the soft timeout
 * so a live parse is not stolen before that deadline. A crash does not refresh
 * `startedAt`, so recovery waits out this lease.
 */
export const EXTRACT_RUNNING_LEASE_MS = EXTRACT_TIMEOUT_MS;
export const EXTRACT_MAX_ATTEMPTS = 3;
/** BullMQ delay before the next extract attempt. Not an AIJob status (D-011). */
export const EXTRACT_RETRY_BACKOFF_MS = 200;
export const EXTRACT_JOB_TYPE = "document.extract";
export const EXTRACT_IDEMPOTENCY_VERSION = "v1";

export function extractIdempotencyKey(documentId: string): string {
  return `${documentId}:extract:${EXTRACT_IDEMPOTENCY_VERSION}`;
}
