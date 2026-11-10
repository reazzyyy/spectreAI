import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import ts from "typescript"
const { outputText } = ts.transpileModule(
  readFileSync("src/data/audit.ts", "utf8"),
  {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2020,
    },
  },
)
const { canReadAudit: read, deletionError: remove } = await import(
  `data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`
)
let checks = 0
function check(name, fn) {
  fn()
  checks++
  console.log(`PASS ${name}`)
}
const event = { orgId: "vector", category: "project", projectId: "sever" }
const viewer = {
  active: true,
  orgId: "vector",
  userId: "elena",
  orgRole: "owner",
  projectIds: [],
}
check("org owner sees own org only", () => {
  assert.equal(read(event, viewer), true)
  assert.equal(read({ ...event, orgId: "other" }, viewer), false)
})
check("org admin has no implicit audit right", () => {
  assert.equal(read(event, { ...viewer, orgRole: "admin" }), false)
})
check("current project membership grants only project scope", () => {
  const member = { ...viewer, orgRole: "member", projectIds: ["sever"] }
  assert.equal(read(event, member), true)
  assert.equal(read({ ...event, projectId: "hidden" }, member), false)
  assert.equal(read({ ...event, projectId: undefined }, member), false)
})
check("approver sees only own grants without project membership", () => {
  const member = { ...viewer, orgRole: "member" }
  assert.equal(
    read({ ...event, category: "access", approverId: "elena" }, member),
    true,
  )
  assert.equal(
    read({ ...event, category: "access", approverId: "daria" }, member),
    false,
  )
  assert.equal(read({ ...event, approverId: "elena" }, member), false)
})
check("session expiry and revoke close all audit scopes", () => {
  assert.equal(read(event, { ...viewer, active: false }), false)
  assert.equal(
    read(event, { ...viewer, orgRole: "member", projectIds: [] }),
    false,
  )
})
const project = { role: "owner", status: "active", name: "Проект Север" }
check("OWNER can delete active and archived project", () => {
  assert.equal(remove(project, true, project.name, true), "")
  assert.equal(
    remove({ ...project, status: "archived" }, true, project.name, true),
    "",
  )
})
check("EDITOR VIEWER and missing project cannot delete", () => {
  for (const role of ["editor", "viewer"])
    assert.ok(remove({ ...project, role }, true, project.name, true))
  assert.ok(remove(undefined, true, project.name, true))
})
check("execution revalidates session and lifecycle", () => {
  assert.ok(remove(project, false, project.name, true))
  for (const status of ["restricted", "deleting"])
    assert.ok(remove({ ...project, status }, true, project.name, true))
})
check(
  "exact second confirmation including case whitespace and renamed project",
  () => {
    for (const name of ["", "проект север", "Проект Север ", "Север"])
      assert.ok(remove(project, true, name, true))
    assert.ok(
      remove({ ...project, name: "Другое название" }, true, project.name, true),
    )
  },
)
check("mandatory audit failure prevents deletion; retry after recovery", () => {
  assert.ok(remove(project, true, project.name, false))
  assert.equal(remove(project, true, project.name, true), "")
})
console.log(`${checks} model groups passed`)
