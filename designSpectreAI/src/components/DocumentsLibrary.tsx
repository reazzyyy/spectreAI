import { useState } from "react"
import { useApp } from "../app-context"
import { stageLabel, stageTone } from "../data/workspace"
import { useWorkspace } from "../workspace-context"
import { Badge, Button, Icon, StateCard } from "./ui"
import { UploadDocuments } from "./UploadDocuments"

export function DocumentsLibrary() {
  const ctx = useApp()
  const ws = useWorkspace()
  const [upload, setUpload] = useState(false)
  const [query, setQuery] = useState("")
  const [status, setStatus] = useState("all")
  const [type, setType] = useState("all")
  const [author, setAuthor] = useState("all")
  const [date, setDate] = useState("all")
  const all = ws.materials.filter((m) => m.projectId === ctx.current?.id)
  const visible = all.filter((m) => m.stage !== "forbidden")
  const ready = visible.filter((m) => m.stage === "ready").length
  const rows = all.filter((m) => {
    if (m.stage === "forbidden")
      return (
        !query &&
        status === "all" &&
        type === "all" &&
        author === "all" &&
        date === "all"
      )
    const needle = query.toLocaleLowerCase("ru")
    const content =
      m.stage === "ready" ? (m.versions.slice(-1)[0]?.text ?? "") : ""
    return (
      (m.name.toLocaleLowerCase("ru").includes(needle) ||
        content.toLocaleLowerCase("ru").includes(needle)) &&
      (status === "all" ||
        (status === "processing"
          ? ["queued", "extracting", "indexing"].includes(m.stage)
          : status === "partial"
            ? m.stage === "ready" && m.versions.slice(-1)[0]?.extraction === "partial"
            : status === m.stage)) &&
      (type === "all" || m.name.toLowerCase().endsWith(`.${type}`)) &&
      (author === "all" || m.author === author) &&
      (date === "all" || m.date === date)
    )
  })
  const reset = () => {
    setQuery("")
    setStatus("all")
    setType("all")
    setAuthor("all")
    setDate("all")
  }
  const open = (m: (typeof all)[number]) => ctx.openDocument(m.projectId, m.stage === "forbidden" ? "__unavailable__" : m.name)
  return (
    <>
      <div className="page-head compact">
        <div>
          <div className="eyebrow">Материалы проекта</div>
          <h1>Документы</h1>
          <p className="muted">
            Оригиналы, версии и контекст для юридической работы.
          </p>
        </div>
        <Button
          variant="primary"
          icon="upload"
          disabled={ctx.readOnly.is}
          onClick={() => setUpload(true)}
        >
          Добавить документы
        </Button>
      </div>
      <div className="library-summary">
        <span>
          <strong>{visible.length}</strong> документов
        </span>
        <span>
          <i className="status-dot success" />
          <strong>{ready}</strong> готовы к работе
        </span>
        <span>
          <i className="status-dot warning" />
          <strong>
            {visible.filter((m) => ["error", "ocr"].includes(m.stage) || (m.stage === "ready" && m.versions.slice(-1)[0]?.extraction === "partial")).length}
          </strong>{" "}
          требуют внимания
        </span>
      </div>
      <div className="library-toolbar">
        <label className="library-search">
          <Icon name="search" size={18} />
          <input
            aria-label="Поиск документов"
            placeholder="Название или текст документа"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <select
          aria-label="Формат документа"
          value={type}
          onChange={(e) => setType(e.target.value)}
        >
          <option value="all">Все форматы</option>
          <option value="pdf">PDF</option>
          <option value="docx">DOCX</option>
          <option value="txt">TXT</option>
        </select>
        <select
          aria-label="Статус документа"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="all">Все статусы</option>
          <option value="ready">Готовы</option>
          <option value="partial">Частично извлечены</option>
          <option value="processing">Обрабатываются</option>
          <option value="ocr">Требуется OCR</option>
          <option value="error">Ошибка</option>
        </select>
        <select
          aria-label="Автор документа"
          value={author}
          onChange={(e) => setAuthor(e.target.value)}
        >
          <option value="all">Все авторы</option>
          {[...new Set(visible.map((m) => m.author))].map((a) => (
            <option key={a}>{a}</option>
          ))}
        </select>
        <select
          aria-label="Дата добавления"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        >
          <option value="all">Любая дата</option>
          <option value="2026-10-27">27 октября 2026</option>
        </select>
      </div>
      {!all.length ? (
        <StateCard
          icon="file"
          title="Первый документ — начало работы"
          text="Добавьте материалы в этот проект. После обработки их можно будет использовать в чате и анализе."
        >
          <Button
            variant="primary"
            disabled={ctx.readOnly.is}
            onClick={() => setUpload(true)}
          >
            Добавить документ
          </Button>
        </StateCard>
      ) : !rows.length ? (
        <StateCard
          icon="search"
          title="Документы не найдены"
          text="Измените запрос или сбросьте фильтры. Поиск по тексту доступен после обработки."
        >
          <Button onClick={reset}>Сбросить фильтры</Button>
        </StateCard>
      ) : (
        <div className="document-table">
          <div className="document-table-head">
            <span>Документ</span>
            <span>Статус</span>
            <span>Добавил</span>
            <span />
          </div>
          {rows.map((m) => (
            <div className="document-row" key={m.id}>
              <button
                className="document-main"
              onClick={() => open(m)}
              >
                <span
                  className={`file-tile ${
                    m.stage === "forbidden" ? "locked" : ""
                  }`}
                >
                  <Icon
                    name={m.stage === "forbidden" ? "lock" : "file"}
                    size={20}
                  />
                  <small>
                    {m.stage === "forbidden"
                      ? "—"
                      : m.name.split(".").pop()?.toUpperCase()}
                  </small>
                </span>
                <span>
                  <strong>
                    {m.stage === "forbidden" ? "Документ недоступен" : m.name}
                  </strong>
                  <small>
                    {m.stage === "forbidden"
                      ? "Содержимое скрыто"
                      : `Версия ${m.versions.length} · ${Math.round(m.bytes / 1024)} КБ · ${m.date.slice(8)} октября`}
                  </small>
                </span>
              </button>
              <Badge tone={m.stage === "ready" && m.versions.slice(-1)[0]?.extraction === "partial" ? "warning" : stageTone(m.stage)}>{m.stage === "ready" && m.versions.slice(-1)[0]?.extraction === "partial" ? "Готов частично" : stageLabel[m.stage]}</Badge>
              <span className="document-author">
                {m.stage === "forbidden" ? "—" : m.author}
              </span>
              <button
                className="icon-button"
                aria-label={
                  m.stage === "forbidden"
                    ? "Открыть ограничение доступа"
                    : `Открыть ${m.name}`
                }
              onClick={() => open(m)}
              >
                <Icon name="chevron" size={16} />
              </button>
            </div>
          ))}
        </div>
      )}
      <p className="library-footnote">
        <Icon name="layers" size={15} />Контекст задаётся вручную или явным
        поиском по готовым документам проекта. Частичное извлечение отмечено
        отдельно; связанные дела не подключаются автоматически.
      </p>
      {upload && <UploadDocuments onClose={() => setUpload(false)} />}
    </>
  )
}
