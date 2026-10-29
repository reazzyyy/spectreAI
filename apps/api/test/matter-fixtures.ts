/** Stable UUIDs for e2e seeding — not an in-memory HTTP store. */
export const ORG_A = "00000000-0000-4000-8000-00000000000a";
export const ORG_B = "00000000-0000-4000-8000-00000000000b";
export const USER_A = "00000000-0000-4000-8000-0000000000aa";
export const MEMBERSHIP_A = "00000000-0000-4000-8000-0000000000c1";

export const USER_A_EMAIL = "lawyer-a@example.com";
/** Synthetic fixture password for e2e only — not a production secret. */
export const USER_A_PASSWORD = "synthetic-test-password-a";

export const MATTER_A = {
  id: "00000000-0000-4000-8000-0000000000a1",
  organizationId: ORG_A,
  title: "synthetic-matter-a",
  clientId: null as string | null,
  workspaceId: null as string | null,
};

export const MATTER_B = {
  id: "00000000-0000-4000-8000-0000000000b1",
  organizationId: ORG_B,
  title: "synthetic-matter-b",
  clientId: null as string | null,
  workspaceId: null as string | null,
};
