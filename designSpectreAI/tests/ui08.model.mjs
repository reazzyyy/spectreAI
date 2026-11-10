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
  validChatSources: valid,
  chatResultBadge: badge,
} = await import(
  `data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`
)
let checks = 0
function check(name, fn) {
  fn()
  checks++
  console.log(`PASS ${name}`)
}
const material = (id, overrides = {}) => ({
  id,
  projectId: "sever",
  name: `PRIVATE_${id}.pdf`,
  stage: "ready",
  versions: [
    {
      number: 1,
      text: "Неустойка за просрочку поставки. Ответственность сторон.",
    },
  ],
  ...overrides,
})
const ref = (id, version = 1) => ({ id, version })
check("search includes only the requested project", () => {
  const result = search(
    [material("a"), material("b", { projectId: "other" })],
    "sever",
    "Неустойка",
  )
  assert.deepEqual(result.sources, [ref("a")])
  assert.equal(result.summary.eligible, 1)
})
check("forbidden metadata and counts stay out of retrieval summary", () => {
  const result = search(
    [material("a"), material("secret", { stage: "forbidden" })],
    "sever",
    "Неустойка",
  )
  assert.deepEqual(result.sources, [ref("a")])
  assert.equal(result.summary.eligible, 1)
  assert.equal(result.summary.excluded, 0)
  assert.equal(JSON.stringify(result).includes("secret"), false)
})
check("queued extraction indexing OCR and errors are excluded", () => {
  const stages = ["queued", "extracting", "indexing", "ocr", "error"]
  const result = search(
    stages.map((stage) => material(stage, { stage })),
    "sever",
    "Неустойка",
  )
  assert.equal(result.summary.outcome, "no_ready")
  assert.equal(result.summary.excluded, 5)
  assert.deepEqual(result.sources, [])
})
check("empty extracted text is not ready evidence", () => {
  const result = search(
    [material("a", { versions: [{ number: 1, text: "  " }] })],
    "sever",
    "Неустойка",
  )
  assert.equal(result.summary.outcome, "no_ready")
})
check(
  "only latest version is searched and actual version number is returned",
  () => {
    const versions = [
      { number: 2, text: "Неустойка" },
      { number: 7, text: "Аренда склада" },
    ]
    assert.equal(
      search([material("a", { versions })], "sever", "Неустойка").summary
        .outcome,
      "no_matches",
    )
    assert.deepEqual(
      search([material("a", { versions })], "sever", "Аренда").sources,
      [ref("a", 7)],
    )
  },
)
check("no matches is not a fabricated legal answer", () => {
  const result = search([material("a")], "sever", "Телепортация")
  assert.equal(result.summary.outcome, "no_matches")
  assert.equal(result.summary.eligible, 1)
  assert.equal(result.summary.matched, 0)
  assert.deepEqual(result.sources, [])
})
check("empty and generic questions do not select arbitrary documents", () => {
  for (const prompt of ["", "Проверь документ", "Какие материалы проекта"]) {
    assert.deepEqual(search([material("a")], "sever", prompt).sources, [])
  }
})
check("lexical sample matching handles case and inflection prefixes", () => {
  assert.equal(
    search([material("a")], "sever", "Проверь НЕУСТОЙКУ").summary.outcome,
    "matched",
  )
})
check("all eligible are considered but only three matched sources used", () => {
  const result = search(
    Array.from({ length: 5 }, (_, i) => material(`m${i}`)),
    "sever",
    "Неустойка",
  )
  assert.equal(result.summary.eligible, 5)
  assert.equal(result.summary.matched, 5)
  assert.equal(result.summary.limit, 3)
  assert.equal(result.sources.length, 3)
})
check("ranking is deterministic and prefers more matched terms", () => {
  const docs = [
    material("less", { versions: [{ number: 1, text: "Неустойка" }] }),
    material("more"),
  ]
  const a = search(docs, "sever", "Неустойка и ответственность", 1)
  assert.deepEqual(a.sources, [ref("more")])
  assert.deepEqual(a, search(docs, "sever", "Неустойка и ответственность", 1))
})
check("invalid internal limits are bounded without losing the result", () => {
  for (const limit of [0, -4, NaN, Infinity]) {
    assert.ok(
      search([material("a")], "sever", "Неустойка", limit).sources.length > 0,
    )
  }
})
check(
  "source references and summary do not contain material contents or names",
  () => {
    const result = JSON.stringify(search([material("a")], "sever", "Неустойка"))
    assert.equal(result.includes("PRIVATE"), false)
    assert.equal(result.includes("Ответственность сторон"), false)
  },
)
check("selected sources do not expand to other documents", () => {
  assert.deepEqual(valid([ref("a")], [material("a"), material("b")], "sever"), [
    ref("a"),
  ])
})
check("missing revoked unready and wrong-tenant selections are invalid", () => {
  const docs = [
    material("secret", { stage: "forbidden" }),
    material("pending", { stage: "queued" }),
    material("foreign", { projectId: "other" }),
  ]
  assert.deepEqual(
    valid(
      [ref("gone"), ref("secret"), ref("pending"), ref("foreign")],
      docs,
      "sever",
      true,
    ),
    [],
  )
})
check(
  "normal continuation requires latest version but explicit branch can pin history",
  () => {
    const docs = [
      material("a", {
        versions: [
          { number: 1, text: "old" },
          { number: 2, text: "new" },
        ],
      }),
    ]
    assert.deepEqual(valid([ref("a", 1)], docs, "sever"), [])
    assert.deepEqual(valid([ref("a", 1)], docs, "sever", true), [ref("a", 1)])
  },
)
check(
  "historical branch never revives absent version or revoked material",
  () => {
    assert.deepEqual(valid([ref("a", 9)], [material("a")], "sever", true), [])
    assert.deepEqual(
      valid([ref("a")], [material("a", { stage: "forbidden" })], "sever", true),
      [],
    )
  },
)
check(
  "repair returns only usable references without mutating selection",
  () => {
    const selected = [ref("a"), ref("gone")]
    assert.deepEqual(valid(selected, [material("a")], "sever"), [ref("a")])
    assert.equal(selected.length, 2)
  },
)
check("job badges distinguish queued running success and cancellation", () => {
  const labels = ["queued", "running", "succeeded", "cancelled"].map(
    (s) => badge(s).label,
  )
  assert.equal(new Set(labels).size, 4)
})
check("failed and timed out are never presented as running", () => {
  assert.deepEqual(badge("failed"), { label: "Ошибка ответа", tone: "danger" })
  assert.deepEqual(badge("timed_out"), {
    label: "Время ожидания истекло",
    tone: "warning",
  })
})
check("absent turn has explicit empty status", () => {
  assert.deepEqual(badge(), { label: "Нет сообщений", tone: "neutral" })
})
console.log(`${checks} UI-08 model groups passed`)
