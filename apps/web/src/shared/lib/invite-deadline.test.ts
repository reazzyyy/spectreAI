import { describe, expect, it } from "vitest";
import { inviteDeadlineLabel } from "./invite-deadline";

describe("inviteDeadlineLabel", () => {
  it("formats the server deadline and does not claim seven days", () => {
    const label = inviteDeadlineLabel("2026-11-27T12:00:00.000Z");
    expect(label).not.toMatch(/7 дн/);
    expect(label.length).toBeGreaterThan(0);
  });

  it("does not invent a duration for a bad timestamp", () => {
    expect(inviteDeadlineLabel("not-a-date")).toBe("срок задаёт сервер");
  });
});
