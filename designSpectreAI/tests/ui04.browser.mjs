// Ownership/offboarding remain synthetic; use the existing supervised preview.
import assert from "node:assert/strict"
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE ?? "playwright-core"
)
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? "/usr/bin/chromium",
  args: ["--no-sandbox"],
})
const base = process.env.PREVIEW_URL ?? "http://localhost:3000"
let page
let checks = 0
const errors = []
const button = (name) => page.getByRole("button", { name, exact: true })
const row = (id) =>
  page.locator(".membership-row").filter({ hasText: `${id}@example.test` })
async function route(hash) {
  await page.evaluate((h) => {
    location.hash = h
  }, hash)
  await page.waitForTimeout(130)
}
async function persona(id) {
  await button("Меню профиля").click()
  await page.locator(".profile-menu summary").click()
  await page.getByLabel("Смотреть как сотрудник").selectOption(id)
  await page.locator(".home h1").waitFor()
}
async function check(name, fn) {
  if (page) await page.close()
  page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  page.on("pageerror", (e) => errors.push(e.message))
  await page.goto(`${base}/#/projects/sever/members`)
  await page
    .getByRole("heading", { name: "Участники проекта", exact: true })
    .waitFor()
  await fn()
  checks++
  console.log(`PASS ${name}`)
}
async function propose(projectId, recipient, recovery = false) {
  await route(`#/projects/${projectId}/members`)
  await button(recovery ? "Предложить преемника" : "Передать владение").click()
  await page.getByLabel("Получатель владения").selectOption(recipient)
  await button("Отправить предложение").click()
  await page.locator(".ownership-pending").waitFor()
}
async function accept(projectId, recipient) {
  await persona(recipient)
  await route(`#/projects/${projectId}/members`)
  await button("Рассмотреть предложение").click()
  await button("Принять владение").click()
  await page.locator(".ownership-complete").waitFor()
}
async function offboard(target = "alex", operator = "elena") {
  await persona(operator)
  await route("#/organization")
  await page
    .locator(".org-person")
    .filter({ hasText: `${target}@example.test` })
    .getByRole("button", { name: "Прекратить членство", exact: true })
    .click()
  const dialog = page.getByRole("dialog", {
    name: "Прекратить членство сотрудника",
  })
  await dialog.locator(".offboard-confirm input").check()
  await dialog
    .getByRole("button", { name: "Прекратить членство", exact: true })
    .click()
  await page
    .locator(".departure-row")
    .filter({
      hasText: target === "alex" ? "Алексей Волков" : "Дарья Смирнова",
    })
    .waitFor()
}
async function limited(projectId) {
  await route(`#/projects/${projectId}/members`)
  await page
    .getByRole("heading", { name: "TEAM в ограниченном режиме", exact: true })
    .waitFor()
  assert.equal(
    await page
      .locator(".membership-table")
      .getByText("Владелец", { exact: true })
      .count(),
    0,
  )
}
async function role(id, label) {
  await row(id).getByText(label, { exact: true }).waitFor()
}
async function login(email, password = "SpectrumDemo1!") {
  await page.getByLabel("Рабочий email", { exact: true }).fill(email)
  await page.getByLabel("Пароль", { exact: true }).fill(password)
  await button("Войти").click()
  await page.locator(".home h1").waitFor()
}
try {
  await check(
    "only Workspace OWNER proposes; candidates are existing EDITOR/VIEWER, not admin or self",
    async () => {
      await button("Передать владение").click()
      const select = page.getByLabel("Получатель владения")
      assert.equal(await select.locator('option[value="elena"]').count(), 0)
      assert.equal(await select.locator('option[value="oleg"]').count(), 0)
      assert.equal(await select.locator('option[value="alex"]').count(), 1)
      assert.equal(await select.locator('option[value="daria"]').count(), 1)
      await button("Отмена").click()
      for (const id of ["alex", "daria", "oleg"]) {
        await persona(id)
        await route("#/projects/sever/members")
        assert.equal(await button("Передать владение").count(), 0)
      }
      await persona("elena")
      await route("#/projects/p-1/members")
      assert.equal(await button("Передать владение").count(), 0)
    },
  )
  await check(
    "proposal keeps roles unchanged, has seven-day deadline and recipient inbox",
    async () => {
      await propose("sever", "alex")
      await role("elena", "Владелец")
      await role("alex", "Редактор")
      await page
        .locator(".ownership-panel")
        .getByText(/Предложение отправлено на 7 дней/)
        .waitFor()
      assert.equal(await button("Передать владение").count(), 0)
      await persona("marina")
      await route("#/projects/sever/members")
      assert.equal(await button("Рассмотреть предложение").count(), 0)
      await persona("alex")
      assert.equal(await page.evaluate(() => location.hash), "#/")
      await page
        .locator(".home-ownership-card")
        .filter({ hasText: "Проект Север" })
        .click()
      await button("Рассмотреть предложение").click()
      await role("elena", "Владелец")
      await role("alex", "Редактор")
      await button("Решить позже").click()
      await page.locator(".ownership-pending").waitFor()
    },
  )
  await check(
    "acceptance makes one OWNER and former OWNER VIEWER; PRIVATE and authorship are unchanged",
    async () => {
      await propose("sever", "alex")
      await accept("sever", "alex")
      await role("alex", "Владелец")
      await role("elena", "Просмотр")
      assert.equal(
        await page
          .locator(".membership-table")
          .getByText("Владелец", { exact: true })
          .count(),
        1,
      )
      await route("#/projects/sever/chat?chat=ch1")
      await page
        .getByRole("heading", { name: "Диалог недоступен", exact: true })
        .waitFor()
      await route("#/projects/sever/docs")
      await page
        .locator(".document-row")
        .filter({ hasText: "Договор_поставки_демо.docx" })
        .getByText("Елена Крылова", { exact: true })
        .waitFor()
      await persona("elena")
      await route("#/projects/sever/chat?chat=ch1")
      await page.locator(".legal-answer").waitFor()
      assert.equal(await button("Отправить").isDisabled(), true)
      await route("#/projects/sever/draft?draft=d1")
      assert.equal(
        await page
          .getByLabel("Текст юридического документа")
          .getAttribute("readonly"),
        "",
      )
      assert.equal(await button("Сохранить").isDisabled(), true)
    },
  )
  await check(
    "VIEWER can explicitly accept ownership without getting content-edit rights before acceptance",
    async () => {
      await propose("sever", "daria")
      await persona("daria")
      await route("#/projects/sever/docs")
      assert.equal(await button("Добавить документы").isDisabled(), true)
      await route("#/projects/sever/members")
      await button("Рассмотреть предложение").click()
      await button("Принять владение").click()
      await page.locator(".ownership-complete").waitFor()
      await role("daria", "Владелец")
      await route("#/projects/sever/docs")
      assert.equal(await button("Добавить документы").isDisabled(), false)
    },
  )
  await check(
    "decline and sender withdrawal preserve roles, history and allow a new proposal",
    async () => {
      await propose("sever", "alex")
      await persona("alex")
      await route("#/projects/sever/members")
      await button("Рассмотреть предложение").click()
      await button("Отказаться").click()
      await page
        .getByRole("status")
        .filter({ hasText: "Предложение отклонено" })
        .waitFor()
      await role("elena", "Владелец")
      await role("alex", "Редактор")
      await persona("elena")
      await propose("sever", "daria")
      await button("Отозвать предложение").click()
      await button("Отмена").click()
      await page.locator(".ownership-pending").waitFor()
      await button("Отозвать предложение").click()
      await button("Отозвать").click()
      await page
        .getByRole("status")
        .filter({ hasText: "Предложение отозвано" })
        .waitFor()
      await page.locator(".ownership-history summary").click()
      await page.getByText("Получатель отказался", { exact: true }).waitFor()
      await page.getByText("Предложение отозвано", { exact: true }).waitFor()
      await role("elena", "Владелец")
    },
  )
  await check(
    "proposal failure preserves selected recipient and can retry once",
    async () => {
      await page
        .locator(".ownership-panel > .work-demo-details summary")
        .click()
      await page.getByLabel("Ошибка следующего шага передачи").check()
      await button("Передать владение").click()
      await page.getByLabel("Получатель владения").selectOption("alex")
      await button("Отправить предложение").click()
      await page
        .getByRole("alert")
        .filter({ hasText: "Операция не выполнена" })
        .waitFor()
      assert.equal(
        await page.getByLabel("Получатель владения").inputValue(),
        "alex",
      )
      await role("elena", "Владелец")
      await button("Отправить предложение").click()
      await page.locator(".ownership-pending").waitFor()
    },
  )
  await check(
    "acceptance failure changes no roles and successful retry creates one accepted record",
    async () => {
      await propose("sever", "alex")
      await persona("alex")
      await route("#/projects/sever/members")
      await button("Рассмотреть предложение").click()
      const dialog = page.getByRole("dialog", {
        name: "Принять владение проектом",
      })
      await dialog.locator("details summary").click()
      await dialog.getByLabel("Ошибка следующего шага передачи").check()
      await button("Принять владение").click()
      await page
        .getByRole("alert")
        .filter({ hasText: "Операция не выполнена" })
        .waitFor()
      await role("elena", "Владелец")
      await role("alex", "Редактор")
      await button("Принять владение").click()
      await page.locator(".ownership-complete").waitFor()
      assert.equal(await button("Принять владение").count(), 0)
      assert.equal(
        await page
          .locator(".membership-table")
          .getByText("Владелец", { exact: true })
          .count(),
        1,
      )
      await page.locator(".ownership-history summary").click()
      assert.equal(
        await page.getByText("Передача завершена", { exact: true }).count(),
        1,
      )
    },
  )
  await check(
    "expired offer cannot be accepted, does not change roles and can be replaced",
    async () => {
      await propose("sever", "alex")
      await page
        .locator(".ownership-panel > .work-demo-details summary")
        .click()
      await button("Истечь предложению (демо)").click()
      assert.equal(await page.locator(".ownership-pending").count(), 0)
      await role("elena", "Владелец")
      await propose("sever", "daria")
      await page.locator(".ownership-history summary").click()
      await page.getByText("Срок истёк", { exact: true }).waitFor()
    },
  )
  await check(
    "offer expiration during acceptance is rechecked at execution",
    async () => {
      await propose("sever", "alex")
      await persona("alex")
      await route("#/projects/sever/members")
      await button("Рассмотреть предложение").click()
      await page.getByRole("dialog").locator("details summary").click()
      await button("Принять владение").click()
      await button("Истечь во время решения (демо)").click()
      await page.getByRole("alert").waitFor()
      await role("elena", "Владелец")
      await role("alex", "Редактор")
      assert.equal(await button("Принять владение").isDisabled(), true)
    },
  )
  await check(
    "recipient losing project membership invalidates proposal without transferring ownership",
    async () => {
      await propose("sever", "alex")
      await row("alex")
        .getByRole("button", { name: "Удалить доступ", exact: true })
        .click()
      await button("Прекратить доступ").click()
      await page
        .getByRole("status")
        .filter({ hasText: "Доступ участника к проекту прекращён" })
        .waitFor()
      assert.equal(await page.locator(".ownership-pending").count(), 0)
      await page.locator(".ownership-history summary").click()
      await page
        .getByText("Предложение аннулировано", { exact: true })
        .waitFor()
      await role("elena", "Владелец")
      await button("Передать владение").click()
      assert.equal(
        await page
          .getByLabel("Получатель владения")
          .locator('option[value="alex"]')
          .count(),
        0,
      )
    },
  )
  await check(
    "owner leaving before acceptance invalidates proposal and makes TEAM read-only",
    async () => {
      await persona("alex")
      await propose("spor", "daria")
      await offboard()
      await limited("spor")
      assert.equal(await page.locator(".ownership-pending").count(), 0)
      await page.locator(".ownership-history summary").click()
      await page
        .getByText("Предложение аннулировано", { exact: true })
        .waitFor()
      await route("#/projects/spor/docs")
      assert.equal(await button("Добавить документы").isDisabled(), true)
      await page
        .locator(".document-row")
        .filter({ hasText: "Акт_сверки_демо.pdf" })
        .waitFor()
      await route("#/projects/spor/chats")
      assert.equal(await button("Начать диалог").isDisabled(), true)
    },
  )
  await check(
    "Org Admin proposes successor without reading and only recipient acceptance restores TEAM",
    async () => {
      await offboard()
      await persona("oleg")
      await limited("spor")
      assert.equal(await page.locator(".project-bar").count(), 0)
      await propose("spor", "daria", true)
      assert.equal(
        await page
          .getByRole("heading", {
            name: "TEAM в ограниченном режиме",
            exact: true,
          })
          .count(),
        1,
      )
      await route("#/projects/spor/docs")
      await page
        .getByRole("heading", { name: "Проект недоступен", exact: true })
        .waitFor()
      await accept("spor", "daria")
      await role("daria", "Владелец")
      assert.equal(await row("alex").count(), 0)
      await route("#/projects/spor/docs")
      assert.equal(await button("Добавить документы").isDisabled(), false)
      await persona("oleg")
      await route("#/projects/spor/docs")
      await page
        .getByRole("heading", { name: "Проект недоступен", exact: true })
        .waitFor()
    },
  )
  await check(
    "declined, cancelled and expired recovery keep TEAM restricted",
    async () => {
      await offboard()
      await persona("oleg")
      await propose("spor", "daria", true)
      await persona("daria")
      await limited("spor")
      await button("Рассмотреть предложение").click()
      await button("Отказаться").click()
      await page
        .getByRole("status")
        .filter({ hasText: "Предложение отклонено" })
        .waitFor()
      await limited("spor")
      await persona("oleg")
      await propose("spor", "daria", true)
      await button("Отозвать предложение").click()
      await button("Отозвать").click()
      await page
        .getByRole("status")
        .filter({ hasText: "Предложение отозвано" })
        .waitFor()
      await propose("spor", "daria", true)
      await page
        .locator(".ownership-panel > .work-demo-details summary")
        .click()
      await button("Истечь предложению (демо)").click()
      await limited("spor")
      assert.equal(await page.locator(".ownership-pending").count(), 0)
    },
  )
  await check(
    "no successor leaves TEAM restricted; no automatic admin owner or self-candidate",
    async () => {
      await persona("alex")
      await page.locator(".side-create").click()
      await page
        .getByLabel("Название", { exact: true })
        .fill("TEAM без преемника")
      await page.getByRole("radio", { name: "Командное", exact: true }).click()
      await button("Создать").click()
      await page
        .locator(".project-switch strong")
        .getByText("TEAM без преемника", { exact: true })
        .waitFor()
      const projectId = await page.evaluate(() => location.hash.split("/")[2])
      await route(`#/projects/${projectId}/members`)
      await button("Передать владение").click()
      await page
        .getByText("Нет допустимого преемника", { exact: true })
        .waitFor()
      assert.equal(await button("Отправить предложение").isDisabled(), true)
      await button("Отмена").click()
      await offboard()
      await persona("oleg")
      await limited(projectId)
      await button("Предложить преемника").click()
      await page
        .getByText("Нет допустимого преемника", { exact: true })
        .waitFor()
      assert.equal(await button("Отправить предложение").isDisabled(), true)
      assert.equal(
        await page.locator(".membership-table .membership-row").count(),
        0,
      )
      assert.equal(await page.locator(".project-bar").count(), 0)
    },
  )
  await check(
    "remote org revoke hides open Draft, clears unsafe input and blocks old login",
    async () => {
      await persona("alex")
      await route("#/projects/sever/draft?draft=d1")
      const before = await page
        .getByLabel("Текст юридического документа")
        .inputValue()
      await page.locator(".draft-side-panel .work-demo-details summary").click()
      await page.getByLabel("Демо сохранения").selectOption("error")
      await page
        .getByLabel("Текст юридического документа")
        .fill("Несохранённый ввод перед org-revoke UI04")
      await button("Меню профиля").click()
      await page.locator(".profile-menu summary").click()
      await button("Отзыв моего org-доступа (демо)").click()
      const dialog = page.getByRole("dialog", {
        name: "Отзыв моего членства — демо",
      })
      await dialog.locator(".offboard-confirm input").check()
      await dialog
        .getByRole("button", { name: "Прекратить членство", exact: true })
        .click()
      await page
        .getByText("Доступ к организации прекращён. Материалы недоступны.", {
          exact: true,
        })
        .waitFor()
      assert.equal(
        await page.getByLabel("Текст юридического документа").count(),
        0,
      )
      await page
        .getByLabel("Рабочий email", { exact: true })
        .fill("alex@example.test")
      await page.getByLabel("Пароль", { exact: true }).fill("SpectrumDemo1!")
      await button("Войти").click()
      await page
        .getByRole("alert")
        .filter({ hasText: "Не удалось войти" })
        .waitFor()
      await login("elena@example.test")
      await route("#/projects/sever/draft?draft=d1")
      assert.equal(
        await page.getByLabel("Текст юридического документа").inputValue(),
        before,
      )
    },
  )
  await check(
    "org revoke of former OWNER now VIEWER does not remove accepted successor",
    async () => {
      await persona("alex")
      await propose("spor", "daria")
      await accept("spor", "daria")
      await role("alex", "Просмотр")
      await offboard()
      await persona("daria")
      await route("#/projects/spor/members")
      await role("daria", "Владелец")
      assert.equal(await row("alex").count(), 0)
      assert.equal(
        await page.locator(".ownership-panel.is-restricted").count(),
        0,
      )
      await route("#/projects/spor/docs")
      assert.equal(await button("Добавить документы").isDisabled(), false)
    },
  )
  await check(
    "PERSONAL and PRIVATE are not transferred by recovery",
    async () => {
      await persona("alex")
      await route("#/projects/alex-personal/docs")
      await button("Добавить документы").click()
      await button("Или добавить демонстрационный образец").click()
      await button("Добавить · 1").click()
      await page
        .locator(".document-row")
        .getByText("Готов к работе", { exact: true })
        .waitFor()
      await route("#/projects/spor/chats")
      await button("Начать диалог").click()
      await page
        .getByLabel("Ваш вопрос", { exact: true })
        .fill("PRIVATE владельца UI04")
      await button("Отправить").click()
      await page.locator(".legal-answer").waitFor()
      const privateHash = await page.evaluate(() => location.hash)
      await offboard()
      await persona("oleg")
      await propose("spor", "daria", true)
      await accept("spor", "daria")
      await route(privateHash)
      await page
        .getByRole("heading", { name: "Диалог недоступен", exact: true })
        .waitFor()
      await route("#/projects/alex-personal/docs")
      await page
        .getByRole("heading", { name: "Проект недоступен", exact: true })
        .waitFor()
    },
  )
  await check(
    "recovery preserves original archived status instead of silently reactivating",
    async () => {
      await persona("alex")
      await route("#/projects/spor/members")
      await page.getByLabel("Действия: Спор о поставке").click()
      await page
        .getByRole("menuitem", { name: "Архивировать", exact: true })
        .click()
      await page
        .getByRole("dialog")
        .getByRole("button", { name: "Архивировать проект", exact: true })
        .click()
      await page
        .locator(".project-bar")
        .getByText("Архив", { exact: true })
        .waitFor()
      assert.equal(await button("Передать владение").count(), 0)
      await offboard()
      await persona("oleg")
      await propose("spor", "daria", true)
      await accept("spor", "daria")
      await page
        .locator(".project-bar")
        .getByText("Архив", { exact: true })
        .waitFor()
      await route("#/projects/spor/docs")
      assert.equal(await button("Добавить документы").isDisabled(), true)
    },
  )
  await check(
    "org revoke is tenant-scoped; another organization stays accessible",
    async () => {
      await route("#/invite?token=invite-existing")
      await page.getByLabel("Пароль", { exact: true }).fill("SpectrumDemo1!")
      await button("Войти и принять приглашение").click()
      await page.locator(".home h1").waitFor()
      await page.locator(".side-create").click()
      await page
        .getByLabel("Название", { exact: true })
        .fill("Другой tenant UI04")
      await page.getByRole("radio", { name: "Командное", exact: true }).click()
      await button("Создать").click()
      await page
        .locator(".project-switch strong")
        .getByText("Другой tenant UI04", { exact: true })
        .waitFor()
      await offboard()
      await button("Меню профиля").click()
      await button("Выйти").click()
      await login("alex@example.test")
      assert.equal(
        await page.getByLabel("Текущая организация").inputValue(),
        "praktika",
      )
      await page
        .locator(".home .rows")
        .getByText("Другой tenant UI04", { exact: true })
        .waitFor()
      await route("#/projects/spor/docs")
      await page
        .getByRole("heading", { name: "Проект недоступен", exact: true })
        .waitFor()
    },
  )
  await check(
    "changing session while acceptance is busy cannot apply stale actor authority",
    async () => {
      await propose("sever", "alex")
      await persona("alex")
      await route("#/projects/sever/members")
      await button("Рассмотреть предложение").click()
      await button("Принять владение").click()
      await route("#/login")
      await page.waitForTimeout(650)
      await login("elena@example.test")
      await route("#/projects/sever/members")
      await role("elena", "Владелец")
      await role("alex", "Редактор")
      await page.locator(".ownership-pending").waitFor()
    },
  )
  await check(
    "offboard failure preserves active membership and can retry after explicit confirmation",
    async () => {
      await route("#/organization")
      await page
        .locator(".org-person")
        .filter({ hasText: "alex@example.test" })
        .getByRole("button", { name: "Прекратить членство", exact: true })
        .click()
      const dialog = page.getByRole("dialog", {
        name: "Прекратить членство сотрудника",
      })
      assert.equal(
        await dialog
          .getByRole("button", { name: "Прекратить членство", exact: true })
          .isDisabled(),
        true,
      )
      await dialog.locator(".offboard-confirm input").check()
      await dialog.locator("details summary").click()
      await dialog.getByLabel("Ошибка следующего отзыва").check()
      await dialog
        .getByRole("button", { name: "Прекратить членство", exact: true })
        .click()
      await page
        .getByRole("alert")
        .filter({ hasText: "Отзыв не применён" })
        .waitFor()
      assert.equal(
        await page
          .locator(".org-person")
          .filter({ hasText: "alex@example.test" })
          .count(),
        1,
      )
      await dialog
        .getByRole("button", { name: "Прекратить членство", exact: true })
        .click()
      await page.locator(".departure-row").waitFor()
      assert.equal(
        await page
          .locator(".org-person")
          .filter({ hasText: "alex@example.test" })
          .count(),
        0,
      )
    },
  )
  await check(
    "restricted status filter and lifecycle surfaces fit 1280/1440 desktop",
    async () => {
      await offboard()
      await route("#/projects")
      await page
        .getByLabel("Статус", { exact: true })
        .selectOption("restricted")
      await page
        .locator(".proj-main")
        .getByText("Спор о поставке", { exact: true })
        .waitFor()
      for (const width of [1280, 1440]) {
        await page.setViewportSize({ width, height: 1000 })
        await limited("spor")
        assert.equal(
          await page.evaluate(
            () => document.documentElement.scrollWidth > innerWidth,
          ),
          false,
        )
        await route("#/projects/spor/docs")
        assert.equal(
          await page.evaluate(
            () => document.documentElement.scrollWidth > innerWidth,
          ),
          false,
        )
      }
      await persona("oleg")
      await limited("spor")
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
        false,
      )
    },
  )
  await check(
    "recipient org revoke also invalidates offer without freezing unchanged current OWNER",
    async () => {
      await propose("sever", "daria")
      await offboard("daria")
      await route("#/projects/sever/members")
      await role("elena", "Владелец")
      assert.equal(await page.locator(".ownership-pending").count(), 0)
      assert.equal(
        await page.locator(".ownership-panel.is-restricted").count(),
        0,
      )
      await page.locator(".ownership-history summary").click()
      await page
        .getByText("Предложение аннулировано", { exact: true })
        .waitFor()
    },
  )
  assert.deepEqual(errors, [])
  console.log(`PASS ${checks} UI-04 scenario groups; no browser runtime errors`)
} catch (error) {
  console.error("Failure URL:", page?.url())
  if (page) {
    console.error((await page.locator("body").innerText()).slice(-9000))
    await page.screenshot({
      path: "/tmp/neuro-ui04-failure.png",
      fullPage: true,
    })
  }
  throw error
} finally {
  await browser.close()
}
