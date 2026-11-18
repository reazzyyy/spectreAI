/** BullMQ / AIJob type for chat generation (docs/32 §8.1). */
export const CHAT_GENERATE_JOB_TYPE = "chat.generate";

/** Outbox eventType for chat jobs. */
export const CHAT_GENERATE_OUTBOX_EVENT = "chat.generate";

export const CHAT_JOB_MAX_ATTEMPTS = 3;

/**
 * How long a chat attempt may stay `running` before another worker may reclaim it.
 * A live attempt refreshes `startedAt` at claim time. Crash recovery waits out this lease.
 */
export const CHAT_RUNNING_LEASE_MS = 30_000;
