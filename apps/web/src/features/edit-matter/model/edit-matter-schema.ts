import { z } from "zod";

/** Client PATCH payload — title + status (CRM thin). */
export const editMatterSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, "Введите название дела.")
    .max(200, "Название не длиннее 200 символов."),
  status: z.enum(["active", "archived"]),
});

export type EditMatterFormValues = z.infer<typeof editMatterSchema>;
