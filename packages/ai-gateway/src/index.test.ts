import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  AI_JOB_STATUSES,
  AiGateway,
  AiGatewayError,
  type GenerateTextRequest,
} from "./index.js";

const syntheticRequest: GenerateTextRequest = {
  operationId: "op-1",
  dataClass: "synthetic",
  messages: [{ role: "user", content: "synthetic-fixture" }],
};

describe("SyntheticAIProvider", () => {
  it("returns a deterministic synthetic result without calling the network", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const gateway = new AiGateway();

    const result = await gateway.generateText(syntheticRequest);

    expect(gateway.providerId).toBe("synthetic");
    expect(result).toEqual({
      text: "synthetic:op-1:17",
      providerId: "synthetic",
      modelId: "synthetic-echo",
      synthetic: true,
      usage: { inputTokens: 17, outputTokens: "synthetic:op-1:17".length },
    });
    expect(result.text).not.toContain("synthetic-fixture");
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("blocks any data class other than synthetic", async () => {
    const gateway = new AiGateway();

    await expect(
      gateway.generateText({ ...syntheticRequest, dataClass: "client_document" }),
    ).rejects.toMatchObject({
      name: "AiGatewayError",
      code: "AI_DATA_POLICY_BLOCKED",
    });
  });

  it("rejects an incomplete synthetic request", async () => {
    const gateway = new AiGateway();

    await expect(
      gateway.generateText({ ...syntheticRequest, operationId: "  ", messages: [] }),
    ).rejects.toBeInstanceOf(AiGatewayError);
  });
});

describe("AI job statuses", () => {
  it("uses only the confirmed D-011 statuses", () => {
    expect([...AI_JOB_STATUSES]).toEqual([
      "queued",
      "running",
      "succeeded",
      "failed",
      "cancelled",
      "timed_out",
    ]);
    expect(AI_JOB_STATUSES).not.toContain("completed");
    expect(AI_JOB_STATUSES).not.toContain("retry_wait");
  });
});

describe("package dependencies", () => {
  it("does not depend on an external model SDK", () => {
    const manifest = JSON.parse(
      readFileSync(new URL("../package.json", import.meta.url), "utf8"),
    ) as { dependencies?: Record<string, string> };

    expect(manifest.dependencies ?? {}).not.toHaveProperty("openai");
  });
});
