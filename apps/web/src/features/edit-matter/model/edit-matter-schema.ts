import { z } from "zod";

/** Client PATCH payload — title, status, optional client link (F5f). */
export const editMatterSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, "Введите название дела.")
    .max(200, "Название не длиннее 200 символов."),
  status: z.enum(["active", "archived"]),
  /** Empty string clears clientId; otherwise UUID. */
  clientId: z.union([z.literal(""), z.uuid("Укажите корректный UUID клиента.")]),
});

export type EditMatterFormValues = z.infer<typeof editMatterSchema>;
