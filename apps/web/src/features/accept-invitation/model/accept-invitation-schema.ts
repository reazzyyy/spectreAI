import { z } from "zod";

/** Accept invite — aligned with POST /invitations/accept (S4c). */
export const acceptInvitationSchema = z
  .object({
    token: z
      .string()
      .trim()
      .min(16, "Вставьте полный токен приглашения."),
    password: z.string(),
  })
  .superRefine((values, ctx) => {
    if (values.password.length === 0) {
      return;
    }
    if (values.password.length < 12) {
      ctx.addIssue({
        code: "custom",
        path: ["password"],
        message: "Пароль не короче 12 символов.",
      });
    }
  });

export type AcceptInvitationFormValues = z.infer<typeof acceptInvitationSchema>;
