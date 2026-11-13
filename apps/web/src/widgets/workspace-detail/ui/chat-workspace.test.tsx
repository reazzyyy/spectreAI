import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { queryOptions } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ChatWorkspace } from "./chat-workspace";

vi.mock("@/entities/conversation", async () => {
  const actual = await vi.importActual<
    typeof import("@/entities/conversation")
  >("@/entities/conversation");
  return {
    ...actual,
    conversationListQueryOptions: (workspaceId: string) =>
      queryOptions({
        queryKey: ["conversations", "list", workspaceId] as const,
        queryFn: async () => ({
          items: [
            {
              id: "c1",
              organizationId: "o1",
              workspaceId,
              ownerUserId: "u1",
              createdByUserId: "u1",
              visibility: "PRIVATE" as const,
              title: "Черновик иска",
              status: "ACTIVE" as const,
              lastMessageAt: null,
              createdAt: "2026-11-12T10:00:00.000Z",
              updatedAt: "2026-11-12T10:00:00.000Z",
            },
          ],
          nextCursor: null,
        }),
      }),
    createConversation: vi.fn(),
  };
});

vi.mock("@/entities/message", async () => {
  const actual = await vi.importActual<typeof import("@/entities/message")>(
    "@/entities/message",
  );
  return {
    ...actual,
    messageHistoryQueryOptions: (conversationId: string) =>
      queryOptions({
        queryKey: ["messages", "history", conversationId] as const,
        queryFn: async () => ({
          items: [
            {
              id: "m2",
              conversationId,
              role: "assistant" as const,
              content: "Синтетический разбор спора",
              createdByUserId: null,
              generationId: "g1",
              clientMessageId: null,
              createdAt: "2026-11-12T10:02:00.000Z",
            },
            {
              id: "m1",
              conversationId,
              role: "user" as const,
              content: "Кратко опиши спор",
              createdByUserId: "u1",
              generationId: null,
              clientMessageId: null,
              createdAt: "2026-11-12T10:01:00.000Z",
            },
          ],
          nextCursor: null,
        }),
      }),
    sendMessage: vi.fn(),
  };
});

function renderChat() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <ChatWorkspace workspaceId="w1" />
    </QueryClientProvider>,
  );
}

describe("ChatWorkspace", () => {
  afterEach(() => {
    cleanup();
  });

  it("shows Make-style ask bar and opens a conversation row", async () => {
    const user = userEvent.setup();
    renderChat();

    expect(await screen.findByText(/синтетический режим/i)).toBeInTheDocument();
    expect(screen.getByLabelText("Новый вопрос")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /начать диалог/i }),
    ).toBeInTheDocument();
    expect(await screen.findByText("Черновик иска")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /черновик иска/i }));

    expect(await screen.findByText("Диалог по материалам")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /открыть проекту/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /новый чат/i }),
    ).toBeInTheDocument();
    expect(await screen.findByText("Кратко опиши спор")).toBeInTheDocument();
    expect(
      await screen.findByText("Синтетический разбор спора"),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Ваш вопрос")).toBeInTheDocument();
  });
});
