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
async function route(hash) {
  await page.evaluate((h) => {
    location.hash = h
  }, hash)
}
async function persona(id) {
  await button("Меню профиля").click()
  await page.locator(".profile-menu summary").click()
  await page.getByLabel("Смотреть как сотрудник").selectOption(id)
  await page.locator(".home h1").waitFor()
}
async function project(id = "sever") {
  await route(`#/projects/${id}/chats`)
  await page.locator(".project-bar").waitFor()
}
async function deletion() {
  await page
    .getByRole("button", { name: "Действия: Проект Север", exact: true })
    .click()
  await page
    .getByRole("menuitem", { name: "Удалить проект", exact: true })
    .click()
  await page
    .getByRole("dialog", { name: "Удалить проект", exact: true })
    .waitFor()
}
async function second() {
  await deletion()
  await page.getByLabel("Я понимаю последствия", { exact: false }).check()
  await button("Подтвердить намерение").click()
}
async function rename() {
  await page
    .getByRole("button", { name: "Действия: Проект Север", exact: true })
    .click()
  await page
    .getByRole("menuitem", { name: "Переименовать", exact: true })
    .click()
  await page.getByLabel("Название", { exact: true }).fill("Север · аудит")
  await button("Переименовать проект").click()
  await page.getByRole("dialog").waitFor({ state: "hidden" })
}
async function audit() {
  await button("Журнал аудита").click()
  await page.locator(".audit-page").waitFor()
}
async function check(name, fn) {
  if (page) await page.close()
  page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  page.on("pageerror", (e) => errors.push(e.message))
  await page.goto(`${base}/#/projects/sever/chats`)
  await page.locator(".project-bar").waitFor()
  await fn()
  checks++
  console.log(`PASS ${name}`)
}
try {
  await check(
    "two confirmations; cancel at either step makes no mutation",
    async () => {
      await deletion()
      assert.equal(await button("Подтвердить намерение").isDisabled(), true)
      await button("Отмена").click()
      await second()
      assert.equal(
        await button("Удалить без восстановления").isDisabled(),
        true,
      )
      await button("Отмена").click()
      await audit()
      assert.equal(await page.locator(".audit-operation").count(), 0)
      assert.equal(await page.locator(".audit-table tbody tr").count(), 0)
    },
  )
  await check("exact project name, back and Escape", async () => {
    await second()
    await page
      .getByLabel("Введите точное название проекта")
      .fill("проект север")
    assert.equal(await button("Удалить без восстановления").isDisabled(), true)
    await page
      .getByLabel("Введите точное название проекта")
      .fill("Проект Север")
    assert.equal(await button("Удалить без восстановления").isDisabled(), false)
    await button("Назад").click()
    await button("Подтвердить намерение").click()
    await page.keyboard.press("Escape")
    await page.getByRole("dialog").waitFor({ state: "hidden" })
  })
  await check(
    "deletion audit failure is fail-closed and recoverable",
    async () => {
      await second()
      await page
        .getByLabel("Введите точное название проекта")
        .fill("Проект Север")
      await page.locator(".dialog .work-demo-details summary").click()
      await page
        .getByLabel("Обязательный аудит недоступен", { exact: true })
        .check()
      await button("Удалить без восстановления").click()
      await page
        .getByRole("alert")
        .filter({ hasText: "Обязательный аудит недоступен" })
        .waitFor()
      assert.equal(
        await page.getByLabel("Введите точное название проекта").inputValue(),
        "Проект Север",
      )
      await page
        .getByLabel("Обязательный аудит недоступен", { exact: true })
        .uncheck()
      await button("Удалить без восстановления").click()
      await page.locator(".audit-operation").waitFor()
      await page.getByText("Завершено (демо)", { exact: true }).waitFor()
      assert.equal(await page.locator(".audit-operation").count(), 1)
    },
  )
  await check(
    "failed launch preserves confirmation; retry no duplicate; old link closes",
    async () => {
      await second()
      await page
        .getByLabel("Введите точное название проекта")
        .fill("Проект Север")
      await page.locator(".dialog .work-demo-details summary").click()
      await page.getByLabel("Ошибка запуска удаления (одна попытка)").check()
      await button("Удалить без восстановления").click()
      await page
        .getByRole("alert")
        .filter({ hasText: "Ошибка запуска" })
        .waitFor()
      await button("Удалить без восстановления").dblclick()
      await page.locator(".audit-operation").waitFor()
      await page.getByText("Завершено (демо)", { exact: true }).waitFor()
      assert.equal(await page.locator(".audit-operation").count(), 1)
      assert.equal(await page.locator(".audit-table tbody tr").count(), 3)
      await route("#/projects/sever/chats")
      await page
        .getByRole("heading", { name: "Проект недоступен", exact: true })
        .waitFor()
      assert.equal(await page.locator(".project-bar").count(), 0)
      await audit()
      assert.equal(await page.locator(".audit-operation").count(), 1)
    },
  )
  await check(
    "EDITOR cannot delete and org admin cannot delete through org authority",
    async () => {
      await persona("daria")
      await project()
      await page
        .getByRole("button", { name: "Действия: Проект Север", exact: true })
        .click()
      assert.equal(
        await page
          .getByRole("menuitem", { name: "Удалить проект", exact: true })
          .isDisabled(),
        true,
      )
      await page.keyboard.press("Escape")
      await persona("oleg")
      await route("#/projects/sever/chats")
      await page
        .getByRole("heading", { name: "Проект недоступен", exact: true })
        .waitFor()
      assert.equal(
        await page.getByRole("menuitem", { name: "Удалить проект" }).count(),
        0,
      )
    },
  )
  await check(
    "journal event details and search, dates, empty and loading error retry",
    async () => {
      await rename()
      await audit()
      await page.locator(".audit-table tbody tr").waitFor()
      await button("Детали").click()
      await page
        .getByRole("dialog", { name: "Детали события аудита" })
        .waitFor()
      assert.ok(
        (await page.getByRole("dialog").innerText()).includes(
          "Только метаданные",
        ),
      )
      await button("Закрыть").click()
      await page.getByLabel("Поиск в журнале аудита").fill("не существует")
      await page
        .getByRole("heading", { name: "Нет подходящих событий", exact: true })
        .waitFor()
      await button("Сбросить фильтры").first().click()
      await page.getByLabel("Аудит с даты").fill("2030-01-01")
      await page.getByLabel("Аудит по дату").fill("2020-01-01")
      await page.getByRole("alert").waitFor()
      await button("Сбросить фильтры").first().click()
      await page.locator(".audit-page > details summary").click()
      await page.getByLabel("Состояние журнала").selectOption("loading")
      await button("Завершить демозагрузку").click()
      await page.getByLabel("Состояние журнала").selectOption("error")
      await button("Повторить загрузку").click()
      assert.equal(await page.locator(".audit-table tbody tr").count(), 1)
    },
  )
  await check(
    "project members see own project events; admin has no blanket audit; tenant isolated",
    async () => {
      await rename()
      await persona("daria")
      await audit()
      assert.equal(await page.locator(".audit-table tbody tr").count(), 1)
      await persona("oleg")
      await audit()
      assert.equal(await page.locator(".audit-table tbody tr").count(), 0)
      await persona("elena")
      await page.getByLabel("Текущая организация").selectOption("praktika")
      await audit()
      assert.equal(await page.locator(".audit-table tbody tr").count(), 0)
    },
  )
  await check(
    "archived project deletion and retention disclosure",
    async () => {
      await page
        .getByRole("button", { name: "Действия: Проект Север", exact: true })
        .click()
      await page
        .getByRole("menuitem", { name: "Архивировать", exact: true })
        .click()
      await button("Архивировать проект").click()
      await second()
      assert.ok(
        (await page.getByRole("dialog").innerText()).includes("35 дней"),
      )
      await page
        .getByLabel("Введите точное название проекта")
        .fill("Проект Север")
      await button("Удалить без восстановления").click()
      await page.getByText("Завершено (демо)", { exact: true }).waitFor()
    },
  )
  await check(
    "project audit entry, hash restore and 1280px layout",
    async () => {
      await rename()
      await button("Аудит").click()
      assert.ok(page.url().includes("audit?project=sever"))
      assert.equal(
        await page.getByLabel("Область аудита").inputValue(),
        "sever",
      )
      await page.setViewportSize({ width: 1280, height: 1000 })
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth > window.innerWidth,
        ),
        false,
      )
      await page.screenshot({ path: "/tmp/ui06-audit.png", fullPage: true })
      await page.reload()
      await page.locator(".audit-page").waitFor()
      assert.equal(
        await page.getByLabel("Область аудита").inputValue(),
        "sever",
      )
    },
  )
  await check(
    "grant history joined without reason or document content; own approver only",
    async () => {
      await route("#/organization")
      await page.locator(".access-appointments summary").click()
      await page.getByLabel("Сотрудник для назначения").selectOption("daria")
      await button("Назначить согласующего").click()
      await page.locator(".access-appointed").waitFor()
      await persona("oleg")
      await route("#/organization")
      await button("Запросить доступ").click()
      await page.getByLabel("Объект доступа").selectOption("sever-0")
      await page
        .getByLabel("Причина доступа")
        .fill("Секретная причина для проверки сокрытия")
      await page.getByLabel("Согласующий доступа").selectOption("daria")
      await button("Отправить запрос").click()
      await page.getByRole("dialog").waitFor({ state: "hidden" })
      await audit()
      assert.equal(await page.locator(".audit-table tbody tr").count(), 0)
      await persona("daria")
      await audit()
      await page.getByLabel("Область аудита").selectOption("grants")
      assert.equal(await page.locator(".audit-table tbody tr").count(), 2)
      assert.equal(
        (await page.locator(".audit-page").innerText()).includes(
          "Секретная причина",
        ),
        false,
      )
      await button("Детали").first().click()
      assert.equal(
        (await page.getByRole("dialog").innerText()).includes(
          "Секретная причина",
        ),
        false,
      )
    },
  )
  await check(
    "paginated journal and category/employee/result filters",
    async () => {
      for (let i = 0; i < 16; i++) {
        const action = i % 2 ? "Восстановить" : "Архивировать"
        await page
          .getByRole("button", { name: "Действия: Проект Север", exact: true })
          .click()
        await page.getByRole("menuitem", { name: action, exact: true }).click()
        await button(`${action} проект`).click()
        await page.getByRole("dialog").waitFor({ state: "hidden" })
      }
      await audit()
      assert.equal(await page.locator(".audit-table tbody tr").count(), 15)
      await button("Далее").click()
      assert.equal(await page.locator(".audit-table tbody tr").count(), 1)
      await page.getByLabel("Тип события").selectOption("material")
      await page
        .getByRole("heading", { name: "Нет подходящих событий", exact: true })
        .waitFor()
      await button("Сбросить фильтры").first().click()
      await page.getByLabel("Сотрудник аудита").selectOption("elena")
      await page.getByLabel("Результат аудита").selectOption("success")
      assert.equal(await page.locator(".audit-table tbody tr").count(), 15)
    },
  )
  await check(
    "session switch during final verification does not execute deletion",
    async () => {
      await second()
      await page
        .getByLabel("Введите точное название проекта")
        .fill("Проект Север")
      await button("Удалить без восстановления").click()
      await button("Меню профиля").evaluate((el) => el.click())
      await page.locator(".profile-menu summary").evaluate((el) => el.click())
      await page.getByLabel("Смотреть как сотрудник").evaluate((el) => {
        el.value = "daria"
        el.dispatchEvent(new Event("change", { bubbles: true }))
      })
      await page.locator(".home h1").waitFor()
      await page.waitForTimeout(600)
      await audit()
      assert.equal(await page.locator(".audit-operation").count(), 0)
      await project()
      assert.equal(await page.locator(".project-bar").count(), 1)
    },
  )
  await check(
    "deleting deep links immediately deny Review/AI content",
    async () => {
      await second()
      await page
        .getByLabel("Введите точное название проекта")
        .fill("Проект Север")
      await button("Удалить без восстановления").click()
      await page.locator(".audit-operation").waitFor()
      await route("#/projects/sever/review")
      await page
        .getByRole("heading", { name: "Проект удаляется", exact: true })
        .waitFor()
      assert.equal(await page.locator(".project-bar").count(), 0)
    },
  )
  assert.deepEqual(errors, [])
  console.log(`${checks} browser groups passed; no runtime errors`)
} finally {
  await browser.close()
}
