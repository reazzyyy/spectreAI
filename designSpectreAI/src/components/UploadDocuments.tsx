import { useRef, useState } from "react"
import { useApp } from "../app-context"
import { validateFiles, type Material } from "../data/workspace"
import { useWorkspace } from "../workspace-context"
import { Dialog } from "./Dialog"
import { Button, Icon } from "./ui"

type Pending = {
  name: string
  size: number
  duplicate: "skip" | "version" | "copy"
}
export function UploadDocuments({ onClose }: { onClose: () => void }) {
  const ctx = useApp()
  const ws = useWorkspace()
  const input = useRef<HTMLInputElement>(null)
  const [files, setFiles] = useState<Pending[]>([])
  const [errors, setErrors] = useState<string[]>([])
  const [outcome, setOutcome] = useState<Material["outcome"]>("ready")
  const [dragging, setDragging] = useState(false)
  const select = (selected: { name: string; size: number }[]) => {
    const next = [
      ...files,
      ...selected.map((f) => ({
        name: f.name,
        size: f.size,
        duplicate: "skip" as const,
      })),
    ]
    if (next.length > 10) {
      setErrors(validateFiles(next))
      return
    }
    setErrors(validateFiles(next))
    setFiles(next)
  }
  const validFiles = files.filter((f) => !validateFiles([f]).length)
  const toAdd = validFiles.filter((f, i) => !(f.duplicate === "skip" && (
    ws.materials.some((m) => m.projectId === ctx.current?.id && m.stage !== "forbidden" && m.name === f.name) ||
    validFiles.slice(0, i).some((previous) => previous.name === f.name)
  )))
  const send = () => {
    if (!ctx.current || ctx.readOnly.is || !toAdd.length) return
    ws.add(ctx.current.id, validFiles, outcome)
    ctx.openProject(ctx.current.id, "docs")
    onClose()
  }
  return (
    <Dialog label="Добавить документы" onClose={onClose}>
      <div className="dialog-head">
        <div className="eyebrow">Библиотека проекта</div>
        <h2>Добавить документы</h2>
        <p className="muted">{ctx.current?.name}</p>
      </div>
      <div className="dialog-body">
        <p className="demo-notice">
          <Icon name="lock" size={16} />
          Макет: файлы не читаются и не отправляются. Просмотр и ответы
          используют синтетический текст. Данные сбросятся при перезагрузке.
        </p>
        <div
          className={`upload-zone ${dragging ? "dragging" : ""}`}
          onDragOver={(e) => {
            e.preventDefault()
            setDragging(true)
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault()
            setDragging(false)
            select(Array.from(e.dataTransfer.files))
          }}
        >
          <Icon name="upload" size={28} />
          <strong>Перетащите файлы сюда</strong>
          <p>PDF, DOCX, TXT · до 25 МБ · до 10 файлов</p>
          <Button onClick={() => input.current?.click()}>Выбрать файлы</Button>
          <input
            ref={input}
            type="file"
            multiple
            accept=".pdf,.docx,.txt"
            aria-label="Файлы для демонстрации"
            className="sr-only"
            onChange={(e) => {
              select(Array.from(e.target.files ?? []))
              e.target.value = ""
            }}
          />
        </div>
        <button
          className="text-action"
          disabled={files.length >= 10}
          onClick={() =>
            select([{ name: "Договор_поставки_образец.docx", size: 184320 }])
          }
        >
          Или добавить демонстрационный образец
        </button>
        {errors.length > 0 && (
          <div className="form-error" role="alert">
            {errors.map((error, i) => (
              <p key={i}>{error}</p>
            ))}
            <p>Можно добавить корректные файлы, отклонённые не загрузятся.</p>
          </div>
        )}
        {files.length > 0 && (
          <div className="pending-files">
            {files.map((f, i) => {
              const duplicate =
                ws.materials.some(
                  (m) =>
                    m.projectId === ctx.current?.id &&
                    m.stage !== "forbidden" &&
                    m.name === f.name,
                ) || files.slice(0, i).some((other) => other.name === f.name)
              const error = validateFiles([f])[0]
              return (
                <div className="pending-file" key={i}>
                  <div className="pending-title">
                    <Icon name="file" size={18} />
                    <div>
                      <strong>{f.name}</strong>
                      <small>
                        {(f.size / 1024).toFixed(0)} КБ
                        {error ? " · отклонён" : ""}
                      </small>
                    </div>
                    <button
                      className="icon-button"
                      aria-label={`Убрать ${f.name}`}
                      onClick={() => {
                        const next = files.filter((_, index) => index !== i)
                        setFiles(next)
                        setErrors(validateFiles(next))
                      }}
                    >
                      <Icon name="close" size={14} />
                    </button>
                  </div>
                  {duplicate && !error && (
                    <label className="duplicate-choice">
                      Файл с таким именем уже есть
                      <select
                        aria-label={`Дубликат ${f.name}`}
                        value={f.duplicate}
                        onChange={(e) =>
                          setFiles(
                            files.map((file, index) =>
                              index === i
                                ? {
                                    ...file,
                                    duplicate: e.target
                                      .value as Pending["duplicate"],
                                  }
                                : file,
                            ),
                          )
                        }
                      >
                        <option value="skip">Пропустить</option>
                        <option value="version">Добавить новую версию</option>
                        <option value="copy">
                          Добавить отдельным документом
                        </option>
                      </select>
                    </label>
                  )}
                </div>
              )
            })}
          </div>
        )}
        {validFiles.length > 0 && toAdd.length === 0 && <p className="help">Все корректные файлы выбраны для пропуска. Выберите новую версию или отдельный документ.</p>}
        <label className="field">
          <span className="visible-label">
            Демонстрационный результат обработки
          </span>
          <select
            value={outcome}
            onChange={(e) => setOutcome(e.target.value as Material["outcome"])}
          >
            <option value="ready">Текст извлечён, документ готов</option>
            <option value="partial">Частично извлечён текст — таблицы и приложения пропущены</option>
            <option value="ocr">Скан без текста — требуется OCR</option>
            <option value="error">Ошибка извлечения текста</option>
          </select>
        </label>
      </div>
      <div className="dialog-foot">
        <Button variant="ghost" onClick={onClose}>
          Отмена
        </Button>
        <Button
          variant="primary"
          icon="upload"
          disabled={ctx.readOnly.is || !toAdd.length}
          onClick={send}
        >
          Добавить{toAdd.length ? ` · ${toAdd.length}` : ""}
        </Button>
      </div>
    </Dialog>
  )
}
