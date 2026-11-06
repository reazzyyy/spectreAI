import { WorkspaceDetail } from "@/widgets/workspace-detail";

type ProjectsDetailPageProps = {
  params: Promise<{ workspaceId: string }>;
};

/** Authenticated workspace card + edit (F5b). */
export default async function ProjectsDetailPage({
  params,
}: ProjectsDetailPageProps) {
  const { workspaceId } = await params;
  return <WorkspaceDetail workspaceId={workspaceId} />;
}
