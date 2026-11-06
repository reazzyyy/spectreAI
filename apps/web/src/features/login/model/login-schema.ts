import { z } from "zod";

/** Client login payload — must stay aligned with POST /auth/login. */
export const loginSchema = z.object({
  email: z.email("Укажите корректный email."),
  password: z.string().min(1, "Введите пароль."),
  organizationId: z.uuid("Укажите UUID организации."),
});

export type LoginFormValues = z.infer<typeof loginSchema>;
