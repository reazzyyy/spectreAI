import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { Workspace } from "@/entities/workspace";
import { ProjectBar } from "./project-bar";

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

describe("ProjectBar", () => {
  it("switches to chats and keeps future tabs disabled", async () => {
    const user = userEvent.setup();
    const onTabChange = vi.fn();
    render(
      <ProjectBar
        workspace={workspace}
        activeTab="overview"
        onTabChange={onTabChange}
      />,
    );

    expect(screen.getByRole("heading", { name: "Север" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Документы" })).toBeDisabled();
    expect(screen.getByRole("tab", { name: "Исследования" })).toBeDisabled();
    expect(screen.getByRole("tab", { name: "Черновики" })).toBeDisabled();

    await user.click(screen.getByRole("tab", { name: "Чаты" }));
    expect(onTabChange).toHaveBeenCalledWith("chats");
  });
});
