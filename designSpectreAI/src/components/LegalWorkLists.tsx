import { useState } from "react"
import { useApp } from "../app-context"
import { useLegalWork } from "../legal-work-context"
import { Dialog } from "./Dialog"
import { Badge, Button, Icon, StateCard } from "./ui"

export function ResearchList() {
  const ctx = useApp()
  const work = useLegalWork()
  const [query, setQuery] = useState("")
  const all = work.researches.filter((r) => r.projectId === ctx.current?.id)
  const rows = all.filter((r) =>
    r.config.question.toLowerCase().includes(query.toLowerCase()),
  )
  return (
    <>
      <div className="page-head compact">
        <div>
          <div className="eyebrow">Правовая позиция</div>
          <h1>Исследования</h1>
          <p className="muted">
            Нормы, судебная практика и проверяемые основания выводов.
          </p>
        </div>
        <Button
          variant="primary"
          icon="plus"
          disabled={ctx.readOnly.is}
          onClick={() => ctx.openResearch()}
        >
          Новое исследование
        </Button>
      </div>
      <p className="work-demo-note">
        <Icon name="sparkle" size={15} />
        Синтетический Research. Реальные правовые базы и проверка актуальности
        не подключены.
      </p>
      {all.length > 0 && (
        <label className="library-search work-list-search">
          <Icon name="search" size={16} />
          <input
            aria-label="Поиск исследований"
            placeholder="Найти исследование по вопросу"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
      )}
      {!all.length ? (
        <div className="work-empty">
          <StateCard
            icon="search"
            title="Начните с правового вопроса"
            text="Задайте правовую дату и область поиска. Вывод, источники и ограничения будут сохранены внутри проекта."
          >
            <Button
              variant="primary"
              disabled={ctx.readOnly.is}
              onClick={() => ctx.openResearch()}
            >
              Создать исследование
            </Button>
          </StateCard>
          <div className="work-empty-topics">
            <span>Например</span>
            <p>Соразмерность неустойки</p>
            <p>Убытки и договорная ответственность</p>
            <p>Практика по просрочке поставки</p>
          </div>
        </div>
      ) : !rows.length ? (
        <StateCard
          icon="search"
          title="Исследования не найдены"
          text="Измените поисковый запрос."
        >
          <Button onClick={() => setQuery("")}>Сбросить поиск</Button>
        </StateCard>
      ) : (
        <div className="work-cards">
          {rows.map((r) => {
            const last = r.runs.slice(-1)[0]
            const pending = ["queued", "running"].includes(last.status)
            return (
              <button
                className="work-card"
                key={r.id}
                onClick={() => ctx.openResearch(r.id)}
              >
                <div className="work-card-icon">
                  <Icon name="search" size={20} />
                </div>
                <div className="work-card-main">
                  <div className="eyebrow">
                    Российская Федерация · на {r.config.legalDate}
                  </div>
                  <h2>{r.config.question}</h2>
                  <p>
                    {r.runs.length} этапов · {r.config.norms ? "Нормы" : ""}
                    {r.config.norms && r.config.practice ? " и " : ""}
                    {r.config.practice ? "судебная практика" : ""}
                  </p>
                </div>
                <Badge
                  tone={
                    pending
                      ? "info"
                      : last.status === "succeeded"
                        ? "success"
                        : "warning"
                  }
                >
                  {pending
                    ? "Выполняется"
                    : r.saved
                      ? "Сохранено"
                      : last.status === "succeeded"
                        ? "Результат готов"
                        : "Требует внимания"}
                </Badge>
                <Icon name="chevron" size={16} />
              </button>
            )
          })}
        </div>
      )}
    </>
  )
}
export function DraftList() {
  const ctx = useApp()
  const work = useLegalWork()
  const [create, setCreate] = useState(false)
  const [title, setTitle] = useState("")
  const [kind, setKind] = useState("Ответ на претензию")
  const [query, setQuery] = useState("")
  const all = work.drafts.filter((d) => d.projectId === ctx.current?.id)
  const rows = all.filter((d) =>
    d.title.toLowerCase().includes(query.toLowerCase()),
  )
  return (
    <>
      <div className="page-head compact">
        <div>
          <div className="eyebrow">Подготовка документов</div>
          <h1>Черновики</h1>
          <p className="muted">
            От первого текста до согласованной редакции — отдельно от
            оригиналов.
          </p>
        </div>
        <Button
          variant="primary"
          icon="plus"
          disabled={ctx.readOnly.is}
          onClick={() => setCreate(true)}
        >
          Новый черновик
        </Button>
      </div>
      <p className="work-demo-note">
        <Icon name="edit" size={15} />
        Ручные и AI-правки, автосохранение, история и сравнение версий.
        Состояние — до перезагрузки макета.
      </p>
      {all.length > 0 && (
        <label className="library-search work-list-search">
          <Icon name="search" size={16} />
          <input
            aria-label="Поиск черновиков"
            placeholder="Название черновика"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
      )}
      {!all.length ? (
        <StateCard
          icon="edit"
          title="Черновиков пока нет"
          text="Создайте отдельный документ с нуля или сохраните ответ чата как черновик."
        >
          <Button
            variant="primary"
            disabled={ctx.readOnly.is}
            onClick={() => setCreate(true)}
          >
            Создать черновик
          </Button>
        </StateCard>
      ) : !rows.length ? (
        <StateCard
          icon="search"
          title="Черновики не найдены"
          text="Попробуйте другое название."
        >
          <Button onClick={() => setQuery("")}>Сбросить поиск</Button>
        </StateCard>
      ) : (
        <div className="work-cards">
          {rows.map((d) => {
            const readable = work.canReadDraft(d)
            return (
              <button
                className="work-card"
                key={d.id}
                onClick={() => ctx.openDraft(d.id)}
              >
                <div className="work-card-icon">
                  <Icon name={readable ? "edit" : "lock"} size={20} />
                </div>
                <div className="work-card-main">
                  <div className="eyebrow">
                    {readable ? d.kind : "Ограничение доступа"}
                  </div>
                  <h2>{readable ? d.title : "Черновик недоступен"}</h2>
                  <p>
                    {readable
                      ? `${d.author} · ${d.versions.length} версий · требует проверки юристом`
                      : "Недоступен связанный источник"}
                  </p>
                </div>
                <Badge
                  tone={
                    d.saveStatus === "error" || d.saveStatus === "conflict"
                      ? "warning"
                      : "neutral"
                  }
                >
                  {d.saveStatus === "saved"
                    ? "Сохранено в макете"
                    : d.saveStatus === "conflict"
                      ? "Конфликт"
                      : d.saveStatus === "error"
                        ? "Ошибка сохранения"
                        : "Есть изменения"}
                </Badge>
                <Icon name="chevron" size={16} />
              </button>
            )
          })}
        </div>
      )}
      {create && (
        <Dialog label="Новый черновик" onClose={() => setCreate(false)}>
          <div className="dialog-head">
            <h2>Новый черновик</h2>
            <p className="muted">{ctx.current?.name}</p>
          </div>
          <div className="dialog-body">
            <label className="field">
              <span>Название</span>
              <input
                aria-label="Название нового черновика"
                data-autofocus
                value={title}
                maxLength={160}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Например, ответ на претензию"
              />
            </label>
            <label className="field">
              <span>Тип документа</span>
              <select value={kind} onChange={(e) => setKind(e.target.value)}>
                <option>Ответ на претензию</option>
                <option>Правовое заключение</option>
                <option>Проект условия договора</option>
                <option>Другой документ</option>
              </select>
            </label>
            <p className="help">
              Черновик создаётся в этом проекте. Исходные документы не
              изменяются.
            </p>
          </div>
          <div className="dialog-foot">
            <Button onClick={() => setCreate(false)}>Отмена</Button>
            <Button
              variant="primary"
              disabled={!title.trim() || ctx.readOnly.is}
              onClick={() => {
                const id = work.createDraft(ctx.current!.id, title, kind)
                if (id) ctx.openDraft(id)
              }}
            >
              Создать
            </Button>
          </div>
        </Dialog>
      )}
    </>
  )
}
