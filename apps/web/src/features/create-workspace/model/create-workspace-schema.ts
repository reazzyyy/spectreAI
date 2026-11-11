import { z } from "zod";

/** Client create payload — aligned with POST /workspaces + optional matter link. */
export const createWorkspaceSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Введите название проекта.")
    .max(160, "Название не длиннее 160 символов."),
  description: z
    .string()
    .max(2000, "Описание не длиннее 2000 символов.")
    .optional(),
  visibility: z.enum(["PERSONAL", "TEAM"]),
  /** Optional Client UUID (POST /workspaces.clientId). */
  clientId: z.string().uuid().optional().or(z.literal("")),
  /** Optional Matter UUID — linked after create via POST …/matters. */
  matterId: z.string().uuid().optional().or(z.literal("")),
});

export type CreateWorkspaceFormValues = z.infer<typeof createWorkspaceSchema>;
