import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import ts from "typescript"
const { outputText } = ts.transpileModule(
  readFileSync("src/lib/chat-context.ts", "utf8"),
  {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2020,
    },
  },
)
const {
  searchWorkspaceSamples: search,
  filterChatMaterials: filter,
  incompleteSourceRefs: partialRefs,
  chatAnswerText: answer,
  chatResultBadge: badge,
  MATERIAL_PAGE_SIZE,
  MAX_SELECTED_SOURCES,
} = await import(
  `data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`
)
let checks = 0
function check(name, fn) {
  fn()
  checks++
  console.log(`PASS ${name}`)
}
const doc = (id, changes = {}) => ({
  id,
  name: `${id}.pdf`,
  projectId: "sever",
  stage: "ready",
  versions: [
    { number: 1, text: "Неустойка за поставку.", extraction: "complete" },
  ],
  ...changes,
})
const partial = (id, changes = {}) =>
  doc(id, {
    versions: [
      { number: 1, text: "Неустойка за поставку.", extraction: "partial" },
    ],
    ...changes,
  })
const ref = (id, version = 1) => ({ id, version })
const many = Array.from({ length: 100 }, (_, i) =>
  doc(`doc${String(i).padStart(3, "0")}`),
)
check("retrieval failure is distinct from both no-ready and no-match", () => {
  assert.equal(
    search([], "sever", "Неустойка", 3, true).summary.outcome,
    "failed",
  )
  assert.equal(search([], "sever", "Неустойка").summary.outcome, "no_ready")
  assert.equal(
    search([doc("a")], "sever", "Телепортация").summary.outcome,
    "no_matches",
  )
})
check("retrieval failure has no used sources or fabricated answer text", () => {
  const result = search([doc("a")], "sever", "Неустойка", 3, true)
  assert.deepEqual(result.sources, [])
  assert.equal(
    answer({ searchSummary: result.summary }, "MUST NOT COPY"),
    "Поиск источников не выполнен. AI-ответ не создавался; повторите поиск.",
  )
})
check("retry without failure reevaluates current sources", () => {
  assert.equal(
    search([doc("a")], "sever", "Неустойка", 3, true).summary.outcome,
    "failed",
  )
  assert.deepEqual(search([doc("b")], "sever", "Неустойка").sources, [ref("b")])
})
check("failure summary never reveals forbidden or foreign metadata", () => {
  const result = search(
    [
      doc("a"),
      doc("SECRET", { stage: "forbidden" }),
      doc("FOREIGN", { projectId: "other" }),
    ],
    "sever",
    "Неустойка",
    3,
    true,
  )
  assert.equal(result.summary.eligible, 1)
  assert.equal(JSON.stringify(result).includes("SECRET"), false)
  assert.equal(JSON.stringify(result).includes("FOREIGN"), false)
})
check(
  "one hundred candidates do not silently become one hundred used sources",
  () => {
    const result = search(many, "sever", "Неустойка")
    assert.equal(result.summary.eligible, 100)
    assert.equal(result.summary.matched, 100)
    assert.equal(result.sources.length, 3)
    assert.deepEqual(result.sources, [
      ref("doc000"),
      ref("doc001"),
      ref("doc002"),
    ])
  },
)
check("search snapshot remains immutable when new material is added", () => {
  const old = search(many, "sever", "Неустойка")
  search([doc("new"), ...many], "sever", "Неустойка")
  assert.equal(old.summary.eligible, 100)
  assert.equal(old.sources[0].id, "doc000")
})
check("partial extraction remains eligible but explicitly counted", () => {
  const result = search([partial("p"), doc("a")], "sever", "Неустойка")
  assert.equal(result.summary.partialEligible, 1)
  assert.equal(result.summary.partialUsed, 1)
  assert.deepEqual(
    partialRefs(result.sources, [partial("p"), doc("a")], "sever"),
    [ref("p")],
  )
})
check("unused partial document does not taint the used source snapshot", () => {
  const result = search(
    [doc("a"), doc("b"), doc("c"), partial("p")],
    "sever",
    "Неустойка",
  )
  assert.equal(result.summary.partialEligible, 1)
  assert.equal(result.summary.partialUsed, 0)
})
check("partial no-match still reports incomplete search coverage", () => {
  const result = search([partial("p")], "sever", "Пропущенная таблица")
  assert.equal(result.summary.outcome, "no_matches")
  assert.equal(result.summary.partialEligible, 1)
  assert.equal(result.summary.partialUsed, 0)
})
check(
  "quality follows exact historical version, not the latest version",
  () => {
    const versions = [
      { number: 1, text: "Неустойка", extraction: "partial" },
      { number: 2, text: "Неустойка и убытки", extraction: "complete" },
    ]
    assert.deepEqual(
      partialRefs(
        [ref("a", 1), ref("a", 2)],
        [doc("a", { versions })],
        "sever",
      ),
      [ref("a", 1)],
    )
    assert.equal(
      search([doc("a", { versions })], "sever", "Неустойка").summary
        .partialUsed,
      0,
    )
  },
)
check(
  "incomplete references never include unavailable or foreign versions",
  () => {
    assert.deepEqual(
      partialRefs(
        [ref("p"), ref("f"), ref("gone")],
        [
          partial("p", { stage: "forbidden" }),
          partial("f", { projectId: "other" }),
        ],
        "sever",
      ),
      [],
    )
  },
)
check("complete answer text is unchanged", () => {
  assert.equal(answer({}, "ORIGINAL"), "ORIGINAL")
})
check("partial answer copy includes a prominent caveat", () => {
  const text = answer({ incompleteSources: [ref("p")] }, "ANSWER")
  assert.ok(text.startsWith("Неполное извлечение"))
  assert.ok(text.includes("не доказывает отсутствие условия"))
  assert.ok(text.includes("ANSWER"))
})
check("context truncation warning travels with copy and Draft text", () => {
  const text = answer(
    { searchSummary: search(many, "sever", "Неустойка").summary },
    "ANSWER",
  )
  assert.ok(text.includes("3 из 100"))
  assert.ok(text.includes("не полная проверка"))
})
check("partial and limited-context warnings are both retained", () => {
  const text = answer(
    {
      incompleteSources: [ref("p")],
      searchSummary: search([partial("p"), ...many], "sever", "Неустойка")
        .summary,
    },
    "ANSWER",
  )
  assert.ok(text.includes("Ограниченный контекст"))
  assert.ok(text.includes("Неполное извлечение"))
})
check("material search is scoped to the current project", () => {
  assert.deepEqual(
    filter(
      [doc("a"), doc("b", { projectId: "other" })],
      "sever",
      "",
      "all",
      [],
    ).map((m) => m.id),
    ["a"],
  )
})
check(
  "hidden names are not searchable and unavailable rows remain generic",
  () => {
    const docs = [doc("SECRET", { stage: "forbidden" }), doc("public")]
    assert.equal(filter(docs, "sever", "SECRET", "all", []).length, 0)
    assert.equal(filter(docs, "sever", "unknown", "all", []).length, 0)
    assert.equal(filter(docs, "sever", "", "ready", []).length, 1)
  },
)
check("search ignores case and surrounding whitespace", () => {
  assert.equal(
    filter([doc("Example")], "sever", " EXAMPLE ", "all", []).length,
    1,
  )
})
check("readiness filter excludes pending OCR and failed processing", () => {
  const docs = [
    doc("a"),
    partial("p"),
    doc("q", { stage: "queued" }),
    doc("o", { stage: "ocr" }),
    doc("e", { stage: "error" }),
  ]
  assert.equal(filter(docs, "sever", "", "ready", []).length, 2)
  assert.equal(filter(docs, "sever", "", "processing", []).length, 1)
  assert.equal(filter(docs, "sever", "", "attention", []).length, 3)
})
check(
  "a configured partial outcome is not presented as completed extraction while processing",
  () => {
    assert.equal(
      filter(
        [partial("p", { stage: "indexing" })],
        "sever",
        "",
        "attention",
        [],
      ).length,
      0,
    )
    assert.equal(
      search([partial("p", { stage: "indexing" })], "sever", "Неустойка")
        .summary.partialEligible,
      0,
    )
  },
)
check(
  "selected filter is independent of pagination and does not mutate selection",
  () => {
    const selected = [ref("doc000"), ref("doc099")]
    assert.deepEqual(
      filter(many, "sever", "", "selected", selected).map((m) => m.id),
      ["doc000", "doc099"],
    )
    assert.equal(selected.length, 2)
  },
)
check("page size is bounded and pages do not overlap", () => {
  assert.equal(MATERIAL_PAGE_SIZE, 12)
  const a = filter(many, "sever", "", "all", []).slice(0, MATERIAL_PAGE_SIZE)
  const b = filter(many, "sever", "", "all", []).slice(
    MATERIAL_PAGE_SIZE,
    MATERIAL_PAGE_SIZE * 2,
  )
  assert.equal(a.length, 12)
  assert.equal(
    a.some((m) => b.includes(m)),
    false,
  )
})
check(
  "manual context cap is explicit, not an implicit source truncation",
  () => {
    assert.equal(MAX_SELECTED_SOURCES, 10)
    const selected = many.slice(0, 11).map((m) => ref(m.id))
    assert.equal(filter(many, "sever", "", "selected", selected).length, 11)
    assert.ok(selected.length > MAX_SELECTED_SOURCES)
  },
)
check(
  "retrieval failure and AI failure have distinct project list statuses",
  () => {
    assert.equal(badge("failed", "retrieval").label, "Ошибка поиска")
    assert.equal(badge("failed").label, "Ошибка ответа")
    assert.equal(badge("cancelled", "retrieval").label, "Остановлен")
  },
)
console.log(`${checks} UI-09 model groups passed`)
