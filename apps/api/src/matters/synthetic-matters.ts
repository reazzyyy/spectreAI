import { MatterRecord } from "@spectre/access";

export const ORG_A = "00000000-0000-4000-8000-00000000000a";
export const ORG_B = "00000000-0000-4000-8000-00000000000b";
export const USER_A = "00000000-0000-4000-8000-0000000000aa";

export const SYNTHETIC_MATTERS: readonly MatterRecord[] = [
  {
    id: "00000000-0000-4000-8000-0000000000a1",
    organizationId: ORG_A,
    title: "synthetic-matter-a",
    clientId: null,
    workspaceId: null,
  },
  {
    id: "00000000-0000-4000-8000-0000000000b1",
    organizationId: ORG_B,
    title: "synthetic-matter-b",
    clientId: null,
    workspaceId: null,
  },
];
