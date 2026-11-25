import "@testing-library/jest-dom/vitest";
import { act, cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

afterEach(async () => {
  cleanup();
  // React 19 commits passive effects on the scheduler (setImmediate) and that
  // callback reads `window.event`. Drain it before Vitest removes jsdom, or CI
  // reports an unhandled ReferenceError after the assertions have passed.
  await act(async () => {
    await new Promise<void>((resolve) => {
      setImmediate(resolve);
    });
    await new Promise<void>((resolve) => {
      setImmediate(resolve);
    });
  });
});
