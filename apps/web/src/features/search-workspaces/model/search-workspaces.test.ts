import { describe, expect, it } from "vitest";
import type { Client } from "@/entities/client";
import type { Matter } from "@/entities/matter";
import type { Workspace } from "@/entities/workspace";
import {
  recentWorkspaceHits,
  searchWorkspaces,
  tokenizeSearchQuery,
} from "./search-workspaces";

const clients: Client[] = [
  {
    id: "c1",
    organizationId: "o1",
    name: "АО Вектор",
    status: "active",
  },
];

const matters: Matter[] = [
  {
    id: "m1",
    organizationId: "o1",
    title: "Договор аренды",
    clientId: "c1",
    workspaceId: "w1",
    status: "active",
  },
];

function ws(
  partial: Pick<Workspace, "id" | "name"> & Partial<Workspace>,
): Workspace {
  return {
    organizationId: "o1",
    ownerUserId: "u1",
    description: null,
    visibility: "PERSONAL",
    status: "ACTIVE",
    clientId: null,
    ...partial,
  };
}

describe("tokenizeSearchQuery", () => {
  it("splits and normalizes ё", () => {
    expect(tokenizeSearchQuery("  Договор  Аренда ")).toEqual([
      "договор",
      "аренда",
    ]);
    expect(tokenizeSearchQuery("Ёлка")).toEqual(["елка"]);
  });
});

describe("searchWorkspaces", () => {
  const workspaces = [
    ws({ id: "w1", name: "Проект Альфа", clientId: "c1" }),
    ws({ id: "w2", name: "Команда Бета", visibility: "TEAM" }),
  ];

  it("matches name, client, and matter", () => {
    expect(
      searchWorkspaces({
        workspaces,
        clients,
        matters,
        query: "альфа",
        visibility: "all",
      }).items.map((h) => h.workspace.id),
    ).toEqual(["w1"]);

    expect(
      searchWorkspaces({
        workspaces,
        clients,
        matters,
        query: "вектор",
        visibility: "all",
      }).items[0]?.matchedIn,
    ).toBe("client");

    expect(
      searchWorkspaces({
        workspaces,
        clients,
        matters,
        query: "аренды",
        visibility: "all",
      }).items[0]?.workspace.id,
    ).toBe("w1");
  });

  it("filters by visibility", () => {
    expect(
      searchWorkspaces({
        workspaces,
        clients,
        matters,
        query: "проект",
        visibility: "TEAM",
      }).total,
    ).toBe(0);
    expect(
      searchWorkspaces({
        workspaces,
        clients,
        matters,
        query: "бета",
        visibility: "TEAM",
      }).total,
    ).toBe(1);
  });
});

describe("recentWorkspaceHits", () => {
  it("returns first N without query match metadata", () => {
    const hits = recentWorkspaceHits(
      [ws({ id: "w1", name: "A" }), ws({ id: "w2", name: "B" })],
      clients,
      matters,
      "all",
      1,
    );
    expect(hits).toHaveLength(1);
    expect(hits[0]?.matchedIn).toBeNull();
  });
});
