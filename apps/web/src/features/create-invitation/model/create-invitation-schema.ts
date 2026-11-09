import { z } from "zod";

/** Invite create — aligned with POST …/invitations (S4c). */
export const createInvitationSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, "Введите email.")
    .max(320, "Email слишком длинный.")
    .email("Некорректный email."),
  role: z.enum(["admin", "member"]),
});

export type CreateInvitationFormValues = z.infer<typeof createInvitationSchema>;
