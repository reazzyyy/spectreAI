import { describe, expect, it } from "vitest";
import { statusLabel } from "./status-label";

describe("statusLabel", () => {
  it("maps workspace and record enums to Russian", () => {
    expect(statusLabel("ACTIVE")).toBe("Активно");
    expect(statusLabel("archived")).toBe("Архив");
    expect(statusLabel("PENDING_DELETION")).toBe("Удаляется");
    expect(statusLabel("processing_failed")).toBe("Ошибка обработки");
  });

  it("keeps an unknown status visible", () => {
    expect(statusLabel("quarantine")).toBe("quarantine");
  });
});
