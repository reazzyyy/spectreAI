import { AcceptInvitationForm } from "@/features/accept-invitation";
import { SyntheticModeBanner } from "@/shared/ui";

type AcceptInvitePageProps = {
  searchParams: Promise<{ token?: string | string[] }>;
};

/** Public accept-invite (no product shell). Token may come from `?token=`. */
export default async function AcceptInvitePage({
  searchParams,
}: AcceptInvitePageProps) {
  const params = await searchParams;
  const raw = params.token;
  const initialToken = typeof raw === "string" ? raw : "";

  return (
    <main className="page-main">
      <SyntheticModeBanner />
      <h1>Принять приглашение</h1>
      <p className="lead">
        Новый пользователь задаёт пароль (≥12). Существующий — сначала входит, затем
        принимает токен без пароля.
      </p>
      <AcceptInvitationForm initialToken={initialToken} />
    </main>
  );
}
