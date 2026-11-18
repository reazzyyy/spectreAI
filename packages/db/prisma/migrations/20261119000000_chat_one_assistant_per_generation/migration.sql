-- One assistant message per generation. Refuses to apply if duplicates already exist.
-- Does not delete or rewrite rows.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "messages"
    WHERE "generation_id" IS NOT NULL
      AND "role" = 'assistant'
    GROUP BY "generation_id"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'duplicate assistant messages for one generation; unique index not applied';
  END IF;
END $$;

CREATE UNIQUE INDEX "messages_one_assistant_per_generation"
  ON "messages" ("generation_id")
  WHERE "generation_id" IS NOT NULL AND "role" = 'assistant';
