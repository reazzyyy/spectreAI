import { NotFoundException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { isUuidParam, UuidParamGuard } from "../src/http/uuid-param.guard.js";

function contextWith(params: Record<string, unknown>) {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ params }),
    }),
  };
}

describe("uuid path params", () => {
  it("accepts a version-4 id and rejects text", () => {
    expect(isUuidParam(randomUUID())).toBe(true);
    expect(isUuidParam(randomUUID().toUpperCase())).toBe(true);
    expect(isUuidParam("abc")).toBe(false);
    expect(isUuidParam("00000000-0000-0000-0000-000000000000")).toBe(false);
    expect(isUuidParam(undefined)).toBe(false);
  });

  it("rejects the request before a query when any path id is not a uuid", () => {
    const guard = new UuidParamGuard();
    expect(guard.canActivate(contextWith({}) as never)).toBe(true);
    expect(
      guard.canActivate(contextWith({ documentId: randomUUID() }) as never),
    ).toBe(true);
    expect(() =>
      guard.canActivate(contextWith({ documentId: "abc" }) as never),
    ).toThrow(NotFoundException);
    expect(() =>
      guard.canActivate(
        contextWith({ workspaceId: randomUUID(), userId: "abc" }) as never,
      ),
    ).toThrow(NotFoundException);
  });
});
