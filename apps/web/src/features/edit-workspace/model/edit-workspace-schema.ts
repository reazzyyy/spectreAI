import { z } from "zod";

/** Workspace PATCH — name/description + optional Client (WS-07 / F5f). */
export const editWorkspaceSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Введите название проекта.")
    .max(160, "Название не длиннее 160 символов."),
  description: z.string().max(2000, "Описание не длиннее 2000 символов."),
  /** Empty string clears clientId; otherwise UUID. */
  clientId: z.union([z.literal(""), z.uuid("Укажите корректный UUID клиента.")]),
});

export type EditWorkspaceFormValues = z.infer<typeof editWorkspaceSchema>;
