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
  searchSelectedSamples: search,
  searchWorkspaceSamples: workspace,
  sampleEvidence: evidence,
  chatAnswerText: answer,
  incompleteSourceRefs: partialRefs,
} = await import(
  `data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`
)
let checks = 0
function check(name, fn) {
  fn()
  checks++
  console.log(`PASS ${name}`)
}
const doc = (id, text = "5.1. Неустойка за поставку.", changes = {}) => ({
  id,
  projectId: "sever",
  name: `PRIVATE_${id}.pdf`,
  stage: "ready",
  versions: [{ number: 1, text, extraction: "complete" }],
  ...changes,
})
const ref = (id, version = 1) => ({ id, version })
check("selected negative question never cites the selected document", () => {
  const result = search([doc("a")], "sever", "Телепортация", [ref("a")])
  assert.deepEqual(result.sources, [])
  assert.equal(result.summary.scope, "selected")
  assert.equal(result.summary.outcome, "no_matches")
  assert.equal(result.summary.eligible, 1)
})
check("selected match stays within exact requested scope", () => {
  const result = search([doc("a"), doc("b")], "sever", "Неустойка", [ref("a")])
  assert.deepEqual(result.sources, [ref("a")])
})
check("matched and unmatched selected versions are not conflated", () => {
  const result = search(
    [doc("a", "5.2. Возмещение убытков."), doc("b")],
    "sever",
    "Убытков",
    [ref("a"), ref("b")],
  )
  assert.equal(result.summary.eligible, 2)
  assert.equal(result.summary.matched, 1)
  assert.deepEqual(result.sources, [ref("a")])
  assert.ok(
    answer({ searchSummary: result.summary }, "ANSWER").includes(
      "Не весь выбранный набор",
    ),
  )
})
check("documents outside selection cannot supply missing evidence", () => {
  const result = search(
    [doc("a"), doc("b", "5.2. Убытков.")],
    "sever",
    "Убытков",
    [ref("a")],
  )
  assert.equal(result.summary.outcome, "no_matches")
})
check("historical selection searches exact old text, not new revision", () => {
  const d = doc("a", "", {
    versions: [
      { number: 1, text: "Неустойка", extraction: "partial" },
      { number: 2, text: "Аренда", extraction: "complete" },
    ],
  })
  assert.equal(
    search([d], "sever", "Аренда", [ref("a", 1)]).summary.outcome,
    "no_matches",
  )
  assert.deepEqual(search([d], "sever", "Неустойка", [ref("a", 1)]).sources, [
    ref("a", 1),
  ])
  assert.equal(
    workspace([d], "sever", "Неустойка").summary.outcome,
    "no_matches",
  )
})
check(
  "manual failure has no used references and is retryable with same request",
  () => {
    const requested = [ref("a")]
    const docs = [doc("a")]
    assert.equal(
      search(docs, "sever", "Неустойка", requested, true).summary.outcome,
      "failed",
    )
    assert.deepEqual(
      search(docs, "sever", "Неустойка", requested, true).sources,
      [],
    )
    assert.deepEqual(
      search(docs, "sever", "Неустойка", requested).sources,
      requested,
    )
    assert.deepEqual(requested, [ref("a")])
  },
)
check(
  "invalid selection fails closed instead of silently dropping one source",
  () => {
    const result = search([doc("a")], "sever", "Неустойка", [
      ref("a"),
      ref("gone"),
    ])
    assert.equal(result.summary.outcome, "failed")
    assert.deepEqual(result.sources, [])
  },
)
check("foreign forbidden and unready references never become evidence", () => {
  for (const changes of [
    { projectId: "other" },
    { stage: "forbidden" },
    { stage: "queued" },
  ]) {
    assert.deepEqual(
      search([doc("a", "Неустойка", changes)], "sever", "Неустойка", [ref("a")])
        .sources,
      [],
    )
  }
})
check("unknown version cannot be replaced by current version", () => {
  assert.equal(
    search([doc("a")], "sever", "Неустойка", [ref("a", 8)]).summary.outcome,
    "failed",
  )
})
check("manual budget is not silently truncated", () => {
  const docs = Array.from({ length: 11 }, (_, i) => doc(String(i)))
  const result = search(
    docs,
    "sever",
    "Неустойка",
    docs.map((d) => ref(d.id)),
  )
  assert.equal(result.summary.outcome, "failed")
  assert.deepEqual(result.sources, [])
})
check(
  "empty extracted selected text is no-ready, not invented evidence",
  () => {
    assert.equal(
      search([doc("a", "")], "sever", "Неустойка", [ref("a")]).summary.outcome,
      "no_ready",
    )
  },
)
check("partial selected versions carry quality only when actually used", () => {
  const docs = [
    doc("full", "5.2. Убытков."),
    doc("partial", "5.1. Неустойка.", {
      versions: [{ number: 1, text: "5.1. Неустойка.", extraction: "partial" }],
    }),
  ]
  const result = search(docs, "sever", "Убытков", [ref("full"), ref("partial")])
  assert.equal(result.summary.partialEligible, 1)
  assert.equal(result.summary.partialUsed, 0)
  assert.deepEqual(partialRefs(result.sources, docs, "sever"), [])
})
check("no-match answer helper cannot manufacture full reply", () => {
  const result = search([doc("a")], "sever", "Телепортация", [ref("a")])
  assert.equal(
    answer({ searchSummary: result.summary }, "DO NOT COPY").includes(
      "DO NOT COPY",
    ),
    false,
  )
})
check(
  "independent Research context is not mislabelled as a missing document answer",
  () => {
    const result = search([doc("a")], "sever", "Телепортация", [ref("a")])
    const text = answer({ searchSummary: result.summary }, "RESEARCH", true)
    assert.ok(text.includes("RESEARCH"))
    assert.ok(text.includes("отдельный доступный контекст исследования"))
  },
)
check(
  "manual result payload does not copy names, questions or source contents",
  () => {
    const result = JSON.stringify(
      search([doc("a", "5.2. Убытков.")], "sever", "Убытков PRIVATE QUESTION", [
        ref("a"),
      ]),
    )
    for (const text of ["PRIVATE_a", "PRIVATE QUESTION", "5.2."])
      assert.equal(result.includes(text), false)
  },
)
check(
  "evidence fragment follows the question rather than always showing 5.1",
  () => {
    const text = "5.1. Неустойка.\n\n5.2. Возмещение убытков."
    assert.equal(evidence(text, "Убытков"), "5.2. Возмещение убытков.")
    assert.equal(evidence(text, "Неустойка"), "5.1. Неустойка.")
  },
)
check("unmatched excerpt is honest, not an arbitrary paragraph", () => {
  assert.equal(evidence("5.1. Неустойка.", "Телепортация"), "")
})
check(
  "evidence matching is deterministic and chooses stronger paragraph",
  () => {
    const text = "1. Неустойка.\n\n2. Неустойка и поставка."
    assert.equal(
      evidence(text, "Неустойка поставка"),
      "2. Неустойка и поставка.",
    )
  },
)
check(
  "request arrays and historical results remain immutable across next lookup",
  () => {
    const selected = [ref("a")]
    const first = search([doc("a")], "sever", "Неустойка", selected)
    search([doc("a", "Аренда")], "sever", "Аренда", selected)
    assert.equal(first.summary.outcome, "matched")
    assert.deepEqual(first.sources, [ref("a")])
    assert.deepEqual(selected, [ref("a")])
  },
)
console.log(`${checks} UI-10 model groups passed`)
