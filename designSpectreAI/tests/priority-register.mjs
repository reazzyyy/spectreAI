// Documentation integrity only: this does not accept the 174 UX scenarios.
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"

const register = readFileSync(
  "plans/neurojurist-spectrum-flow-register.md",
  "utf8",
)
const queue = readFileSync(
  "plans/neurojurist-spectrum-priority-queue.md",
  "utf8",
)
const cardPattern =
  /^### ((?:AUTH|DASH|WS|MEM|CHAT|DOC|RAG|RES|DRF|CRM|JOB|SEC|SET|SYS|E2E)-\d{2})\. (.+)$/gm
const headings = [...register.matchAll(cardPattern)]
const cards = new Map()
let checks = 0
function check(name, fn) {
  fn()
  checks++
  console.log(`PASS ${name}`)
}
const expectedCounts = {
  AUTH: 9,
  DASH: 6,
  WS: 11,
  MEM: 9,
  CHAT: 18,
  DOC: 15,
  RAG: 10,
  RES: 15,
  DRF: 13,
  CRM: 7,
  JOB: 10,
  SEC: 15,
  SET: 7,
  SYS: 20,
  E2E: 9,
}
const packages = [
  "P0-A",
  "P0-B",
  "P0-C",
  "P0-S",
  "P1-D",
  "P1-R",
  "P2-W",
  "P2-T",
  "P2-C",
  "P2-N",
  "P3-A",
  "P3-L",
  "P3-O",
  "OUT",
]
check("all 174 original IDs exist exactly once with their anchors", () => {
  assert.equal(headings.length, 174)
  assert.equal(new Set(headings.map((h) => h[1])).size, 174)
  for (const [prefix, count] of Object.entries(expectedCounts)) {
    for (let i = 1; i <= count; i++) {
      const id = `${prefix}-${String(i).padStart(2, "0")}`
      assert.ok(
        headings.some((h) => h[1] === id),
        id,
      )
      assert.ok(register.includes(`<a id="${id.toLowerCase()}"></a>`), id)
    }
  }
})
check("each card has one priority, package, hypothesis, value and risk", () => {
  for (let i = 0; i < headings.length; i++) {
    const h = headings[i]
    const body = register.slice(
      h.index,
      headings[i + 1]?.index ?? register.length,
    )
    const fields = [...body.matchAll(/^- \*\*Приоритет HYP-01:\*\* (.+)$/gm)]
    assert.equal(fields.length, 1, h[1])
    const field = fields[0][1]
    const parsed = /^(P[0-3]|Вне очереди) · (P[0-3]-[A-Z]|OUT) — /.exec(field)
    assert.ok(parsed, h[1])
    assert.ok(packages.includes(parsed[2]), h[1])
    assert.equal(
      parsed[1],
      parsed[2] === "OUT" ? "Вне очереди" : parsed[2].slice(0, 2),
    )
    assert.ok(field.includes("частота:") && field.includes("(гипотеза)"), h[1])
    assert.ok(field.includes("ценность:") && field.includes("риск:"), h[1])
    assert.ok(
      field.endsWith(
        `neurojurist-spectrum-priority-queue.md#${parsed[2].toLowerCase()}).`,
      ),
      h[1],
    )
    cards.set(h[1], { title: h[2], priority: parsed[1], package: parsed[2] })
  }
})
const rows = []
check(
  "sorted index covers every card once with matching title and package",
  () => {
    let currentPackage
    const foundPackages = []
    for (const line of queue.split("\n")) {
      const group = /^### (P[0-3]-[A-Z]|OUT) · /.exec(line)
      if (group) {
        currentPackage = group[1]
        foundPackages.push(currentPackage)
        assert.ok(
          queue.includes(`<a id="${currentPackage.toLowerCase()}"></a>`),
        )
      }
      const row =
        /^\| ([A-Z0-9]+-\d{2}) \| (.+) \| \[Открыть\]\(neurojurist-spectrum-flow-register\.md#([^)]*)\) \|$/.exec(
          line,
        )
      if (!row) continue
      const [, id, title, anchor] = row
      assert.ok(cards.has(id), id)
      assert.equal(cards.get(id).title, title, id)
      assert.equal(cards.get(id).package, currentPackage, id)
      assert.equal(anchor, id.toLowerCase(), id)
      rows.push(id)
    }
    assert.deepEqual(foundPackages, packages)
    assert.equal(rows.length, 174)
    assert.equal(new Set(rows).size, 174)
    assert.deepEqual([...rows].sort(), [...cards.keys()].sort())
  },
)
check("index is sorted by the agreed work-package order", () => {
  const order = rows.map((id) => packages.indexOf(cards.get(id).package))
  assert.deepEqual(
    order,
    [...order].sort((a, b) => a - b),
  )
})
check("priority totals agree with the 174-card index", () => {
  let total = 0
  for (const priority of ["P0", "P1", "P2", "P3", "Вне очереди"]) {
    const count = [...cards.values()].filter(
      (c) => c.priority === priority,
    ).length
    assert.ok(queue.includes(`| ${priority} | ${count} |`), priority)
    total += count
  }
  assert.equal(total, 174)
  assert.ok(queue.includes("| **Итого** | **174** |"))
})
check("public bootstrap and exports stay outside the active queue", () => {
  const excluded = [...cards.entries()]
    .filter(([, c]) => c.package === "OUT")
    .map(([id]) => id)
    .sort()
  assert.deepEqual(excluded, ["AUTH-05", "DRF-11", "RES-12"])
  assert.equal(cards.get("AUTH-04").package, "P2-T")
  assert.equal(cards.get("E2E-04").package, "P1-D")
})
check("core sources and safety are P0, grant expansion is P3", () => {
  for (let i = 1; i <= 10; i++) {
    assert.equal(cards.get(`RAG-${String(i).padStart(2, "0")}`).priority, "P0")
  }
  for (const id of [
    "SEC-12",
    "SEC-13",
    "SYS-13",
    "SYS-18",
    "SYS-20",
    "DRF-07",
    "DRF-08",
    "DRF-13",
  ]) {
    assert.equal(cards.get(id).priority, "P0", id)
  }
  for (let i = 4; i <= 10; i++) {
    assert.equal(cards.get(`SEC-${String(i).padStart(2, "0")}`).package, "P3-A")
  }
  assert.ok(queue.includes("повышается в P0 немедленно"))
})
check(
  "current entry points link the queue and no longer prescribe grant next",
  () => {
    for (const path of [
      "plans/README.md",
      "plans/neurojurist-spectrum-ux-completion.md",
      "plans/neurojurist-spectrum-reg07.md",
      "plans/neurojurist-spectrum-ui07.md",
    ]) {
      const text = readFileSync(path, "utf8")
      assert.ok(text.includes("neurojurist-spectrum-priority-queue.md"), path)
      assert.ok(text.includes("HYP-01"), path)
      assert.equal(
        text.includes("**Следующий шаг:** проектный grant"),
        false,
        path,
      )
      assert.equal(
        text.includes("Следующий рекомендуемый пакет — проектный grant"),
        false,
        path,
      )
    }
    assert.ok(queue.includes("62 карточки «В работе»"))
    assert.ok(queue.includes("112 без полной покарточной приёмки"))
  },
)
console.log(
  `${checks} priority documentation groups passed; UX status not promoted`,
)
