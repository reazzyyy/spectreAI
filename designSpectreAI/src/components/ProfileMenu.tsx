import { useEffect, useRef, useState } from "react"
import { useApp } from "../app-context"
import { initials, orgRoleLabel } from "../data/identity"
import { Icon } from "./ui"
import { OffboardDialog } from "./OffboardDialog"

export function ProfileMenu({ collapsed }: { collapsed: boolean }) {
  const ctx = useApp()
  const id = ctx.identity
  const [open, setOpen] = useState(false)
  const [revokeDemo, setRevokeDemo] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false)
    }
    document.addEventListener("mousedown", close)
    document.addEventListener("keydown", esc)
    return () => {
      document.removeEventListener("mousedown", close)
      document.removeEventListener("keydown", esc)
    }
  }, [open])
  return (
    <div className="profile-menu-anchor" ref={ref}>
      <button
        className="profile-trigger"
        aria-label="Меню профиля"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <span className="avatar">{initials(id.user.name)}</span>
        {!collapsed && (
          <span className="profile-text">
            <strong>{id.user.name}</strong>
            <small>{id.organization.name}</small>
          </span>
        )}
      </button>
      {open && (
        <div className="profile-menu">
          <div className="profile-menu-heading">
            <strong>{id.user.name}</strong>
            <small>{id.user.email}</small>
            <span>
              {id.orgRole ? orgRoleLabel[id.orgRole] : "Нет членства"}
            </span>
          </div>
          <button
            onClick={() => {
              setOpen(false)
              ctx.go("organization")
            }}
          >
            <Icon name="users" size={16} />
            Организация и сотрудники
          </button>
          <button
            onClick={() => {
              setOpen(false)
              ctx.go("home")
            }}
          >
            <Icon name="home" size={16} />
            Выбор организации на Главной
          </button>
          <button
            onClick={() => {
              setOpen(false)
              ctx.logout()
            }}
          >
            <Icon name="arrow" size={16} />
            Выйти
          </button>
          <details>
            <summary>Демонстрационные сценарии</summary>
            <label className="field">
              <span>Смотреть как сотрудник</span>
              <select
                aria-label="Смотреть как сотрудник"
                value={id.userId}
                onChange={(e) => {
                  setOpen(false)
                  ctx.switchUser(e.target.value)
                }}
              >
                {id.people
                  .filter((p) => id.orgMembers.some((m) => m.userId === p.id))
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} · {p.email}
                    </option>
                  ))}
              </select>
            </label>
            <p>
              Это симулятор участников, не переключение реальных аккаунтов.
              Каждый переход открывает Главную.
            </p>
            <button
              onClick={() => {
                setOpen(false)
                ctx.logout(true)
              }}
            >
              Истечение сессии (демо)
            </button>
            {id.orgRole === "member" && (
              <button
                onClick={() => {
                  setOpen(false)
                  setRevokeDemo(true)
                }}
              >
                Отзыв моего org-доступа (демо)
              </button>
            )}
          </details>
        </div>
      )}
      {revokeDemo && (
        <OffboardDialog
          userId={id.userId}
          demoRemote
          onClose={() => setRevokeDemo(false)}
        />
      )}
    </div>
  )
}
