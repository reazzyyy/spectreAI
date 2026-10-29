const MAX_NAME_LENGTH = 200;
const MAX_STATUS_LENGTH = 64;
const ALLOWED_STATUS = new Set(["active", "archived"]);

export interface ParsedClientCreate {
  name: string;
  status?: string;
}

export interface ParsedClientUpdate {
  name?: string;
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

/**
 * Parses POST /clients body. organizationId is never taken from the client.
 */
export function parseClientCreate(body: unknown): ParsedClientCreate | null {
  if (typeof body !== "object" || body === null) {
    return null;
  }

  const record = body as Record<string, unknown>;
  if (typeof record.name !== "string") {
    return null;
  }

  const name = record.name.trim();
  if (name.length === 0 || name.length > MAX_NAME_LENGTH) {
    return null;
  }

  const status = parseStatus(record.status);
  if (status === null) {
    return null;
  }

  return status === undefined ? { name } : { name, status };
}

/**
 * Parses PATCH /clients/:id body. At least one field required.
 */
export function parseClientUpdate(body: unknown): ParsedClientUpdate | null {
  if (typeof body !== "object" || body === null) {
    return null;
  }

  const record = body as Record<string, unknown>;
  const patch: ParsedClientUpdate = {};

  if (record.name !== undefined) {
    if (typeof record.name !== "string") {
      return null;
    }
    const name = record.name.trim();
    if (name.length === 0 || name.length > MAX_NAME_LENGTH) {
      return null;
    }
    patch.name = name;
  }

  if (record.status !== undefined) {
    const status = parseStatus(record.status);
    if (status === null || status === undefined) {
      return null;
    }
    patch.status = status;
  }

  if (patch.name === undefined && patch.status === undefined) {
    return null;
  }

  return patch;
}
