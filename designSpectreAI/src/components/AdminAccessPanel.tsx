import { useEffect, useRef, useState } from "react"
import { useApp } from "../app-context"
import { useAdminAccess } from "../admin-access-context"
import {
  accessStatusLabel,
  isAccessApprover,
  isAccessManager,
  type AccessAction,
  type AccessRequest,
} from "../data/admin-access"
import { Dialog } from "./Dialog"
import { Badge, Button, Icon } from "./ui"

const time = (at: number) =>
  new Date(at).toLocaleString("ru-RU", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  })
export function AdminAccessPanel() {
  const ctx = useApp()
  const { identity: id } = ctx
  const access = useAdminAccess()
  const { ledger, env } = access
  const manager = isAccessManager(env)
  const approver = isAccessApprover(ledger, env)
  const [create, setCreate] = useState(false)
  const [objectId, setObjectId] = useState("")
  const [approverId, setApproverId] = useState("")
  const [minutes, setMinutes] = useState(15)
  const [reason, setReason] = useState("")
  const [selected, setSelected] = useState<string | null>(null)
  const [view, setView] = useState<string | null>(null)
  const [revoke, setRevoke] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const busyRef = useRef(false)
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")
  const [filter, setFilter] = useState("all")
  const [candidate, setCandidate] = useState("")
  const staff = id.orgMembers.filter((m) => m.orgId === id.orgId)
  const person = (userId: string) =>
    id.people.find((p) => p.id === userId)?.name ?? "Сотрудник"
  const candidates = staff.filter(
    (m) =>
      m.userId !== id.userId && ledger.approvers[id.orgId]?.includes(m.userId),
  )
  const objects = env.objects.filter((o) => o.orgId === id.orgId)
  const objectLabel = (r: AccessRequest) =>
    `Документ ${r.object.id} · версия ${r.object.version}`
  const requests = ledger.requests.filter(
    (r) =>
      r.orgId === id.orgId &&
      (r.requesterId === id.userId ||
        r.approverId === id.userId ||
        id.orgRole === "owner"),
  )
  const shown = requests
    .filter((r) => filter === "all" || r.status === filter)
    .slice()
    .reverse()
  const current = requests.find((r) => r.id === selected)
  const targetId = ctx.route.accessRequestId
  useEffect(() => {
    if (!targetId) return
    setSelected(targetId)
    document.getElementById("admin-access")?.scrollIntoView({ block: "start" })
  }, [targetId])
  const viewing = requests.find((r) => r.id === view)
  const content = view ? access.read(view) : undefined
  const operate = async (
    action: AccessAction,
    success: string,
    done?: () => void,
  ) => {
    if (busyRef.current) return
    busyRef.current = true
    setBusy(true)
    setError("")
    setNotice("")
    try {
      const failure = await access.execute(action)
      if (failure) setError(failure)
      else {
        setNotice(success)
        done?.()
      }
    } finally {
      busyRef.current = false
      setBusy(false)
    }
  }
  const remaining = (r: AccessRequest) => {
    const seconds = Math.max(
      0,
      Math.ceil(((r.expiresAt ?? 0) - access.now) / 1000),
    )
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`
  }
  if (!manager && !approver && !requests.length && !targetId) return null
  return (
    <section
      className="org-section admin-access"
      aria-labelledby="admin-access-title"
      id="admin-access"
    >
      {targetId && !requests.some((r) => r.id === targetId) && <div className="demo-notice" role="status"><strong>Запрос недоступен</strong><p>Запроса нет в этой демосессии или у вас нет права его просматривать. Ссылка не предоставляет доступ.</p><Button onClick={() => ctx.go("notifications")}>К уведомлениям</Button></div>}
      <div className="section-row">
        <div>
          <div className="eyebrow">Безопасность · отдельное разрешение</div>
          <h2 id="admin-access-title">Временный административный доступ</h2>
        </div>
        {manager && (
          <Button
            variant="primary"
            icon="plus"
            onClick={() => {
              setError("")
              setCreate(true)
            }}
          >
            Запросить доступ
          </Button>
        )}
      </div>
      <div className="access-principles">
        <Icon name="lock" size={20} />
        <div>
          <strong>Один документ. Только чтение. Не более часа.</strong>
          <p>
            Независимое решение обязательно. Без изменения, экспорта,
            AI-передачи и доступа к другим материалам. Продления нет — нужен
            новый запрос.
          </p>
        </div>
      </div>
      {notice && (
        <p role="status" className="success-message">
          {notice}
        </p>
      )}
      {error && !create && !selected && !revoke && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      {id.orgRole === "owner" && (
        <details className="access-appointments">
          <summary>
            Уполномоченные согласующие{" "}
            <span>{ledger.approvers[id.orgId]?.length ?? 0}</span>
          </summary>
          <p className="muted">
            Owner назначает отдельное право admin_grant:approve для документов
            TEAM этой организации. Организационная роль сама по себе его не
            даёт. Назначение не открывает содержимое. Самосогласование
            запрещено.
          </p>
          <div className="access-appoint-form">
            <label className="field">
              <span>Сотрудник для назначения</span>
              <select
                aria-label="Сотрудник для назначения"
                value={candidate}
                onChange={(e) => setCandidate(e.target.value)}
                disabled={busy}
              >
                <option value="">Выберите сотрудника</option>
                {staff
                  .filter(
                    (m) => !ledger.approvers[id.orgId]?.includes(m.userId),
                  )
                  .map((m) => (
                    <option key={m.userId} value={m.userId}>
                      {person(m.userId)}
                      {m.userId === id.userId ? " · вы" : ""}
                    </option>
                  ))}
              </select>
            </label>
            <Button
              disabled={!candidate || busy}
              onClick={() =>
                operate(
                  { type: "appoint", userId: candidate, enabled: true },
                  "Полномочие согласующего назначено.",
                  () => setCandidate(""),
                )
              }
            >
              Назначить согласующего
            </Button>
          </div>
          {(ledger.approvers[id.orgId] ?? []).map((userId) => (
            <div className="access-appointed" key={userId}>
              <span>
                {person(userId)}{" "}
                <small>Документы TEAM · {id.organization.name}</small>
              </span>
              <Button
                disabled={busy}
                onClick={() =>
                  operate(
                    { type: "appoint", userId, enabled: false },
                    "Полномочие отозвано. Связанные ожидающие и активные разрешения прекращены.",
                  )
                }
              >
                Снять полномочие
              </Button>
            </div>
          ))}
          <p className="help">
            Снятие полномочия прекращает связанные запросы и активный доступ.
            Для повторного доступа потребуется новое согласование.
          </p>
        </details>
      )}
      <div className="section-row access-list-head">
        <h3>
          {id.orgRole === "owner"
            ? "Запросы организации"
            : "Мои запросы и решения"}{" "}
          <small>{requests.length}</small>
        </h3>
        <label className="access-filter">
          Статус
          <select
            aria-label="Статус запросов доступа"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          >
            <option value="all">Все статусы</option>
            {Object.entries(accessStatusLabel).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </div>
      {!shown.length && (
        <div className="access-empty">
          <Icon name="lock" size={24} />
          <strong>
            {requests.length
              ? "Нет запросов с таким статусом"
              : "Доступ не запрошен"}
          </strong>
          <p>
            {manager
              ? "Создайте запрос и дождитесь независимого решения. До одобрения материалы закрыты."
              : "Здесь появятся запросы, адресованные вам как согласующему."}
          </p>
        </div>
      )}
      <div className="access-requests">
        {shown.map((r) => (
          <div className="access-request" key={r.id} data-request-id={r.id}>
            <div className="access-request-main">
              <strong>{objectLabel(r)}</strong>
              <small>
                {r.requesterId === id.userId
                  ? "Ваш запрос"
                  : `Заявитель: ${person(r.requesterId)}`}{" "}
                · {r.minutes} мин · {time(r.createdAt)}
              </small>
              <small>Согласующий: {person(r.approverId)}</small>
              {r.status === "active" && (
                <span className="access-countdown">
                  Осталось {remaining(r)} · до {time(r.expiresAt!)}
                </span>
              )}
            </div>
            <Badge
              tone={
                r.status === "active"
                  ? "success"
                  : r.status === "pending"
                    ? "info"
                    : "neutral"
              }
            >
              {accessStatusLabel[r.status]}
            </Badge>
            <div className="access-row-actions">
              <Button
                onClick={() => {
                  setError("")
                  setSelected(r.id)
                }}
              >
                {r.status === "pending" &&
                r.approverId === id.userId &&
                approver
                  ? "Рассмотреть запрос"
                  : "Детали запроса"}
              </Button>
              {r.status === "active" && r.requesterId === id.userId && (
                <Button
                  variant="primary"
                  disabled={busy}
                  onClick={() =>
                    operate(
                      { type: "open", requestId: r.id },
                      "Открыта согласованная версия документа.",
                      () => setView(r.id),
                    )
                  }
                >
                  Открыть read-only
                </Button>
              )}
              {["pending", "active"].includes(r.status) && (
                <button
                  className="text-action danger-text"
                  onClick={() => {
                    setError("")
                    setRevoke(r.id)
                  }}
                >
                  Отозвать
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
      <p className="help">
        {id.orgRole === "owner"
          ? "Owner видит запросы организации и может отозвать доступ, но не читать материалы по чужому разрешению."
          : "Видны только ваши запросы и адресованные вам решения."}{" "}
        Это история workflow, не общий журнал аудита. Причины не содержат копий
        юридических материалов.
      </p>
      <details className="work-demo-details">
        <summary>Демонстрация безопасности доступа</summary>
        <p className="help">
          Данные живут только в открытом макете. Для полного пути назначьте
          Дарью, запросите доступ как Олег и переключитесь на Дарью через меню
          профиля.
        </p>
        <label className="demo-check">
          <input
            type="checkbox"
            checked={access.auditFailure}
            onChange={(e) => access.setAuditFailure(e.target.checked)}
          />
          Ошибка обязательного аудита доступа
        </label>
        <p className="help">
          Ошибка блокирует выдачу. Отзыв и истечение не ждут восстановления
          аудита.
        </p>
      </details>
      {create && (
        <Dialog
          label="Запросить временный доступ"
          onClose={() => !busy && setCreate(false)}
        >
          <div className="dialog-head">
            <div className="eyebrow">Независимое согласование</div>
            <h2>Запросить временный доступ</h2>
            <p className="muted">
              Доступ появится только после явного одобрения.
            </p>
          </div>
          <div className="dialog-body access-form">
            <label className="field">
              <span>Объект · конкретная версия документа TEAM</span>
              <select
                data-autofocus
                aria-label="Объект доступа"
                disabled={busy}
                value={objectId}
                onChange={(e) => setObjectId(e.target.value)}
              >
                <option value="">Выберите объект</option>
                {objects.map((o) => (
                  <option key={o.id} value={o.id}>
                    Документ {o.id} · версия {o.version} · TEAM {o.projectId}
                  </option>
                ))}
              </select>
            </label>
            <p className="help">
              До одобрения показываем только безопасный идентификатор, не
              название и текст документа. PERSONAL, PRIVATE и материалы с
              ограниченным ACL не входят в этот scope.
            </p>
            <label className="field">
              <span>Причина доступа</span>
              <textarea
                aria-label="Причина доступа"
                value={reason}
                maxLength={500}
                rows={3}
                disabled={busy}
                placeholder="Например: проверить обращение по обработке документа"
                onChange={(e) => setReason(e.target.value)}
              />
            </label>
            <small>
              {reason.length}/500 · без текста документов, сообщений и промптов
            </small>
            <label className="field">
              <span>Срок с момента одобрения</span>
              <select
                aria-label="Срок доступа"
                disabled={busy}
                value={minutes}
                onChange={(e) => setMinutes(Number(e.target.value))}
              >
                <option value={15}>15 минут</option>
                <option value={30}>30 минут</option>
                <option value={60}>60 минут</option>
              </select>
            </label>
            <label className="field">
              <span>Независимый согласующий</span>
              <select
                aria-label="Согласующий доступа"
                value={approverId}
                disabled={busy || !candidates.length}
                onChange={(e) => setApproverId(e.target.value)}
              >
                <option value="">Выберите согласующего</option>
                {candidates.map((m) => (
                  <option key={m.userId} value={m.userId}>
                    {person(m.userId)}
                  </option>
                ))}
              </select>
            </label>
            {!candidates.length && (
              <div className="demo-notice" role="status">
                Нет независимого согласующего — нет доступа. Owner организации
                должен назначить другого действующего сотрудника. Аварийного
                обхода нет.
              </div>
            )}
            <div className="demo-notice">
              Только чтение одной согласованной версии. Другие документы, чаты и
              проект целиком не откроются. Продление запрещено.
            </div>
            {error && (
              <p role="alert" className="form-error">
                {error}
              </p>
            )}
          </div>
          <div className="dialog-foot">
            <Button disabled={busy} onClick={() => setCreate(false)}>
              Отмена
            </Button>
            <Button
              variant="primary"
              disabled={
                busy ||
                !objectId ||
                !reason.trim() ||
                !candidates.some((c) => c.userId === approverId)
              }
              onClick={() =>
                operate(
                  { type: "request", objectId, approverId, minutes, reason },
                  "Запрос отправлен. Пока он ожидает решения, доступа нет.",
                  () => {
                    setCreate(false)
                    setReason("")
                    setObjectId("")
                    setApproverId("")
                  },
                )
              }
            >
              {busy ? "Отправляем…" : "Отправить запрос"}
            </Button>
          </div>
        </Dialog>
      )}
      {current && (
        <Dialog
          label="Решение по запросу доступа"
          onClose={() => !busy && setSelected(null)}
        >
          <div className="dialog-head">
            <div className="eyebrow">{accessStatusLabel[current.status]}</div>
            <h2>{objectLabel(current)}</h2>
          </div>
          <div className="dialog-body access-form">
            <dl className="access-facts">
              <dt>Заявитель</dt>
              <dd>{person(current.requesterId)}</dd>
              <dt>Согласующий</dt>
              <dd>{person(current.approverId)}</dd>
              <dt>Срок</dt>
              <dd>{current.minutes} минут с одобрения</dd>
              <dt>Scope</dt>
              <dd>
                Чтение · {current.object.id} · v{current.object.version}
              </dd>
              <dt>Создан</dt>
              <dd>{time(current.createdAt)}</dd>
            </dl>
            <div className="access-reason">
              <strong>Причина</strong>
              <p>{current.reason}</p>
            </div>
            {current.closedReason && (
              <p className="demo-notice">{current.closedReason}</p>
            )}
            <p className="help">
              Решение не меняет членство в проекте. Нет изменения, экспорта,
              внешнего AI и продления.
            </p>
            {current.requesterId === id.userId &&
              current.status === "pending" && (
                <p className="demo-notice">
                  Самосогласование запрещено. Дождитесь решения назначенного
                  сотрудника.
                </p>
              )}
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
          </div>
          <div className="dialog-foot">
            <Button disabled={busy} onClick={() => setSelected(null)}>
              Закрыть
            </Button>
            {current.status === "active" && current.requesterId === id.userId && <Button variant="primary" disabled={busy} onClick={() => operate(
              { type: "open", requestId: current.id },
              "Открыта согласованная версия документа.",
              () => { setSelected(null); setView(current.id) },
            )}>Открыть read-only</Button>}
            {current.status === "pending" &&
              current.approverId === id.userId &&
              approver &&
              current.requesterId !== id.userId && (
                <>
                  <Button
                    disabled={busy}
                    onClick={() =>
                      operate(
                        { type: "reject", requestId: current.id },
                        "Запрос отклонён. Доступ не выдан.",
                        () => setSelected(null),
                      )
                    }
                  >
                    Отклонить запрос
                  </Button>
                  <Button
                    variant="primary"
                    disabled={busy}
                    onClick={() =>
                      operate(
                        { type: "approve", requestId: current.id },
                        "Read-only доступ выдан на согласованный срок.",
                        () => setSelected(null),
                      )
                    }
                  >
                    {busy ? "Применяем…" : "Одобрить доступ"}
                  </Button>
                </>
              )}
          </div>
        </Dialog>
      )}
      {view && (
        <Dialog
          label="Временный read-only просмотр"
          variant="wide"
          onClose={() => setView(null)}
        >
          <div className="dialog-head">
            <div className="eyebrow">Временный доступ · только чтение</div>
            <h2>{content ? content.name : "Доступ прекращён"}</h2>
            {content && viewing && (
              <p className="access-countdown">
                Версия {content.version} · осталось {remaining(viewing)}
              </p>
            )}
          </div>
          <div className="dialog-body">
            {content ? (
              <>
                <div className="demo-notice">
                  Разрешена только эта версия документа. Редактирование, экспорт
                  и AI недоступны.
                </div>
                {content.extraction === "partial" && <div className="extraction-warning"><strong>Текст согласованной версии извлечён частично</strong><p>Таблицы, приложения или часть текста не извлечены. Разрешение на просмотр не подтверждает полноту документа.</p></div>}
                <pre className="access-document">{content.text}</pre>
              </>
            ) : (
              <div className="access-empty" role="alert">
                <Icon name="lock" size={28} />
                <strong>Материалы скрыты</strong>
                <p>
                  {viewing?.closedReason ??
                    "Разрешение больше не действует. Истечение, отзыв или потеря членства прекращают просмотр, в том числе уже открытого экрана."}
                </p>
              </div>
            )}
          </div>
          <div className="dialog-foot">
            <Button onClick={() => setView(null)}>Закрыть просмотр</Button>
            {content && (
              <Button
                onClick={() => {
                  setView(null)
                  setRevoke(view)
                }}
              >
                Завершить доступ
              </Button>
            )}
          </div>
          {content && (
            <details className="work-demo-details access-view-demo">
              <summary>Демо: прекращение открытого доступа</summary>
              <label className="demo-check">
                <input
                  type="checkbox"
                  checked={access.auditFailure}
                  onChange={(e) => access.setAuditFailure(e.target.checked)}
                />
                Сбой аудита после открытия (демо)
              </label>
              <Button onClick={() => access.expireDemo(view)}>
                Истечь сейчас (демо)
              </Button>
              <Button
                disabled={busy}
                onClick={() =>
                  operate(
                    { type: "revoke", requestId: view },
                    "Доступ отозван.",
                  )
                }
              >
                Внешний отзыв (демо)
              </Button>
              <p className="help">
                Имитируется прекращение разрешения; текст должен немедленно
                исчезнуть.
              </p>
            </details>
          )}
        </Dialog>
      )}
      {revoke && (
        <Dialog
          label="Отозвать временный доступ"
          onClose={() => !busy && setRevoke(null)}
        >
          <div className="dialog-head">
            <h2>Отозвать запрос или доступ?</h2>
          </div>
          <div className="dialog-body">
            <p>
              Ожидающий запрос будет закрыт, активный доступ прекратится, в том
              числе на открытом экране. Материалы не удаляются. Для нового
              доступа потребуется новый запрос.
            </p>
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
          </div>
          <div className="dialog-foot">
            <Button disabled={busy} onClick={() => setRevoke(null)}>
              Отмена
            </Button>
            <Button
              variant="primary"
              disabled={busy}
              onClick={() =>
                operate(
                  { type: "revoke", requestId: revoke },
                  "Запрос или доступ отозван.",
                  () => setRevoke(null),
                )
              }
            >
              Подтвердить отзыв
            </Button>
          </div>
        </Dialog>
      )}
    </section>
  )
}
