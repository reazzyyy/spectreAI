const MAX_NAME_LENGTH = 160;
const MAX_DESCRIPTION_LENGTH = 2000;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface ParsedWorkspaceCreate {
  name: string;
  description?: string | null;
  clientId?: string | null;
  visibility?: "PERSONAL" | "TEAM";
}

export interface ParsedWorkspaceUpdate {
  name?: string;
  description?: string | null;
  clientId?: string | null;
}

export interface ParsedMemberUpsert {
  userId: string;
  role: "EDITOR" | "VIEWER";
}

export interface ParsedMatterLink {
  matterId: string;
}

function parseOptionalUuid(value: unknown): string | null | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value === null) {
    return null;
  }
  if (typeof value !== "string" || !UUID_RE.test(value.trim())) {
    return null;
  }
  return value.trim().toLowerCase();
}

function parseDescription(value: unknown): string | null | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value === null) {
    return null;
  }
  if (typeof value !== "string") {
    return null;
  }
  const description = value.trim();
  if (description.length > MAX_DESCRIPTION_LENGTH) {
    return null;
  }
  return description.length === 0 ? null : description;
}

/**
 * Parses POST /workspaces. PERSONAL (default) or TEAM (W-002).
 * organizationId / ownerUserId never taken from the client.
 */
export function parseWorkspaceCreate(body: unknown): ParsedWorkspaceCreate | null {
  if (typeof body !== "object" || body === null) {
    return null;
  }

  const record = body as Record<string, unknown>;

  let visibility: "PERSONAL" | "TEAM" | undefined;
  if (record.visibility !== undefined) {
    if (record.visibility !== "PERSONAL" && record.visibility !== "TEAM") {
      return null;
    }
    visibility = record.visibility;
  }

  if (typeof record.name !== "string") {
    return null;
  }
  const name = record.name.trim();
  if (name.length === 0 || name.length > MAX_NAME_LENGTH) {
    return null;
  }

  const description = parseDescription(record.description);
  if (record.description !== undefined && description === null && record.description !== null) {
    return null;
  }

  const clientId = parseOptionalUuid(record.clientId);
  if (record.clientId !== undefined && clientId === null && record.clientId !== null) {
    return null;
  }

  const out: ParsedWorkspaceCreate = { name };
  if (description !== undefined) {
    out.description = description;
  }
  if (clientId !== undefined) {
    out.clientId = clientId;
  }
  if (visibility !== undefined) {
    out.visibility = visibility;
  }
  return out;
}

/** Parses PATCH /workspaces/:id. At least one field required. */
export function parseWorkspaceUpdate(body: unknown): ParsedWorkspaceUpdate | null {
  if (typeof body !== "object" || body === null) {
    return null;
  }

  const record = body as Record<string, unknown>;
  const out: ParsedWorkspaceUpdate = {};

  if (record.name !== undefined) {
    if (typeof record.name !== "string") {
      return null;
    }
    const name = record.name.trim();
    if (name.length === 0 || name.length > MAX_NAME_LENGTH) {
      return null;
    }
    out.name = name;
  }

  if (record.description !== undefined) {
    const description = parseDescription(record.description);
    if (description === null && record.description !== null) {
      return null;
    }
    out.description = description ?? null;
  }

  if (record.clientId !== undefined) {
    const clientId = parseOptionalUuid(record.clientId);
    if (clientId === null && record.clientId !== null) {
      return null;
    }
    out.clientId = clientId ?? null;
  }

  if (out.name === undefined && out.description === undefined && out.clientId === undefined) {
    return null;
  }

  return out;
}

export function parseMemberUpsert(body: unknown): ParsedMemberUpsert | null {
  if (typeof body !== "object" || body === null) {
    return null;
  }
  const record = body as Record<string, unknown>;
  if (typeof record.userId !== "string" || !UUID_RE.test(record.userId.trim())) {
    return null;
  }
  if (record.role !== "EDITOR" && record.role !== "VIEWER") {
    return null;
  }
  return { userId: record.userId.trim().toLowerCase(), role: record.role };
}

export function parseMatterLink(body: unknown): ParsedMatterLink | null {
  if (typeof body !== "object" || body === null) {
    return null;
  }
  const record = body as Record<string, unknown>;
  if (typeof record.matterId !== "string" || !UUID_RE.test(record.matterId.trim())) {
    return null;
  }
  return { matterId: record.matterId.trim().toLowerCase() };
}
