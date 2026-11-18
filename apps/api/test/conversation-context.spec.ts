import { describe, expect, it } from "vitest";
import {
  HISTORY_INPUT_TOKEN_BUDGET,
  HISTORY_MESSAGE_LIMIT,
  HISTORY_OUTPUT_TOKEN_BUDGET,
  SELECTION_POLICY_VERSION,
  selectConversationPrefix,
  type ContextMessage,
} from "../src/chat/conversation-context.js";

function message(id: string, atMs: number, content = id): ContextMessage {
  return { id, role: "user", content, createdAt: new Date(atMs) };
}

describe("conversation prefix selection", () => {
  it("keeps the last 50 messages up to the target, not the first 50", () => {
    const messages = Array.from({ length: 100 }, (_, index) =>
      message(`m-${index}`, index * 1000, `body-${index}`),
    );

    const selected = selectConversationPrefix(messages, "m-99");

    expect(selected).not.toBeNull();
    expect(selected!.messages.map((item) => item.id)).toEqual(
      Array.from({ length: HISTORY_MESSAGE_LIMIT }, (_, index) => `m-${50 + index}`),
    );
    expect(selected!.messages.at(-1)?.id).toBe("m-99");
    expect(selected!.targetUserMessageId).toBe("m-99");
    expect(selected!.cutoff).toEqual({
      messageId: "m-99",
      createdAt: new Date(99_000).toISOString(),
    });
    expect(selected!.selectionPolicyVersion).toBe(SELECTION_POLICY_VERSION);
    expect(selected!.contentHashes).toHaveLength(HISTORY_MESSAGE_LIMIT);
    expect(selected!.inputTokenBudget).toBe(HISTORY_INPUT_TOKEN_BUDGET);
    expect(selected!.outputTokenBudget).toBe(HISTORY_OUTPUT_TOKEN_BUDGET);
  });

  it("drops messages written after the target", () => {
    const messages = [
      message("a", 1_000, "alpha"),
      message("b", 2_000, "beta"),
    ];

    const selected = selectConversationPrefix(messages, "a");

    expect(selected!.messages.map((item) => item.content)).toEqual(["alpha"]);
  });

  it("drops peers that share a timestamp instead of ordering them by id", () => {
    const messages = [
      message("older", 1_000, "older"),
      message("tie-z", 2_000, "tie-z"),
      message("tie-a", 2_000, "tie-a"),
      message("target", 3_000, "target"),
      message("peer", 3_000, "peer"),
      message("later", 4_000, "later"),
    ];

    const selected = selectConversationPrefix(messages, "target");

    expect(selected!.messages.map((item) => item.id)).toEqual(["older", "target"]);
  });

  it("repeats the same ordered ids and hashes for the same input", () => {
    const messages = [
      message("a", 1_000, "alpha"),
      message("b", 2_000, "beta"),
    ];

    const first = selectConversationPrefix(messages, "b");
    const second = selectConversationPrefix([...messages].reverse(), "b");

    expect(second).toEqual(first);
  });

  it("drops the oldest messages until the input budget fits and still keeps the target", () => {
    const messages = [
      message("old", 1_000, "aaaa"),
      message("mid", 2_000, "bbbb"),
      message("target", 3_000, "cccc"),
    ];

    const selected = selectConversationPrefix(messages, "target", { inputTokenBudget: 10 });

    expect(selected!.messages.map((item) => item.id)).toEqual(["mid", "target"]);
    expect(selected!.inputTokenEstimate).toBe(8);
  });

  it("keeps only the target when the target itself exceeds the budget", () => {
    const messages = [
      message("old", 1_000, "short"),
      message("target", 2_000, "target-is-longer-than-budget"),
    ];

    const selected = selectConversationPrefix(messages, "target", { inputTokenBudget: 5 });

    expect(selected!.messages.map((item) => item.id)).toEqual(["target"]);
    expect(selected!.inputTokenEstimate).toBe("target-is-longer-than-budget".length);
  });

  it("returns null when the target is absent", () => {
    expect(selectConversationPrefix([message("a", 1_000)], "missing")).toBeNull();
  });
});
