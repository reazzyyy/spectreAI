import { useState } from "react"
import { useApp } from "../app-context"
import { Dialog } from "./Dialog"
import { Button, Icon } from "./ui"

export function OffboardDialog({
  userId,
  demoRemote = false,
  onClose,
  onComplete,
}: {
  userId: string
  demoRemote?: boolean
  onClose: () => void
  onComplete?: (message: string) => void
}) {
  const ctx = useApp()
  const id = ctx.identity
  const person = id.people.find((p) => p.id === userId)
  const impact = id.offboardImpact(userId)
  const [confirmed, setConfirmed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [fail, setFail] = useState(false)
  const apply = async () => {
    if (!confirmed || busy) return
    setBusy(true)
    setError("")
    await new Promise((r) => setTimeout(r, 550))
    if (fail) {
      setFail(false)
      setBusy(false)
      setError(
        "Отзыв не применён. Доступы не изменены. Подтверждение сохранено, повторите попытку.",
      )
      return
    }
    const result = demoRemote
      ? id.demoRevokeCurrentMembership()
      : id.offboardMember(userId)
    if (result.ok) {
      onComplete?.(result.message)
      onClose()
    } else setError(result.message)
    setBusy(false)
  }
  return (
    <Dialog
      label={
        demoRemote
          ? "Отзыв моего членства — демо"
          : "Прекратить членство сотрудника"
      }
      onClose={() => !busy && onClose()}
    >
      <div className="dialog-head">
        <div className="eyebrow">{id.organization.name}</div>
        <h2>
          {demoRemote
            ? "Смоделировать отзыв вашего доступа?"
            : "Прекратить членство в организации?"}
        </h2>
      </div>
      <div className="dialog-body">
        <div className="invite-identity">
          <Icon name="user" size={19} />
          <div>
            <strong>{person?.name}</strong>
            <small>{person?.email}</small>
          </div>
        </div>
        {demoRemote && (
          <p className="demo-notice">
            Демо-событие от уполномоченного Org Admin. Это не право сотрудника
            менять собственное членство: будет показан открытый экран после
            внешнего отзыва.
          </p>
        )}
        <div className="offboard-impact">
          <div>
            <strong>{impact.teamCount}</strong>
            <span>TEAM потеряют доступ этого сотрудника</span>
          </div>
          <div>
            <strong>{impact.ownedTeamIds.length}</strong>
            <span>TEAM без OWNER перейдут в ограниченный режим</span>
          </div>
          <div>
            <strong>{impact.personalCount}</strong>
            <span>PERSONAL останутся закрытыми, не передадутся</span>
          </div>
          <div>
            <strong>{impact.cancelledOffers}</strong>
            <span>ожидающих предложений будут аннулированы</span>
          </div>
        </div>
        <div className="offboard-warning">
          <Icon name="warning" size={18} />
          <div>
            <strong>Ожидание преемника не откладывает отзыв</strong>
            <p>
              Доступ к этой Organization, PERSONAL/TEAM, PRIVATE/WORKSPACE и
              результатам прекращается. Новые действия и выдача AI-результатов
              требуют актуальных прав. Другие организации не затрагиваются.
            </p>
          </div>
        </div>
        <p className="help">
          Данные и авторство сохранятся. Ограниченный TEAM доступен оставшимся
          участникам только для чтения; Org Admin предложит действующего
          преемника, который должен принять владение. Без него режим не
          снимается.
        </p>
        <label className="offboard-confirm">
          <input
            type="checkbox"
            checked={confirmed}
            disabled={busy}
            onChange={(e) => setConfirmed(e.target.checked)}
          />
          Подтверждаю прекращение доступа без автоматического удаления или
          передачи PERSONAL/PRIVATE.
        </label>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <details className="work-demo-details">
          <summary>Демо-сценарий отзыва</summary>
          <label className="demo-check">
            <input
              type="checkbox"
              checked={fail}
              onChange={(e) => setFail(e.target.checked)}
            />
            Ошибка следующего отзыва
          </label>
        </details>
      </div>
      <div className="dialog-foot">
        <Button disabled={busy} onClick={onClose}>
          Отмена
        </Button>
        <Button variant="primary" disabled={!confirmed || busy} onClick={apply}>
          {busy ? "Применяем…" : "Прекратить членство"}
        </Button>
      </div>
    </Dialog>
  )
}
