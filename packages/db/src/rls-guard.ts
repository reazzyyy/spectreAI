import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

/** Shared with vitest global setup/teardown. One line per RLS test that actually ran. */
export const RLS_EXECUTED_FILE = path.join(tmpdir(), "spectre-db-rls-executed.log");

/** Floor for the current harness. CI fails closed if fewer cases ran. */
export const MIN_RLS_TESTS = 20;

export function resetRlsExecutedCount(): void {
  writeFileSync(RLS_EXECUTED_FILE, "");
}

export function rlsTestsExecuted(): number {
  try {
    const text = readFileSync(RLS_EXECUTED_FILE, "utf8");
    return text.split("\n").filter((line) => line === "1").length;
  } catch {
    return 0;
  }
}

/**
 * Local runs without Postgres may skip. CI must not: a skipped RLS test is a failed run.
 * A ready test is counted so teardown can require {@link MIN_RLS_TESTS}.
 */
export function requireRlsFixture(ready: boolean, skip: () => void): void {
  if (!ready) {
    if (process.env.CI === "true") {
      throw new Error(
        "RLS tests must execute in CI; the runtime database was not ready",
      );
    }
    skip();
    return;
  }
  appendFileSync(RLS_EXECUTED_FILE, "1\n");
}
