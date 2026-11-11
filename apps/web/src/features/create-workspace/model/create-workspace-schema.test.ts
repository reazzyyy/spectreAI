import { describe, expect, it } from "vitest";
import { createWorkspaceSchema } from "./create-workspace-schema";

describe("createWorkspaceSchema", () => {
  it("accepts PERSONAL and TEAM", () => {
    expect(
      createWorkspaceSchema.safeParse({
        name: "Договор АО",
        visibility: "PERSONAL",
      }).success,
    ).toBe(true);
    expect(
      createWorkspaceSchema.safeParse({
        name: "Команда",
        visibility: "TEAM",
      }).success,
    ).toBe(true);
  });

  it("rejects empty name or bad visibility", () => {
    expect(
      createWorkspaceSchema.safeParse({
        name: "   ",
        visibility: "PERSONAL",
      }).success,
    ).toBe(false);
    expect(
      createWorkspaceSchema.safeParse({
        name: "X",
        visibility: "PUBLIC",
      }).success,
    ).toBe(false);
  });

  it("accepts empty or UUID clientId/matterId", () => {
    expect(
      createWorkspaceSchema.safeParse({
        name: "Проект",
        visibility: "PERSONAL",
        clientId: "",
        matterId: "",
      }).success,
    ).toBe(true);
    expect(
      createWorkspaceSchema.safeParse({
        name: "Проект",
        visibility: "TEAM",
        clientId: "550e8400-e29b-41d4-a716-446655440000",
        matterId: "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
      }).success,
    ).toBe(true);
    expect(
      createWorkspaceSchema.safeParse({
        name: "Проект",
        visibility: "PERSONAL",
        clientId: "not-a-uuid",
      }).success,
    ).toBe(false);
  });
});
