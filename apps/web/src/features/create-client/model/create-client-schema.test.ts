import { describe, expect, it } from "vitest";
import { createClientSchema } from "./create-client-schema";

describe("createClientSchema", () => {
  it("accepts a name", () => {
    expect(createClientSchema.safeParse({ name: "АО Ромашка" }).success).toBe(
      true,
    );
  });

  it("rejects blank name", () => {
    expect(createClientSchema.safeParse({ name: "  " }).success).toBe(false);
  });
});
