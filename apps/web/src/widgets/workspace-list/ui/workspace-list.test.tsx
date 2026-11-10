import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { queryOptions } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WorkspaceList } from "./workspace-list";

const replace = vi.fn();
let search = new URLSearchParams();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, push: vi.fn() }),
  useSearchParams: () => search,
}));

vi.mock("@/entities/workspace", async () => {
  const actual = await vi.importActual<typeof import("@/entities/workspace")>(
    "@/entities/workspace",
  );
  const items = [
    {
      id: "w1",
      organizationId: "o1",
      ownerUserId: "u1",
      name: "Север",
      description: "Договор поставки",
      visibility: "PERSONAL" as const,
      status: "ACTIVE" as const,
      clientId: null,
    },
    {
      id: "w2",
      organizationId: "o1",
      ownerUserId: "u1",
      name: "Команда Альфа",
      description: null,
      visibility: "TEAM" as const,
      status: "ACTIVE" as const,
      clientId: null,
    },
  ];
  return {
    ...actual,
    workspacesListQueryOptions: queryOptions({
      queryKey: ["workspaces", "list"] as const,
      queryFn: async () => ({ items, nextCursor: null }),
    }),
  };
});

function renderList() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <WorkspaceList />
    </QueryClientProvider>,
  );
}

describe("WorkspaceList", () => {
  beforeEach(() => {
    replace.mockClear();
    search = new URLSearchParams();
  });

  afterEach(() => {
    cleanup();
  });

  it("filters by client search", async () => {
    const user = userEvent.setup();
    renderList();

    expect(await screen.findByText("Север")).toBeInTheDocument();
    expect(screen.getByText("Команда Альфа")).toBeInTheDocument();

    await user.type(screen.getByLabelText(/Поиск проектов/i), "север");
    expect(screen.getByText("Север")).toBeInTheDocument();
    expect(screen.queryByText("Команда Альфа")).not.toBeInTheDocument();
  });

  it("shows create panel when ?create=1", async () => {
    search = new URLSearchParams("create=1");
    renderList();
    expect(
      await screen.findByRole("heading", { name: "Новый проект" }),
    ).toBeInTheDocument();
  });

  it("CTA requests create query param", async () => {
    const user = userEvent.setup();
    renderList();
    await screen.findByText("Север");
    await user.click(screen.getByRole("button", { name: /^Создать проект$/i }));
    expect(replace).toHaveBeenCalledWith(expect.stringContaining("create=1"));
  });
});
