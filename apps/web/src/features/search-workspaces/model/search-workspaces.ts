import type { Client } from "@/entities/client";
import type { Matter } from "@/entities/matter";
import type { Workspace, WorkspaceVisibility } from "@/entities/workspace";

export type SearchVisibilityFilter = "all" | WorkspaceVisibility;

export type SearchHitMatchedIn = "name" | "client" | "matter" | null;

export type WorkspaceSearchHit = {
  workspace: Workspace;
  clientName: string | null;
  matterTitle: string | null;
  matchedIn: SearchHitMatchedIn;
};

export type WorkspaceSearchInput = {
  workspaces: Workspace[];
  clients: Client[];
  matters: Matter[];
  query: string;
  visibility: SearchVisibilityFilter;
  limit?: number;
};

/** Normalize for RU search (ё→е, casefold). */
export function normalizeSearchText(value: string): string {
  return value.toLowerCase().replace(/ё/g, "е");
}

export function tokenizeSearchQuery(query: string): string[] {
  return normalizeSearchText(query)
    .replace(/[«»"“”']/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

/**
 * Client-side workspace search (Make CommandPalette / projectSearch).
 * Matches name, linked client name, and Matter.title via matter.workspaceId.
 * List API has no server search yet — filters the loaded GET /workspaces page.
 */
export function searchWorkspaces(
  input: WorkspaceSearchInput,
): { items: WorkspaceSearchHit[]; total: number } {
  const limit = input.limit ?? 8;
  const tokens = tokenizeSearchQuery(input.query);
  const clientsById = new Map(input.clients.map((c) => [c.id, c.name]));
  const mattersByWorkspace = new Map<string, string>();
  for (const matter of input.matters) {
    if (!matter.workspaceId) continue;
    const prev = mattersByWorkspace.get(matter.workspaceId);
    if (!prev) mattersByWorkspace.set(matter.workspaceId, matter.title);
  }

  const scored: { hit: WorkspaceSearchHit; score: number }[] = [];

  for (const workspace of input.workspaces) {
    if (
      input.visibility !== "all" &&
      workspace.visibility !== input.visibility
    ) {
      continue;
    }

    const clientName = workspace.clientId
      ? (clientsById.get(workspace.clientId) ?? null)
      : null;
    const matterTitle = mattersByWorkspace.get(workspace.id) ?? null;
    let matchedIn: SearchHitMatchedIn = null;
    let score = 0;

    if (tokens.length > 0) {
      const name = normalizeSearchText(workspace.name);
      const client = normalizeSearchText(clientName ?? "");
      const matter = normalizeSearchText(matterTitle ?? "");
      const inName = tokens.every((t) => name.includes(t));
      if (inName) {
        matchedIn = "name";
        score = name.startsWith(tokens[0]!) ? 0 : 1;
      } else if (
        tokens.every(
          (t) => name.includes(t) || client.includes(t) || matter.includes(t),
        )
      ) {
        matchedIn = tokens.every((t) => name.includes(t) || client.includes(t))
          ? "client"
          : "matter";
        score = 3;
      } else {
        continue;
      }
    }

    if (workspace.status === "ARCHIVED") score += 10;
    if (workspace.status === "PENDING_DELETION") score += 20;

    scored.push({
      hit: { workspace, clientName, matterTitle, matchedIn },
      score,
    });
  }

  scored.sort((a, b) => {
    if (a.score !== b.score) return a.score - b.score;
    return a.hit.workspace.name.localeCompare(b.hit.workspace.name, "ru");
  });

  return {
    total: scored.length,
    items: scored.slice(0, limit).map((s) => s.hit),
  };
}

/** Recent rows when the palette query is empty (list order preserved). */
export function recentWorkspaceHits(
  workspaces: Workspace[],
  clients: Client[],
  matters: Matter[],
  visibility: SearchVisibilityFilter,
  limit = 8,
): WorkspaceSearchHit[] {
  const clientsById = new Map(clients.map((c) => [c.id, c.name]));
  const mattersByWorkspace = new Map<string, string>();
  for (const matter of matters) {
    if (!matter.workspaceId) continue;
    if (!mattersByWorkspace.has(matter.workspaceId)) {
      mattersByWorkspace.set(matter.workspaceId, matter.title);
    }
  }

  return workspaces
    .filter(
      (ws) => visibility === "all" || ws.visibility === visibility,
    )
    .slice(0, limit)
    .map((workspace) => ({
      workspace,
      clientName: workspace.clientId
        ? (clientsById.get(workspace.clientId) ?? null)
        : null,
      matterTitle: mattersByWorkspace.get(workspace.id) ?? null,
      matchedIn: null,
    }));
}
