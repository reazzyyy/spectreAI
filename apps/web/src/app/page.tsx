import { SyntheticModeBanner } from "@/shared/ui";
import { SessionPanel } from "@/widgets/session-panel";

export default function HomePage() {
  return (
    <main>
      <SyntheticModeBanner />
      <h1>НейроЮрист Спектр</h1>
      <p className="lead">
        Каркас интерфейса: вход по cookie-сессии. API пространств уже есть; экраны Workspace
        ещё впереди.
      </p>
      <p className="lead">
        <a href="/system">Карта системы</a> — что уже работает, как устроены слои и куда
        едем (для тех, кто ближе к фронту).
      </p>
      <SessionPanel />
    </main>
  );
}
