import { z } from "zod";

/** Client create payload — aligned with POST /clients. */
export const createClientSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Введите название клиента.")
    .max(200, "Название не длиннее 200 символов."),
});

export type CreateClientFormValues = z.infer<typeof createClientSchema>;
