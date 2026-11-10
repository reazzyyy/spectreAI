import type { SourceRef } from "./workspace"

export type JobStatus = "queued" | "running" | "succeeded" | "failed" | "cancelled" | "timed_out"
export type ResearchOutcome = "success" | "empty" | "partial" | "failed" | "timed_out"
export type ResearchConfig = {
  question: string
  legalDate: string
  norms: boolean
  practice: boolean
  court: string
  year: string
  outcome: ResearchOutcome
}
export type ResearchRun = {
  id: string
  actorId?: string
  question: string
  status: JobStatus
  at: number
  outcome: ResearchOutcome
}
export type Research = {
  id: string
  projectId: string
  config: ResearchConfig
  runs: ResearchRun[]
  saved: boolean
}
export type LegalSource = {
  id: string
  kind: "norm" | "case"
  title: string
  court: string
  year: string
  date: string
  excerpt: string
}
export const legalSources: LegalSource[] = [
  {
    id: "law-333",
    kind: "norm",
    title: "ГК РФ · статья 333",
    court: "",
    year: "",
    date: "2020-01-01",
    excerpt:
      "Синтетическое изложение: при оценке размера неустойки требуется рассмотреть её соразмерность последствиям нарушения. Это не официальный текст нормы.",
  },
  {
    id: "law-394",
    kind: "norm",
    title: "ГК РФ · статья 394",
    court: "",
    year: "",
    date: "2020-01-01",
    excerpt:
      "Синтетическое изложение: соотношение убытков и неустойки зависит от закона и условий договора. Текст приведён только для демонстрации интерфейса.",
  },
  {
    id: "case-1",
    kind: "case",
    title: "Дело № ДЕМО-А40-124/2025",
    court: "arbitration",
    year: "2025",
    date: "2025-06-18",
    excerpt:
      "Вымышленный пример: суд сопоставил базу расчёта неустойки с объёмом просроченной поставки. Не является реальным судебным актом.",
  },
  {
    id: "case-2",
    kind: "case",
    title: "Определение № ДЕМО-305-2024",
    court: "supreme",
    year: "2024",
    date: "2024-03-12",
    excerpt:
      "Вымышленный пример: рассмотрены доводы о последствиях просрочки и размере ответственности. Реквизиты созданы для макета.",
  },
]
export const researchSummary =
  "В демонстрационном исследовании выделены два вопроса: соразмерность неустойки последствиям нарушения и соотношение неустойки с убытками. Для правовой позиции необходимо проверить действующую редакцию норм, факты просрочки и применимость судебных актов. Этот текст синтетический, источники не проверены."
export function sourcesFor(config: ResearchConfig) {
  return legalSources.filter(
    (s) =>
      s.date <= config.legalDate &&
      (s.kind === "norm"
        ? config.norms
        : config.practice &&
          (config.court === "all" || s.court === config.court) &&
          (config.year === "all" || s.year === config.year)),
  )
}
export const draftInitial = `ОТВЕТ НА ПРЕТЕНЗИЮ

Уважаемые коллеги!

ООО «Север-Проект» рассмотрело претензию по демонстрационному договору поставки № ДП-14.

1. Позиция доверителя

Основная часть товара передана и принята без замечаний по качеству. Причины и продолжительность просрочки требуют подтверждения документами.

2. Правовое обоснование

Заявленная неустойка рассчитана от стоимости всей партии, включая поставленный в срок товар. Полагаем, что такой расчёт требует проверки с учётом фактического объёма нарушения.

3. Предложение об урегулировании

Предлагаем сверить расчёт и обсудить размер ответственности исходя из стоимости товара, поставленного с просрочкой.

Демонстрационный текст. Требует проверки юристом.`
export type DraftVersion = {
  number: number
  text: string
  title: string
  label: string
  at: string
}
export type DraftAI = {
  mode: "clarify" | "shorten" | "review"
  actorId?: string
  status: JobStatus
  at: number
  baseRevision: number
  baseText: string
  proposedText: string
  outcome: "success" | "empty" | "failed"
  resolved?: boolean
}
export type LegalDraft = {
  id: string
  projectId: string
  title: string
  savedTitle: string
  kind: string
  author: string
  authorId: string
  text: string
  savedText: string
  editRevision: number
  touchedAt: number
  saveAt: number
  saveStatus: "saved" | "dirty" | "saving" | "error" | "conflict"
  saveOutcome: "success" | "error" | "conflict"
  manualSave: boolean
  versions: DraftVersion[]
  ai?: DraftAI
  sources: SourceRef[]
  researchId?: string
}
export function draftProposal(text: string, mode: DraftAI["mode"]) {
  return mode === "shorten"
    ? text
        .split("\n\n")
        .filter(Boolean)
        .slice(0, Math.max(1, Math.ceil(text.split("\n\n").length * 0.65)))
        .join("\n\n")
    : `${text}\n\nУточнение для обсуждения: база расчёта и общий предел ответственности подлежат отдельному согласованию с учётом фактических последствий нарушения.`
}
export function seedDrafts(): LegalDraft[] {
  return ["sever", "p-3"].map((projectId) => {
    const versions = [
      draftInitial.replace("сверить расчёт", "проверить расчёт"),
      draftInitial.replace(
        "обсудить размер ответственности",
        "согласовать ответственность",
      ),
      draftInitial,
    ].map((text, i) => ({
      number: i + 1,
      text,
      title: "Проект ответа на претензию",
      label:
        i === 0
          ? "Первый черновик"
          : i === 1
            ? "Уточнение позиции"
            : "Ручное сохранение",
      at: `27 октября, ${10 + i}:20`,
    }))
    return {
      id: projectId === "sever" ? "d1" : "d-view",
      projectId,
      title: "Проект ответа на претензию",
      savedTitle: "Проект ответа на претензию",
      kind: "Ответ на претензию",
      author: projectId === "sever" ? "Елена Крылова" : "Алексей Волков",
      authorId: projectId === "sever" ? "elena" : "alex",
      text: draftInitial,
      savedText: draftInitial,
      editRevision: 0,
      touchedAt: 0,
      saveAt: 0,
      saveStatus: "saved",
      saveOutcome: "success",
      manualSave: false,
      versions,
      sources: projectId === "sever" ? [{ id: "sever-0", version: 2 }] : [],
      ai: {
        mode: "clarify",
        status: "succeeded",
        at: 0,
        baseRevision: 0,
        baseText: draftInitial,
        proposedText: draftProposal(draftInitial, "clarify"),
        outcome: "success",
      },
    } as LegalDraft
  })
}
