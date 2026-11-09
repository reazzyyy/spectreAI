import "reflect-metadata";
import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { createPrismaClient } from "@spectre/db";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { AppModule } from "../src/app.module.js";
import { hashPassword } from "../src/auth/password.js";
import { applyHttpMiddleware } from "../src/http/apply-http-middleware.js";
import { CSRF_COOKIE_NAME, CSRF_HEADER_NAME } from "../src/http/csrf.js";
import {
  CLIENT_B,
  MATTER_A,
  MATTER_B,
  MEMBERSHIP_A,
  MEMBERSHIP_B,
  ORG_A,
  ORG_B,
  TEAM_WORKSPACE_A,
  TEAM_WORKSPACE_B,
  USER_A,
  USER_A_EMAIL,
  USER_A_PASSWORD,
  USER_B,
  USER_B_EMAIL,
  USER_B_PASSWORD,
  USER_ORG_B,
  USER_ORG_B_EMAIL,
} from "./matter-fixtures.js";

function extractCookieValue(
  setCookie: string | string[] | undefined,
  name: string,
): string | undefined {
  const parts = Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : [];
  const prefix = `${name}=`;
  for (const part of parts) {
    const segment = part.split(";")[0] ?? "";
    if (segment.startsWith(prefix)) {
      return decodeURIComponent(segment.slice(prefix.length));
    }
  }
  return undefined;
}

async function seedFixtures(): Promise<void> {
  // Seed as migrator (table owner) — bypasses tenant RLS; API uses runtime + GUC.
  const prisma = createPrismaClient({ purpose: "migrator" });
  try {
    await prisma.session.deleteMany({
      where: { userId: { in: [USER_A, USER_B, USER_ORG_B] } },
    });
    await prisma.organizationInvitation.deleteMany({
      where: { organizationId: { in: [ORG_A, ORG_B] } },
    });
    await prisma.workspaceMember.deleteMany({
      where: { organizationId: { in: [ORG_A, ORG_B] } },
    });
    await prisma.workspaceMatter.deleteMany({
      where: { organizationId: { in: [ORG_A, ORG_B] } },
    });
    await prisma.workspace.deleteMany({
      where: { organizationId: { in: [ORG_A, ORG_B] } },
    });
    await prisma.organizationMembership.deleteMany({
      where: { organizationId: { in: [ORG_A, ORG_B] } },
    });
    await prisma.user.deleteMany({
      where: {
        OR: [
          { id: { in: [USER_A, USER_B, USER_ORG_B] } },
          { email: { endsWith: "@localhost" } },
        ],
      },
    });
    await prisma.matter.deleteMany({
      where: { organizationId: { in: [ORG_A, ORG_B] } },
    });
    await prisma.client.deleteMany({
      where: { organizationId: { in: [ORG_A, ORG_B] } },
    });
    await prisma.organization.deleteMany({
      where: { id: { in: [ORG_A, ORG_B] } },
    });

    await prisma.organization.createMany({
      data: [
        { id: ORG_A, name: "org-a" },
        { id: ORG_B, name: "org-b" },
      ],
    });
    await prisma.client.create({
      data: {
        id: CLIENT_B.id,
        organizationId: CLIENT_B.organizationId,
        name: CLIENT_B.name,
        status: CLIENT_B.status,
      },
    });
    await prisma.matter.createMany({
      data: [
        {
          id: MATTER_A.id,
          organizationId: MATTER_A.organizationId,
          title: MATTER_A.title,
          clientId: MATTER_A.clientId,
          workspaceId: MATTER_A.workspaceId,
          status: MATTER_A.status,
        },
        {
          id: MATTER_B.id,
          organizationId: MATTER_B.organizationId,
          title: MATTER_B.title,
          clientId: MATTER_B.clientId,
          workspaceId: MATTER_B.workspaceId,
          status: MATTER_B.status,
        },
      ],
    });

    const passwordHashA = await hashPassword(USER_A_PASSWORD);
    const passwordHashB = await hashPassword(USER_B_PASSWORD);
    await prisma.user.createMany({
      data: [
        {
          id: USER_A,
          email: USER_A_EMAIL,
          passwordHash: passwordHashA,
          status: "active",
        },
        {
          id: USER_B,
          email: USER_B_EMAIL,
          passwordHash: passwordHashB,
          status: "active",
        },
        {
          id: USER_ORG_B,
          email: USER_ORG_B_EMAIL,
          passwordHash: passwordHashA,
          status: "active",
        },
      ],
    });
    await prisma.organizationMembership.createMany({
      data: [
        {
          id: MEMBERSHIP_A,
          organizationId: ORG_A,
          userId: USER_A,
          role: "owner",
          status: "active",
        },
        {
          id: MEMBERSHIP_B,
          organizationId: ORG_A,
          userId: USER_B,
          role: "member",
          status: "active",
        },
      ],
    });
    await prisma.workspace.createMany({
      data: [
        {
          id: TEAM_WORKSPACE_A,
          organizationId: ORG_A,
          ownerUserId: USER_A,
          name: "seed-team-a",
          visibility: "TEAM",
          status: "ACTIVE",
        },
        {
          id: TEAM_WORKSPACE_B,
          organizationId: ORG_B,
          ownerUserId: USER_ORG_B,
          name: "seed-team-b",
          visibility: "TEAM",
          status: "ACTIVE",
        },
      ],
    });
  } finally {
    await prisma.$disconnect();
  }
}

async function createApp(): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleRef.createNestApplication({ logger: false });
  applyHttpMiddleware(app);
  app.setGlobalPrefix("api/v1");
  await app.init();
  return app;
}

describe("API scaffold", () => {
  beforeAll(async () => {
    await seedFixtures();
  });

  describe("without an authenticated session", () => {
    let app: INestApplication;

    beforeAll(async () => {
      app = await createApp();
    });

    afterAll(async () => {
      await app.close();
    });

    it("GET /api/v1/health returns ok", async () => {
      const response = await request(app.getHttpServer()).get("/api/v1/health");

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ status: "ok" });
    });

    it("GET /api/v1/ai/provider reports the synthetic adapter", async () => {
      const response = await request(app.getHttpServer()).get("/api/v1/ai/provider");

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        providerId: "synthetic",
        externalTransferEnabled: false,
      });
    });

    it("hides matters until the server has a session", async () => {
      const response = await request(app.getHttpServer()).get(
        `/api/v1/matters/${MATTER_A.id}`,
      );

      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe("UNAUTHENTICATED");
      expect(response.body.error.requestId).toEqual(expect.any(String));
      expect(JSON.stringify(response.body)).not.toContain(MATTER_A.title);
    });

    it("hides clients until the server has a session", async () => {
      const response = await request(app.getHttpServer()).get("/api/v1/clients");

      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe("UNAUTHENTICATED");
    });

    it("hides workspaces until the server has a session", async () => {
      const response = await request(app.getHttpServer()).get("/api/v1/workspaces");

      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe("UNAUTHENTICATED");
    });

    it("rejects login with the same 401 for bad credentials", async () => {
      const response = await request(app.getHttpServer())
        .post("/api/v1/auth/login")
        .send({
          email: USER_A_EMAIL,
          password: "wrong-password",
          organizationId: ORG_A,
        });

      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe("UNAUTHENTICATED");
      expect(response.headers["set-cookie"]).toBeUndefined();
    });
  });

  describe("session in organization A", () => {
    let app: INestApplication;
    let agent: ReturnType<typeof request.agent>;

    beforeAll(async () => {
      app = await createApp();
      agent = request.agent(app.getHttpServer());

      const login = await agent.post("/api/v1/auth/login").send({
        email: USER_A_EMAIL,
        password: USER_A_PASSWORD,
        organizationId: ORG_A,
      });

      expect(login.status).toBe(200);
      expect(login.body).toEqual({
        user: { id: USER_A, email: USER_A_EMAIL },
        organization: { id: ORG_A, role: "owner" },
      });
      expect(JSON.stringify(login.body)).not.toContain(USER_A_PASSWORD);
      const setCookie = login.headers["set-cookie"];
      const cookieHeader = Array.isArray(setCookie)
        ? setCookie.join(";")
        : (setCookie ?? "");
      expect(cookieHeader).toContain("spectre_sid=");
      expect(cookieHeader).toContain(`${CSRF_COOKIE_NAME}=`);
      const csrf = extractCookieValue(setCookie, CSRF_COOKIE_NAME);
      expect(csrf).toEqual(expect.any(String));
      agent.set(CSRF_HEADER_NAME, csrf!);
    });

    afterAll(async () => {
      await app.close();
    });

    it("rejects mutating requests with a foreign Origin", async () => {
      const response = await agent
        .post("/api/v1/clients")
        .set("Origin", "https://evil.example")
        .send({ name: "Should Fail Origin" });

      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe("CSRF_REJECTED");
    });

    it("rejects mutating requests without the CSRF header", async () => {
      const sidAgent = request.agent(app.getHttpServer());
      const login = await sidAgent.post("/api/v1/auth/login").send({
        email: USER_A_EMAIL,
        password: USER_A_PASSWORD,
        organizationId: ORG_A,
      });
      expect(login.status).toBe(200);
      expect(extractCookieValue(login.headers["set-cookie"], CSRF_COOKIE_NAME)).toEqual(
        expect.any(String),
      );

      const response = await sidAgent.post("/api/v1/clients").send({ name: "No Csrf Header" });
      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe("CSRF_REJECTED");
    });

    it("reads a matter from the same organization", async () => {
      const response = await agent.get(`/api/v1/matters/${MATTER_A.id}`);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        id: MATTER_A.id,
        organizationId: ORG_A,
        title: MATTER_A.title,
        clientId: null,
        workspaceId: null,
        status: "active",
      });
    });

    it("does not reveal a matter from another organization", async () => {
      const missing = await agent.get(
        "/api/v1/matters/00000000-0000-4000-8000-000000000099",
      );
      const foreign = await agent.get(`/api/v1/matters/${MATTER_B.id}`);

      expect(foreign.status).toBe(404);
      expect(foreign.body.error.code).toBe("NOT_FOUND");
      expect(foreign.body.error.message).toBe(missing.body.error.message);
      expect(JSON.stringify(foreign.body)).not.toContain(MATTER_B.title);
      expect(JSON.stringify(foreign.body)).not.toContain(MATTER_B.organizationId);
    });

    it("returns the session actor from GET /auth/me", async () => {
      const response = await agent.get("/api/v1/auth/me");

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        user: { id: USER_A, email: USER_A_EMAIL },
        organization: { id: ORG_A, role: "owner" },
      });
    });

    it("ignores a client-supplied organizationId header for matters", async () => {
      const response = await agent
        .get(`/api/v1/matters/${MATTER_B.id}`)
        .set("x-organization-id", ORG_B);

      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe("NOT_FOUND");
    });

    it("creates, lists, reads, and patches a client in the actor organization", async () => {
      const created = await agent.post("/api/v1/clients").send({ name: " Client Acme " });

      expect(created.status).toBe(201);
      expect(created.body).toMatchObject({
        organizationId: ORG_A,
        name: "Client Acme",
        status: "active",
      });
      expect(created.body.id).toEqual(expect.any(String));

      const listed = await agent.get("/api/v1/clients");
      expect(listed.status).toBe(200);
      expect(listed.body.items).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: created.body.id, name: "Client Acme" }),
        ]),
      );
      expect(listed.body.items.every((row: { organizationId: string }) => row.organizationId === ORG_A)).toBe(
        true,
      );
      expect(JSON.stringify(listed.body)).not.toContain(CLIENT_B.name);

      const read = await agent.get(`/api/v1/clients/${created.body.id}`);
      expect(read.status).toBe(200);
      expect(read.body).toEqual(created.body);

      const patched = await agent
        .patch(`/api/v1/clients/${created.body.id}`)
        .send({ name: "Client Acme Renamed", status: "archived" });
      expect(patched.status).toBe(200);
      expect(patched.body).toMatchObject({
        id: created.body.id,
        name: "Client Acme Renamed",
        status: "archived",
      });
    });

    it("does not reveal a client from another organization", async () => {
      const missing = await agent.get(
        "/api/v1/clients/00000000-0000-4000-8000-000000000099",
      );
      const foreign = await agent.get(`/api/v1/clients/${CLIENT_B.id}`);

      expect(foreign.status).toBe(404);
      expect(foreign.body.error.code).toBe("NOT_FOUND");
      expect(foreign.body.error.message).toBe(missing.body.error.message);
      expect(JSON.stringify(foreign.body)).not.toContain(CLIENT_B.name);
    });

    it("rejects patch of a foreign client and ignores body organizationId", async () => {
      const foreign = await agent
        .patch(`/api/v1/clients/${CLIENT_B.id}`)
        .send({ name: "hijack", organizationId: ORG_B });

      expect(foreign.status).toBe(404);
      expect(foreign.body.error.code).toBe("NOT_FOUND");
    });

    it("creates and patches a matter; rejects foreign clientId", async () => {
      const client = await agent.post("/api/v1/clients").send({ name: "Matter Client" });
      expect(client.status).toBe(201);

      const created = await agent.post("/api/v1/matters").send({
        title: " New Matter ",
        clientId: client.body.id,
      });
      expect(created.status).toBe(201);
      expect(created.body).toMatchObject({
        organizationId: ORG_A,
        title: "New Matter",
        clientId: client.body.id,
        workspaceId: null,
        status: "active",
      });

      const listed = await agent.get("/api/v1/matters");
      expect(listed.status).toBe(200);
      expect(listed.body.items).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: created.body.id, title: "New Matter" }),
          expect.objectContaining({ id: MATTER_A.id }),
        ]),
      );
      expect(JSON.stringify(listed.body)).not.toContain(MATTER_B.title);

      const patched = await agent
        .patch(`/api/v1/matters/${created.body.id}`)
        .send({ title: "Renamed Matter", status: "archived" });
      expect(patched.status).toBe(200);
      expect(patched.body).toMatchObject({
        id: created.body.id,
        title: "Renamed Matter",
        status: "archived",
      });

      const foreignClient = await agent.post("/api/v1/matters").send({
        title: "Should fail",
        clientId: CLIENT_B.id,
      });
      expect(foreignClient.status).toBe(422);
      expect(foreignClient.body.error.code).toBe("VALIDATION_ERROR");

      const foreignPatch = await agent
        .patch(`/api/v1/matters/${MATTER_B.id}`)
        .send({ title: "hijack" });
      expect(foreignPatch.status).toBe(404);
      expect(foreignPatch.body.error.code).toBe("NOT_FOUND");
    });

    it("rejects invalid client and matter bodies", async () => {
      const badClient = await agent.post("/api/v1/clients").send({ name: "" });
      expect(badClient.status).toBe(422);

      const badMatter = await agent.post("/api/v1/matters").send({ title: "" });
      expect(badMatter.status).toBe(422);

      const emptyPatch = await agent.patch(`/api/v1/matters/${MATTER_A.id}`).send({});
      expect(emptyPatch.status).toBe(422);
    });

    it("creates PERSONAL and TEAM workspaces, lists owned, patches; rejects bad visibility and foreign id", async () => {
      const created = await agent.post("/api/v1/workspaces").send({
        name: " My Desk ",
        description: "personal notes",
      });
      expect(created.status).toBe(201);
      expect(created.body).toMatchObject({
        organizationId: ORG_A,
        ownerUserId: USER_A,
        name: "My Desk",
        description: "personal notes",
        visibility: "PERSONAL",
        status: "ACTIVE",
        clientId: null,
      });
      expect(created.body.id).toEqual(expect.any(String));

      const teamCreate = await agent.post("/api/v1/workspaces").send({
        name: "Team Desk",
        visibility: "TEAM",
      });
      expect(teamCreate.status).toBe(201);
      expect(teamCreate.body).toMatchObject({
        name: "Team Desk",
        visibility: "TEAM",
        ownerUserId: USER_A,
        organizationId: ORG_A,
      });

      const badVisibility = await agent.post("/api/v1/workspaces").send({
        name: "Nope",
        visibility: "PUBLIC",
      });
      expect(badVisibility.status).toBe(422);
      expect(badVisibility.body.error.code).toBe("VALIDATION_ERROR");

      const listed = await agent.get("/api/v1/workspaces");
      expect(listed.status).toBe(200);
      expect(listed.body.items).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: created.body.id, name: "My Desk" }),
          expect.objectContaining({ id: TEAM_WORKSPACE_A, visibility: "TEAM" }),
        ]),
      );
      expect(JSON.stringify(listed.body)).not.toContain("seed-team-b");
      expect(JSON.stringify(listed.body)).not.toContain(TEAM_WORKSPACE_B);

      const read = await agent.get(`/api/v1/workspaces/${created.body.id}`);
      expect(read.status).toBe(200);
      expect(read.body).toEqual(created.body);

      const patched = await agent
        .patch(`/api/v1/workspaces/${created.body.id}`)
        .send({ name: "Desk Renamed" });
      expect(patched.status).toBe(200);
      expect(patched.body).toMatchObject({
        id: created.body.id,
        name: "Desk Renamed",
      });

      const missing = await agent.get(
        "/api/v1/workspaces/00000000-0000-4000-8000-000000000099",
      );
      const foreign = await agent.get(`/api/v1/workspaces/${TEAM_WORKSPACE_B}`);
      expect(foreign.status).toBe(404);
      expect(foreign.body.error.code).toBe("NOT_FOUND");
      expect(foreign.body.error.message).toBe(missing.body.error.message);
      expect(JSON.stringify(foreign.body)).not.toContain("seed-team-b");

      const foreignPatch = await agent
        .patch(`/api/v1/workspaces/${TEAM_WORKSPACE_B}`)
        .send({ name: "hijack" });
      expect(foreignPatch.status).toBe(404);

      const foreignClient = await agent.post("/api/v1/workspaces").send({
        name: "Bad client",
        clientId: CLIENT_B.id,
      });
      expect(foreignClient.status).toBe(422);
      expect(foreignClient.body.error.code).toBe("VALIDATION_ERROR");
    });

    it("manages TEAM members and matter links; denies foreign matter and PERSONAL members", async () => {
      const membersBefore = await agent.get(
        `/api/v1/workspaces/${TEAM_WORKSPACE_A}/members`,
      );
      expect(membersBefore.status).toBe(200);
      expect(membersBefore.body.items).toEqual([]);

      const added = await agent
        .post(`/api/v1/workspaces/${TEAM_WORKSPACE_A}/members`)
        .send({ userId: USER_B, role: "EDITOR" });
      expect(added.status).toBe(201);
      expect(added.body).toMatchObject({
        organizationId: ORG_A,
        workspaceId: TEAM_WORKSPACE_A,
        userId: USER_B,
        role: "EDITOR",
        status: "ACTIVE",
      });

      const listed = await agent.get(`/api/v1/workspaces/${TEAM_WORKSPACE_A}/members`);
      expect(listed.status).toBe(200);
      expect(listed.body.items).toEqual(
        expect.arrayContaining([expect.objectContaining({ userId: USER_B, role: "EDITOR" })]),
      );

      const rolePatch = await agent
        .patch(`/api/v1/workspaces/${TEAM_WORKSPACE_A}/members/${USER_B}`)
        .send({ role: "VIEWER" });
      expect(rolePatch.status).toBe(200);
      expect(rolePatch.body).toMatchObject({ userId: USER_B, role: "VIEWER" });

      const ownerAsMember = await agent
        .post(`/api/v1/workspaces/${TEAM_WORKSPACE_A}/members`)
        .send({ userId: USER_A, role: "EDITOR" });
      expect(ownerAsMember.status).toBe(404);

      const personal = await agent.post("/api/v1/workspaces").send({ name: "No members" });
      expect(personal.status).toBe(201);
      const personalMember = await agent
        .post(`/api/v1/workspaces/${personal.body.id}/members`)
        .send({ userId: USER_B, role: "VIEWER" });
      expect(personalMember.status).toBe(404);

      const foreignMembers = await agent.get(
        `/api/v1/workspaces/${TEAM_WORKSPACE_B}/members`,
      );
      expect(foreignMembers.status).toBe(404);

      const linked = await agent
        .post(`/api/v1/workspaces/${TEAM_WORKSPACE_A}/matters`)
        .send({ matterId: MATTER_A.id });
      expect(linked.status).toBe(201);
      expect(linked.body).toEqual({ matterId: MATTER_A.id });

      const matters = await agent.get(`/api/v1/workspaces/${TEAM_WORKSPACE_A}/matters`);
      expect(matters.status).toBe(200);
      expect(matters.body.items).toEqual([{ matterId: MATTER_A.id }]);

      const foreignMatter = await agent
        .post(`/api/v1/workspaces/${TEAM_WORKSPACE_A}/matters`)
        .send({ matterId: MATTER_B.id });
      expect(foreignMatter.status).toBe(422);
      expect(foreignMatter.body.error.code).toBe("VALIDATION_ERROR");

      const missingMatterId = "00000000-0000-4000-8000-000000000099";
      const foreignWsKnownMatter = await agent
        .post(`/api/v1/workspaces/${TEAM_WORKSPACE_B}/matters`)
        .send({ matterId: MATTER_A.id });
      const foreignWsMissingMatter = await agent
        .post(`/api/v1/workspaces/${TEAM_WORKSPACE_B}/matters`)
        .send({ matterId: missingMatterId });
      expect(foreignWsKnownMatter.status).toBe(404);
      expect(foreignWsMissingMatter.status).toBe(404);
      expect(foreignWsKnownMatter.body.error.code).toBe("NOT_FOUND");
      expect(foreignWsKnownMatter.body.error.message).toBe(
        foreignWsMissingMatter.body.error.message,
      );

      const unlinked = await agent.delete(
        `/api/v1/workspaces/${TEAM_WORKSPACE_A}/matters/${MATTER_A.id}`,
      );
      expect(unlinked.status).toBe(200);
      expect(unlinked.body).toEqual({ ok: true });

      const revoked = await agent.delete(
        `/api/v1/workspaces/${TEAM_WORKSPACE_A}/members/${USER_B}`,
      );
      expect(revoked.status).toBe(200);
      expect(revoked.body).toMatchObject({ userId: USER_B, status: "REVOKED" });
    });

    it("lists org members and lets owner patch admin|member roles", async () => {
      const listed = await agent.get(`/api/v1/organizations/${ORG_A}/members`);
      expect(listed.status).toBe(200);
      expect(listed.body.items).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            userId: USER_A,
            email: USER_A_EMAIL,
            role: "owner",
            status: "active",
          }),
          expect.objectContaining({
            userId: USER_B,
            email: USER_B_EMAIL,
            role: "member",
            status: "active",
          }),
        ]),
      );
      expect(JSON.stringify(listed.body)).not.toContain(USER_ORG_B_EMAIL);
      expect(JSON.stringify(listed.body)).not.toContain("password");

      const foreign = await agent.get(`/api/v1/organizations/${ORG_B}/members`);
      expect(foreign.status).toBe(404);
      expect(foreign.body.error.code).toBe("NOT_FOUND");

      const promoted = await agent
        .patch(`/api/v1/organizations/${ORG_A}/members/${USER_B}`)
        .send({ role: "admin" });
      expect(promoted.status).toBe(200);
      expect(promoted.body).toMatchObject({
        userId: USER_B,
        role: "admin",
        status: "active",
      });

      const demoted = await agent
        .patch(`/api/v1/organizations/${ORG_A}/members/${USER_B}`)
        .send({ role: "member" });
      expect(demoted.status).toBe(200);
      expect(demoted.body).toMatchObject({ userId: USER_B, role: "member" });

      const ownerTarget = await agent
        .patch(`/api/v1/organizations/${ORG_A}/members/${USER_A}`)
        .send({ role: "admin" });
      expect(ownerTarget.status).toBe(422);

      const badRole = await agent
        .patch(`/api/v1/organizations/${ORG_A}/members/${USER_B}`)
        .send({ role: "owner" });
      expect(badRole.status).toBe(422);

      const foreignPatch = await agent
        .patch(`/api/v1/organizations/${ORG_B}/members/${USER_ORG_B}`)
        .send({ role: "admin" });
      expect(foreignPatch.status).toBe(404);
    });

    it("creates, accepts, and revokes org invitations; rejects owner role and foreign org", async () => {
      const inviteEmail = `invitee-${Date.now()}@localhost`;
      const created = await agent.post(`/api/v1/organizations/${ORG_A}/invitations`).send({
        email: inviteEmail,
        role: "member",
      });
      expect(created.status).toBe(201);
      expect(created.body).toMatchObject({
        organizationId: ORG_A,
        emailNormalized: inviteEmail,
        role: "member",
      });
      expect(created.body.devToken).toEqual(expect.any(String));
      expect(JSON.stringify(created.body)).not.toContain("tokenHash");

      const ownerRole = await agent.post(`/api/v1/organizations/${ORG_A}/invitations`).send({
        email: `owner-role-${Date.now()}@localhost`,
        role: "owner",
      });
      expect(ownerRole.status).toBe(422);

      const foreignOrg = await agent.post(`/api/v1/organizations/${ORG_B}/invitations`).send({
        email: `x-${Date.now()}@localhost`,
        role: "member",
      });
      expect(foreignOrg.status).toBe(404);

      const accepted = await request(app.getHttpServer())
        .post("/api/v1/invitations/accept")
        .send({
          token: created.body.devToken,
          password: "synthetic-invitee-password",
        });
      expect(accepted.status).toBe(200);
      expect(accepted.body).toMatchObject({
        organizationId: ORG_A,
        role: "member",
      });

      const replay = await request(app.getHttpServer())
        .post("/api/v1/invitations/accept")
        .send({
          token: created.body.devToken,
          password: "synthetic-invitee-password",
        });
      expect(replay.status).toBe(404);

      const pending = await agent.post(`/api/v1/organizations/${ORG_A}/invitations`).send({
        email: `revoke-${Date.now()}@localhost`,
        role: "admin",
      });
      expect(pending.status).toBe(201);
      const revokedInvite = await agent.delete(
        `/api/v1/organizations/${ORG_A}/invitations/${pending.body.id}`,
      );
      expect(revokedInvite.status).toBe(200);
      expect(revokedInvite.body.revokedAt).toEqual(expect.any(String));

      const acceptRevoked = await request(app.getHttpServer())
        .post("/api/v1/invitations/accept")
        .send({
          token: pending.body.devToken,
          password: "synthetic-invitee-password",
        });
      expect(acceptRevoked.status).toBe(404);
    });
  });

  describe("synthetic generation", () => {
    let app: INestApplication;

    beforeAll(async () => {
      app = await createApp();
    });

    afterAll(async () => {
      await app.close();
    });

    it("generates from synthetic input without calling fetch", async () => {
      const fetchSpy = vi.spyOn(globalThis, "fetch");
      const response = await request(app.getHttpServer())
        .post("/api/v1/ai/generate")
        .send({
          operationId: "op-1",
          dataClass: "synthetic",
          content: "synthetic-fixture",
        });

      expect(response.status).toBe(200);
      expect(response.body.providerId).toBe("synthetic");
      expect(response.body.synthetic).toBe(true);
      expect(response.body.text).toBe("synthetic:op-1:17");
      expect(response.body.text).not.toContain("synthetic-fixture");
      expect(fetchSpy).not.toHaveBeenCalled();
      fetchSpy.mockRestore();
    });

    it("blocks a non-synthetic data class", async () => {
      const fetchSpy = vi.spyOn(globalThis, "fetch");
      const response = await request(app.getHttpServer())
        .post("/api/v1/ai/generate")
        .send({
          operationId: "op-2",
          dataClass: "client_document",
          content: "not-for-external-transfer",
        });

      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe("AI_DATA_POLICY_BLOCKED");
      expect(JSON.stringify(response.body)).not.toContain("not-for-external-transfer");
      expect(fetchSpy).not.toHaveBeenCalled();
      fetchSpy.mockRestore();
    });

    it("rejects an incomplete generate body", async () => {
      const response = await request(app.getHttpServer())
        .post("/api/v1/ai/generate")
        .send({ dataClass: "synthetic" });

      expect(response.status).toBe(422);
      expect(response.body.error.code).toBe("VALIDATION_ERROR");
    });
  });
});
