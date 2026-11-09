import { describe, expect, it } from "vitest";
import { createMatterSchema } from "./create-matter-schema";

describe("createMatterSchema", () => {
  it("accepts a title", () => {
    expect(createMatterSchema.safeParse({ title: "Дело №12" }).success).toBe(
      true,
    );
  });

  it("rejects blank title", () => {
    expect(createMatterSchema.safeParse({ title: "  " }).success).toBe(false);
  });
});
