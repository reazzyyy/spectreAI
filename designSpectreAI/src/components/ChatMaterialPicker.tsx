import { useState } from "react"
import type { ChatContextMode, Material, SourceRef } from "../data/workspace"
import { stageLabel } from "../data/workspace"
import {
  filterChatMaterials,
  MATERIAL_PAGE_SIZE,
  MAX_SELECTED_SOURCES,
} from "../lib/chat-context"
import { Button, Icon } from "./ui"

export function ChatMaterialPicker({
  materials,
  projectId,
  selected,
  mode,
  disabled,
  historical,
  onSelected,
}: {
  materials: Material[]
  projectId: string
  selected: SourceRef[]
  mode: ChatContextMode
  disabled: boolean
  historical: boolean
  onSelected: (sources: SourceRef[]) => void
}) {
  const [query, setQuery] = useState("")
  const [filter, setFilter] = useState("all")
  const [page, setPage] = useState(1)
  const rows = filterChatMaterials(
    materials,
    projectId,
    query,
    filter,
    selected,
  )
  const pages = Math.max(1, Math.ceil(rows.length / MATERIAL_PAGE_SIZE))
  const currentPage = Math.min(page, pages)
  const start = (currentPage - 1) * MATERIAL_PAGE_SIZE
  const reset = () => {
    setQuery("")
    setFilter("all")
    setPage(1)
  }
  return (
    <div className="chat-material-picker">
      <label className="library-search">
        <Icon name="search" size={15} />
        <input
          aria-label="Поиск материалов контекста"
          placeholder="Найти документ по названию"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setPage(1)
          }}
        />
      </label>
      <label className="field">
        <span className="sr-only">Фильтр материалов контекста</span>
        <select
          aria-label="Фильтр материалов контекста"
          value={filter}
          onChange={(e) => {
            setFilter(e.target.value)
            setPage(1)
          }}
        >
          <option value="all">Все материалы</option>
          <option value="ready">Готовые к вопросу</option>
          <option value="processing">В обработке</option>
          <option value="attention">Требуют внимания</option>
          <option value="selected">Выбранные вручную</option>
        </select>
      </label>
      <div className="chat-material-count" role="status">
        Строк: {rows.length} · страница {currentPage} из {pages}
        {mode === "selected" &&
          ` · выбрано ${selected.length}/${MAX_SELECTED_SOURCES}`}
      </div>
      {rows.slice(start, start + MATERIAL_PAGE_SIZE).map((m) => {
        const ref = selected.find((s) => s.id === m.id)
        const included = !!ref
        const allowed = m.stage === "ready"
        const latest = m.versions.slice(-1)[0]
        const shownVersion =
          mode === "selected" && ref
            ? m.versions.find((v) => v.number === ref.version)
            : latest
        return (
          <label
            key={m.id}
            className={`material-choice ${!allowed ? "unavailable" : ""}`}
          >
            <input
              type="checkbox"
              checked={mode === "workspace" ? allowed : included}
              disabled={
                mode === "workspace" || disabled || (!allowed && !included)
              }
              onChange={() => {
                if (included) onSelected(selected.filter((s) => s.id !== m.id))
                else if (allowed && latest)
                  onSelected([
                    ...selected,
                    { id: m.id, version: latest.number },
                  ])
              }}
            />
            <span>
              <strong>
                {m.stage === "forbidden" ? "Документ недоступен" : m.name}
              </strong>
              <small>
                {m.stage === "forbidden"
                  ? "Нет разрешения"
                  : `Версия ${shownVersion?.number ?? ref?.version ?? "—"} · ${stageLabel[m.stage]}`}
              </small>
              {m.stage === "ready" &&
                shownVersion?.extraction === "partial" && (
                  <small className="extraction-label">
                    Частичное извлечение · пропуски не проверены
                  </small>
                )}
              {included &&
                m.stage !== "forbidden" &&
                ref.version !== latest?.number && (
                  <small className="field-error">
                    {historical
                      ? "Новая ветка сохранит исходную версию контекста."
                      : "Версия изменилась. Снимите выбор и выберите текущую."}
                  </small>
                )}
            </span>
          </label>
        )
      })}
      {!rows.length && (
        <div className="chat-material-empty">
          <strong>Материалы не найдены</strong>
          <p>Измените запрос или фильтр. Выбор на других страницах сохранён.</p>
          <Button variant="ghost" onClick={reset}>
            Сбросить поиск материалов
          </Button>
        </div>
      )}
      {pages > 1 && (
        <div className="chat-material-pagination">
          <Button
            variant="ghost"
            disabled={currentPage === 1}
            onClick={() => setPage(currentPage - 1)}
          >
            Предыдущие материалы
          </Button>
          <Button
            variant="ghost"
            disabled={currentPage === pages}
            onClick={() => setPage(currentPage + 1)}
          >
            Следующие материалы
          </Button>
        </div>
      )}
      {mode === "selected" && selected.length > 0 && (
        <Button
          variant="ghost"
          disabled={disabled}
          onClick={() => onSelected([])}
        >
          Снять весь выбор
        </Button>
      )}
    </div>
  )
}
