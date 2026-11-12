-- Phase 5B: ContextSnapshot / ContextSnapshotItem / MessageSource (conversation_only).
-- Provenance refs only — no full prompt/document text. CTX-* journal statuses unchanged.

CREATE TYPE "context_snapshot_item_type" AS ENUM (
  'conversation_message',
  'document_chunk',
  'legal_evidence',
  'workspace_instruction',
  'organization_instruction',
  'tool_result',
  'summary'
);

CREATE TYPE "message_source_type" AS ENUM (
  'conversation_message',
  'document',
  'document_chunk',
  'legal',
  'synthetic'
);

CREATE TABLE "context_snapshots" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "conversation_id" UUID NOT NULL,
    "ai_generation_id" UUID NOT NULL,
    "ai_job_id" UUID,
    "context_mode" TEXT NOT NULL DEFAULT 'conversation_only',
    "context_manifest" JSONB NOT NULL,
    "context_hash" TEXT,
    "prompt_version" TEXT,
    "provider_id" TEXT,
    "model_id" TEXT,
    "input_token_estimate" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "context_snapshots_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "context_snapshots_ai_generation_id_key"
  ON "context_snapshots"("ai_generation_id");
CREATE UNIQUE INDEX "context_snapshots_organization_id_id_key"
  ON "context_snapshots"("organization_id", "id");
CREATE INDEX "context_snapshots_organization_id_conversation_id_created_at_idx"
  ON "context_snapshots"("organization_id", "conversation_id", "created_at");

ALTER TABLE "context_snapshots" ADD CONSTRAINT "context_snapshots_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "context_snapshots" ADD CONSTRAINT "context_snapshots_organization_id_workspace_id_fkey"
  FOREIGN KEY ("organization_id", "workspace_id") REFERENCES "workspaces"("organization_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "context_snapshots" ADD CONSTRAINT "context_snapshots_organization_id_conversation_id_fkey"
  FOREIGN KEY ("organization_id", "conversation_id") REFERENCES "conversations"("organization_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "context_snapshots" ADD CONSTRAINT "context_snapshots_ai_generation_id_fkey"
  FOREIGN KEY ("ai_generation_id") REFERENCES "ai_generations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ai_generations" ADD COLUMN "context_snapshot_id" UUID;
CREATE UNIQUE INDEX "ai_generations_context_snapshot_id_key"
  ON "ai_generations"("context_snapshot_id");
ALTER TABLE "ai_generations" ADD CONSTRAINT "ai_generations_context_snapshot_id_fkey"
  FOREIGN KEY ("context_snapshot_id") REFERENCES "context_snapshots"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "context_snapshot_items" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "context_snapshot_id" UUID NOT NULL,
    "ordinal" INTEGER NOT NULL,
    "item_type" "context_snapshot_item_type" NOT NULL,
    "source_entity_type" TEXT NOT NULL,
    "source_entity_id" UUID NOT NULL,
    "source_version_id" UUID,
    "content_hash" TEXT,
    "source_locator" JSONB,
    "included_token_estimate" INTEGER,
    "citation_key" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "context_snapshot_items_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "context_snapshot_items_organization_id_id_key"
  ON "context_snapshot_items"("organization_id", "id");
CREATE UNIQUE INDEX "context_snapshot_items_context_snapshot_id_ordinal_key"
  ON "context_snapshot_items"("context_snapshot_id", "ordinal");
CREATE INDEX "context_snapshot_items_organization_id_context_snapshot_id_idx"
  ON "context_snapshot_items"("organization_id", "context_snapshot_id");

ALTER TABLE "context_snapshot_items" ADD CONSTRAINT "context_snapshot_items_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "context_snapshot_items" ADD CONSTRAINT "context_snapshot_items_context_snapshot_id_fkey"
  FOREIGN KEY ("context_snapshot_id") REFERENCES "context_snapshots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "message_sources" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "message_id" UUID NOT NULL,
    "context_snapshot_item_id" UUID NOT NULL,
    "citation_key" TEXT NOT NULL,
    "rank" INTEGER NOT NULL,
    "source_type" "message_source_type" NOT NULL,
    "page_start" INTEGER,
    "page_end" INTEGER,
    "quote_locator" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "message_sources_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "message_sources_organization_id_id_key"
  ON "message_sources"("organization_id", "id");
CREATE UNIQUE INDEX "message_sources_message_id_citation_key_key"
  ON "message_sources"("message_id", "citation_key");
CREATE INDEX "message_sources_organization_id_message_id_idx"
  ON "message_sources"("organization_id", "message_id");

ALTER TABLE "message_sources" ADD CONSTRAINT "message_sources_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "message_sources" ADD CONSTRAINT "message_sources_organization_id_message_id_fkey"
  FOREIGN KEY ("organization_id", "message_id") REFERENCES "messages"("organization_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "message_sources" ADD CONSTRAINT "message_sources_context_snapshot_item_id_fkey"
  FOREIGN KEY ("context_snapshot_item_id") REFERENCES "context_snapshot_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "context_snapshots" TO spectre_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "context_snapshot_items" TO spectre_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "message_sources" TO spectre_app;

-- Inherit Conversation ACL via parent conversation EXISTS (same pattern as messages).
ALTER TABLE "context_snapshots" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "context_snapshots" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS context_snapshots_chat_isolation ON "context_snapshots";
CREATE POLICY context_snapshots_chat_isolation ON "context_snapshots"
  FOR ALL
  USING (
    "organization_id" = NULLIF(current_setting('app.current_organization_id', true), '')::uuid
    AND EXISTS (
      SELECT 1 FROM "conversations" c
      WHERE c.id = "context_snapshots"."conversation_id"
        AND c.organization_id = "context_snapshots"."organization_id"
    )
  )
  WITH CHECK (
    "organization_id" = NULLIF(current_setting('app.current_organization_id', true), '')::uuid
    AND EXISTS (
      SELECT 1 FROM "conversations" c
      WHERE c.id = "context_snapshots"."conversation_id"
        AND c.organization_id = "context_snapshots"."organization_id"
    )
  );

ALTER TABLE "context_snapshot_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "context_snapshot_items" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS context_snapshot_items_chat_isolation ON "context_snapshot_items";
CREATE POLICY context_snapshot_items_chat_isolation ON "context_snapshot_items"
  FOR ALL
  USING (
    "organization_id" = NULLIF(current_setting('app.current_organization_id', true), '')::uuid
    AND EXISTS (
      SELECT 1 FROM "context_snapshots" s
      WHERE s.id = "context_snapshot_items"."context_snapshot_id"
        AND s.organization_id = "context_snapshot_items"."organization_id"
    )
  )
  WITH CHECK (
    "organization_id" = NULLIF(current_setting('app.current_organization_id', true), '')::uuid
    AND EXISTS (
      SELECT 1 FROM "context_snapshots" s
      WHERE s.id = "context_snapshot_items"."context_snapshot_id"
        AND s.organization_id = "context_snapshot_items"."organization_id"
    )
  );

ALTER TABLE "message_sources" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "message_sources" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS message_sources_chat_isolation ON "message_sources";
CREATE POLICY message_sources_chat_isolation ON "message_sources"
  FOR ALL
  USING (
    "organization_id" = NULLIF(current_setting('app.current_organization_id', true), '')::uuid
    AND EXISTS (
      SELECT 1 FROM "messages" m
      WHERE m.id = "message_sources"."message_id"
        AND m.organization_id = "message_sources"."organization_id"
    )
  )
  WITH CHECK (
    "organization_id" = NULLIF(current_setting('app.current_organization_id', true), '')::uuid
    AND EXISTS (
      SELECT 1 FROM "messages" m
      WHERE m.id = "message_sources"."message_id"
        AND m.organization_id = "message_sources"."organization_id"
    )
  );
