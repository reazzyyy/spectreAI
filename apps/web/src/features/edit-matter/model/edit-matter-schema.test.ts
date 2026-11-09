import { describe, expect, it } from "vitest";
import { editMatterSchema } from "./edit-matter-schema";

describe("editMatterSchema", () => {
  it("accepts empty clientId (unlink)", () => {
    expect(
      editMatterSchema.safeParse({
        title: "Дело",
        status: "active",
        clientId: "",
      }).success,
    ).toBe(true);
  });

  it("accepts client UUID", () => {
    expect(
      editMatterSchema.safeParse({
        title: "Дело",
        status: "active",
        clientId: "11111111-1111-4111-8111-111111111111",
      }).success,
    ).toBe(true);
  });

  it("rejects unknown status", () => {
    expect(
      editMatterSchema.safeParse({
        title: "Дело",
        status: "open",
        clientId: "",
      }).success,
    ).toBe(false);
  });
});
