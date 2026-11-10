import { docsFor } from "./documents"

export type DocumentStage = "queued" | "extracting" | "indexing" | "ready" | "ocr" | "error" | "forbidden"
export type DocumentVersion = {
  number: number
  text: string
  at: string
  extraction?: "complete" | "partial"
}
export type Material = {
  id: string
  projectId: string
  name: string
  bytes: number
  author: string
  authorId: string
  processingActorId?: string
  date: string
  stage: DocumentStage
  outcome: "ready" | "ocr" | "error" | "partial"
  stepAt: number
  versions: DocumentVersion[]
}
export const stageLabel: Record<DocumentStage, string> = {
  queued: "В очереди",
  extracting: "Извлечение текста",
  indexing: "Подготовка к поиску",
  ready: "Готов к работе",
  ocr: "Требуется OCR",
  error: "Ошибка обработки",
  forbidden: "Нет доступа",
}
export const stageTone = (s: DocumentStage) =>
  s === "ready"
    ? "success" as const
    : s === "error"
      ? "danger" as const
      : s === "forbidden"
        ? "neutral" as const
        : "warning" as const
export const sampleText = `ДЕМОНСТРАЦИОННЫЙ ДОГОВОР ПОСТАВКИ

1. Предмет договора
Поставщик обязуется передать товар, а Покупатель — принять и оплатить его в порядке, установленном договором.

5. Ответственность сторон
5.1. За нарушение срока поставки Поставщик уплачивает Покупателю неустойку в размере 0,5% от стоимости всей партии товара за каждый день просрочки.

5.2. Уплата неустойки не освобождает Поставщика от исполнения обязательства и возмещения убытков в полном объёме.

5.3. Покупатель вправе удержать сумму начисленной неустойки из платежей, причитающихся Поставщику.

6. Обстоятельства непреодолимой силы
6.1. Сторона уведомляет другую сторону о наступлении обстоятельств непреодолимой силы в течение одного рабочего дня.

6.2. Срок исполнения продлевается соразмерно времени действия таких обстоятельств.`

export function seedMaterials(): Material[] {
  return ["sever", "spor"].flatMap((projectId) =>
    docsFor(projectId).map((d, i) => ({
      id: `${projectId}-${i}`,
      projectId,
      name: d.name,
      bytes: 245760 + i * 1024,
      author: i === 0 ? "Елена Крылова" : "Алексей Волков",
      authorId: i === 0 ? "elena" : "alex",
      date: "2026-10-27",
      stage: (d.scenario === "forbidden"
        ? "forbidden"
        : d.scenario === "error"
          ? "error"
          : d.scenario === "processing" || d.scenario === "uploaded"
            ? "queued"
            : "ready") as DocumentStage,
      outcome: "ready" as const,
      stepAt: Date.now(),
      versions: [
        {
          number: 1,
          text: sampleText.replace("0,5%", "0,3%"),
          at: "26 октября, 10:00",
        },
        { number: 2, text: sampleText, at: "27 октября, 11:20" },
      ],
    })),
  )
}

export function validateFiles(files: { name: string; size: number }[]) {
  if (files.length > 10)
    return ["За одну операцию можно добавить не более 10 файлов."]
  return files.flatMap((f) => {
    if (!/\.(pdf|docx|txt)$/i.test(f.name))
      return [`${f.name}: поддерживаются только PDF, DOCX и TXT.`]
    if (f.size > 25 * 1024 * 1024) return [`${f.name}: размер превышает 25 МБ.`]
    if (!f.size) return [`${f.name}: файл пуст.`]
    return []
  })
}

export type SourceRef = { id: string; version: number }
export type ChatContextMode = "selected" | "workspace"
export type WorkspaceSearchSummary = {
  scope?: ChatContextMode
  eligible: number
  excluded: number
  matched: number
  limit: number
  outcome: "matched" | "no_matches" | "no_ready" | "failed"
  partialEligible?: number
  partialUsed?: number
}
export type ChatComposerState = {
  prompt: string
  sources: SourceRef[]
  mode: ChatContextMode
  branch: boolean
}
export type AIOutcome = "succeeded" | "failed" | "timed_out"
export type Turn = {
  id: string
  actorId?: string
  prompt: string
  status: "queued" | "running" | "succeeded" | "cancelled" | "failed" | "timed_out"
  outcome?: AIOutcome
  at: number
  sources: SourceRef[]
  contextMode?: ChatContextMode
  contextSources?: SourceRef[]
  searchSummary?: WorkspaceSearchSummary
  failureStage?: "retrieval"
  cancelReason?: "access" | "user"
  incompleteSources?: SourceRef[]
  partial: boolean
}
export type Conversation = {
  id: string
  creatorId?: string
  projectId: string
  title: string
  visibility: "PRIVATE" | "WORKSPACE"
  researchId?: string
  researchRunId?: string
  turns: Turn[]
}
export const demoAnswer =
  "В демонстрационном условии неустойка исчисляется от стоимости всей партии. Для юридической проверки важно сопоставить базу расчёта с объёмом просроченной поставки, оценить соразмерность и отдельно согласовать предел ответственности. Это синтетический пример, а не результат анализа вашего файла или подтверждённая правовая консультация."
