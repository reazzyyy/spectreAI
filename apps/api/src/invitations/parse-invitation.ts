const EMAIL_RE = /^[^\s@]+@[^\s@]+$/;
const MAX_EMAIL = 320;

export type InvitableRole = "admin" | "member";

export interface ParsedInviteCreate {
  email: string;
  role: InvitableRole;
}

export interface ParsedInviteAccept {
  token: string;
  password?: string;
}

export function normalizeInviteEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function parseInviteCreate(body: unknown): ParsedInviteCreate | null {
  if (typeof body !== "object" || body === null) {
    return null;
  }
  const record = body as Record<string, unknown>;
  if (typeof record.email !== "string") {
    return null;
  }
  const email = normalizeInviteEmail(record.email);
  if (email.length === 0 || email.length > MAX_EMAIL || !EMAIL_RE.test(email)) {
    return null;
  }
  if (record.role !== "admin" && record.role !== "member") {
    return null;
  }
  return { email, role: record.role };
}

export function parseInviteAccept(body: unknown): ParsedInviteAccept | null {
  if (typeof body !== "object" || body === null) {
    return null;
  }
  const record = body as Record<string, unknown>;
  if (typeof record.token !== "string" || record.token.trim().length < 16) {
    return null;
  }
  const out: ParsedInviteAccept = { token: record.token.trim() };
  if (record.password !== undefined) {
    if (typeof record.password !== "string" || record.password.length < 12) {
      return null;
    }
    out.password = record.password;
  }
  return out;
}
