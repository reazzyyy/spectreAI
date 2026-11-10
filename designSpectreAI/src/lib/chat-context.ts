import type {
  Material,
  SourceRef,
  Turn,
  WorkspaceSearchSummary,
} from "../data/workspace"

export const MAX_SELECTED_SOURCES = 10
export const MATERIAL_PAGE_SIZE = 12

export function incompleteSourceRefs(
  sources: SourceRef[],
  materials: Material[],
  projectId: string,
) {
  return sources.filter((s) =>
    materials.some(
      (m) =>
        m.projectId === projectId &&
        m.id === s.id &&
        m.stage !== "forbidden" &&
        m.versions.some(
          (v) => v.number === s.version && v.extraction === "partial",
        ),
    ),
  )
}

export function chatAnswerText(
  turn: Pick<Turn, "incompleteSources" | "searchSummary">,
  fullText: string,
  alternativeContext = false,
) {
  if (turn.searchSummary?.outcome === "failed")
    return "Поиск источников не выполнен. AI-ответ не создавался; повторите поиск."
  if (
    !alternativeContext &&
    (turn.searchSummary?.outcome === "no_matches" ||
      turn.searchSummary?.outcome === "no_ready")
  )
    return "В доступном контексте не найдено подтверждений. Это не доказывает отсутствие условия; уточните вопрос или проверьте готовность и полноту выбранных версий."
  const caveats: string[] = []
  if (
    alternativeContext &&
    turn.searchSummary &&
    ["no_matches", "no_ready"].includes(turn.searchSummary.outcome)
  )
    caveats.push(
      "В документальном наборе подтверждений не найдено. Ответ использует отдельный доступный контекст исследования, а не отсутствующие фрагменты документов.",
    )
  if (
    turn.searchSummary?.scope === "selected" &&
    turn.searchSummary.matched < turn.searchSummary.eligible
  )
    caveats.push(
      "Не весь выбранный набор дал совпадения. Ответ опирается только на указанные использованные источники; отсутствие совпадений в остальных материалах не доказывает отсутствие условия.",
    )
  if (
    turn.searchSummary &&
    turn.searchSummary.matched > turn.searchSummary.limit
  )
    caveats.push(
      `Ограниченный контекст: использовано не более ${turn.searchSummary.limit} из ${turn.searchSummary.matched} совпадений. Это не полная проверка всех материалов проекта.`,
    )
  if (turn.incompleteSources?.length)
    caveats.push(
      "Неполное извлечение: вывод предварительный. Таблицы, приложения или часть текста не извлечены и не проверены. Сверьте оригинал и загрузите полную версию; отсутствие совпадений не доказывает отсутствие условия.",
    )
  return caveats.length
    ? `${caveats.join("\n\n")}\n\nСинтетический фрагмент ответа:\n${fullText}`
    : fullText
}

export function filterChatMaterials(
  materials: Material[],
  projectId: string,
  query: string,
  filter: string,
  selected: SourceRef[],
) {
  const needle = query.trim().toLocaleLowerCase("ru")
  return materials.filter((m) => {
    if (m.projectId !== projectId) return false
    // A known unavailable placeholder is not searchable by its hidden metadata.
    if (m.stage === "forbidden") return !needle && filter === "all"
    return (
      m.name.toLocaleLowerCase("ru").includes(needle) &&
      (filter === "all" ||
        (filter === "ready" && m.stage === "ready") ||
        (filter === "processing" &&
          ["queued", "extracting", "indexing"].includes(m.stage)) ||
        (filter === "attention" &&
          (["ocr", "error"].includes(m.stage) ||
            (m.stage === "ready" &&
              m.versions.slice(-1)[0]?.extraction === "partial"))) ||
        (filter === "selected" && selected.some((s) => s.id === m.id)))
    )
  })
}

export function validChatSources(
  sources: SourceRef[],
  materials: Material[],
  projectId: string,
  historical = false,
) {
  return sources.filter((source) =>
    materials.some(
      (m) =>
        m.projectId === projectId &&
        m.id === source.id &&
        m.stage === "ready" &&
        m.versions.some((v) => v.number === source.version) &&
        (historical || m.versions.slice(-1)[0]?.number === source.version),
    ),
  )
}

const genericTerms = new Set([
  "проверь",
  "какие",
  "какой",
  "какая",
  "нужно",
  "расскажи",
  "документ",
  "документы",
  "материалы",
  "проекта",
  "можно",
  "почему",
  "вопрос",
  "согласно",
  "объясни",
  "сделай",
  "анализ",
])

// Local lexical matching of synthetic sample text, not uploaded file retrieval.
function sampleTerms(prompt: string) {
  return [
    ...new Set(
      (
        prompt
          .toLocaleLowerCase("ru")
          .replace(/ё/g, "е")
          .match(/[а-яa-z0-9]+/g) ?? []
      )
        .filter((term) => term.length >= 4 && !genericTerms.has(term))
        .map((term) => term.slice(0, 6)),
    ),
  ]
}

export function sampleEvidence(text: string, prompt: string) {
  const terms = sampleTerms(prompt)
  const blocks = text
    .split(/\n\s*\n/)
    .map((block, index) => ({
      text: block.trim(),
      index,
      score: terms.filter((term) =>
        block.toLocaleLowerCase("ru").replace(/ё/g, "е").includes(term),
      ).length,
    }))
    .filter((block) => block.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
  return blocks[0]?.text ?? ""
}

function searchSampleCandidates(
  candidates: {
    id: string
    version: number
    text: string
    partial: boolean
  }[],
  excluded: number,
  prompt: string,
  cap: number,
  fail: boolean,
  scope: "selected" | "workspace",
): {
  sources: SourceRef[]
  summary: WorkspaceSearchSummary
} {
  const partialEligible = candidates.filter((c) => c.partial).length
  if (fail)
    return {
      sources: [],
      summary: {
        scope,
        eligible: candidates.length,
        excluded,
        matched: 0,
        limit: cap,
        outcome: "failed",
        partialEligible,
        partialUsed: 0,
      },
    }
  const terms = sampleTerms(prompt)
  const ranked = candidates
    .map((candidate, index) => ({
      ...candidate,
      index,
      score: terms.filter((term) =>
        candidate.text
          .toLocaleLowerCase("ru")
          .replace(/ё/g, "е")
          .includes(term),
      ).length,
    }))
    .filter((candidate) => candidate.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
  const used = ranked.slice(0, cap)
  return {
    sources: used.map((c) => ({ id: c.id, version: c.version })),
    summary: {
      scope,
      eligible: candidates.length,
      excluded,
      matched: ranked.length,
      limit: cap,
      partialEligible,
      partialUsed: used.filter((c) => c.partial).length,
      outcome: !candidates.length
        ? "no_ready"
        : ranked.length
          ? "matched"
          : "no_matches",
    },
  }
}

export function searchSelectedSamples(
  materials: Material[],
  projectId: string,
  prompt: string,
  selected: SourceRef[],
  fail = false,
) {
  const valid = validChatSources(selected, materials, projectId, true)
  // A stale or inaccessible requested scope must not become a smaller silent scope.
  if (
    valid.length !== selected.length ||
    selected.length > MAX_SELECTED_SOURCES
  )
    return searchSampleCandidates(
      [],
      selected.length,
      prompt,
      MAX_SELECTED_SOURCES,
      true,
      "selected",
    )
  const candidates = valid.flatMap((s) => {
    const m = materials.find((m) => m.projectId === projectId && m.id === s.id)!
    const v = m.versions.find((v) => v.number === s.version)!
    return v.text.trim()
      ? [
          {
            id: s.id,
            version: v.number,
            text: v.text,
            partial: v.extraction === "partial",
          },
        ]
      : []
  })
  return searchSampleCandidates(
    candidates,
    selected.length - candidates.length,
    prompt,
    MAX_SELECTED_SOURCES,
    fail,
    "selected",
  )
}

export function searchWorkspaceSamples(
  materials: Material[],
  projectId: string,
  prompt: string,
  limit = 3,
  fail = false,
): {
  sources: SourceRef[]
  summary: WorkspaceSearchSummary
} {
  const visible = materials.filter(
    (m) => m.projectId === projectId && m.stage !== "forbidden",
  )
  const eligible = visible.filter(
    (m) => m.stage === "ready" && !!m.versions.slice(-1)[0]?.text.trim(),
  )
  const cap = Math.max(1, Number.isFinite(limit) ? Math.floor(limit) : 3)
  return searchSampleCandidates(
    eligible.map((m) => {
      const v = m.versions.slice(-1)[0]!
      return {
        id: m.id,
        version: v.number,
        text: v.text,
        partial: v.extraction === "partial",
      }
    }),
    visible.length - eligible.length,
    prompt,
    cap,
    fail,
    "workspace",
  )
}

export function chatResultBadge(
  status?: Turn["status"],
  failureStage?: Turn["failureStage"],
) {
  switch (status) {
    case "succeeded":
      return { label: "Ответ готов", tone: "success" as const }
    case "failed":
      return {
        label: failureStage === "retrieval" ? "Ошибка поиска" : "Ошибка ответа",
        tone: "danger" as const,
      }
    case "timed_out":
      return { label: "Время ожидания истекло", tone: "warning" as const }
    case "cancelled":
      return { label: "Остановлен", tone: "neutral" as const }
    case "queued":
      return { label: "В очереди", tone: "info" as const }
    case "running":
      return { label: "Готовим ответ", tone: "info" as const }
    default:
      return { label: "Нет сообщений", tone: "neutral" as const }
  }
}
