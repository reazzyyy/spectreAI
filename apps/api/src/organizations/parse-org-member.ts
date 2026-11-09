export type AssignableOrgRole = "admin" | "member";

export interface ParsedOrgMemberRolePatch {
  role: AssignableOrgRole;
}

/** Parses PATCH …/members/:userId — only admin|member (not owner). */
export function parseOrgMemberRolePatch(
  body: unknown,
): ParsedOrgMemberRolePatch | null {
  if (typeof body !== "object" || body === null) {
    return null;
  }
  const record = body as Record<string, unknown>;
  if (record.role !== "admin" && record.role !== "member") {
    return null;
  }
  return { role: record.role };
}
