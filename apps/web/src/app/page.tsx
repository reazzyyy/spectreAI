import { SyntheticModeBanner } from "@/shared/ui";
import { SessionPanel } from "@/widgets/session-panel";

export default function HomePage() {
  return (
    <main>
      <SyntheticModeBanner />
      <h1>НейроЮрист Спектр</h1>
      <p className="lead">
        Каркас интерфейса: вход по cookie-сессии. Рабочие пространства появятся после
        ворот A.
      </p>
      <SessionPanel />
    </main>
  );
}
