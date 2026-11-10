import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import ts from "typescript"
const { outputText } = ts.transpileModule(
  readFileSync("src/data/notifications.ts", "utf8"),
  {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2020,
    },
  },
)
const {
  securityNotifications: build,
  visibleNotifications: visible,
  defaultNotificationPreferences: defaults,
} = await import(
  `data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`
)
let checks = 0
function check(name, fn) {
  fn()
  checks++
  console.log(`PASS ${name}`)
}
const viewer = { userId: "oleg", orgId: "vector", active: true }
const request = {
  id: "r1",
  orgId: "vector",
  requesterId: "oleg",
  approverId: "daria",
  reason: "PRIVATE REASON",
  object: { id: "secret-document", version: 2, projectId: "sever" },
}
const ledger = { requests: [request], events: [], approvers: {} }
const event = (action, id = action) => ({
  id,
  orgId: "vector",
  requestId: "r1",
  actorId: "oleg",
  at: 100,
  action,
})
check(
  "request, decision, expiry and revoke address only request participants",
  () => {
    for (const action of [
      "Запрос создан",
      "Read-only доступ выдан",
      "Запрос отклонён",
      "Доступ отозван",
      "Срок доступа истёк",
      "Доступ прекращён",
    ]) {
      const items = build({ ...ledger, events: [event(action)] }, [], [], [])
      assert.equal(items.length, 1)
      assert.deepEqual(items[0].recipients, ["oleg", "daria"])
      assert.deepEqual(items[0].target, { kind: "access", requestId: "r1" })
      assert.equal(
        visible(items, { ...viewer, userId: "elena" }, defaults()).length,
        0,
      )
    }
  },
)
check("read-only open and unknown events do not create inbox noise", () => {
  assert.equal(
    build(
      {
        ...ledger,
        events: [event("Read-only просмотр открыт"), event("unknown")],
      },
      [],
      [],
      [],
    ).length,
    0,
  )
})
check(
  "missing request and failed action produce no request notification",
  () => {
    assert.equal(
      build(
        { ...ledger, requests: [], events: [event("Запрос создан")] },
        [],
        [],
        [],
      ).length,
      0,
    )
    assert.equal(build(ledger, [], [], []).length, 0)
  },
)
check(
  "notification payload excludes reason, document name, prompt and content",
  () => {
    const serialized = JSON.stringify(
      build({ ...ledger, events: [event("Запрос создан")] }, [], [], []),
    )
    for (const secret of [
      "PRIVATE REASON",
      "secret-document",
      "reason",
      "prompt",
      "text",
    ])
      assert.equal(serialized.includes(secret), false)
  },
)
check(
  "expiry semantic identity remains stable if reconciliation regenerates event id",
  () => {
    const a = build(
      { ...ledger, events: [event("Срок доступа истёк", "uuid1")] },
      [],
      [],
      [],
    )[0]
    const b = build(
      { ...ledger, events: [event("Срок доступа истёк", "uuid2")] },
      [],
      [],
      [],
    )[0]
    assert.equal(a.id, b.id)
  },
)
const sample = {
  id: "security",
  orgId: "vector",
  recipients: ["oleg"],
  at: 100,
  title: "Safe title",
  category: "security",
  target: { kind: "access", requestId: "r1" },
}
check("tenant, session and recipient isolation", () => {
  assert.equal(visible([sample], viewer, defaults()).length, 1)
  assert.equal(
    visible([sample], { ...viewer, active: false }, defaults()).length,
    0,
  )
  assert.equal(
    visible([sample], { ...viewer, orgId: "other" }, defaults()).length,
    0,
  )
  assert.equal(
    visible([sample], { ...viewer, userId: "alex" }, defaults()).length,
    0,
  )
})
check("security cannot be disabled by optional preferences", () => {
  assert.equal(
    visible([sample], viewer, { documents: false, ai: false }).length,
    1,
  )
})
check(
  "document and AI preferences affect actual feed and can be restored",
  () => {
    const items = [
      sample,
      { ...sample, id: "document", category: "documents" },
      { ...sample, id: "ai", category: "ai" },
    ]
    assert.equal(visible(items, viewer, defaults()).length, 3)
    assert.equal(
      visible(items, viewer, { documents: false, ai: true }).length,
      2,
    )
    assert.equal(
      visible(items, viewer, { documents: false, ai: false }).length,
      1,
    )
    assert.equal(visible(items, viewer, defaults()).length, 3)
  },
)
check("deduplication and descending chronology", () => {
  const items = visible(
    [sample, sample, { ...sample, id: "new", at: 200 }],
    viewer,
    defaults(),
  )
  assert.deepEqual(
    items.map((n) => n.id),
    ["new", "security"],
  )
})
check("appointment is addressed to subject, not every org manager", () => {
  const items = build(
    {
      ...ledger,
      events: [
        {
          id: "a",
          orgId: "vector",
          actorId: "elena",
          subjectId: "daria",
          at: 100,
          action: "Согласующий назначен",
        },
      ],
    },
    [],
    [],
    [],
  )
  assert.deepEqual(items[0].recipients, ["daria"])
  assert.deepEqual(items[0].target, { kind: "organization" })
})
const offer = {
  id: "o1",
  orgId: "vector",
  projectId: "sever",
  createdById: "elena",
  fromId: "elena",
  toId: "daria",
  createdAt: 100,
  status: "pending",
  mode: "handover",
}
check("ownership proposal and decision have distinct stable identities", () => {
  const items = build(
    ledger,
    [{ ...offer, status: "accepted", closedAt: 200 }],
    [],
    [],
  )
  assert.equal(items.length, 2)
  assert.notEqual(items[0].id, items[1].id)
  assert.deepEqual(items[0].recipients, ["daria", "elena"])
  assert.deepEqual(items[1].target, { kind: "members", projectId: "sever" })
})
check(
  "membership revocation addresses affected member without project contents",
  () => {
    const audit = [
      {
        id: "m1",
        category: "membership",
        projectId: "sever",
        projectName: "PRIVATE NAME",
        objectId: "daria",
        actorId: "elena",
        orgId: "vector",
        at: 100,
        action: "Доступ участника отозван",
      },
    ]
    const items = build(ledger, [], audit, [])
    assert.deepEqual(items[0].recipients, ["daria"])
    assert.equal(JSON.stringify(items).includes("PRIVATE NAME"), false)
    assert.equal(
      build(
        ledger,
        [],
        [{ ...audit[0], action: "Чат опубликован для участников проекта" }],
        [],
      ).length,
      0,
    )
  },
)
check(
  "completed deletion receipt addresses initiator only, without project name",
  () => {
    const op = {
      id: "delete1",
      orgId: "vector",
      actorId: "oleg",
      projectId: "sever",
      projectName: "PRIVATE NAME",
      startedAt: 10,
    }
    assert.equal(build(ledger, [], [], [op]).length, 0)
    const items = build(ledger, [], [], [{ ...op, finishedAt: 100 }])
    assert.deepEqual(items[0].recipients, ["oleg"])
    assert.equal(JSON.stringify(items).includes("PRIVATE NAME"), false)
  },
)
console.log(`${checks} UI-07 model groups passed`)
