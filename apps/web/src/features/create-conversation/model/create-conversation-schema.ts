import { z } from "zod";

/** Create conversation form (W-007 PRIVATE|WORKSPACE). */
export const createConversationSchema = z.object({
  visibility: z.enum(["PRIVATE", "WORKSPACE"]),
  title: z.string().trim().max(200),
});

export type CreateConversationFormValues = z.infer<
  typeof createConversationSchema
>;
