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
  dataClass: "synthetic_fixture",
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

  it("rejects a class the server does not define", async () => {
    const gateway = new AiGateway();

    await expect(
      gateway.generateText({
        ...syntheticRequest,
        dataClass: "client_document" as "D3",
      }),
    ).rejects.toMatchObject({
      name: "AiGatewayError",
      code: "AI_DATA_POLICY_BLOCKED",
    });
  });

  it("blocks a D3 chat before any network call when env or the adapter asks to leave the process", async () => {
    const secret = "SECRET-CONTRACT-BODY";
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(""));
    const calls: string[] = [];
    const logged: string[] = [];
    const sinks = ["log", "info", "warn", "error", "debug"] as const;
    const spies = sinks.map((sink) =>
      vi.spyOn(console, sink).mockImplementation((...args: unknown[]) => {
        logged.push(args.map((item) => String(item)).join(" "));
      }),
    );
    const gateway = new AiGateway({
      providerId: "openai",
      async generateText(request) {
        calls.push(request.messages.map((message) => message.content).join("\n"));
        await fetch("https://example.invalid/v1/responses", {
          method: "POST",
          body: request.messages[0]?.content,
        });
        return {
          text: request.messages[0]?.content ?? "",
          providerId: "synthetic",
          modelId: "synthetic-echo",
          synthetic: true,
          usage: { inputTokens: 0, outputTokens: 0 },
        };
      },
    });

    let thrown: unknown;
    try {
      await gateway.generateText(
        {
          operationId: "chat-1",
          dataClass: "D3",
          messages: [{ role: "user", content: secret }],
        },
        { AI_EXECUTION_MODE: "synthetic", AI_PROVIDER: "synthetic" },
      );
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toMatchObject({ name: "AiGatewayError", code: "AI_TRANSFER_BLOCKED" });
    expect(thrown).toBeInstanceOf(Error);
    expect((thrown as Error).message).not.toContain(secret);
    expect(logged.join("\n")).not.toContain(secret);
    expect(calls).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
    for (const spy of spies) spy.mockRestore();
  });

  it("blocks D3 when env names an external provider even though the adapter is synthetic", async () => {
    const secret = "SECRET-CONTRACT-BODY";
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const gateway = new AiGateway();

    await expect(
      gateway.generateText(
        {
          operationId: "chat-env",
          dataClass: "D3",
          messages: [{ role: "user", content: secret }],
        },
        { AI_PROVIDER: "openai" },
      ),
    ).rejects.toMatchObject({ code: "AI_TRANSFER_BLOCKED", message: "AI_TRANSFER_BLOCKED" });

    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("runs D3 chat text in-process while the external gate stays closed", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const gateway = new AiGateway();

    const result = await gateway.generateText({
      operationId: "chat-2",
      dataClass: "D3",
      messages: [{ role: "user", content: "hello" }],
    });

    expect(result.synthetic).toBe(true);
    expect(result.text).toBe("synthetic:chat-2:5");
    expect(result.text).not.toContain("hello");
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
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
