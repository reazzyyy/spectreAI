import { z } from "zod";

/** Client PATCH payload — aligned with PATCH /workspaces/:id. */
export const editWorkspaceSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Введите название проекта.")
    .max(160, "Название не длиннее 160 символов."),
  description: z.string().max(2000, "Описание не длиннее 2000 символов."),
});

export type EditWorkspaceFormValues = z.infer<typeof editWorkspaceSchema>;
