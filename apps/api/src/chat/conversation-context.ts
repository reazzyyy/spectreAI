import { createHash } from "node:crypto";
import type { PrismaTxClient } from "@spectre/db";

/** Protective history window. The newest messages win, not the oldest. */
export const HISTORY_MESSAGE_LIMIT = 50;

/**
 * Input budget for the selected prefix. One token is one character, matching
 * SyntheticAIProvider's scaffold estimate. Not a model tokenizer.
 */
export const HISTORY_INPUT_TOKEN_BUDGET = 8_000;

/**
 * Reserved for a later provider call. The synthetic gateway has no output cap,
 * so this value is stored on the snapshot and does not trim history.
 */
export const HISTORY_OUTPUT_TOKEN_BUDGET = 2_000;

/** Cutoff policy. A new rule needs a new version; snapshots are not rewritten. */
export const SELECTION_POLICY_VERSION = "conversation-prefix-v1";

export type ContextMessage = {
  id: string;
  role: string;
  content: string;
  createdAt: Date;
};

export type ConversationPrefix = {
  messages: ContextMessage[];
  targetUserMessageId: string;
  cutoff: { messageId: string; createdAt: string };
  selectionPolicyVersion: typeof SELECTION_POLICY_VERSION;
  contentHashes: string[];
  inputTokenEstimate: number;
  inputTokenBudget: number;
  outputTokenBudget: number;
};

export function contentHash(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

function tokenEstimate(messages: readonly ContextMessage[]): number {
  return messages.reduce((sum, message) => sum + message.content.length, 0);
}

/**
 * Prefix for one generation.
 *
 * Includes the target and earlier messages with a unique createdAt, then the
 * last `limit` of those, then drops from the oldest until the input budget
 * holds. Messages that share a timestamp are left out: message id is not
 * insertion order. A later message never enters, even if the worker runs
 * after it was written. The target stays when it alone exceeds the budget.
 */
export function selectConversationPrefix(
  messages: readonly ContextMessage[],
  targetId: string,
  options?: { limit?: number; inputTokenBudget?: number },
): ConversationPrefix | null {
  const target = messages.find((message) => message.id === targetId);
  if (!target) {
    return null;
  }

  const limit = options?.limit ?? HISTORY_MESSAGE_LIMIT;
  const inputTokenBudget = options?.inputTokenBudget ?? HISTORY_INPUT_TOKEN_BUDGET;
  const targetMs = target.createdAt.getTime();
  const earlierCounts = new Map<number, number>();
  for (const message of messages) {
    if (message.id === target.id) {
      continue;
    }
    const at = message.createdAt.getTime();
    if (at >= targetMs) {
      continue;
    }
    earlierCounts.set(at, (earlierCounts.get(at) ?? 0) + 1);
  }

  const earlier = messages
    .filter((message) => {
      if (message.id === target.id) {
        return false;
      }
      const at = message.createdAt.getTime();
      return at < targetMs && earlierCounts.get(at) === 1;
    })
    .sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime());

  const room = Math.max(0, limit - 1);
  const chronological = [...earlier.slice(Math.max(0, earlier.length - room)), target];
  let start = 0;
  while (start < chronological.length - 1) {
    if (tokenEstimate(chronological.slice(start)) <= inputTokenBudget) {
      break;
    }
    start += 1;
  }
  const selected = chronological.slice(start);

  return {
    messages: selected,
    targetUserMessageId: target.id,
    cutoff: {
      messageId: target.id,
      createdAt: target.createdAt.toISOString(),
    },
    selectionPolicyVersion: SELECTION_POLICY_VERSION,
    contentHashes: selected.map((message) => contentHash(message.content)),
    inputTokenEstimate: tokenEstimate(selected),
    inputTokenBudget,
    outputTokenBudget: HISTORY_OUTPUT_TOKEN_BUDGET,
  };
}

/**
 * Loads the prefix through the caller's actor transaction so RLS applies.
 * Fetches the target, timestamps that are not unique, and the newest
 * unambiguous rows before the target. Does not read message text into logs.
 */
export async function loadConversationPrefix(
  tx: PrismaTxClient,
  input: {
    conversationId: string;
    organizationId: string;
    targetMessageId: string;
    limit?: number;
    inputTokenBudget?: number;
  },
): Promise<ConversationPrefix | null> {
  const target = await tx.message.findFirst({
    where: {
      id: input.targetMessageId,
      conversationId: input.conversationId,
      organizationId: input.organizationId,
    },
    select: { id: true, role: true, content: true, createdAt: true },
  });
  if (!target) {
    return null;
  }

  const ties = await tx.$queryRaw<Array<{ created_at: Date | string }>>`
    SELECT created_at
    FROM messages
    WHERE conversation_id = ${input.conversationId}::uuid
      AND organization_id = ${input.organizationId}::uuid
      AND created_at < ${target.createdAt}
    GROUP BY created_at
    HAVING COUNT(*) > 1
  `;
  const ambiguous = ties.map((row: { created_at: Date | string }) =>
    row.created_at instanceof Date ? row.created_at : new Date(row.created_at),
  );
  const limit = input.limit ?? HISTORY_MESSAGE_LIMIT;
  const earlier =
    limit <= 1
      ? []
      : await tx.message.findMany({
          where: {
            conversationId: input.conversationId,
            organizationId: input.organizationId,
            createdAt:
              ambiguous.length === 0
                ? { lt: target.createdAt }
                : { lt: target.createdAt, notIn: ambiguous },
          },
          orderBy: { createdAt: "desc" },
          take: limit - 1,
          select: { id: true, role: true, content: true, createdAt: true },
        });

  return selectConversationPrefix([target, ...earlier], target.id, {
    limit,
    inputTokenBudget: input.inputTokenBudget,
  });
}
