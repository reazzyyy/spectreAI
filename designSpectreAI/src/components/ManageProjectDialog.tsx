import { useState } from "react"
import type { ManageAction } from "../app-context"
import type { Project } from "../data/projects"
import { Dialog } from "./Dialog"
import { Button } from "./ui"

export function ManageProjectDialog({
  project,
  action,
  onApply,
  onClose,
}: {
  project: Project
  action: Exclude<ManageAction, "delete">
  onApply: (patch: Partial<Project>) => void
  onClose: () => void
}) {
  const [name, setName] = useState(project.name)
  const title = {
    rename: "Переименовать проект",
    archive: "Архивировать проект",
    restore: "Восстановить проект",
  }[action]
  const valid =
    (action !== "rename" || name.trim().length > 0) &&
    project.role === "owner" &&
    (action === "restore"
      ? project.status === "archived"
      : project.status === "active")
  const apply = (e: React.FormEvent) => {
    e.preventDefault()
    if (
      !valid ||
      project.role !== "owner" ||
      (action !== "restore" && project.status !== "active")
    )
      return
    if (action === "rename") onApply({ name: name.trim() })
    if (action === "archive") onApply({ status: "archived" })
    if (action === "restore") onApply({ status: "active" })
  }
  return (
    <Dialog label={title} onClose={onClose}>
      <form onSubmit={apply}>
        <div className="dialog-head">
          <h2>{title}</h2>
        </div>
        <div className="dialog-body">
          {action === "rename" && (
            <div className="field">
              <label htmlFor="rn">Название</label>
              <input
                id="rn"
                data-autofocus
                maxLength={160}
                value={name}
                disabled={
                  project.role !== "owner" || project.status !== "active"
                }
                onChange={(e) => setName(e.target.value)}
              />
            </div>
          )}
          {action === "archive" && (
            <p>
              Проект «{project.name}» станет доступен только для чтения. Данные
              сохранятся, архив можно восстановить.
            </p>
          )}
          {action === "restore" && (
            <p>Проект «{project.name}» снова станет активным.</p>
          )}
          <p className="help">
            Демонстрация: изменения не сохраняются после перезагрузки.
          </p>
        </div>
        <div className="dialog-foot">
          <Button variant="ghost" onClick={onClose}>
            Отмена
          </Button>
          <button
            className="button primary"
            type="submit"
            disabled={!valid}
            data-autofocus={action !== "rename" ? true : undefined}
          >
            {title}
          </button>
        </div>
      </form>
    </Dialog>
  )
}
