import { useEffect, useRef, useState } from "react"
import type { ManageAction } from "../app-context"
import type { Project } from "../data/projects"
import { IconButton } from "./ui"

export function ProjectMenu({
  project,
  onAction,
}: {
  project: Project
  onAction: (a: ManageAction) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) =>
      !ref.current?.contains(e.target as Node) && setOpen(false)
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false)
    document.addEventListener("mousedown", close)
    document.addEventListener("keydown", esc)
    return () => {
      document.removeEventListener("mousedown", close)
      document.removeEventListener("keydown", esc)
    }
  }, [open])
  const active = project.status === "active"
  const owner = project.role === "owner"
  const canRename = active && owner
  const items: { a: ManageAction; label: string; ok: boolean; hint: string }[] = [
    {
      a: "rename",
      label: "Переименовать",
      ok: canRename,
      hint: "Нужна роль OWNER и активный проект",
    },
    project.status === "archived"
      ? {
          a: "restore",
          label: "Восстановить",
          ok: owner,
          hint: "Доступно владельцу",
        }
      : {
          a: "archive",
          label: "Архивировать",
          ok: active && owner,
          hint: "Доступно владельцу активного проекта",
        },
    {
      a: "delete",
      label: "Удалить проект",
      ok: owner && (active || project.status === "archived"),
      hint: "Только текущий OWNER активного или архивного проекта",
    },
  ]
  return (
    <div className="menu-anchor" ref={ref}>
      <IconButton
        icon="more"
        label={`Действия: ${project.name}`}
        onClick={() => setOpen(!open)}
        active={open}
      />
      {open && (
        <div className="menu" role="menu">
          {items.map((i) => (
            <button
              key={i.a}
              className={i.a === "delete" ? "danger-text" : undefined}
              role="menuitem"
              disabled={!i.ok}
              title={i.ok ? undefined : i.hint}
              onClick={() => {
                setOpen(false)
                onAction(i.a)
              }}
            >
              {i.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
