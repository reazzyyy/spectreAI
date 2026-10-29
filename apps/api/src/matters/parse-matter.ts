const MAX_TITLE_LENGTH = 200;
const MAX_STATUS_LENGTH = 64;
const ALLOWED_STATUS = new Set(["active", "archived"]);
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface ParsedMatterCreate {
  title: string;
  clientId?: string | null;
  workspaceId?: string | null;
  status?: string;
}

export interface ParsedMatterUpdate {
  title?: string;
  clientId?: string | null;
  workspaceId?: string | null;
  status?: string;
}

function parseStatus(value: unknown): string | undefined | null {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "string") {
    return null;
  }
  const status = value.trim();
  if (status.length === 0 || status.length > MAX_STATUS_LENGTH || !ALLOWED_STATUS.has(status)) {
    return null;
  }
  return status;
}

/** Optional UUID or explicit null; undefined = omit. Invalid → null sentinel for failure. */
function parseOptionalUuid(
  value: unknown,
): { ok: true; value: string | null | undefined } | { ok: false } {
  if (value === undefined) {
    return { ok: true, value: undefined };
  }
  if (value === null) {
    return { ok: true, value: null };
  }
  if (typeof value !== "string" || !UUID_RE.test(value)) {
    return { ok: false };
  }
  return { ok: true, value: value.toLowerCase() };
}

/**
 * Parses POST /matters body. organizationId is never taken from the client.
 */
export function parseMatterCreate(body: unknown): ParsedMatterCreate | null {
  if (typeof body !== "object" || body === null) {
    return null;
  }

  const record = body as Record<string, unknown>;
  if (typeof record.title !== "string") {
    return null;
  }

  const title = record.title.trim();
  if (title.length === 0 || title.length > MAX_TITLE_LENGTH) {
    return null;
  }

  const status = parseStatus(record.status);
  if (status === null) {
    return null;
  }

  const clientId = parseOptionalUuid(record.clientId);
  if (!clientId.ok) {
    return null;
  }

  const workspaceId = parseOptionalUuid(record.workspaceId);
  if (!workspaceId.ok) {
    return null;
  }

  const result: ParsedMatterCreate = { title };
  if (status !== undefined) {
    result.status = status;
  }
  if (clientId.value !== undefined) {
    result.clientId = clientId.value;
  }
  if (workspaceId.value !== undefined) {
    result.workspaceId = workspaceId.value;
  }
  return result;
}

/**
 * Parses PATCH /matters/:id body. At least one field required.
 */
export function parseMatterUpdate(body: unknown): ParsedMatterUpdate | null {
  if (typeof body !== "object" || body === null) {
    return null;
  }

  const record = body as Record<string, unknown>;
  const patch: ParsedMatterUpdate = {};

  if (record.title !== undefined) {
    if (typeof record.title !== "string") {
      return null;
    }
    const title = record.title.trim();
    if (title.length === 0 || title.length > MAX_TITLE_LENGTH) {
      return null;
    }
    patch.title = title;
  }

  if (record.status !== undefined) {
    const status = parseStatus(record.status);
    if (status === null || status === undefined) {
      return null;
    }
    patch.status = status;
  }

  const clientId = parseOptionalUuid(record.clientId);
  if (!clientId.ok) {
    return null;
  }
  if (clientId.value !== undefined) {
    patch.clientId = clientId.value;
  }

  const workspaceId = parseOptionalUuid(record.workspaceId);
  if (!workspaceId.ok) {
    return null;
  }
  if (workspaceId.value !== undefined) {
    patch.workspaceId = workspaceId.value;
  }

  if (
    patch.title === undefined &&
    patch.status === undefined &&
    patch.clientId === undefined &&
    patch.workspaceId === undefined
  ) {
    return null;
  }

  return patch;
}
