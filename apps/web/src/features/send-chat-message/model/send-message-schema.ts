import { z } from "zod";

/** Composer body for POST /conversations/:id/messages. */
export const sendMessageSchema = z.object({
  content: z
    .string()
    .trim()
    .min(1, "Введите сообщение")
    .max(8000, "Слишком длинное сообщение"),
});

export type SendMessageFormValues = z.infer<typeof sendMessageSchema>;
