import { describe, expect, it } from "vitest";
import { MatterAccess, type MatterRecord, type MatterStore } from "./index.js";

const ORG_A = "00000000-0000-4000-8000-00000000000a";
const ORG_B = "00000000-0000-4000-8000-00000000000b";

const matterA: MatterRecord = {
  id: "00000000-0000-4000-8000-0000000000a1",
  organizationId: ORG_A,
  title: "synthetic-matter-a",
  clientId: null,
  workspaceId: null,
};

const matterB: MatterRecord = {
  id: "00000000-0000-4000-8000-0000000000b1",
  organizationId: ORG_B,
  title: "synthetic-matter-b",
  clientId: null,
  workspaceId: null,
};

function storeOf(...records: MatterRecord[]): MatterStore {
  return {
    async findById(id) {
      return records.find((record) => record.id === id) ?? null;
    },
  };
}

describe("MatterAccess", () => {
  const access = new MatterAccess(storeOf(matterA, matterB));

  it("returns a matter that belongs to the actor organization", async () => {
    await expect(access.readForOrganization(ORG_A, matterA.id)).resolves.toEqual(matterA);
  });

  it("hides a matter that belongs to another organization", async () => {
    const result = await access.readForOrganization(ORG_A, matterB.id);

    expect(result).toBeNull();
  });

  it("hides an unknown matter", async () => {
    await expect(
      access.readForOrganization(ORG_A, "00000000-0000-4000-8000-000000000099"),
    ).resolves.toBeNull();
  });

  it("refuses a read when the server did not resolve an organization", async () => {
    await expect(access.readForOrganization("  ", matterA.id)).resolves.toBeNull();
  });
});
