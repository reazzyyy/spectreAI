import {
  MIN_RLS_TESTS,
  resetRlsExecutedCount,
  rlsTestsExecuted,
} from "./rls-guard.js";

export function setup(): void {
  resetRlsExecutedCount();
}

/** CI fails when the harness skipped or dropped below the floor. Local skips stay allowed. */
export function teardown(): void {
  if (process.env.CI !== "true") return;
  const executed = rlsTestsExecuted();
  if (executed < MIN_RLS_TESTS) {
    throw new Error(
      `RLS tests executed ${executed}, need at least ${MIN_RLS_TESTS}`,
    );
  }
}
