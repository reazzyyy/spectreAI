/**
 * Compatibility entrypoint. Starts the shared ai-jobs dispatcher.
 * A dedicated extract-only consumer must not listen on ai-jobs: returning
 * on a foreign type completes the BullMQ job and drops chat.generate.
 *
 * Run: `pnpm --filter @spectre/api worker:extract` (same process as worker:ai).
 */
import { runAiJobsWorker } from "./start-ai-jobs-worker.js";

runAiJobsWorker().catch((error: unknown) => {
  console.error(error instanceof Error ? error.name : "WORKER_FAILED");
  process.exit(1);
});
