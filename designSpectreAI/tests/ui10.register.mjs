// Documentation traceability only; passing does not accept the UX scenarios.
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"

const read = (name) => readFileSync(`plans/${name}.md`, "utf8")
const register = read("neurojurist-spectrum-flow-register")
const report = read("neurojurist-spectrum-ui10")
const cards = new Map(
  [
    ...register.matchAll(
      /^### ([A-Z0-9]+-\d{2})\. .+\n([\s\S]*?)(?=^### |$(?![\s\S]))/gm,
    ),
  ].map((match) => [match[1], match[2]]),
)
const added = ["RAG-02", "RAG-04", "RAG-07", "RAG-09", "JOB-05", "JOB-07"]
let checks = 0
function check(name, fn) {
  fn()
  checks++
  console.log(`PASS ${name}`)
}
check("all original cards remain; 79 working is not 79 accepted", () => {
  assert.equal(cards.size, 174)
  assert.equal(
    [...cards.values()].filter((body) => /\*\*Дизайн:\*\* В работе/.test(body))
      .length,
    79,
  )
  assert.equal(
    [...cards.values()].filter((body) => /\*\*Дизайн:\*\* Готово/.test(body))
      .length,
    0,
  )
})
check("six selected cards link explicit UI-10 evidence and residuals", () => {
  for (const id of added) {
    assert.match(cards.get(id), /\*\*Дизайн:\*\* В работе — UI-10;/)
    assert.ok(
      cards.get(id).includes("neurojurist-spectrum-ui10.md#coverage"),
      id,
    )
    assert.match(cards.get(id), /Остаточные вопросы:\*\* UI-10:/)
    assert.ok(report.includes(`| ${id} |`), id)
  }
})
check(
  "existing multi-source coverage no longer describes direct passthrough",
  () => {
    assert.ok(
      cards
        .get("RAG-03")
        .includes("запрошенные версии и использованные совпадения"),
    )
    assert.equal(
      cards.get("RAG-03").includes("Прямая передача ручного набора"),
      false,
    )
  },
)
check(
  "relogin evidence explicitly leaves browser-close recovery unimplemented",
  () => {
    assert.ok(
      cards
        .get("JOB-07")
        .includes(
          "Закрытие браузера/возврат к восстановленной задаче не реализованы",
        ),
    )
    assert.ok(report.includes("не реализация полного JOB-07"))
    assert.ok(report.includes("без persistence"))
  },
)
check(
  "current entry points link the package with the same working count",
  () => {
    for (const name of [
      "README",
      "neurojurist-spectrum-ux-completion",
      "neurojurist-spectrum-priority-queue",
      "neurojurist-spectrum-flow-register",
    ]) {
      const text = read(name)
      assert.ok(text.includes("neurojurist-spectrum-ui10.md"), name)
      assert.ok(/79 (?:«В работе»|рабочи)|всего 79/.test(text), name)
    }
  },
)
check(
  "next work stays P0 with synthetic boundaries and no grant expansion",
  () => {
    assert.ok(report.includes("JOB-01/02/03/08/09/10"))
    assert.ok(report.includes("RAG-08/10"))
    assert.ok(report.includes("остаются P3"))
    assert.ok(
      report.includes(
        "без backend, реального AI/RAG, чтения файлов и постоянного хранения",
      ),
    )
  },
)
console.log(
  `${checks} UI-10 documentation groups passed; no UX acceptance implied`,
)
