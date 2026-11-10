import { useState } from "react"
import { useApp } from "../app-context"
import { useAdminAccess } from "../admin-access-context"
import { Dialog } from "../components/Dialog"
import { Shell } from "../components/shell"
import {
  Badge,
  Button,
  Icon,
  StateCard,
  type ScreenProps,
} from "../components/ui"
import { canReadAudit, type AuditEvent } from "../data/audit"
import { lifecycleDate, ownershipStatusLabel } from "../data/ownership"

const categories = {
  project: "Проекты",
  membership: "Участники и владение",
  access: "Временный доступ",
  material: "Материалы",
  ai: "AI-задачи",
}
const results = {
  success: "Выполнено",
  pending: "В процессе",
  failed: "Ошибка",
}

export function AuditScreen({ go, scenario }: ScreenProps) {
  const ctx = useApp()
  const id = ctx.identity
  const access = useAdminAccess()
  const [query, setQuery] = useState("")
  const [scope, setScope] = useState(scenario === "default" ? "all" : scenario)
  const [category, setCategory] = useState("all")
  const [actor, setActor] = useState("all")
  const [result, setResult] = useState("all")
  const [from, setFrom] = useState("")
  const [to, setTo] = useState("")
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState<string>()
  const [state, setState] = useState("ready")
  const viewer = {
    active: id.session === "active" && id.inOrg(id.userId),
    orgId: id.orgId,
    userId: id.userId,
    orgRole: id.orgRole,
    projectIds: ctx.projects
      .filter((p) => p.status !== "deleting")
      .map((p) => p.id),
  }
  const accessEvents: AuditEvent[] = access.ledger.events.map((event) => {
    const request = access.ledger.requests.find((r) => r.id === event.requestId)
    return {
      ...event,
      category: "access",
      projectId: request?.object.projectId,
      objectId: event.requestId ?? event.subjectId,
      approverId: request?.approverId ?? event.subjectId,
      result: "success",
    }
  })
  const ownershipEvents: AuditEvent[] = id.lifecycle.offers.flatMap((offer) => {
    const base = {
      orgId: offer.orgId,
      projectId: offer.projectId,
      objectId: offer.id,
      category: "membership" as const,
    }
    const events: AuditEvent[] = [
      {
        ...base,
        id: `${offer.id}:created`,
        at: offer.createdAt,
        actorId: offer.createdById,
        action:
          offer.mode === "recovery"
            ? "Преемник предложен без доступа к содержимому"
            : "Передача владения предложена",
        result: "success",
      },
    ]
    if (offer.closedAt)
      events.push({
        ...base,
        id: `${offer.id}:${offer.status}`,
        at: offer.closedAt,
        actorId: ["expired", "invalidated"].includes(offer.status)
          ? "system"
          : ["accepted", "declined"].includes(offer.status)
            ? offer.toId
            : offer.createdById,
        action: ownershipStatusLabel[offer.status],
        result: "success",
      })
    return events
  })
  const departures: AuditEvent[] = id.lifecycle.departures.map((d) => ({
    id: d.id,
    orgId: d.orgId,
    actorId: d.byId,
    at: d.at,
    category: "membership",
    objectId: d.userId,
    action: "Членство в организации прекращено",
    result: "success",
  }))
  const visible = [
    ...ctx.auditEvents,
    ...accessEvents,
    ...ownershipEvents,
    ...departures,
  ]
    .filter((event) => canReadAudit(event, viewer))
    .sort((a, b) => b.at - a.at || a.id.localeCompare(b.id))
  const person = (userId: string) =>
    id.people.find((p) => p.id === userId)?.name ?? "Системное событие"
  const projectName = (event: AuditEvent) =>
    event.projectId
      ? (event.projectName ??
        ctx.projects.find((p) => p.id === event.projectId)?.name ??
        `Проект · ${event.projectId}`)
      : "Организация"
  const invalidDates = !!(from && to && from > to)
  const filtered = visible.filter((event) => {
    const text =
      `${event.action} ${person(event.actorId)} ${projectName(event)} ${event.id} ${event.objectId ?? ""}`.toLowerCase()
    return (
      !invalidDates &&
      (scope === "all" ||
        (scope === "grants"
          ? event.category === "access" && event.approverId === id.userId
          : event.projectId === scope)) &&
      (category === "all" || event.category === category) &&
      (actor === "all" || event.actorId === actor) &&
      (result === "all" || event.result === result) &&
      (!from || event.at >= new Date(`${from}T00:00:00`).getTime()) &&
      (!to || event.at <= new Date(`${to}T23:59:59.999`).getTime()) &&
      text.includes(query.trim().toLowerCase())
    )
  })
  const pages = Math.max(1, Math.ceil(filtered.length / 15))
  const currentPage = Math.min(page, pages)
  const detail = visible.find((e) => e.id === selected)
  const operations = ctx.deletions.filter(
    (op) =>
      viewer.active &&
      op.orgId === id.orgId &&
      (id.orgRole === "owner" || op.actorId === id.userId) &&
      (scope === "all" || scope === op.projectId),
  )
  const reset = () => {
    setQuery("")
    setScope("all")
    setCategory("all")
    setActor("all")
    setResult("all")
    setFrom("")
    setTo("")
    setPage(1)
  }
  return (
    <Shell screen="audit" go={go}>
      <div className="page audit-page">
        <div className="page-head">
          <div>
            <div className="eyebrow">{id.organization.name} · безопасность</div>
            <h1>Журнал аудита</h1>
            <p className="muted">
              Кто, когда и что изменил — без содержимого материалов
            </p>
          </div>
          <Badge tone="info">
            {id.orgRole === "owner"
              ? "Аудит организации"
              : "В пределах вашего доступа"}
          </Badge>
        </div>
        <div className="audit-boundary">
          <Icon name="lock" size={19} />
          <div>
            <strong>
              {id.orgRole === "owner"
                ? "Вы видите события своей организации"
                : "Только доступные проекты и свои согласования grant"}
            </strong>
            <p>
              Org Admin не получает общий аудит автоматически. Тексты
              документов, PRIVATE-чатов, AI-запросы и причины grant здесь не
              показываются. Экспорт вне MVP.
            </p>
          </div>
        </div>
        {operations.length > 0 && (
          <section className="audit-operations" aria-label="Операции удаления">
            <div className="section-row">
              <h2>Операции удаления</h2>
              <small>Синтетические статусы</small>
            </div>
            {operations.map((op) => (
              <div className="audit-operation" key={op.id}>
                <Icon
                  name={op.status === "deleting" ? "clock" : "check"}
                  size={20}
                />
                <div>
                  <strong>{op.projectName}</strong>
                  <p>
                    {op.status === "deleting"
                      ? "Доступ закрыт. Удаляем активные данные и производные…"
                      : "Активные данные и производные удалены в демомодели."}
                  </p>
                  <small>
                    Операция {op.id} · {lifecycleDate(op.startedAt)}
                  </small>
                  <p className="help">
                    Без восстановления по кнопке. Резервные копии — 35 дней; это
                    не подтверждение физического стирания. Реальный backend не
                    подключён.
                  </p>
                </div>
                <Badge tone={op.status === "deleting" ? "warning" : "success"}>
                  {op.status === "deleting" ? "Удаляется" : "Завершено (демо)"}
                </Badge>
              </div>
            ))}
          </section>
        )}
        <section className="audit-register" aria-label="События аудита">
          <div className="audit-toolbar">
            <label className="library-search">
              <Icon name="search" size={16} />
              <input
                aria-label="Поиск в журнале аудита"
                placeholder="Действие, сотрудник, проект или ID"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value)
                  setPage(1)
                }}
              />
            </label>
            <span className="muted">Событий: {filtered.length}</span>
            <Button variant="ghost" onClick={reset}>
              Сбросить фильтры
            </Button>
          </div>
          <div className="audit-filters" onChange={() => setPage(1)}>
            <label className="field">
              <span>Область</span>
              <select
                aria-label="Область аудита"
                value={scope}
                onChange={(e) => setScope(e.target.value)}
              >
                <option value="all">
                  {id.orgRole === "owner"
                    ? "Вся организация"
                    : "Все доступные события"}
                </option>
                <option value="grants">Мои согласования grant</option>
                {Array.from(
                  new Map([
                    ...operations.map((op) => [op.projectId, op.projectName] as const),
                    ...visible
                      .filter((e) => e.projectId)
                      .map((e) => [e.projectId!, projectName(e)] as const),
                    ...ctx.projects.map((p) => [p.id, p.name] as const),
                  ]).entries(),
                ).map(([pid, name]) => (
                  <option key={pid} value={pid}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Тип события</span>
              <select
                aria-label="Тип события"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              >
                <option value="all">Все типы</option>
                {Object.entries(categories).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Сотрудник</span>
              <select
                aria-label="Сотрудник аудита"
                value={actor}
                onChange={(e) => setActor(e.target.value)}
              >
                <option value="all">Все сотрудники</option>
                {[...new Set(visible.map((e) => e.actorId))].map((uid) => (
                  <option key={uid} value={uid}>
                    {person(uid)}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Результат</span>
              <select
                aria-label="Результат аудита"
                value={result}
                onChange={(e) => setResult(e.target.value)}
              >
                <option value="all">Все результаты</option>
                {Object.entries(results).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>С даты</span>
              <input
                type="date"
                aria-label="Аудит с даты"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
              />
            </label>
            <label className="field">
              <span>По дату</span>
              <input
                type="date"
                aria-label="Аудит по дату"
                value={to}
                onChange={(e) => setTo(e.target.value)}
              />
            </label>
          </div>
          {invalidDates && (
            <p className="form-error" role="alert">
              Дата начала не может быть позже даты окончания.
            </p>
          )}
          {state === "error" ? (
            <div className="audit-empty">
              <StateCard
                icon="lock"
                title="Журнал не загрузился"
                text="Фильтры сохранены. Сбой просмотра не расширяет права и не удаляет события."
              >
                <Button onClick={() => setState("ready")}>
                  Повторить загрузку
                </Button>
              </StateCard>
            </div>
          ) : state === "loading" ? (
            <div className="audit-empty" role="status">
              Загружаем разрешённые события…{" "}
              <Button onClick={() => setState("ready")}>
                Завершить демозагрузку
              </Button>
            </div>
          ) : filtered.length ? (
            <>
              <div className="audit-table-wrap">
                <table className="audit-table">
                  <thead>
                    <tr>
                      <th>Время</th>
                      <th>Действие / объект</th>
                      <th>Сотрудник</th>
                      <th>Результат</th>
                      <th>
                        <span className="sr-only">Детали</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered
                      .slice((currentPage - 1) * 15, currentPage * 15)
                      .map((event) => (
                        <tr key={event.id}>
                          <td>
                            <time dateTime={new Date(event.at).toISOString()}>
                              {lifecycleDate(event.at)}
                            </time>
                          </td>
                          <td>
                            <strong>{event.action}</strong>
                            <small>
                              {projectName(event)} ·{" "}
                              {categories[event.category]}
                            </small>
                          </td>
                          <td>{person(event.actorId)}</td>
                          <td>
                            <Badge
                              tone={
                                event.result === "failed"
                                  ? "warning"
                                  : event.result === "pending"
                                    ? "info"
                                    : "success"
                              }
                            >
                              {results[event.result]}
                            </Badge>
                          </td>
                          <td>
                            <Button
                              variant="ghost"
                              onClick={() => setSelected(event.id)}
                            >
                              Детали
                            </Button>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
              <div className="audit-pagination">
                <span>
                  {currentPage} из {pages}
                </span>
                <Button
                  disabled={currentPage === 1}
                  onClick={() => setPage(currentPage - 1)}
                >
                  Назад
                </Button>
                <Button
                  disabled={currentPage === pages}
                  onClick={() => setPage(currentPage + 1)}
                >
                  Далее
                </Button>
              </div>
            </>
          ) : (
            <div className="audit-empty">
              <StateCard
                icon="layers"
                title={
                  visible.length
                    ? "Нет подходящих событий"
                    : "Пока нет доступных событий"
                }
                text={
                  visible.length
                    ? "Измените запрос или сбросьте фильтры."
                    : "Измените проект, участника или создайте запрос доступа — разрешённые события появятся здесь. Журнал живёт только в этой демосессии."
                }
              >
                {visible.length > 0 && (
                  <Button onClick={reset}>Сбросить фильтры</Button>
                )}
              </StateCard>
            </div>
          )}
        </section>
        <p className="audit-retention">
          Техническая цель хранения аудита — 1 год; юридическая проверка сроков
          остаётся внешней зависимостью. В макете история сбрасывается при
          перезагрузке.
        </p>
        <details className="work-demo-details">
          <summary>Демонстрационные состояния</summary>
          <label className="field">
            <span>Просмотр журнала</span>
            <select
              aria-label="Состояние журнала"
              value={state}
              onChange={(e) => setState(e.target.value)}
            >
              <option value="ready">Обычное</option>
              <option value="loading">Загрузка</option>
              <option value="error">Ошибка загрузки</option>
            </select>
          </label>
          <label className="demo-check">
            <input
              type="checkbox"
              checked={ctx.auditFailure}
              onChange={(e) => ctx.setAuditFailure(e.target.checked)}
            />
            Обязательный аудит удаления недоступен
          </label>
        </details>
      </div>
      {detail && (
        <Dialog
          label="Детали события аудита"
          onClose={() => setSelected(undefined)}
        >
          <div className="dialog-head">
            <div className="eyebrow">{categories[detail.category]}</div>
            <h2>{detail.action}</h2>
          </div>
          <div className="dialog-body">
            <dl className="audit-details">
              <dt>Сотрудник</dt>
              <dd>{person(detail.actorId)}</dd>
              <dt>Время</dt>
              <dd>{new Date(detail.at).toLocaleString("ru-RU")}</dd>
              <dt>Объект</dt>
              <dd>{projectName(detail)}</dd>
              <dt>Результат</dt>
              <dd>{results[detail.result]}</dd>
              <dt>ID события</dt>
              <dd>{detail.id}</dd>
              {detail.objectId && (
                <>
                  <dt>ID операции / объекта</dt>
                  <dd>{detail.objectId}</dd>
                </>
              )}
            </dl>
            <p className="help">
              Только метаданные. Это событие не даёт доступа к документам,
              приватным чатам или AI-запросам.
            </p>
          </div>
          <div className="dialog-foot">
            <Button onClick={() => setSelected(undefined)}>Закрыть</Button>
          </div>
        </Dialog>
      )}
    </Shell>
  )
}
