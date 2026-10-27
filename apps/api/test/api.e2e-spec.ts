import "reflect-metadata";
import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { AppModule } from "../src/app.module.js";
import { ACTOR_CONTEXT, type ActorContext } from "../src/auth/actor-context.js";
import { ORG_A, SYNTHETIC_MATTERS, USER_A } from "../src/matters/synthetic-matters.js";

const matterA = SYNTHETIC_MATTERS[0];
const matterB = SYNTHETIC_MATTERS[1];

if (!matterA || !matterB) {
  throw new Error("Synthetic matter fixtures are missing");
}

async function createApp(actor: ActorContext | null): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideProvider(ACTOR_CONTEXT)
    .useValue(actor)
    .compile();

  const app = moduleRef.createNestApplication({ logger: false });
  app.setGlobalPrefix("api/v1");
  await app.init();
  return app;
}

describe("API scaffold", () => {
  describe("without an authenticated actor", () => {
    let app: INestApplication;

    beforeAll(async () => {
      app = await createApp(null);
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

    it("hides matters until the server has an actor", async () => {
      const response = await request(app.getHttpServer()).get(
        `/api/v1/matters/${matterA.id}`,
      );

      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe("UNAUTHENTICATED");
      expect(response.body.error.requestId).toEqual(expect.any(String));
      expect(JSON.stringify(response.body)).not.toContain(matterA.title);
    });
  });

  describe("actor in organization A", () => {
    let app: INestApplication;

    beforeAll(async () => {
      app = await createApp({ organizationId: ORG_A, userId: USER_A });
    });

    afterAll(async () => {
      await app.close();
    });

    it("reads a matter from the same organization", async () => {
      const response = await request(app.getHttpServer()).get(
        `/api/v1/matters/${matterA.id}`,
      );

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        id: matterA.id,
        organizationId: ORG_A,
        title: matterA.title,
        clientId: null,
        workspaceId: null,
      });
    });

    it("does not reveal a matter from another organization", async () => {
      const missing = await request(app.getHttpServer()).get(
        "/api/v1/matters/00000000-0000-4000-8000-000000000099",
      );
      const foreign = await request(app.getHttpServer()).get(
        `/api/v1/matters/${matterB.id}`,
      );

      expect(foreign.status).toBe(404);
      expect(foreign.body.error.code).toBe("NOT_FOUND");
      expect(foreign.body.error.message).toBe(missing.body.error.message);
      expect(JSON.stringify(foreign.body)).not.toContain(matterB.title);
      expect(JSON.stringify(foreign.body)).not.toContain(matterB.organizationId);
    });
  });

  describe("synthetic generation", () => {
    let app: INestApplication;

    beforeAll(async () => {
      app = await createApp(null);
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
