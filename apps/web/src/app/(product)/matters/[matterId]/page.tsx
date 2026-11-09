import { MatterDetail } from "@/widgets/matter-detail";

type MatterDetailPageProps = {
  params: Promise<{ matterId: string }>;
};

/** Authenticated Matter card + edit (F5d). */
export default async function MatterDetailPage({
  params,
}: MatterDetailPageProps) {
  const { matterId } = await params;
  return <MatterDetail matterId={matterId} />;
}
