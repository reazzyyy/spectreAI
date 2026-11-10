import { useEffect, useRef, useState } from "react"
import { useApp } from "../app-context"
import type { Project } from "../data/projects"
import { Dialog } from "./Dialog"
import { Badge, Button, Icon } from "./ui"

export function DeleteProjectDialog({
  project,
  onClose,
}: {
  project: Project
  onClose: () => void
}) {
  const ctx = useApp()
  const [step, setStep] = useState(1)
  const [name, setName] = useState("")
  const [understood, setUnderstood] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [fail, setFail] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (step === 2) input.current?.focus()
  }, [step])
  const allowed =
    project.role === "owner" &&
    (project.status === "active" || project.status === "archived")
  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (busy || !allowed) return
    if (step === 1) {
      if (understood) setStep(2)
      return
    }
    if (name !== project.name) return
    setBusy(true)
    setError("")
    const message = await ctx.deleteProject(project.id, name, fail)
    setFail(false)
    setBusy(false)
    if (message) setError(message)
    else onClose()
  }
  return (
    <Dialog label="Удалить проект" onClose={() => !busy && onClose()}>
      <form onSubmit={submit}>
        <div className="dialog-head">
          <div className="deletion-heading">
            <span className="deletion-icon">
              <Icon name="lock" size={22} />
            </span>
            <Badge tone="warning">OWNER · шаг {step} из 2</Badge>
          </div>
          <h2>{step === 1 ? "Удалить проект?" : "Подтвердите название"}</h2>
          <p className="muted">{project.name}</p>
        </div>
        <div className="dialog-body">
          <div className="deletion-warning">
            <strong>Это не архив. Корзины и кнопки восстановления нет.</strong>
            <p>
              Доступ к документам, чатам, исследованиям и черновикам закроется
              сразу после запуска. Активные данные и производные удаляются в
              срок до 24 часов, резервные копии — 35 дней. Событие остаётся в
              аудите.
            </p>
          </div>
          {step === 1 ? (
            <label className="demo-check deletion-check">
              <input
                data-autofocus
                type="checkbox"
                checked={understood}
                disabled={!allowed}
                onChange={(e) => setUnderstood(e.target.checked)}
              />
              Я понимаю последствия и хочу перейти ко второму подтверждению.
            </label>
          ) : (
            <label className="field">
              <span>Введите точное название проекта</span>
              <input
                ref={input}
                value={name}
                autoComplete="off"
                disabled={busy || !allowed}
                onChange={(e) => setName(e.target.value)}
                aria-describedby="delete-name-help"
              />
              <small id="delete-name-help">
                С учётом регистра, пробелов и знаков: {project.name}
              </small>
            </label>
          )}
          {!allowed && (
            <p className="form-error" role="alert">
              Право OWNER утрачено или проект уже недоступен для удаления.
            </p>
          )}
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <p className="help">
            Оба подтверждения выполняете вы — текущий OWNER проекта. Второй
            сотрудник не нужен. Это синтетическая операция: реальные данные и
            резервные копии не удаляются.
          </p>
          {step === 2 && (
            <details className="work-demo-details">
              <summary>Демонстрационные состояния</summary>
              <label className="demo-check">
                <input
                  type="checkbox"
                  checked={fail}
                  disabled={busy}
                  onChange={(e) => setFail(e.target.checked)}
                />
                Ошибка запуска удаления (одна попытка)
              </label>
              <label className="demo-check">
                <input
                  type="checkbox"
                  checked={ctx.auditFailure}
                  disabled={busy}
                  onChange={(e) => ctx.setAuditFailure(e.target.checked)}
                />
                Обязательный аудит недоступен
              </label>
            </details>
          )}
        </div>
        <div className="dialog-foot">
          <Button variant="ghost" disabled={busy} onClick={onClose}>
            Отмена
          </Button>
          {step === 2 && (
            <Button disabled={busy} onClick={() => setStep(1)}>
              Назад
            </Button>
          )}
          <button
            type="submit"
            className={`button ${step === 2 ? "danger" : "primary"}`}
            disabled={
              busy ||
              !allowed ||
              (step === 1 ? !understood : name !== project.name)
            }
          >
            {busy
              ? "Проверяем права…"
              : step === 1
                ? "Подтвердить намерение"
                : "Удалить без восстановления"}
          </button>
        </div>
      </form>
    </Dialog>
  )
}
