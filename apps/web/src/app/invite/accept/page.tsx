import { AcceptInvitationForm } from "@/features/accept-invitation";
import { AuthLayout } from "@/widgets/auth-layout";

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
    <AuthLayout title="Принять приглашение" cardEyebrow="Вход по приглашению">
      <AcceptInvitationForm initialToken={initialToken} />
    </AuthLayout>
  );
}
