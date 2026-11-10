import { useApp, type ProjectTab } from "../app-context"
import { visLabel, type Project } from "../data/projects"
import { ProjectMenu } from "./ProjectMenu"
import { Badge, Button, Icon } from "./ui"
import { useWorkspace } from "../workspace-context"
import { useLegalWork } from "../legal-work-context"

const tabs: { id: ProjectTab; label: string }[] = [
  { id: "chats", label: "Чаты" },
  { id: "docs", label: "Документы" },
  { id: "research", label: "Исследования" },
  { id: "drafts", label: "Черновики" },
]

export function ProjectBar({
  project,
  tab,
}: {
  project: Project
  tab: ProjectTab
}) {
  const ctx = useApp()
  const ws = useWorkspace()
  const work = useLegalWork()
  const counts: Partial<Record<ProjectTab, number>> = {
    docs: ws.materials.filter(
      (m) => m.projectId === project.id && m.stage !== "forbidden",
    ).length,
    chats: ws.conversations.filter((c) => c.projectId === project.id).length,
    drafts: work.drafts.filter((d) => d.projectId === project.id).length,
    research: work.researches.filter((r) => r.projectId === project.id).length,
  }
  return (
    <div className="project-bar">
      <div className="project-bar-top">
        <button
          className="project-switch"
          onClick={ctx.openPalette}
          title="Перейти в другой проект (Ctrl K)"
        >
          <strong>{project.name}</strong>
          <Icon name="down" size={16} />
        </button>
        <span className="kind">{visLabel(project)}</span>
        {project.status === "archived" && <Badge>Архив</Badge>}
        {project.status === "deleting" && (
          <Badge tone="warning">Удаляется</Badge>
        )}
        {project.status === "restricted" && <Badge tone="warning">Ограничен · нет OWNER</Badge>}
        {project.role === "viewer" && <Badge tone="info">Просмотр</Badge>}
        <span className="spacer" />
        <Button icon="layers" variant="ghost" onClick={() => ctx.go("audit", project.id)}>Аудит</Button>
        <Button icon="users" variant="ghost" onClick={() => ctx.openMembers(project.id)}>{project.visibility === "personal" ? "Доступ" : `Участники · ${project.memberCount}`}</Button>
        <ProjectMenu
          project={project}
          onAction={(a) => ctx.manage(project, a)}
        />
      </div>
      <div className="tabs project-tabs" role="tablist">
        {tabs.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            className={tab === t.id ? "active" : ""}
            onClick={() => ctx.openProject(project.id, t.id)}
          >
            {t.label}
            {counts[t.id] !== undefined && (
              <span className="tab-count">{counts[t.id]}</span>
            )}
          </button>
        ))}
      </div>
      {ctx.readOnly.is && (
        <p className="readonly-note">
          <Icon name="lock" size={14} />
          {ctx.readOnly.reason}
        </p>
      )}
    </div>
  )
}
