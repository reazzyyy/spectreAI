import { describe, expect, it } from "vitest";
import { editMatterSchema } from "./edit-matter-schema";

describe("editMatterSchema", () => {
  it("accepts active status", () => {
    expect(
      editMatterSchema.safeParse({ title: "Дело", status: "active" }).success,
    ).toBe(true);
  });

  it("rejects unknown status", () => {
    expect(
      editMatterSchema.safeParse({ title: "Дело", status: "open" }).success,
    ).toBe(false);
  });
});
