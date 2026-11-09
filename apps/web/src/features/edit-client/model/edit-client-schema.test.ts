import { describe, expect, it } from "vitest";
import { editClientSchema } from "./edit-client-schema";

describe("editClientSchema", () => {
  it("accepts archived status", () => {
    expect(
      editClientSchema.safeParse({ name: "Клиент", status: "archived" })
        .success,
    ).toBe(true);
  });

  it("rejects unknown status", () => {
    expect(
      editClientSchema.safeParse({ name: "Клиент", status: "draft" }).success,
    ).toBe(false);
  });
});
