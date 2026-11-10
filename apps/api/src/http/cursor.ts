/** Encode/decode opaque list cursors (D-026): base64url JSON `{ t, i }`. */

export interface TimeIdCursor {
  createdAt: Date;
  id: string;
}

export function encodeCursor(cursor: TimeIdCursor): string {
  const payload = JSON.stringify({
    t: cursor.createdAt.toISOString(),
    i: cursor.id,
  });
  return Buffer.from(payload, "utf8").toString("base64url");
}

export function decodeCursor(raw: string | undefined): TimeIdCursor | undefined {
  if (!raw || raw.trim() === "") {
    return undefined;
  }
  try {
    const json = Buffer.from(raw, "base64url").toString("utf8");
    const parsed = JSON.parse(json) as { t?: string; i?: string };
    if (!parsed.t || !parsed.i) {
      return undefined;
    }
    const createdAt = new Date(parsed.t);
    if (Number.isNaN(createdAt.getTime())) {
      return undefined;
    }
    return { createdAt, id: parsed.i };
  } catch {
    return undefined;
  }
}

export function parseLimit(raw: string | undefined, fallback = 50): number {
  const n = raw ? Number(raw) : fallback;
  if (!Number.isFinite(n) || n < 1) {
    return fallback;
  }
  return Math.min(Math.floor(n), 100);
}
