import { z } from "zod";

/** Client PATCH payload — name + status. */
export const editClientSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Введите название клиента.")
    .max(200, "Название не длиннее 200 символов."),
  status: z.enum(["active", "archived"]),
});

export type EditClientFormValues = z.infer<typeof editClientSchema>;
