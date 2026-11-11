import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppShell } from "./app-shell";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/entities/session", async () => {
  const actual = await vi.importActual<typeof import("@/entities/session")>(
    "@/entities/session",
  );
  return {
    ...actual,
    sessionMeQueryOptions: {
      queryKey: ["session", "me"],
      queryFn: async () => ({
        user: { id: "u1", email: "lawyer@example.com" },
        organization: {
          id: "11111111-1111-4111-8111-111111111111",
          name: "Legal Team",
          role: "MEMBER",
        },
      }),
    },
  };
});

vi.mock("@/entities/workspace", async () => {
  const actual = await vi.importActual<typeof import("@/entities/workspace")>(
    "@/entities/workspace",
  );
  return {
    ...actual,
    workspacesListQueryOptions: {
      queryKey: ["workspaces", "list"],
      queryFn: async () => ({ items: [], nextCursor: null }),
    },
  };
});

describe("AppShell", () => {
  beforeEach(() => {
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: (query: string) => ({
        matches: false,
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }),
    });
  });

  it("renders brand and home navigation after session loads", async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={client}>
        <AppShell>
          <p>Контент</p>
        </AppShell>
      </QueryClientProvider>,
    );

    expect(await screen.findByText("Спектр")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Главная/i })).toBeInTheDocument();
    expect(
      screen.getAllByRole("button", { name: /Поиск проектов/i }).length,
    ).toBeGreaterThanOrEqual(1);
    expect(
      screen.getByRole("link", { name: /Создать проект/i }),
    ).toHaveAttribute("href", "/projects?create=1");
    expect(screen.getByRole("link", { name: /Личные/i })).toHaveAttribute(
      "href",
      "/projects?visibility=PERSONAL",
    );
    expect(
      screen.getByRole("link", { name: /Проекты команды/i }),
    ).toHaveAttribute("href", "/projects?visibility=TEAM");
    expect(screen.getByRole("link", { name: /Клиенты/i })).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /Юридические дела/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /Организация/i }),
    ).toBeInTheDocument();
    expect(screen.getByText("Контент")).toBeInTheDocument();
    expect(screen.getByText("Lawyer")).toBeInTheDocument();
    expect(screen.getByText("Legal Team")).toBeInTheDocument();
  });

  it("hides profile text when sidebar is collapsed", async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={client}>
        <AppShell>
          <p>Контент</p>
        </AppShell>
      </QueryClientProvider>,
    );

    expect(await screen.findByText("Lawyer")).toBeInTheDocument();
    expect(screen.getByText("Legal Team")).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: "Свернуть навигацию" }),
    );

    expect(
      screen.getByRole("button", { name: "Развернуть навигацию" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Lawyer")).not.toBeInTheDocument();
    expect(screen.queryByText("Legal Team")).not.toBeInTheDocument();
    expect(screen.queryByText("lawyer@example.com")).not.toBeInTheDocument();
  });
});
