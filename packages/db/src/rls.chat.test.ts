import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPrismaClient, withActorContext } from "./index.js";

/**
 * Chat RLS harness (Phase 5A-1). Requires migrate:deploy including phase5a_chat_foundation.
 * Skips when DATABASE_URL_RUNTIME is unreachable.
 */
describe("chat RLS (runtime role)", () => {
  const migrator = createPrismaClient({ purpose: "migrator" });
  const runtime = createPrismaClient({ purpose: "runtime" });

  const orgA = randomUUID();
  const orgB = randomUUID();
  const userOwner = randomUUID();
  const userEditor = randomUUID();
  const userOutsider = randomUUID();
  const userOtherOrg = randomUUID();
  const workspaceId = randomUUID();
  const privateConvId = randomUUID();
  const workspaceConvId = randomUUID();
  const privateMessageId = randomUUID();
  const workspaceMessageId = randomUUID();
  const privateGenerationId = randomUUID();
  const workspaceGenerationId = randomUUID();

  let ready = false;

  beforeAll(async () => {
    try {
      await runtime.$queryRaw`SELECT 1`;
      await migrator.organization.createMany({
        data: [
          { id: orgA, name: "chat-rls-org-a" },
          { id: orgB, name: "chat-rls-org-b" },
        ],
      });
      await migrator.user.createMany({
        data: [
          {
            id: userOwner,
            email: `chat-owner-${userOwner}@example.com`,
            passwordHash: "x",
          },
          {
            id: userEditor,
            email: `chat-editor-${userEditor}@example.com`,
            passwordHash: "x",
          },
          {
            id: userOutsider,
            email: `chat-out-${userOutsider}@example.com`,
            passwordHash: "x",
          },
          {
            id: userOtherOrg,
            email: `chat-b-${userOtherOrg}@example.com`,
            passwordHash: "x",
          },
        ],
      });
      await migrator.workspace.create({
        data: {
          id: workspaceId,
          organizationId: orgA,
          ownerUserId: userOwner,
          name: "chat-team",
          visibility: "TEAM",
          status: "ACTIVE",
        },
      });
      await migrator.workspaceMember.create({
        data: {
          organizationId: orgA,
          workspaceId,
          userId: userEditor,
          role: "EDITOR",
          status: "ACTIVE",
        },
      });
      await migrator.conversation.createMany({
        data: [
          {
            id: privateConvId,
            organizationId: orgA,
            workspaceId,
            ownerUserId: userOwner,
            createdByUserId: userOwner,
            visibility: "PRIVATE",
            status: "ACTIVE",
            title: "private",
            updatedAt: new Date(),
          },
          {
            id: workspaceConvId,
            organizationId: orgA,
            workspaceId,
            ownerUserId: userOwner,
            createdByUserId: userOwner,
            visibility: "WORKSPACE",
            status: "ACTIVE",
            title: "shared",
            updatedAt: new Date(),
          },
        ],
      });
      await migrator.message.createMany({
        data: [
          {
            id: privateMessageId,
            organizationId: orgA,
            conversationId: privateConvId,
            role: "user",
            content: "private-body",
            createdByUserId: userOwner,
          },
          {
            id: workspaceMessageId,
            organizationId: orgA,
            conversationId: workspaceConvId,
            role: "user",
            content: "workspace-body",
            createdByUserId: userOwner,
          },
        ],
      });
      await migrator.aiGeneration.createMany({
        data: [
          {
            id: privateGenerationId,
            organizationId: orgA,
            conversationId: privateConvId,
            userMessageId: privateMessageId,
            status: "queued",
            generationNumber: 1,
          },
          {
            id: workspaceGenerationId,
            organizationId: orgA,
            conversationId: workspaceConvId,
            userMessageId: workspaceMessageId,
            status: "queued",
            generationNumber: 1,
          },
        ],
      });
      ready = true;
    } catch (error) {
      console.warn(
        "[rls.chat.test] skip — Postgres/runtime role unavailable:",
        error instanceof Error ? error.message : error,
      );
      ready = false;
    }
  }, 60_000);

  afterAll(async () => {
    if (ready) {
      await migrator.aiGeneration.deleteMany({
        where: { id: { in: [privateGenerationId, workspaceGenerationId] } },
      });
      await migrator.message.deleteMany({
        where: { id: { in: [privateMessageId, workspaceMessageId] } },
      });
      await migrator.conversation.deleteMany({
        where: { id: { in: [privateConvId, workspaceConvId] } },
      });
      await migrator.workspaceMember.deleteMany({ where: { workspaceId } });
      await migrator.workspace.deleteMany({ where: { id: workspaceId } });
      await migrator.user.deleteMany({
        where: {
          id: { in: [userOwner, userEditor, userOutsider, userOtherOrg] },
        },
      });
      await migrator.organization.deleteMany({
        where: { id: { in: [orgA, orgB] } },
      });
    }
    await Promise.all([runtime.$disconnect(), migrator.$disconnect()]);
  });

  it("PRIVATE conversation visible only to owner with workspace access", async ({
    skip,
  }) => {
    if (!ready) skip();

    const asOwner = await withActorContext(
      runtime,
      { userId: userOwner, organizationId: orgA },
      (tx) => tx.conversation.findMany({ where: { id: privateConvId } }),
    );
    const asEditor = await withActorContext(
      runtime,
      { userId: userEditor, organizationId: orgA },
      (tx) => tx.conversation.findMany({ where: { id: privateConvId } }),
    );
    const asOutsider = await withActorContext(
      runtime,
      { userId: userOutsider, organizationId: orgA },
      (tx) => tx.conversation.findMany({ where: { id: privateConvId } }),
    );

    expect(asOwner.map((row) => row.id)).toEqual([privateConvId]);
    expect(asEditor).toEqual([]);
    expect(asOutsider).toEqual([]);
  });

  it("WORKSPACE conversation visible to owner and active member, not outsider/other org", async ({
    skip,
  }) => {
    if (!ready) skip();

    const asOwner = await withActorContext(
      runtime,
      { userId: userOwner, organizationId: orgA },
      (tx) => tx.conversation.findMany({ where: { id: workspaceConvId } }),
    );
    const asEditor = await withActorContext(
      runtime,
      { userId: userEditor, organizationId: orgA },
      (tx) => tx.conversation.findMany({ where: { id: workspaceConvId } }),
    );
    const asOutsider = await withActorContext(
      runtime,
      { userId: userOutsider, organizationId: orgA },
      (tx) => tx.conversation.findMany({ where: { id: workspaceConvId } }),
    );
    const asOtherOrg = await withActorContext(
      runtime,
      { userId: userOtherOrg, organizationId: orgB },
      (tx) => tx.conversation.findMany({ where: { id: workspaceConvId } }),
    );

    expect(asOwner.map((row) => row.id)).toEqual([workspaceConvId]);
    expect(asEditor.map((row) => row.id)).toEqual([workspaceConvId]);
    expect(asOutsider).toEqual([]);
    expect(asOtherOrg).toEqual([]);
  });

  it("messages and generations follow parent conversation ACL", async ({ skip }) => {
    if (!ready) skip();

    const editorPrivateMessages = await withActorContext(
      runtime,
      { userId: userEditor, organizationId: orgA },
      (tx) => tx.message.findMany({ where: { id: privateMessageId } }),
    );
    const editorSharedMessages = await withActorContext(
      runtime,
      { userId: userEditor, organizationId: orgA },
      (tx) => tx.message.findMany({ where: { id: workspaceMessageId } }),
    );
    const editorPrivateGens = await withActorContext(
      runtime,
      { userId: userEditor, organizationId: orgA },
      (tx) => tx.aiGeneration.findMany({ where: { id: privateGenerationId } }),
    );
    const editorSharedGens = await withActorContext(
      runtime,
      { userId: userEditor, organizationId: orgA },
      (tx) => tx.aiGeneration.findMany({ where: { id: workspaceGenerationId } }),
    );

    expect(editorPrivateMessages).toEqual([]);
    expect(editorSharedMessages.map((row) => row.id)).toEqual([workspaceMessageId]);
    expect(editorPrivateGens).toEqual([]);
    expect(editorSharedGens.map((row) => row.id)).toEqual([workspaceGenerationId]);
  });

  it("cross-org INSERT into conversations is blocked under runtime GUC", async ({
    skip,
  }) => {
    if (!ready) skip();
    const foreignId = randomUUID();

    await expect(
      withActorContext(runtime, { userId: userOwner, organizationId: orgA }, (tx) =>
        tx.conversation.create({
          data: {
            id: foreignId,
            organizationId: orgB,
            workspaceId,
            ownerUserId: userOwner,
            createdByUserId: userOwner,
            visibility: "WORKSPACE",
            status: "ACTIVE",
            updatedAt: new Date(),
          },
        }),
      ),
    ).rejects.toBeTruthy();
  });
});
