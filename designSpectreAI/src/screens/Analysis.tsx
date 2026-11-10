import { useState } from "react"
import { useApp } from "../app-context"
import { Dialog } from "../components/Dialog"
import { Shell } from "../components/shell"
import {
  Badge,
  Button,
  Icon,
  StateCard,
  type ScreenProps,
} from "../components/ui"
import { UploadDocuments } from "../components/UploadDocuments"
import { stageLabel, stageTone } from "../data/workspace"
import { useWorkspace } from "../workspace-context"

export function AnalysisScreen({ go, scenario }: ScreenProps) {
  const ctx = useApp()
  const ws = useWorkspace()
  const materials = ws.materials.filter((m) => m.projectId === ctx.current?.id)
  const doc = ctx.route.documentName
    ? materials.find((m) => m.name === ctx.route.documentName)
    : materials.find((m) => m.stage === "ready")
  const [version, setVersion] = useState(
    ctx.route.documentVersion ?? doc?.versions.length ?? 1,
  )
  const [mode, setMode] = useState<"preview" | "analysis">("preview")
  const [page, setPage] = useState(1)
  const [dialog, setDialog] = useState<"rename" | "delete" | null>(null)
  const [name, setName] = useState(doc?.name ?? "")
  const [upload, setUpload] = useState(scenario === "upload")
  const ro = ctx.readOnly.is
  const back = () => ctx.openProject(ctx.current!.id, "docs")
  const v = doc?.versions.find((v) => v.number === version)
  const isPdf = !!doc?.name.toLowerCase().endsWith(".pdf")
  const pages = v
    ? [
        v.text.split("\n\n").slice(0, 4).join("\n\n"),
        v.text.split("\n\n").slice(4).join("\n\n"),
      ]
    : []
  const canDelete =
    !!doc &&
    !ro &&
    (ctx.current?.role === "owner" || doc.authorId === ctx.identity.userId)
  const canRename = !!doc && !ro
  const nameTaken = materials.some(
    (m) => m.id !== doc?.id && m.name === name.trim(),
  )
  return (
    <Shell screen="analysis" go={go} project={ctx.current} projectTab="docs">
      <div className="page document-detail">
        <button className="back-link" onClick={back}>
          <Icon name="chevron" size={14} />
          Документы проекта
        </button>
        {!doc || doc.stage === "forbidden" ? (
          <StateCard
            icon="lock"
            title="Документ недоступен"
            text="Материала нет в этом проекте или доступ ограничен. Название и содержимое скрыты."
          >
            <Button onClick={back}>К библиотеке</Button>
            {!ro && (
              <Button onClick={() => setUpload(true)}>Добавить документ</Button>
            )}
          </StateCard>
        ) : (
          <>
            <div className="page-head compact">
              <div>
                <div className="eyebrow">Оригинал документа</div>
                <h1>{doc.name}</h1>
                <p className="muted">
                  {Math.round(doc.bytes / 1024)} КБ · {doc.author} · 27 октября
                  2026
                </p>
              </div>
              <Badge tone={doc.stage === "ready" && v?.extraction === "partial" ? "warning" : stageTone(doc.stage)}>{doc.stage === "ready" && v?.extraction === "partial" ? "Текст извлечён частично" : stageLabel[doc.stage]}</Badge>
            </div>
            {doc.stage === "ready" && v?.extraction === "partial" && <div className="extraction-warning">
              <strong>Неполное извлечение версии {v.number}</strong>
              <p>Доступен только извлечённый фрагмент синтетического образца. Таблицы, приложения и часть текста не проверены. Такой источник можно использовать лишь для предварительного ответа; сверяйте оригинал и добавьте полную версию.</p>
              <Button disabled={ro} onClick={() => setUpload(true)}>Добавить полную версию</Button>
            </div>}
            <div className="document-actionbar">
              <div className="tabs">
                <button
                  className={mode === "preview" ? "active" : ""}
                  onClick={() => setMode("preview")}
                >
                  Просмотр
                </button>
                <button
                  className={mode === "analysis" ? "active" : ""}
                  disabled={doc.stage !== "ready"}
                  onClick={() => setMode("analysis")}
                >
                  Анализ рисков
                </button>
              </div>
              <div className="head-actions">
                <Button
                  icon="chat"
                  variant="primary"
                  disabled={
                    ro ||
                    doc.stage !== "ready" ||
                    !v ||
                    version !== doc.versions.length
                  }
                  title={
                    version !== doc.versions.length
                      ? "Для нового чата выберите текущую версию"
                      : undefined
                  }
                  onClick={() => ctx.startChat("", doc.name)}
                >
                  Обсудить в чате
                </Button>
                <Button
                  icon="edit"
                  disabled={!canRename}
                  onClick={() => setDialog("rename")}
                >
                  Переименовать
                </Button>
                <Button
                  disabled={!canDelete}
                  title={
                    !canDelete
                      ? "OWNER удаляет доступное, EDITOR — только своё"
                      : undefined
                  }
                  onClick={() => setDialog("delete")}
                >
                  Удалить
                </Button>
              </div>
            </div>
            {["queued", "extracting", "indexing"].includes(doc.stage) ? (
              <div className="processing-card" aria-live="polite">
                <span className="state-icon accent">
                  <Icon name="layers" size={24} />
                </span>
                <h2>Подготавливаем документ</h2>
                <p className="muted">
                  Демонстрационная обработка завершится автоматически. Можно
                  перейти в другой раздел.
                </p>
                <ol className="processing-steps">
                  {(["queued", "extracting", "indexing"] as const).map(
                    (stage, i) => (
                      <li
                        key={stage}
                        className={stage === doc.stage ? "current" : ""}
                      >
                        <span>{i + 1}</span>
                        {stageLabel[stage]}
                      </li>
                    ),
                  )}
                </ol>
                <Button onClick={back}>Вернуться к документам</Button>
              </div>
            ) : doc.stage === "error" || doc.stage === "ocr" ? (
              <StateCard
                icon="warning"
                tone={doc.stage === "error" ? "danger" : "neutral"}
                title={
                  doc.stage === "ocr"
                    ? "Нужен текстовый слой"
                    : "Не удалось извлечь текст"
                }
                text={
                  doc.stage === "ocr"
                    ? "Скан не включён в поиск и AI-контекст. Загрузите распознанную версию. OCR в этом макете не подключён."
                    : "Документ остался в проекте. Повторите обработку или добавьте другую версию."
                }
              >
                <Button
                  variant="primary"
                  disabled={ro}
                  onClick={() => ws.retry(doc.id)}
                >
                  {doc.stage === "ocr"
                    ? "Показать успешную обработку (демо)"
                    : "Повторить обработку"}
                </Button>
                <Button disabled={ro} onClick={() => setUpload(true)}>
                  Добавить версию
                </Button>
              </StateCard>
            ) : (
              <div className="document-view-layout">
                <div>
                  <div className="preview-toolbar">
                    <span>
                      <Icon name="file" size={15} />
                      {isPdf ? "Постраничный просмотр" : "Текстовый просмотр"}
                    </span>
                    <label>
                      Версия{" "}
                      <select
                        aria-label="Версия документа"
                        value={version}
                        onChange={(e) => {
                          setVersion(Number(e.target.value))
                          setPage(1)
                        }}
                      >
                        {doc.versions.map((v) => (
                          <option key={v.number} value={v.number}>
                            {v.number}
                            {v.number === doc.versions.length
                              ? " · текущая"
                              : ""}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  {!v ? (
                    <StateCard
                      icon="warning"
                      title="Версия недоступна"
                      text="Версия из ссылки не найдена. Выберите существующую версию."
                    />
                  ) : (
                    <article className="document-paper">
                      <div className="paper-kicker">
                        СИНТЕТИЧЕСКИЙ ОБРАЗЕЦ · НЕ СОДЕРЖИМОЕ ФАЙЛА
                      </div>
                      {isPdf && v.extraction === "partial" && !pages[page - 1]?.trim()
                        ? <div className="note" role="status"><strong>Фрагмент страницы не извлечён</strong><p>Это не означает, что страница оригинала пустая. В макете показано ограничение извлечения, не содержимое файла.</p></div>
                        : <pre>{isPdf ? pages[page - 1] : v.text}</pre>}
                    </article>
                  )}
                  {isPdf && (
                    <div className="pdf-pagination">
                      <Button disabled={page === 1} onClick={() => setPage(1)}>
                        Назад
                      </Button>
                      <span>Страница {page} из 2 · образец</span>
                      <Button disabled={page === 2} onClick={() => setPage(2)}>
                        Далее
                      </Button>
                    </div>
                  )}
                </div>
                <aside className="document-info">
                  {mode === "analysis" ? (
                    <>
                      <div className="eyebrow">Анализ версии {version}</div>
                      <h2>Риски договора</h2>
                      <p className="muted">
                        Демонстрационные замечания к образцу, не к выбранному
                        файлу.
                      </p>
                      {!ro ? (
                        <>
                          {v?.extraction === "partial" && <p className="assumption">Полная проверка рисков невозможна: неизвлечённые пункты, таблицы и приложения не оценены. Обсудите доступный фрагмент или добавьте полную версию.</p>}
                          {v?.extraction !== "partial" && <>
                          <div className="risk-card">
                            <Badge tone="warning">Средний риск · п. 5.1</Badge>
                            <h3>База расчёта неустойки</h3>
                            <p>
                              Стоимость всей партии может превышать стоимость
                              просроченной поставки.
                            </p>
                          </div>
                          <div className="risk-card">
                            <Badge tone="danger">Высокий риск · п. 5.2</Badge>
                            <h3>Нет общего предела убытков</h3>
                            <p>
                              Уточните соотношение неустойки и возмещения
                              убытков.
                            </p>
                          </div>
                          </>}
                          <Button
                            icon="chat"
                            disabled={version !== doc.versions.length}
                            onClick={() =>
                              ctx.startChat(
                                "Разбери риски ответственности в демонстрационном условии",
                                doc.name,
                              )
                            }
                          >
                            {v?.extraction === "partial" ? "Обсудить извлечённый фрагмент" : "Обсудить замечания"}
                          </Button>
                        </>
                      ) : (
                        <p className="demo-notice">
                          VIEWER может читать документ, но не запускать новый
                          AI-анализ.
                        </p>
                      )}
                    </>
                  ) : (
                    <>
                      <div className="eyebrow">О документе</div>
                      <h2>Версия {version}</h2>
                      <dl>
                        <dt>Добавил</dt>
                        <dd>{doc.author}</dd>
                        <dt>Изменено</dt>
                        <dd>{v?.at ?? "Неизвестно"}</dd>
                        <dt>Доступ</dt>
                        <dd>Участники проекта</dd>
                        <dt>Готовность</dt>
                        <dd>{v?.extraction === "partial" ? "Доступен только извлечённый фрагмент" : "Текст и поиск доступны"}</dd>
                      </dl>
                      <p className="demo-notice">
                        Текст показан для демонстрации UX. Извлечение, OCR и
                        реальный AI не подключены.
                      </p>
                      <p className="note">
                        DOCX/TXT — текст без сохранения офисной вёрстки.
                        Оригинал не редактируется; для правок используется
                        отдельный Draft.
                      </p>
                      {version !== doc.versions.length && (
                        <p className="assumption">
                          Историческая версия. Ответы, основанные на ней, не
                          переключаются на новую автоматически.
                        </p>
                      )}
                    </>
                  )}
                </aside>
              </div>
            )}
          </>
        )}
      </div>
      {upload && (
        <UploadDocuments
          onClose={() => {
            setUpload(false)
            if (scenario === "upload") back()
          }}
        />
      )}
      {dialog && doc && (
        <Dialog
          label={
            dialog === "delete" ? "Удалить документ" : "Переименовать документ"
          }
          onClose={() => setDialog(null)}
        >
          <div className="dialog-head">
            <h2>
              {dialog === "delete"
                ? "Удалить документ?"
                : "Переименовать документ"}
            </h2>
          </div>
          <div className="dialog-body">
            {dialog === "delete" ? (
              <>
                <p>
                  «{doc.name}» и его версии станут недоступны. Зависимые
                  AI-ответы будут закрыты, чтобы история не обходила удаление
                  источника.
                </p>
                <p className="help">
                  В макете — удаление из памяти. В целевой системе
                  активные/производные данные удаляются до 24 ч, бэкапы — 35
                  дней.
                </p>
              </>
            ) : (
              <label className="field">
                <span>Название</span>
                <input
                  value={name}
                  maxLength={160}
                  onChange={(e) => setName(e.target.value)}
                />
                {nameTaken && (
                  <span className="field-error">
                    Это название уже используется
                  </span>
                )}
              </label>
            )}
          </div>
          <div className="dialog-foot">
            <Button variant="ghost" onClick={() => setDialog(null)}>
              Отмена
            </Button>
            <Button
              variant="primary"
              disabled={
                ro ||
                (dialog === "delete" ? !canDelete : !name.trim() || nameTaken)
              }
              onClick={() => {
                if (dialog === "delete") {
                  ws.remove(doc.id)
                  back()
                } else {
                  ws.rename(doc.id, name)
                  ctx.openDocument(doc.projectId, name.trim())
                }
                setDialog(null)
              }}
            >
              {dialog === "delete" ? "Удалить" : "Сохранить"}
            </Button>
          </div>
        </Dialog>
      )}
    </Shell>
  )
}
