import { describe, expect, it } from "vitest";
import { displayNameFromEmail, orgRoleLabel } from "./display-name";

describe("displayNameFromEmail", () => {
  it("title-cases local parts", () => {
    expect(displayNameFromEmail("elena.krylova@example.test")).toBe(
      "Elena Krylova",
    );
  });
});

describe("orgRoleLabel", () => {
  it("maps known roles", () => {
    expect(orgRoleLabel("owner")).toBe("Владелец");
    expect(orgRoleLabel("ADMIN")).toBe("Администратор");
    expect(orgRoleLabel("member")).toBe("Сотрудник");
  });
});
