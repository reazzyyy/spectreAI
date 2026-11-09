import { ClientDetail } from "@/widgets/client-detail";

type ClientDetailPageProps = {
  params: Promise<{ clientId: string }>;
};

/** Authenticated Client card + edit (F5e). */
export default async function ClientDetailPage({
  params,
}: ClientDetailPageProps) {
  const { clientId } = await params;
  return <ClientDetail clientId={clientId} />;
}
