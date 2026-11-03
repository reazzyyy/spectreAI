/** Stable UUIDs for e2e seeding — not an in-memory HTTP store. */
export const ORG_A = "00000000-0000-4000-8000-00000000000a";
export const ORG_B = "00000000-0000-4000-8000-00000000000b";
export const USER_A = "00000000-0000-4000-8000-0000000000aa";
export const USER_B = "00000000-0000-4000-8000-0000000000bb";
export const MEMBERSHIP_A = "00000000-0000-4000-8000-0000000000c1";
export const MEMBERSHIP_B = "00000000-0000-4000-8000-0000000000c2";
export const TEAM_WORKSPACE_A = "00000000-0000-4000-8000-0000000000d1";
export const TEAM_WORKSPACE_B = "00000000-0000-4000-8000-0000000000d2";

export const USER_A_EMAIL = "lawyer-a@example.com";
export const USER_B_EMAIL = "lawyer-b@example.com";
export const USER_ORG_B = "00000000-0000-4000-8000-0000000000cc";
export const USER_ORG_B_EMAIL = "lawyer-org-b@example.com";
/** Synthetic fixture password for e2e only — not a production secret. */
export const USER_A_PASSWORD = "synthetic-test-password-a";
export const USER_B_PASSWORD = "synthetic-test-password-b";

export const CLIENT_B = {
  id: "00000000-0000-4000-8000-0000000000cb",
  organizationId: ORG_B,
  name: "synthetic-client-b",
  status: "active",
};

export const MATTER_A = {
  id: "00000000-0000-4000-8000-0000000000a1",
  organizationId: ORG_A,
  title: "synthetic-matter-a",
  clientId: null as string | null,
  workspaceId: null as string | null,
  status: "active",
};

export const MATTER_B = {
  id: "00000000-0000-4000-8000-0000000000b1",
  organizationId: ORG_B,
  title: "synthetic-matter-b",
  clientId: null as string | null,
  workspaceId: null as string | null,
  status: "active",
};
