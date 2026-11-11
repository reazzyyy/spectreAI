import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Workspace } from "@/entities/workspace";
import { ProjectBar } from "./project-bar";

vi.mock("@/features/search-workspaces", () => ({
  useOpenCommandPalette: () => vi.fn(),
}));

const workspace: Workspace = {
  id: "w1",
  organizationId: "o1",
  ownerUserId: "u1",
  name: "Север",
  description: null,
  visibility: "TEAM",
  status: "ACTIVE",
  clientId: null,
};

afterEach(() => {
  cleanup();
});

describe("ProjectBar", () => {
  it("renders sticky chrome: switcher, access, tabs", async () => {
    const user = userEvent.setup();
    const onOpenAccess = vi.fn();
    render(
      <ProjectBar
        workspace={workspace}
        activeTab="chats"
        panel="tab"
        onTabChange={vi.fn()}
        onOpenAccess={onOpenAccess}
        onAction={vi.fn()}
      />,
    );

    expect(
      screen.getByTitle("Перейти в другой проект (Ctrl K)"),
    ).toBeInTheDocument();
    expect(screen.getByText("Команда")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Участники/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Чаты/i })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByRole("tab", { name: /Документы/i })).toBeDisabled();
    expect(screen.getByRole("tab", { name: /Исследования/i })).toBeDisabled();
    expect(screen.getByRole("tab", { name: /Черновики/i })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: /Участники/i }));
    expect(onOpenAccess).toHaveBeenCalled();
  });

  it("exposes rename via actions menu", async () => {
    const user = userEvent.setup();
    const onAction = vi.fn();
    render(
      <ProjectBar
        workspace={workspace}
        activeTab="chats"
        panel="tab"
        onTabChange={vi.fn()}
        onOpenAccess={vi.fn()}
        onAction={onAction}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: "Действия: Север" }),
    );
    await user.click(screen.getByRole("menuitem", { name: /Переименовать/i }));
    expect(onAction).toHaveBeenCalledWith("rename");
  });
});
