import { useState } from "react"
import { useApp } from "../app-context"
import { Dialog } from "../components/Dialog"
import { Shell } from "../components/shell"
import { Badge, Button, Icon, type ScreenProps } from "../components/ui"
import { initials, orgRoleLabel } from "../data/identity"
import { OffboardDialog } from "../components/OffboardDialog"
import { lifecycleDate } from "../data/ownership"
import { AdminAccessPanel } from "../components/AdminAccessPanel"

export function OrganizationScreen({ go }: ScreenProps) {
  const ctx = useApp()
  const id = ctx.identity
  const [query, setQuery] = useState("")
  const [projectQuery, setProjectQuery] = useState("")
  const [showAll, setShowAll] = useState(false)
  const [inviteDialog, setInviteDialog] = useState(false)
  const [email, setEmail] = useState("")
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")
  const [busy, setBusy] = useState(false)
  const [fail, setFail] = useState(false)
  const [mail, setMail] = useState<string | null>(null)
  const [revoke, setRevoke] = useState<string | null>(null)
  const [offboard, setOffboard] = useState<string | null>(null)
  const [restrictedOnly, setRestrictedOnly] = useState(false)
  const staff = id.orgMembers
    .filter((m) => m.orgId === id.orgId)
    .map((m) => ({ ...m, person: id.people.find((p) => p.id === m.userId)! }))
    .filter(
      (m) =>
        m.person &&
        `${m.person.name} ${m.person.email}`
          .toLowerCase()
          .includes(query.toLowerCase()),
    )
  const invitations = id.invitations.filter((i) => i.orgId === id.orgId)
  const selectedMail = id.invitations.find((i) => i.id === mail)
  const adminProjects = id.adminProjects.filter(
    (p) =>
      p.name.toLowerCase().includes(projectQuery.toLowerCase()) &&
      (!restrictedOnly || p.status === "restricted"),
  )
  const send = async () => {
    if (busy) return
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError("Укажите корректный email.")
      return
    }
    setBusy(true)
    setError("")
    await new Promise((r) => setTimeout(r, 500))
    if (fail) {
      setFail(false)
      setError(
        "Не удалось подготовить приглашение. Email сохранён — повторите попытку.",
      )
      setBusy(false)
      return
    }
    const token = id.invite(email)
    if (token) {
      setMail(token)
      setInviteDialog(false)
      setNotice("Приглашение создано на 7 дней. Реальное письмо не отправлено.")
      setEmail("")
    } else
      setError(
        "Сотрудник уже в организации либо для этого email есть действующее приглашение.",
      )
    setBusy(false)
  }
  return (
    <Shell screen="organization" go={go}>
      <div className="page organization-page">
        <div className="page-head">
          <div>
            <div className="eyebrow">Организация · отдельно от проектов</div>
            <h1>{id.organization.name}</h1>
            <p className="muted">Сотрудники и приглашения</p>
          </div>
          <Badge tone="info">
            {id.orgRole ? orgRoleLabel[id.orgRole] : "Нет членства"}
          </Badge>
        </div>
        <div className="membership-boundary">
          <Icon name="lock" size={20} />
          <div>
            <strong>Администрирование не равно чтению материалов</strong>
            <p>
              Доступ в TEAM назначается отдельно. Ни Owner организации, ни Org
              Admin не получают автоматический доступ к документам и личным
              чатам.
            </p>
          </div>
        </div>
        {notice && (
          <p className="success-message" role="status">
            <Icon name="check" size={16} />
            {notice}
          </p>
        )}
        <AdminAccessPanel key={`${id.orgId}:${id.userId}`} />
        <section className="org-section">
          <div className="section-row">
            <h2>
              Сотрудники <span>{staff.length}</span>
            </h2>
            <Button
              variant="primary"
              icon="plus"
              disabled={id.orgRole !== "owner"}
              title={
                id.orgRole !== "owner"
                  ? "Приглашения отправляет Owner организации"
                  : undefined
              }
              onClick={() => {
                setError("")
                setInviteDialog(true)
              }}
            >
              Пригласить сотрудника
            </Button>
          </div>
          <label className="library-search work-list-search">
            <Icon name="search" size={16} />
            <input
              aria-label="Поиск сотрудников организации"
              placeholder="Имя или рабочий email"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          <div className="org-people">
            {staff.map((m) => (
              <div className="org-person" key={m.userId}>
                <span className="avatar">{initials(m.person.name)}</span>
                <div>
                  <strong>
                    {m.person.name}
                    {m.userId === id.userId ? " · вы" : ""}
                  </strong>
                  <small>{m.person.email}</small>
                </div>
                <Badge>{orgRoleLabel[m.role]}</Badge>
                <span className="org-member-state">
                  <i />
                  Активен
                </span>
                {id.isOrgManager && (
                  <div className="org-person-controls">
                    {m.role === "member" ? (
                      <button
                        className="text-action danger-text"
                        onClick={() => setOffboard(m.userId)}
                      >
                        Прекратить членство
                      </button>
                    ) : (
                      <small>Организационная роль — отдельный процесс</small>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
          {!staff.length && <p className="note">По запросу нет сотрудников.</p>}
        </section>
        {id.isOrgManager &&
          id.lifecycle.departures.some((d) => d.orgId === id.orgId) && (
            <section className="org-section departure-section">
              <div className="section-row">
                <h2>Прекращённое членство</h2>
                <small>Метаданные операции · без содержимого</small>
              </div>
              {id.lifecycle.departures
                .filter((d) => d.orgId === id.orgId)
                .map((d) => (
                  <div className="departure-row" key={d.id}>
                    <div>
                      <strong>
                        {id.people.find((p) => p.id === d.userId)?.name}
                      </strong>
                      <small>
                        {lifecycleDate(d.at)} · операция:{" "}
                        {id.people.find((p) => p.id === d.byId)?.name}
                      </small>
                      <p>
                        При отзыве ограничено TEAM: {d.ownedTeamIds.length};
                        сейчас без преемника:{" "}
                        {
                          d.ownedTeamIds.filter(
                            (projectId) => id.lifecycle.restricted[projectId],
                          ).length
                        }
                        . PERSONAL не переданы: {d.personalCount}. Аннулировано
                        предложений: {d.cancelledOffers}.
                      </p>
                    </div>
                    <Badge tone="warning">Доступ прекращён</Badge>
                    {d.ownedTeamIds.some(
                      (projectId) => id.lifecycle.restricted[projectId],
                    ) && (
                      <Button
                        onClick={() =>
                          ctx.openMembers(
                            d.ownedTeamIds.find(
                              (projectId) =>
                                !!id.lifecycle.restricted[projectId],
                            )!,
                          )
                        }
                      >
                        Открыть ограниченный TEAM
                      </Button>
                    )}
                  </div>
                ))}
            </section>
          )}
        {id.orgRole === "owner" && (
          <section className="org-section">
            <div className="section-row">
              <h2>
                Приглашения <span>{invitations.length}</span>
              </h2>
              <small>Срок — 7 дней · только демоданные</small>
            </div>
            <div className="invite-table">
              {invitations.map((i) => {
                const expired = i.expiresAt <= Date.now()
                return (
                  <div className="invite-row" key={i.id}>
                    <div>
                      <strong>{i.email}</strong>
                      <small>
                        {i.requested
                          ? "Получатель запросил новое приглашение"
                          : i.status === "accepted"
                            ? "Членство принято; TEAM-доступ назначается отдельно"
                            : "Приглашение в Organization, не в проект"}
                      </small>
                    </div>
                    <Badge
                      tone={
                        i.status === "accepted"
                          ? "success"
                          : i.status === "pending" && !expired
                            ? "info"
                            : "warning"
                      }
                    >
                      {i.status === "accepted"
                        ? "Принято"
                        : i.status === "revoked"
                          ? "Отозвано"
                          : expired
                            ? "Истекло"
                            : "Ожидает принятия"}
                    </Badge>
                    <div className="member-actions">
                      {i.status === "pending" && !expired && (
                        <>
                          <button
                            className="text-action"
                            onClick={() => setMail(i.id)}
                          >
                            Демописьмо
                          </button>
                          <button
                            className="text-action danger-text"
                            onClick={() => setRevoke(i.id)}
                          >
                            Отозвать
                          </button>
                        </>
                      )}
                      {i.status !== "accepted" && (
                        <button
                          className="text-action"
                          onClick={() => {
                            const token = id.resendInvitation(i.id)
                            if (token) {
                              setMail(token)
                              setNotice(
                                "Создана новая ссылка на 7 дней. Предыдущая ссылка отозвана.",
                              )
                            }
                          }}
                        >
                          Выдать заново
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
            {!invitations.length && <p className="note">Нет приглашений.</p>}
          </section>
        )}
        {id.isOrgManager && (
          <section className="org-section">
            <div className="section-row">
              <h2>Управление членством TEAM</h2>
              <small>Только административные метаданные</small>
            </div>
            <p className="muted org-section-note">
              Эти строки не дают доступа к содержимому. Администратор не
              назначает себе чтение через собственное членство.
            </p>
            <label className="demo-check org-restricted-filter">
              <input
                type="checkbox"
                checked={restrictedOnly}
                onChange={(e) => setRestrictedOnly(e.target.checked)}
              />
              Только TEAM без действующего OWNER
            </label>
            <label className="library-search work-list-search">
              <Icon name="search" size={16} />
              <input
                aria-label="Поиск TEAM для управления"
                value={projectQuery}
                placeholder="Найти проект для управления участниками"
                onChange={(e) => setProjectQuery(e.target.value)}
              />
            </label>
            <div className="org-projects">
              {adminProjects.slice(0, showAll ? undefined : 6).map((p) => (
                <button
                  key={p.id}
                  className="org-project-row"
                  onClick={() => ctx.openMembers(p.id)}
                >
                  <Icon name="users" size={18} />
                  <div>
                    <strong>{p.name}</strong>
                    <small>
                      {id.projectMembers[p.id]?.length ?? 0} участников ·{" "}
                      {p.status === "active"
                        ? "Активный"
                        : p.status === "restricted"
                          ? "Ограничен · только чтение"
                          : p.status === "archived"
                            ? "Архив"
                            : "Удаляется"}
                    </small>
                  </div>
                  <span>Членство</span>
                  <Icon name="chevron" size={15} />
                </button>
              ))}
            </div>
            {adminProjects.length > 6 && (
              <Button onClick={() => setShowAll(!showAll)}>
                {showAll
                  ? "Свернуть список TEAM"
                  : `Показать все TEAM · ${adminProjects.length}`}
              </Button>
            )}
          </section>
        )}
        <details className="work-demo-details">
          <summary>Демонстрационные состояния</summary>
          <label className="demo-check">
            <input
              type="checkbox"
              checked={fail}
              onChange={(e) => setFail(e.target.checked)}
            />
            Ошибка подготовки приглашения
          </label>
        </details>
      </div>
      {offboard && (
        <OffboardDialog
          userId={offboard}
          onClose={() => setOffboard(null)}
          onComplete={setNotice}
        />
      )}
      {inviteDialog && (
        <Dialog
          label="Пригласить в организацию"
          onClose={() => !busy && setInviteDialog(false)}
        >
          <div className="dialog-head">
            <h2>Пригласить сотрудника</h2>
            <p className="muted">{id.organization.name}</p>
          </div>
          <div className="dialog-body">
            <label className="field">
              <span>Рабочий email</span>
              <input
                data-autofocus
                type="email"
                aria-label="Email приглашения"
                value={email}
                disabled={busy}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@example.test"
              />
            </label>
            <div className="demo-notice">
              Приглашение действует 7 дней. После принятия сотрудник станет
              членом организации, но не получит доступ ко всем проектам. Роль в
              TEAM назначается отдельно.
            </div>
            <p className="help">
              Макет не отправляет email. Можно открыть образец письма и пройти
              путь получателя.
            </p>
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
          </div>
          <div className="dialog-foot">
            <Button disabled={busy} onClick={() => setInviteDialog(false)}>
              Отмена
            </Button>
            <Button
              variant="primary"
              disabled={busy || id.orgRole !== "owner"}
              onClick={send}
            >
              {busy ? "Подготавливаем…" : "Создать приглашение"}
            </Button>
          </div>
        </Dialog>
      )}
      {selectedMail && (
        <Dialog
          label="Демонстрационное письмо приглашения"
          onClose={() => setMail(null)}
        >
          <div className="dialog-head">
            <div className="eyebrow">Образец письма · не отправлено</div>
            <h2>Вас приглашают в {id.organization.name}</h2>
          </div>
          <div className="dialog-body">
            <p>
              Получатель: <strong>{selectedMail.email}</strong>
            </p>
            <p>
              Создайте аккаунт или подтвердите существующий и примите
              приглашение. Ссылка действует 7 дней.
            </p>
            <div className="demo-notice">
              Переход ниже завершит текущую демосессию и покажет интерфейс
              получателя. Никакой email не отправляется.
            </div>
            <p className="help">
              Принятие не назначает роль в проектах автоматически.
            </p>
          </div>
          <div className="dialog-foot">
            <Button onClick={() => setMail(null)}>Закрыть</Button>
            <Button
              variant="primary"
              onClick={() => ctx.openAuth("invite", selectedMail.id)}
            >
              Открыть как получатель (демо)
            </Button>
          </div>
        </Dialog>
      )}
      {revoke && (
        <Dialog label="Отозвать приглашение" onClose={() => setRevoke(null)}>
          <div className="dialog-head">
            <h2>Отозвать приглашение?</h2>
          </div>
          <div className="dialog-body">
            <p>
              Старая ссылка больше не позволит принять членство. Это не
              увольнение уже принятого сотрудника и не удаление материалов.
            </p>
          </div>
          <div className="dialog-foot">
            <Button onClick={() => setRevoke(null)}>Отмена</Button>
            <Button
              variant="primary"
              onClick={() => {
                id.revokeInvitation(revoke)
                setRevoke(null)
                setNotice("Приглашение отозвано.")
              }}
            >
              Отозвать приглашение
            </Button>
          </div>
        </Dialog>
      )}
    </Shell>
  )
}
