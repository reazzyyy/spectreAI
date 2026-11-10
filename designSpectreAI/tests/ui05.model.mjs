import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import ts from "typescript"
const source = readFileSync("src/data/admin-access.ts", "utf8")
const { outputText } = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2020,
  },
})
const {
  applyAccessAction: apply,
  emptyAccessLedger: empty,
  reconcileAccess,
  canReadAccessObject: read,
} = await import(
  `data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`
)
let checks = 0
function check(name, fn) {
  fn()
  checks++
  console.log(`PASS ${name}`)
}
const objects = [
  { id: "sever-0", projectId: "sever", orgId: "vector", version: 2 },
  { id: "spor-0", projectId: "spor", orgId: "vector", version: 2 },
]
const env = {
  userId: "elena",
  orgId: "vector",
  active: true,
  now: 1_000_000,
  objects,
  members: [
    { userId: "elena", orgId: "vector", role: "owner" },
    { userId: "oleg", orgId: "vector", role: "admin" },
    { userId: "daria", orgId: "vector", role: "member" },
    { userId: "alex", orgId: "vector", role: "member" },
  ],
}
const as = (userId, changes = {}) => ({ ...env, userId, ...changes })
const appointed = () =>
  apply(empty(), env, { type: "appoint", userId: "daria", enabled: true })
    .ledger
const requestAction = {
  type: "request",
  objectId: "sever-0",
  approverId: "daria",
  reason: "Проверка обработки",
  minutes: 15,
}
function requested(minutes = 15) {
  return apply(appointed(), as("oleg"), { ...requestAction, minutes }).ledger
}
function granted(minutes = 15) {
  const ledger = requested(minutes)
  return apply(ledger, as("daria"), {
    type: "approve",
    requestId: ledger.requests[0].id,
  }).ledger
}
function rejected(ledger, actor, action, audit) {
  const result = apply(ledger, actor, action, audit)
  assert.ok(result.error)
  assert.equal(
    result.ledger.requests.filter((r) => r.status === "active").length,
    ledger.requests.filter((r) => r.status === "active").length,
  )
  return result
}
check("roles do not imply approver authority", () => {
  const l = apply(empty(), as("oleg"), requestAction)
  assert.ok(l.error)
  assert.equal(l.ledger.requests.length, 0)
})
check("only org owner appoints active members", () => {
  rejected(empty(), as("oleg"), {
    type: "appoint",
    userId: "daria",
    enabled: true,
  })
  rejected(empty(), env, { type: "appoint", userId: "unknown", enabled: true })
})
check("assignment does not grant content", () => {
  const l = appointed()
  assert.equal(l.requests.length, 0)
  assert.equal(read(l, as("daria"), "missing"), false)
})
check("self-approval and self-request assignment are blocked", () => {
  const l = apply(empty(), env, {
    type: "appoint",
    userId: "elena",
    enabled: true,
  }).ledger
  rejected(l, env, { ...requestAction, approverId: "elena" })
})
check("pending gives no reading and no approver reading", () => {
  const l = requested()
  const r = l.requests[0]
  assert.equal(read(l, as("oleg"), r.id), false)
  assert.equal(read(l, as("daria"), r.id), false)
})
check("wrong actor cannot decide", () => {
  const l = requested()
  for (const who of ["oleg", "elena"])
    rejected(l, as(who), { type: "approve", requestId: l.requests[0].id })
})
check("only admin may request", () =>
  rejected(appointed(), as("daria"), requestAction),
)
check("unknown object, tenant, reason, TTL rejected", () => {
  for (const patch of [
    { objectId: "personal" },
    { reason: "" },
    { reason: "x".repeat(501) },
    { minutes: 0 },
    { minutes: 61 },
    { minutes: 16 },
  ])
    rejected(appointed(), as("oleg"), { ...requestAction, ...patch })
  rejected(appointed(), as("oleg", { orgId: "praktika" }), requestAction)
})
check("request and assignment audit failure are atomic", () => {
  const result = rejected(appointed(), as("oleg"), requestAction, false)
  assert.equal(result.ledger.requests.length, 0)
  assert.deepEqual(
    apply(
      empty(),
      env,
      { type: "appoint", userId: "daria", enabled: true },
      false,
    ).ledger.approvers,
    {},
  )
})
check("approval audit failure remains pending, retry succeeds", () => {
  const l = requested()
  const action = { type: "approve", requestId: l.requests[0].id }
  const result = rejected(l, as("daria"), action, false)
  assert.equal(result.ledger.requests[0].status, "pending")
  assert.equal(
    apply(result.ledger, as("daria"), action).ledger.requests[0].status,
    "active",
  )
})
for (const ttl of [15, 30, 60])
  check(`TTL ${ttl} starts at approval, hard deadline`, () => {
    const pending = requested(ttl)
    const id = pending.requests[0].id
    const at = env.now + 900_000
    const l = apply(pending, as("daria", { now: at }), {
      type: "approve",
      requestId: id,
    }).ledger
    assert.equal(l.requests[0].expiresAt, at + ttl * 60_000)
    assert.equal(read(l, as("oleg", { now: at + ttl * 60_000 - 1 }), id), true)
    assert.equal(read(l, as("oleg", { now: at + ttl * 60_000 }), id), false)
  })
check("grant belongs to actor, tenant and exact object version", () => {
  const l = granted()
  const id = l.requests[0].id
  assert.ok(read(l, as("oleg"), id))
  assert.equal(read(l, as("elena"), id), false)
  assert.equal(read(l, as("oleg", { orgId: "praktika" }), id), false)
  assert.equal(
    read(
      l,
      as("oleg", { objects: objects.map((o) => ({ ...o, version: 3 })) }),
      id,
    ),
    false,
  )
  assert.equal(l.requests[0].object.id, "sever-0")
})
check("duplicates, extension, repeated decisions blocked", () => {
  const l = granted()
  const id = l.requests[0].id
  rejected(l, as("oleg"), { ...requestAction, minutes: 60 })
  rejected(l, as("daria"), { type: "approve", requestId: id })
})
check("rejection grants nothing, new request possible", () => {
  const l = requested()
  const id = l.requests[0].id
  const result = apply(l, as("daria"), { type: "reject", requestId: id }).ledger
  assert.equal(result.requests[0].status, "rejected")
  assert.equal(read(result, as("oleg"), id), false)
  assert.equal(apply(result, as("oleg"), requestAction).error, undefined)
})
check(
  "requester, assigned approver and org owner revoke; unrelated staff cannot",
  () => {
    const l = granted()
    const id = l.requests[0].id
    rejected(l, as("alex"), { type: "revoke", requestId: id })
    for (const who of ["oleg", "daria", "elena"]) {
      const result = apply(
        l,
        as(who),
        { type: "revoke", requestId: id },
        false,
      ).ledger
      assert.equal(read(result, as("oleg"), id), false)
      assert.equal(result.requests[0].status, "revoked")
    }
  },
)
check("expiry reconciles once, even while another tenant is open", () => {
  const l = granted()
  const e = as("elena", { orgId: "praktika", now: l.requests[0].expiresAt })
  const next = reconcileAccess(l, e)
  assert.equal(next.requests[0].status, "expired")
  assert.equal(next.events.at(-1).orgId, "vector")
  assert.equal(reconcileAccess(next, e), next)
})
check("org membership loss immediately blocks open read", () => {
  const l = granted()
  const id = l.requests[0].id
  const e = as("oleg", {
    members: env.members.filter((m) => m.userId !== "oleg"),
  })
  assert.equal(read(l, e, id), false)
  assert.equal(reconcileAccess(l, e).requests[0].status, "revoked")
})
check(
  "approver departure or authority removal invalidates pending and active",
  () => {
    for (const l of [requested(), granted()]) {
      assert.equal(
        reconcileAccess(
          l,
          as("oleg", {
            members: env.members.filter((m) => m.userId !== "daria"),
          }),
        ).requests[0].status,
        "revoked",
      )
      const removed = apply(l, env, {
        type: "appoint",
        userId: "daria",
        enabled: false,
      }).ledger
      assert.equal(removed.requests[0].status, "revoked")
    }
  },
)
check("missing/deleted object denies and revokes", () => {
  const l = granted()
  const e = as("oleg", { objects: [] })
  assert.equal(read(l, e, l.requests[0].id), false)
  assert.equal(reconcileAccess(l, e).requests[0].status, "revoked")
})
check("expired session denies read and decisions", () => {
  const l = granted()
  assert.equal(read(l, as("oleg", { active: false }), l.requests[0].id), false)
  rejected(l, as("oleg", { active: false }), {
    type: "revoke",
    requestId: l.requests[0].id,
  })
})
check("event records exclude request reason and document content", () => {
  const l = granted()
  assert.ok(l.events.length >= 3)
  assert.equal(JSON.stringify(l.events).includes(requestAction.reason), false)
  for (const e of l.events)
    assert.equal(
      Object.keys(e).some((k) => ["reason", "text", "prompt"].includes(k)),
      false,
    )
})
check(
  "open is audited, audit failure and wrong actor do not open content",
  () => {
    const l = granted()
    const id = l.requests[0].id
    assert.ok(
      apply(l, as("oleg"), { type: "open", requestId: id }, false).error,
    )
    assert.ok(apply(l, as("daria"), { type: "open", requestId: id }).error)
    const result = apply(l, as("oleg"), { type: "open", requestId: id })
    assert.equal(result.error, undefined)
    assert.equal(
      result.ledger.events.at(-1).action,
      "Read-only просмотр открыт",
    )
  },
)
console.log(`PASS ${checks} UI-05 model groups`)
