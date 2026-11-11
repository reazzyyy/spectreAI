import { LoginForm } from "@/features/login";
import { AuthLayout } from "@/widgets/auth-layout";

export default function LoginPage() {
  return (
    <AuthLayout title="Войти в Спектр">
      <LoginForm />
    </AuthLayout>
  );
}
