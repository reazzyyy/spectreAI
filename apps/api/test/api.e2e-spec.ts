import "reflect-metadata";
import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { createPrismaClient } from "@spectre/db";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { AppModule } from "../src/app.module.js";
import { hashPassword } from "../src/auth/password.js";
import { applyHttpMiddleware } from "../src/http/apply-http-middleware.js";
import {
  CLIENT_B,
  MATTER_A,
  MATTER_B,
  MEMBERSHIP_A,
  ORG_A,
  ORG_B,
  USER_A,
  USER_A_EMAIL,
  USER_A_PASSWORD,
} from "./matter-fixtures.js";

async function seedFixtures(): Promise<void> {
  const prisma = createPrismaClient();
  try {
    await prisma.session.deleteMany({
      where: { userId: USER_A },
    });
    await prisma.organizationMembership.deleteMany({
      where: { id: MEMBERSHIP_A },
    });
    await prisma.user.deleteMany({
      where: { id: USER_A },
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

    const passwordHash = await hashPassword(USER_A_PASSWORD);
    await prisma.user.create({
      data: {
        id: USER_A,
        email: USER_A_EMAIL,
        passwordHash,
        status: "active",
      },
    });
    await prisma.organizationMembership.create({
      data: {
        id: MEMBERSHIP_A,
        organizationId: ORG_A,
        userId: USER_A,
        role: "member",
        status: "active",
      },
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
        organization: { id: ORG_A, role: "member" },
      });
      expect(JSON.stringify(login.body)).not.toContain(USER_A_PASSWORD);
      const setCookie = login.headers["set-cookie"];
      const cookieHeader = Array.isArray(setCookie)
        ? setCookie.join(";")
        : (setCookie ?? "");
      expect(cookieHeader).toContain("spectre_sid=");
    });

    afterAll(async () => {
      await app.close();
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
        organization: { id: ORG_A, role: "member" },
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
