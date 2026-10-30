import { LoginForm } from "@/features/login";
import { SyntheticModeBanner } from "@/shared/ui";

export default function LoginPage() {
  return (
    <main>
      <SyntheticModeBanner />
      <h1>Вход</h1>
      <p className="lead">
        Сессия создаётся через существующий API. Регистрация и восстановление пароля
        в этот срез не входят.
      </p>
      <LoginForm />
    </main>
  );
}
