import { z } from "zod";

/** Client create payload — aligned with POST /matters (title only in F5d). */
export const createMatterSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, "Введите название дела.")
    .max(200, "Название не длиннее 200 символов."),
});

export type CreateMatterFormValues = z.infer<typeof createMatterSchema>;
