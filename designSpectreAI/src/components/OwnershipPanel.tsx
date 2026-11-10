import { useState } from "react"
import { useApp } from "../app-context"
import type { Project } from "../data/projects"
import {
  lifecycleDate,
  ownershipStatusLabel,
  type OwnershipOffer,
} from "../data/ownership"
import { Dialog } from "./Dialog"
import { Badge, Button, Icon } from "./ui"

export function OwnershipPanel({ project }: { project: Project }) {
  const ctx = useApp()
  const id = ctx.identity
  const offers = id.lifecycle.offers.filter(
    (o) => o.projectId === project.id && o.orgId === id.orgId,
  )
  const pending = offers.find((o) => o.status === "pending")
  const restricted = id.lifecycle.restricted[project.id]
  const currentOwner = id.projectMembers[project.id]?.find(
    (m) => m.role === "owner" && id.inOrg(m.userId),
  )
  const person = (userId?: string) =>
    id.people.find((p) => p.id === userId)?.name ?? "Сотрудник"
  const candidates = id.ownershipCandidates(project.id)
  const [modal, setModal] = useState<"propose" | "review" | "cancel" | null>(
    null,
  )
  const [offerId, setOfferId] = useState("")
  const [toId, setToId] = useState("")
  const [busy, setBusy] = useState(false)
  const [fail, setFail] = useState(false)
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")
  const selected = offers.find((o) => o.id === offerId)
  const latest = offers[0]
  const formerMember = id.projectMembers[project.id]?.find(
    (m) => m.userId === latest?.fromId,
  )
  const canPropose = id.canProposeOwnership(project.id)
  const open = (
    mode: "propose" | "review" | "cancel",
    offer?: OwnershipOffer,
  ) => {
    setModal(mode)
    setOfferId(offer?.id ?? "")
    setToId("")
    setError("")
  }
  const apply = async (action: "propose" | "accept" | "decline" | "cancel") => {
    if (busy) return
    setBusy(true)
    setError("")
    await new Promise((r) => setTimeout(r, 550))
    if (fail) {
      setFail(false)
      setBusy(false)
      setError(
        "Операция не выполнена. Роли не изменены; выбор сохранён. Повторите попытку.",
      )
      return
    }
    const result =
      action === "propose"
        ? id.proposeOwnership(project.id, toId)
        : action === "accept"
          ? id.acceptOwnership(offerId)
          : action === "decline"
            ? id.declineOwnership(offerId)
            : id.cancelOwnership(offerId)
    if (result.ok) {
      setNotice(result.message)
      setModal(null)
    } else setError(result.message)
    setBusy(false)
  }
  if (project.visibility !== "team") return null
  return (
    <section className={`ownership-panel ${restricted ? "is-restricted" : ""}`}>
      <div className="ownership-panel-heading">
        <div>
          <div className="eyebrow">
            {restricted ? "Организационный процесс" : "Непрерывность работы"}
          </div>
          <h2>
            {restricted ? "TEAM в ограниченном режиме" : "Владение проектом"}
          </h2>
        </div>
        <Badge tone={restricted ? "warning" : "info"}>
          {restricted ? "Только чтение" : "Один OWNER"}
        </Badge>
      </div>
      {restricted ? (
        <>
          <p className="ownership-explanation">
            Владелец покинул организацию. У оставшихся участников сохранено
            чтение доступных материалов; изменения и новые AI-задачи
            заблокированы. Администратор не становится владельцем автоматически.
          </p>
          <div className="ownership-summary">
            <div>
              <small>Прежний владелец</small>
              <strong>{person(restricted.formerOwnerId)}</strong>
              <span>Доступ прекращён</span>
            </div>
            <Icon name="arrow" size={17} />
            <div>
              <small>Следующий шаг</small>
              <strong>
                {pending
                  ? "Ожидаем принятия преемником"
                  : "Предложить преемника"}
              </strong>
              <span>Без принятия проект остаётся ограниченным</span>
            </div>
          </div>
          {project.previousStatus === "archived" && (
            <p className="help">
              Исходный проект был в архиве. После принятия он останется
              архивным, не станет активным.
            </p>
          )}
        </>
      ) : (
        <p className="ownership-explanation">
          Текущий OWNER — <strong>{person(currentOwner?.userId)}</strong>.
          Предложение само по себе не меняет права. После принятия новый
          владелец станет единственным OWNER, прежний — VIEWER.
        </p>
      )}
      {notice && (
        <p className="success-message" role="status">
          <Icon name="check" size={16} />
          {notice}
        </p>
      )}
      {pending ? (
        <div className="ownership-pending">
          <div className="ownership-pending-title">
            <Icon name="users" size={19} />
            <div>
              <strong>
                {pending.toId === id.userId
                  ? "Вам предложено принять владение"
                  : `Ожидается ответ: ${person(pending.toId)}`}
              </strong>
              <small>
                Отправитель: {person(pending.createdById)} · до{" "}
                {lifecycleDate(pending.expiresAt)}
              </small>
            </div>
            <Badge tone="warning">Ожидает принятия</Badge>
          </div>
          <div className="ownership-actions">
            {pending.toId === id.userId && (
              <Button variant="primary" onClick={() => open("review", pending)}>
                Рассмотреть предложение
              </Button>
            )}
            {pending.createdById === id.userId && canPropose && (
              <Button onClick={() => open("cancel", pending)}>
                Отозвать предложение
              </Button>
            )}
            {pending.toId !== id.userId && (
              <p className="help">
                Решение принимает только получатель. До этого владение не
                меняется.
              </p>
            )}
          </div>
        </div>
      ) : (
        <div className="ownership-actions">
          {canPropose ? (
            <Button
              variant="primary"
              icon="users"
              onClick={() => open("propose")}
            >
              {restricted ? "Предложить преемника" : "Передать владение"}
            </Button>
          ) : restricted ? (
            <p className="help">
              Предложить преемника может уполномоченный Org Admin/Owner
              организации. Нет допустимого преемника — TEAM сохраняет этот
              режим.
            </p>
          ) : (
            <p className="help">
              Передачу инициирует текущий Workspace OWNER. Организационная роль
              не заменяет его подтверждение.
            </p>
          )}
        </div>
      )}
      {latest?.status === "accepted" && !restricted && (
        <div className="ownership-complete">
          <Icon name="check" size={19} />
          <div>
            <strong>Владение передано: {person(latest.toId)} — OWNER</strong>
            <p>
              {latest.mode === "recovery" ||
              !id.inOrg(latest.fromId ?? "") ||
              !formerMember
                ? `${person(latest.fromId)}: доступ прекращён, обратно не выдан.`
                : formerMember.role === "viewer"
                  ? `${person(latest.fromId)} — VIEWER, не EDITOR.`
                  : `${person(latest.fromId)}: текущая роль ${formerMember.role.toUpperCase()} назначена отдельным изменением после передачи.`}{" "}
              PRIVATE и PERSONAL не передавались.
            </p>
          </div>
        </div>
      )}
      {offers.length > 0 && (
        <details className="ownership-history">
          <summary>История предложений · {offers.length}</summary>
          {offers.map((o) => (
            <div className="ownership-history-row" key={o.id}>
              <div>
                <strong>{person(o.toId)}</strong>
                <small>
                  {o.mode === "recovery"
                    ? "Преемник ограниченного TEAM"
                    : "Передача действующим OWNER"}{" "}
                  · {lifecycleDate(o.createdAt)}
                </small>
                {o.reason && <small>{o.reason}</small>}
              </div>
              <Badge
                tone={
                  o.status === "accepted"
                    ? "success"
                    : o.status === "pending"
                      ? "info"
                      : "neutral"
                }
              >
                {ownershipStatusLabel[o.status]}
              </Badge>
            </div>
          ))}
        </details>
      )}
      <p className="ownership-privacy">
        <Icon name="lock" size={14} />
        Смена OWNER не раскрывает личную историю и не отменяет отзыв org
        membership. Это не процедура admin grant.
      </p>
      {(canPropose || pending?.toId === id.userId) && (
        <details className="work-demo-details">
          <summary>Демо-сценарии передачи</summary>
          <label className="demo-check">
            <input
              type="checkbox"
              checked={fail}
              onChange={(e) => setFail(e.target.checked)}
            />
            Ошибка следующего шага передачи
          </label>
          {pending && (
            <button
              className="text-action"
              onClick={() => id.expireOwnership(pending.id)}
            >
              Истечь предложению (демо)
            </button>
          )}
        </details>
      )}
      {modal && (
        <Dialog
          label={
            modal === "propose"
              ? restricted
                ? "Предложить преемника"
                : "Передача владения"
              : modal === "cancel"
                ? "Отозвать предложение владения"
                : "Принять владение проектом"
          }
          onClose={() => !busy && setModal(null)}
        >
          <div className="dialog-head">
            <div className="eyebrow">{project.name}</div>
            <h2>
              {modal === "propose"
                ? restricted
                  ? "Предложить преемника TEAM"
                  : "Кому передать владение?"
                : modal === "cancel"
                  ? "Отозвать предложение?"
                  : "Принять ответственность за проект?"}
            </h2>
          </div>
          <div className="dialog-body">
            {modal === "propose" ? (
              <>
                {candidates.length ? (
                  <label className="field">
                    <span>Действующий участник проекта</span>
                    <select
                      aria-label="Получатель владения"
                      value={toId}
                      disabled={busy}
                      onChange={(e) => setToId(e.target.value)}
                    >
                      <option value="">Выберите EDITOR или VIEWER</option>
                      {candidates.map((c) => (
                        <option value={c.userId} key={c.userId}>
                          {c.person.name} ·{" "}
                          {c.role === "editor" ? "EDITOR" : "VIEWER"} ·{" "}
                          {c.person.email}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : (
                  <div className="ownership-empty">
                    <Icon name="users" size={24} />
                    <strong>Нет допустимого преемника</strong>
                    <p>
                      {restricted
                        ? "TEAM остаётся ограниченным. Администратор не назначается автоматически и не получает доступ к содержимому."
                        : "Сначала назначьте в проект действующего сотрудника как EDITOR или VIEWER. Другой OWNER этим select не создаётся."}
                    </p>
                  </div>
                )}
                <div className="ownership-terms">
                  <p>
                    <strong>7 дней</strong> на ответ внутри приложения.
                  </p>
                  <p>
                    {restricted
                      ? "До принятия TEAM остаётся только для чтения. Уволенный сотрудник не возвращается в проект."
                      : "До принятия вы остаётесь OWNER. После успешной передачи ваша роль — VIEWER."}
                  </p>
                </div>
              </>
            ) : (
              <>
                {selected && (
                  <div className="invite-identity">
                    <Icon name="user" size={20} />
                    <div>
                      <strong>{person(selected.toId)}</strong>
                      <small>{ownershipStatusLabel[selected.status]}</small>
                    </div>
                  </div>
                )}
                <p>
                  {modal === "cancel"
                    ? "Получатель больше не сможет принять это предложение. Можно будет отправить новое. Роли и доступы сейчас не изменятся."
                    : selected?.mode === "recovery"
                      ? "Вы станете единственным OWNER. Ограничение отсутствия владельца будет снято, но исходный архивный статус сохранится. Уволенный сотрудник не получит доступ обратно."
                      : `Вы станете единственным OWNER проекта. ${person(selected?.fromId)} останется участником как VIEWER. До успешного выполнения роли не изменятся.`}
                </p>
              </>
            )}
            <p className="demo-notice">
              PRIVATE-чаты не становятся общими. PERSONAL не передаются.
              Организационные роли и независимое согласование admin grant не
              изменяются.
            </p>
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            {modal === "review" && selected?.status === "pending" && (
              <details className="work-demo-details">
                <summary>Демо-сценарии решения</summary>
                <label className="demo-check">
                  <input
                    type="checkbox"
                    checked={fail}
                    onChange={(e) => setFail(e.target.checked)}
                  />
                  Ошибка следующего шага передачи
                </label>
                <button
                  className="text-action"
                  onClick={() => id.expireOwnership(selected.id)}
                >
                  Истечь во время решения (демо)
                </button>
              </details>
            )}
          </div>
          <div className="dialog-foot">
            <Button disabled={busy} onClick={() => setModal(null)}>
              {modal === "review" ? "Решить позже" : "Отмена"}
            </Button>
            {modal === "review" && (
              <Button
                disabled={
                  busy ||
                  selected?.status !== "pending" ||
                  selected.toId !== id.userId
                }
                onClick={() => apply("decline")}
              >
                Отказаться
              </Button>
            )}
            <Button
              variant="primary"
              disabled={
                busy ||
                (modal === "propose"
                  ? !toId || !canPropose
                  : selected?.status !== "pending" ||
                    (modal === "review"
                      ? selected.toId !== id.userId
                      : selected.createdById !== id.userId))
              }
              onClick={() =>
                apply(
                  modal === "propose"
                    ? "propose"
                    : modal === "cancel"
                      ? "cancel"
                      : "accept",
                )
              }
            >
              {busy
                ? "Выполняем…"
                : modal === "propose"
                  ? "Отправить предложение"
                  : modal === "cancel"
                    ? "Отозвать"
                    : "Принять владение"}
            </Button>
          </div>
        </Dialog>
      )}
    </section>
  )
}
