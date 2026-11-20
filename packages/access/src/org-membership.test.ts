import { describe, expect, it } from "vitest";
import {
  isActiveOrganizationMembership,
  mayMutateWorkspaceContent,
} from "./org-membership.js";

describe("organization membership re-check", () => {
  it("treats only active as admitted", () => {
    expect(isActiveOrganizationMembership("active")).toBe(true);
    expect(isActiveOrganizationMembership("revoked")).toBe(false);
    expect(isActiveOrganizationMembership("ACTIVE")).toBe(false);
    expect(isActiveOrganizationMembership(null)).toBe(false);
    expect(isActiveOrganizationMembership(undefined)).toBe(false);
  });

  it("allows content writes for owner and editor only", () => {
    expect(mayMutateWorkspaceContent("OWNER")).toBe(true);
    expect(mayMutateWorkspaceContent("EDITOR")).toBe(true);
    expect(mayMutateWorkspaceContent("VIEWER")).toBe(false);
    expect(mayMutateWorkspaceContent(null)).toBe(false);
  });
});
