import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppShell } from "./app-shell";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/",
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
        organization: { id: "11111111-1111-4111-8111-111111111111", role: "MEMBER" },
      }),
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
    expect(screen.getByText("Контент")).toBeInTheDocument();
    expect(screen.getByText("lawyer@example.com")).toBeInTheDocument();
  });
});
