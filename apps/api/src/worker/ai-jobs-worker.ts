/**
 * Shared BullMQ entrypoint for document.extract and chat.generate.
 * Run: `pnpm --filter @spectre/api worker:ai`
 * Synthetic chat only (D-012). Does not log document text or prompts.
 */
import { runAiJobsWorker } from "./start-ai-jobs-worker.js";

runAiJobsWorker().catch((error: unknown) => {
  console.error(error instanceof Error ? error.name : "WORKER_FAILED");
  process.exit(1);
});
