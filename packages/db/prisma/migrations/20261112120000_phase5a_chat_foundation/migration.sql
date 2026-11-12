-- Phase 5A-1: Conversation / Message / AiGeneration + chat RLS (W-007 / W-020).
-- NestJS ConversationAccess remains mandatory; RLS is defense in depth.
-- ContextSnapshot / MessageSource / chat API / Outbox — later slices.

CREATE TYPE "conversation_visibility" AS ENUM ('PRIVATE', 'WORKSPACE');
CREATE TYPE "conversation_status" AS ENUM ('ACTIVE', 'ARCHIVED');
CREATE TYPE "message_role" AS ENUM ('user', 'assistant');
CREATE TYPE "ai_generation_status" AS ENUM (
  'queued',
  'running',
  'succeeded',
  'failed',
  'cancelled',
  'timed_out'
);

CREATE TABLE "conversations" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "owner_user_id" UUID NOT NULL,
    "created_by_user_id" UUID NOT NULL,
    "visibility" "conversation_visibility" NOT NULL,
    "title" TEXT,
    "status" "conversation_status" NOT NULL DEFAULT 'ACTIVE',
    "last_message_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "conversations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "conversations_organization_id_id_key"
  ON "conversations"("organization_id", "id");
CREATE INDEX "conversations_organization_id_workspace_id_last_message_at_id_idx"
  ON "conversations"("organization_id", "workspace_id", "last_message_at", "id");
CREATE INDEX "conversations_organization_id_owner_user_id_status_idx"
  ON "conversations"("organization_id", "owner_user_id", "status");

ALTER TABLE "conversations" ADD CONSTRAINT "conversations_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_organization_id_workspace_id_fkey"
  FOREIGN KEY ("organization_id", "workspace_id") REFERENCES "workspaces"("organization_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_owner_user_id_fkey"
  FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_created_by_user_id_fkey"
  FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "messages" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "conversation_id" UUID NOT NULL,
    "role" "message_role" NOT NULL,
    "content" TEXT NOT NULL,
    "created_by_user_id" UUID,
    "generation_id" UUID,
    "client_message_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "messages_organization_id_id_key"
  ON "messages"("organization_id", "id");
CREATE UNIQUE INDEX "messages_conversation_id_client_message_id_key"
  ON "messages"("conversation_id", "client_message_id");
CREATE INDEX "messages_organization_id_conversation_id_created_at_id_idx"
  ON "messages"("organization_id", "conversation_id", "created_at", "id");

ALTER TABLE "messages" ADD CONSTRAINT "messages_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "messages" ADD CONSTRAINT "messages_organization_id_conversation_id_fkey"
  FOREIGN KEY ("organization_id", "conversation_id") REFERENCES "conversations"("organization_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "messages" ADD CONSTRAINT "messages_created_by_user_id_fkey"
  FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "ai_generations" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "conversation_id" UUID NOT NULL,
    "user_message_id" UUID NOT NULL,
    "assistant_message_id" UUID,
    "generation_number" INTEGER NOT NULL DEFAULT 1,
    "status" "ai_generation_status" NOT NULL DEFAULT 'queued',
    "ai_job_id" UUID,
    "provider_id" TEXT,
    "model_id" TEXT,
    "prompt_version" TEXT,
    "input_hash" TEXT,
    "supersedes_generation_id" UUID,
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_generations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ai_generations_organization_id_id_key"
  ON "ai_generations"("organization_id", "id");
CREATE UNIQUE INDEX "ai_generations_ai_job_id_key"
  ON "ai_generations"("ai_job_id");
CREATE INDEX "ai_generations_organization_id_conversation_id_created_at_idx"
  ON "ai_generations"("organization_id", "conversation_id", "created_at");
CREATE INDEX "ai_generations_user_message_id_idx"
  ON "ai_generations"("user_message_id");

ALTER TABLE "ai_generations" ADD CONSTRAINT "ai_generations_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ai_generations" ADD CONSTRAINT "ai_generations_organization_id_conversation_id_fkey"
  FOREIGN KEY ("organization_id", "conversation_id") REFERENCES "conversations"("organization_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ai_generations" ADD CONSTRAINT "ai_generations_user_message_id_fkey"
  FOREIGN KEY ("user_message_id") REFERENCES "messages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ai_generations" ADD CONSTRAINT "ai_generations_assistant_message_id_fkey"
  FOREIGN KEY ("assistant_message_id") REFERENCES "messages"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ai_generations" ADD CONSTRAINT "ai_generations_ai_job_id_fkey"
  FOREIGN KEY ("ai_job_id") REFERENCES "ai_jobs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ai_generations" ADD CONSTRAINT "ai_generations_supersedes_generation_id_fkey"
  FOREIGN KEY ("supersedes_generation_id") REFERENCES "ai_generations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Close Message ↔ AiGeneration cycle after both tables exist.
ALTER TABLE "messages" ADD CONSTRAINT "messages_generation_id_fkey"
  FOREIGN KEY ("generation_id") REFERENCES "ai_generations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "conversations" TO spectre_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "messages" TO spectre_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "ai_generations" TO spectre_app;

-- Conversations: org + workspace access + PRIVATE owner / WORKSPACE shared.
ALTER TABLE "conversations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "conversations" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS conversations_chat_isolation ON "conversations";
CREATE POLICY conversations_chat_isolation ON "conversations"
  FOR ALL
  USING (
    "organization_id" = NULLIF(current_setting('app.current_organization_id', true), '')::uuid
    AND (
      EXISTS (
        SELECT 1 FROM "workspaces" w
        WHERE w.id = "conversations"."workspace_id"
          AND w.organization_id = "conversations"."organization_id"
          AND w.owner_user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
      )
      OR EXISTS (
        SELECT 1 FROM "workspace_members" m
        WHERE m.workspace_id = "conversations"."workspace_id"
          AND m.organization_id = "conversations"."organization_id"
          AND m.user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
          AND m.status = 'ACTIVE'
      )
    )
    AND (
      "visibility" = 'WORKSPACE'
      OR "owner_user_id" = NULLIF(current_setting('app.current_user_id', true), '')::uuid
    )
  )
  WITH CHECK (
    "organization_id" = NULLIF(current_setting('app.current_organization_id', true), '')::uuid
    AND (
      EXISTS (
        SELECT 1 FROM "workspaces" w
        WHERE w.id = "conversations"."workspace_id"
          AND w.organization_id = "conversations"."organization_id"
          AND w.owner_user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
      )
      OR EXISTS (
        SELECT 1 FROM "workspace_members" m
        WHERE m.workspace_id = "conversations"."workspace_id"
          AND m.organization_id = "conversations"."organization_id"
          AND m.user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
          AND m.status = 'ACTIVE'
      )
    )
    AND (
      "visibility" = 'WORKSPACE'
      OR "owner_user_id" = NULLIF(current_setting('app.current_user_id', true), '')::uuid
    )
  );

-- Messages / generations inherit Conversation ACL via parent row EXISTS.
ALTER TABLE "messages" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "messages" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS messages_chat_isolation ON "messages";
CREATE POLICY messages_chat_isolation ON "messages"
  FOR ALL
  USING (
    "organization_id" = NULLIF(current_setting('app.current_organization_id', true), '')::uuid
    AND EXISTS (
      SELECT 1 FROM "conversations" c
      WHERE c.id = "messages"."conversation_id"
        AND c.organization_id = "messages"."organization_id"
    )
  )
  WITH CHECK (
    "organization_id" = NULLIF(current_setting('app.current_organization_id', true), '')::uuid
    AND EXISTS (
      SELECT 1 FROM "conversations" c
      WHERE c.id = "messages"."conversation_id"
        AND c.organization_id = "messages"."organization_id"
    )
  );

ALTER TABLE "ai_generations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ai_generations" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ai_generations_chat_isolation ON "ai_generations";
CREATE POLICY ai_generations_chat_isolation ON "ai_generations"
  FOR ALL
  USING (
    "organization_id" = NULLIF(current_setting('app.current_organization_id', true), '')::uuid
    AND EXISTS (
      SELECT 1 FROM "conversations" c
      WHERE c.id = "ai_generations"."conversation_id"
        AND c.organization_id = "ai_generations"."organization_id"
    )
  )
  WITH CHECK (
    "organization_id" = NULLIF(current_setting('app.current_organization_id', true), '')::uuid
    AND EXISTS (
      SELECT 1 FROM "conversations" c
      WHERE c.id = "ai_generations"."conversation_id"
        AND c.organization_id = "ai_generations"."organization_id"
    )
  );
