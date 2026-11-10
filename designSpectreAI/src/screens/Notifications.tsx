import { useState } from "react"
import { useApp } from "../app-context"
import { useNotifications } from "../notification-context"
import { Dialog } from "../components/Dialog"
import { Shell } from "../components/shell"
import {
  Badge,
  Button,
  Icon,
  StateCard,
  type ScreenProps,
} from "../components/ui"
import { lifecycleDate } from "../data/ownership"
import type { NotificationCategory } from "../data/notifications"

const categoryLabels: Record<NotificationCategory, string> = {
  security: "Безопасность и доступ",
  documents: "Обработка документов",
  ai: "Результаты Chat AI",
}

export function NotificationsScreen({ go }: ScreenProps) {
  const ctx = useApp()
  const notifications = useNotifications()
  const [tab, setTab] = useState("all")
  const [category, setCategory] = useState("all")
  const [query, setQuery] = useState("")
  const [page, setPage] = useState(1)
  const [state, setState] = useState("ready")
  const [settings, setSettings] = useState(false)
  const [unavailable, setUnavailable] = useState(false)
  const [notice, setNotice] = useState("")
  const filtered = notifications.items.filter(
    (n) =>
      (tab === "all" || !notifications.readIds.includes(n.id)) &&
      (category === "all" || n.category === category) &&
      n.title
        .toLocaleLowerCase("ru")
        .includes(query.trim().toLocaleLowerCase("ru")),
  )
  const pages = Math.max(1, Math.ceil(filtered.length / 15))
  const currentPage = Math.min(page, pages)
  const reset = () => {
    setTab("all")
    setCategory("all")
    setQuery("")
    setPage(1)
  }
  return (
    <Shell screen="notifications" go={go}>
      <div className="page notifications-page">
        <div className="page-head">
          <div>
            <div className="eyebrow">
              Личный центр · {ctx.identity.organization.name}
            </div>
            <h1>Уведомления</h1>
            <p className="muted">
              Решения, изменения доступа и результаты вашей работы
            </p>
          </div>
          <Button icon="settings" onClick={() => setSettings(true)}>
            Настройки уведомлений
          </Button>
        </div>
        <div className="notification-summary">
          <span className="notification-summary-icon">
            <Icon name="bell" size={22} />
          </span>
          <div>
            <strong>
              {notifications.unreadCount
                ? `Непрочитанных: ${notifications.unreadCount}`
                : "Вы всё прочитали"}
            </strong>
            <p>
              Только адресованные вам события. Уведомление не заменяет
              разрешение на доступ.
            </p>
          </div>
          <Button
            variant="ghost"
            disabled={!notifications.unreadCount || state !== "ready"}
            onClick={() => {
              notifications.markAll()
              setNotice("Все доступные уведомления отмечены прочитанными.")
            }}
          >
            Прочитать все
          </Button>
        </div>
        {notice && (
          <p className="success-message" role="status">
            <Icon name="check" size={16} />
            {notice}
          </p>
        )}
        <section
          className="notification-register"
          aria-label="Список уведомлений"
        >
          <div className="notification-toolbar">
            <div
              className="tabs notification-tabs"
              role="tablist"
              aria-label="Прочитанность уведомлений"
            >
              <button
                role="tab"
                aria-selected={tab === "all"}
                className={tab === "all" ? "active" : ""}
                onClick={() => {
                  setTab("all")
                  setPage(1)
                }}
              >
                Все <span>{notifications.items.length}</span>
              </button>
              <button
                role="tab"
                aria-selected={tab === "unread"}
                className={tab === "unread" ? "active" : ""}
                onClick={() => {
                  setTab("unread")
                  setPage(1)
                }}
              >
                Непрочитанные <span>{notifications.unreadCount}</span>
              </button>
            </div>
            <label className="notification-type">
              <span className="sr-only">Тип уведомления</span>
              <select
                aria-label="Тип уведомления"
                value={category}
                onChange={(e) => {
                  setCategory(e.target.value)
                  setPage(1)
                }}
              >
                <option value="all">Все типы событий</option>
                {Object.entries(categoryLabels).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="notification-search-row">
            <label className="library-search">
              <Icon name="search" size={16} />
              <input
                aria-label="Поиск уведомлений"
                placeholder="Найти событие по названию"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value)
                  setPage(1)
                }}
              />
            </label>
            <span className="muted">Найдено: {filtered.length}</span>
          </div>
          {state === "error" ? (
            <div className="notification-empty">
              <StateCard
                icon="warning"
                title="Не удалось загрузить уведомления"
                text="Фильтры и прочитанность сохранены. Сбой не меняет доступ к материалам."
              >
                <Button onClick={() => setState("ready")}>
                  Повторить загрузку
                </Button>
              </StateCard>
            </div>
          ) : state === "loading" ? (
            <div className="notification-empty" role="status">
              <Icon name="clock" />
              <span>Загружаем ваши уведомления…</span>
              <Button onClick={() => setState("ready")}>
                Завершить демозагрузку
              </Button>
            </div>
          ) : !filtered.length ? (
            <div className="notification-empty">
              <StateCard
                icon="bell"
                title={
                  tab === "unread" && !notifications.unreadCount
                    ? "Всё прочитано"
                    : notifications.items.length
                      ? "Нет подходящих уведомлений"
                      : "Пока нет уведомлений"
                }
                text={
                  notifications.items.length
                    ? "Попробуйте другой тип событий или вернитесь ко всем уведомлениям."
                    : "Здесь появятся адресованные вам запросы и решения, изменения владения и результаты фоновой работы. Реальная рассылка не выполняется."
                }
              >
                {(query || category !== "all" || tab !== "all") && (
                  <Button onClick={reset}>Сбросить фильтры</Button>
                )}
              </StateCard>
            </div>
          ) : (
            <>
              <ul className="notification-list">
                {filtered
                  .slice((currentPage - 1) * 15, currentPage * 15)
                  .map((n) => {
                    const unread = !notifications.readIds.includes(n.id)
                    return (
                      <li
                        className={`notification-row ${unread ? "unread" : ""}`}
                        key={n.id}
                        data-notification-id={n.id}
                        data-category={n.category}
                      >
                        <button
                          className="notification-main"
                          onClick={() => {
                            if (!notifications.open(n.id)) setUnavailable(true)
                          }}
                          aria-label={`Открыть уведомление: ${n.title}`}
                        >
                          <span
                            className={`notification-type-icon ${n.category}`}
                          >
                            <Icon
                              name={
                                n.category === "security"
                                  ? "lock"
                                  : n.category === "documents"
                                    ? "file"
                                    : "chat"
                              }
                              size={19}
                            />
                          </span>
                          <span className="notification-copy">
                            <span className="notification-title">
                              {unread && <i aria-label="Непрочитано" />}
                              {n.title}
                            </span>
                            <span className="notification-meta">
                              {categoryLabels[n.category]} ·{" "}
                              <time dateTime={new Date(n.at).toISOString()}>
                                {lifecycleDate(n.at)}
                              </time>
                            </span>
                            <span className="notification-description">
                              {n.category === "security"
                                ? "Проверьте актуальный статус и доступные действия"
                                : "Откройте результат в его исходном проекте"}
                            </span>
                          </span>
                          <Icon name="chevron" size={16} />
                        </button>
                        <div className="notification-row-controls">
                          {n.category === "security" && (
                            <span className="notification-required">
                              Обязательное
                            </span>
                          )}
                          <button
                            className="text-action"
                            onClick={() => notifications.mark(n.id, unread)}
                            aria-label={
                              unread
                                ? `Прочитать: ${n.title}`
                                : `Пометить непрочитанным: ${n.title}`
                            }
                          >
                            {unread ? "Прочитать" : "В непрочитанные"}
                          </button>
                        </div>
                      </li>
                    )
                  })}
              </ul>
              <div className="audit-pagination">
                <span>
                  Страница {currentPage} из {pages}
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
          )}
        </section>
        <p className="notification-footnote">
          <Icon name="lock" size={14} />
          Без текста документов, приватных чатов и причин запросов. История,
          прочитанность и настройки живут только в этой демосессии.
        </p>
        <details className="work-demo-details">
          <summary>Демонстрационные состояния</summary>
          <label className="field">
            <span>Просмотр уведомлений</span>
            <select
              aria-label="Состояние уведомлений"
              value={state}
              onChange={(e) => setState(e.target.value)}
            >
              <option value="ready">Обычное</option>
              <option value="loading">Загрузка</option>
              <option value="error">Ошибка загрузки</option>
            </select>
          </label>
        </details>
      </div>
      {settings && (
        <NotificationSettingsDialog
          onClose={() => setSettings(false)}
          onSaved={() => {
            setSettings(false)
            setNotice("Настройки уведомлений применены в текущей демосессии.")
          }}
        />
      )}
      {unavailable && (
        <Dialog
          label="Объект уведомления недоступен"
          onClose={() => setUnavailable(false)}
        >
          <div className="dialog-head">
            <h2>Объект недоступен</h2>
          </div>
          <div className="dialog-body">
            <p>
              Объект удалён, доступ отозван или ссылка устарела. Уведомление не
              возвращает прежние права и не раскрывает содержимое.
            </p>
            <p className="help">
              Для временного доступа нужен новый запрос и независимое решение.
              Старое уведомление не продлевает разрешение.
            </p>
          </div>
          <div className="dialog-foot">
            <Button onClick={() => setUnavailable(false)}>Закрыть</Button>
          </div>
        </Dialog>
      )}
    </Shell>
  )
}

function NotificationSettingsDialog({
  onClose,
  onSaved,
}: {
  onClose: () => void
  onSaved: () => void
}) {
  const notifications = useNotifications()
  const [draft, setDraft] = useState({ ...notifications.preferences })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [fail, setFail] = useState(false)
  return (
    <Dialog label="Настройки уведомлений" onClose={() => !busy && onClose()}>
      <form
        onSubmit={async (e) => {
          e.preventDefault()
          if (busy) return
          setBusy(true)
          setError("")
          const message = await notifications.savePreferences(draft, fail)
          setFail(false)
          setBusy(false)
          if (message) setError(message)
          else onSaved()
        }}
      >
        <div className="dialog-head">
          <div className="eyebrow">Личные предпочтения</div>
          <h2>Настройки уведомлений</h2>
        </div>
        <div className="dialog-body">
          <div className="notification-channel">
            <Icon name="bell" size={18} />
            <strong>Внутри приложения</strong>
            <Badge tone="info">Демо</Badge>
          </div>
          <label className="notification-preference">
            <input type="checkbox" checked disabled />
            <span>
              <strong>Безопасность и доступ</strong>
              <small>
                Запросы, решения, истечение, отзыв и владение. Обязательные
                события нельзя отключить.
              </small>
            </span>
            <Icon name="lock" size={16} />
          </label>
          <label className="notification-preference">
            <input
              data-autofocus
              type="checkbox"
              checked={draft.documents}
              disabled={busy}
              onChange={(e) =>
                setDraft((d) => ({ ...d, documents: e.target.checked }))
              }
            />
            <span>
              <strong>Показывать результаты обработки документов</strong>
              <small>Готовность, ошибка обработки или необходимость OCR.</small>
            </span>
          </label>
          <label className="notification-preference">
            <input
              type="checkbox"
              checked={draft.ai}
              disabled={busy}
              onChange={(e) =>
                setDraft((d) => ({ ...d, ai: e.target.checked }))
              }
            />
            <span>
              <strong>Показывать результаты Chat AI</strong>
              <small>Завершение, остановка и ошибка ваших задач.</small>
            </span>
          </label>
          <p className="help">
            Только для вас в текущей организации. Отключённые категории
            скрываются из ленты и счётчика, при включении возвращаются. Email,
            push и реальные рассылки не подключены.
          </p>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <details className="work-demo-details">
            <summary>Демонстрационные состояния</summary>
            <label className="demo-check">
              <input
                type="checkbox"
                checked={fail}
                disabled={busy}
                onChange={(e) => setFail(e.target.checked)}
              />
              Ошибка сохранения настроек (одна попытка)
            </label>
          </details>
        </div>
        <div className="dialog-foot">
          <Button disabled={busy} onClick={onClose}>
            Отмена
          </Button>
          <button type="submit" className="button primary" disabled={busy}>
            {busy ? "Сохраняем…" : "Сохранить настройки"}
          </button>
        </div>
      </form>
    </Dialog>
  )
}
