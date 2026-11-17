/**
 * Compatibility entrypoint. Starts the shared ai-jobs dispatcher.
 * A dedicated chat-only consumer must not listen on ai-jobs: returning
 * on a foreign type completes the BullMQ job and drops document.extract.
 *
 * Run: `pnpm --filter @spectre/api worker:chat` (same process as worker:ai).
 * Synthetic only (D-012). Does not log message content.
 */
import { runAiJobsWorker } from "./start-ai-jobs-worker.js";

runAiJobsWorker().catch((error: unknown) => {
  console.error(error instanceof Error ? error.name : "WORKER_FAILED");
  process.exit(1);
});
