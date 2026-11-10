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
const seedHash = "#/projects/sever/chat?chat=ch1"
const button = (name) => page.getByRole("button", { name, exact: true })
const question = () => page.getByLabel("Ваш вопрос", { exact: true })
const lastTurn = () => page.locator(".conversation-turn").last()
async function route(hash) {
  await page.evaluate((h) => {
    location.hash = h
  }, hash)
}
async function chat(hash = seedHash) {
  await route(hash)
  await question().waitFor()
}
async function panel() {
  await page.locator(".context-line").click()
}
async function workspaceMode() {
  await panel()
  await page
    .getByRole("radio", { name: "Все готовые документы проекта", exact: true })
    .check()
  await button("Закрыть панель").click()
}
async function send(text) {
  const count = await page.locator(".conversation-turn").count()
  await question().fill(text)
  await button("Отправить").click()
  await page.waitForFunction(
    (before) => document.querySelectorAll(".conversation-turn").length > before,
    count,
  )
  await lastTurn().locator(".legal-answer").waitFor()
}
async function upload(name, outcome = "ready", duplicate, project = "sever") {
  await route(`#/projects/${project}/docs`)
  await button("Добавить документы").click()
  await page.getByLabel("Файлы для демонстрации").setInputFiles({
    name,
    mimeType: "application/pdf",
    buffer: Buffer.from("synthetic only"),
  })
  await page
    .getByLabel("Демонстрационный результат обработки")
    .selectOption(outcome)
  if (duplicate)
    await page
      .getByLabel(`Дубликат ${name}`, { exact: true })
      .selectOption(duplicate)
  await button("Добавить · 1").click()
  const row = page.locator(".document-row").filter({ hasText: name })
  await row
    .getByText(
      outcome === "ready"
        ? "Готов к работе"
        : outcome === "ocr"
          ? "Требуется OCR"
          : "Ошибка обработки",
      { exact: true },
    )
    .waitFor()
}
async function persona(userId) {
  await button("Меню профиля").click()
  await page.locator(".profile-menu summary").click()
  await page.getByLabel("Смотреть как сотрудник").selectOption(userId)
  await page.locator(".home h1").waitFor()
}
async function check(name, fn, initial = seedHash) {
  if (process.env.UI08_CASE && !name.includes(process.env.UI08_CASE)) return
  if (page) await page.close()
  page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  page.on("pageerror", (e) => errors.push(e.message))
  await page.goto(`${base}/${initial}`)
  if (initial === "#/login")
    await page
      .getByRole("heading", { name: "Войти в Спектр", exact: true })
      .waitFor()
  else await question().waitFor()
  await fn()
  checks++
  console.log(`PASS ${name}`)
}
try {
  await check(
    "P0-A login ends at Home and an available project opens",
    async () => {
      await button("Заполнить демоданные").click()
      await button("Войти").click()
      await page.locator(".home h1").waitFor()
      assert.equal(await page.evaluate(() => location.hash), "#/")
      await button("Все проекты").click()
      await page
        .getByRole("heading", { name: "Проекты", exact: true })
        .waitFor()
      await chat()
      assert.ok(
        (await page.locator(".project-bar").innerText()).includes(
          "Проект Север",
        ),
      )
    },
    "#/login",
  )
  await check(
    "unsent question survives opening exact source version and returning",
    async () => {
      await question().fill("НЕОТПРАВЛЕННЫЙ ВОПРОС UI08")
      await page.locator(".answer-sources button").first().click()
      await button("Открыть использованную версию").click()
      await page.getByLabel("Версия документа").waitFor()
      await chat()
      assert.equal(await question().inputValue(), "НЕОТПРАВЛЕННЫЙ ВОПРОС UI08")
      await page
        .getByText("Неотправленный вопрос восстановлен", { exact: false })
        .waitFor()
    },
  )
  await check(
    "new unsent composer and explicit scope survive ordinary navigation",
    async () => {
      const hash = "#/projects/sever/chat"
      await chat(hash)
      await workspaceMode()
      await question().fill("Черновой вопрос по неустойке")
      await route("#/projects/sever/docs")
      await page
        .getByRole("heading", { name: "Документы", exact: true })
        .waitFor()
      await chat(hash)
      assert.equal(
        await question().inputValue(),
        "Черновой вопрос по неустойке",
      )
      assert.ok(
        (await page.locator(".context-line").innerText()).includes(
          "Поиск по проекту",
        ),
      )
    },
  )
  await check(
    "composer is isolated across chat, project, user and organization",
    async () => {
      await question().fill("PRIVATE COMPOSER UI08")
      await chat("#/projects/sever/chat")
      assert.equal(await question().inputValue(), "")
      await chat("#/projects/korp/chat")
      assert.equal(await question().inputValue(), "")
      await persona("alex")
      await chat("#/projects/sever/chat")
      assert.equal(await question().inputValue(), "")
      await persona("elena")
      await page.getByLabel("Текущая организация").selectOption("praktika")
      await route("#/projects/sever/chat?chat=ch1")
      await page
        .getByRole("heading", { name: "Проект недоступен", exact: true })
        .waitFor()
      assert.equal(await question().count(), 0)
      await button("Главная").click()
      await page.getByLabel("Текущая организация").selectOption("vector")
      await chat()
      assert.equal(await question().inputValue(), "PRIVATE COMPOSER UI08")
    },
  )
  await check(
    "session expiry clears unsent question before reauthentication",
    async () => {
      await question().fill("UNSAFE SESSION INPUT")
      await button("Меню профиля").click()
      await page.locator(".profile-menu summary").click()
      await button("Истечение сессии (демо)").click()
      await page
        .getByRole("heading", { name: "Войти в Спектр", exact: true })
        .waitFor()
      await button("Заполнить демоданные").click()
      await button("Войти").click()
      await page.locator(".home h1").waitFor()
      await chat()
      assert.equal(await question().inputValue(), "")
    },
  )
  await check(
    "removed selected source has safe recovery without losing the question",
    async () => {
      await question().fill("Сохраните вопрос после удаления")
      await page.locator(".answer-sources button").first().click()
      await button("Открыть использованную версию").click()
      await button("Удалить").click()
      await page
        .getByRole("dialog")
        .getByRole("button", { name: "Удалить", exact: true })
        .click()
      await chat()
      await page
        .getByText("Ответ закрыт: источник недоступен", { exact: true })
        .waitFor()
      assert.equal(await button("Отправить").isDisabled(), true)
      await page
        .locator(".chat-composer-area")
        .getByRole("button", {
          name: "Убрать недоступные материалы",
          exact: true,
        })
        .click()
      assert.equal(
        await question().inputValue(),
        "Сохраните вопрос после удаления",
      )
      assert.equal(await button("Отправить").isDisabled(), false)
      await panel()
      assert.equal(
        await page
          .getByRole("checkbox", { name: /Договор_поставки_демо\.docx/ })
          .count(),
        0,
      )
    },
  )
  await check(
    "selected document that became OCR can be unchecked instead of trapping composer",
    async () => {
      await question().fill("Вопрос не теряется при OCR")
      await upload("Договор_поставки_демо.docx", "ocr", "version")
      await chat()
      assert.equal(await button("Отправить").isDisabled(), true)
      await panel()
      const checkbox = page.getByRole("checkbox", {
        name: /Договор_поставки_демо.docx/,
      })
      assert.equal(await checkbox.isChecked(), true)
      assert.equal(await checkbox.isDisabled(), false)
      await checkbox.uncheck()
      await button("Закрыть панель").click()
      assert.equal(await button("Отправить").isDisabled(), false)
      assert.equal(await question().inputValue(), "Вопрос не теряется при OCR")
    },
  )
  await check(
    "version repair is explicit while historical answer stays pinned",
    async () => {
      await question().fill("Уточните неустойку новой версии")
      await upload("Договор_поставки_демо.docx", "ready", "version")
      await chat()
      assert.equal(await button("Отправить").isDisabled(), true)
      await panel()
      await button("Обновить выбранные версии").click()
      await button("Закрыть панель").click()
      await button("Отправить").click()
      await lastTurn().locator(".legal-answer").waitFor()
      assert.ok(
        (await lastTurn().locator(".answer-sources").innerText()).includes(
          "Версия 3",
        ),
      )
      assert.ok(
        (
          await page
            .locator(".conversation-turn")
            .first()
            .locator(".answer-sources")
            .innerText()
        ).includes("Версия 2"),
      )
    },
  )
  await check(
    "workspace scope searches ready samples, caps used evidence and never claims real retrieval",
    async () => {
      await upload("Дополнительный_контекст.pdf")
      await chat("#/projects/sever/chat")
      await workspaceMode()
      await send("Какая неустойка предусмотрена за просрочку?")
      assert.equal(
        await lastTurn().locator(".answer-sources button").count(),
        3,
      )
      await lastTurn().getByText("Поиск по проекту", { exact: false }).waitFor()
      assert.ok(
        (await lastTurn().locator(".chat-search-summary").innerText()).includes(
          "Только синтетический текст",
        ),
      )
      for (const width of [1280, 1440]) {
        await page.setViewportSize({ width, height: 1000 })
        assert.equal(
          await page.evaluate(
            () => document.documentElement.scrollWidth > innerWidth,
          ),
          false,
        )
      }
      await page.locator(".answer-sources button").first().click()
      await page.screenshot({
        path: "/tmp/ui08-workspace-source.png",
        fullPage: true,
      })
    },
  )
  await check(
    "no matches does not fabricate a conclusion, source, copy or Draft action",
    async () => {
      await chat("#/projects/sever/chat")
      await workspaceMode()
      await send("Квазикристаллическая телепортация сингулярностей")
      await lastTurn()
        .getByRole("heading", {
          name: "Подходящих фрагментов не найдено",
          exact: true,
        })
        .waitFor()
      assert.equal(
        await lastTurn().locator(".answer-sources button").count(),
        0,
      )
      assert.equal(
        await lastTurn()
          .getByRole("button", { name: "Копировать", exact: true })
          .count(),
        0,
      )
      assert.equal(
        await lastTurn()
          .getByRole("button", { name: "Создать черновик", exact: true })
          .count(),
        0,
      )
      assert.ok(
        (await lastTurn().innerText()).includes(
          "не доказывает отсутствие условия",
        ),
      )
    },
  )
  await check(
    "empty project search has honest no-ready state and can retry after upload",
    async () => {
      await chat("#/projects/korp/chat")
      await workspaceMode()
      await send("Проверьте неустойку")
      await lastTurn()
        .getByRole("heading", {
          name: "Нет готовых документов для поиска",
          exact: true,
        })
        .waitFor()
      const hash = await page.evaluate(() => location.hash)
      await upload("Новый_контекст.pdf", "ready", undefined, "korp")
      await chat(hash)
      await button("Повторить в новой ветке").click()
      await page.locator(".answer-sources button").waitFor()
      assert.ok(
        (await page.locator(".answer-sources").innerText()).includes(
          "Новый_контекст.pdf",
        ),
      )
    },
  )
  await check(
    "workspace snapshot stays fixed; next question uses newly processed version",
    async () => {
      await upload("Версии.pdf", "ready", undefined, "korp")
      await chat("#/projects/korp/chat")
      await workspaceMode()
      await send("Неустойка за поставку")
      const hash = await page.evaluate(() => location.hash)
      await upload("Версии.pdf", "ready", "version", "korp")
      await chat(hash)
      assert.ok(
        (
          await page
            .locator(".conversation-turn")
            .first()
            .locator(".answer-sources")
            .innerText()
        ).includes("Версия 1"),
      )
      await send("Уточни неустойку")
      assert.ok(
        (await lastTurn().locator(".answer-sources").innerText()).includes(
          "Версия 2",
        ),
      )
      assert.ok(
        (
          await page
            .locator(".conversation-turn")
            .first()
            .locator(".answer-sources")
            .innerText()
        ).includes("Версия 1"),
      )
    },
  )
  await check(
    "explicit document subset does not silently widen to the project",
    async () => {
      await upload("Выбор.pdf")
      await chat("#/projects/sever/chat")
      await panel()
      const ready = page.getByRole("checkbox").filter({ visible: true })
      let selected = 0
      for (let i = 0; i < (await ready.count()) && selected < 2; i++) {
        if (!(await ready.nth(i).isDisabled())) {
          await ready.nth(i).check()
          selected++
        }
      }
      assert.equal(selected, 2)
      await button("Закрыть панель").click()
      await send("Сравните неустойку выбранных документов")
      assert.equal(
        await lastTurn().locator(".answer-sources button").count(),
        2,
      )
      assert.ok(
        (await lastTurn().locator(".chat-search-summary").innerText()).includes(
          "Поиск в выбранных версиях",
        ),
      )
      assert.equal(
        (await lastTurn().locator(".chat-search-summary").innerText()).includes(
          "Поиск по проекту",
        ),
        false,
      )
    },
  )
  for (const [outcome, error, badge] of [
    ["failed", "Не удалось подготовить ответ", "Ошибка ответа"],
    ["timed_out", "Время ожидания истекло", "Время ожидания истекло"],
  ]) {
    await check(
      `project list displays ${outcome} result instead of endless progress and retry preserves attempt`,
      async () => {
        await chat("#/projects/sever/chat")
        await panel()
        await page.getByLabel("Демо-сценарий AI").selectOption(outcome)
        await button("Закрыть панель").click()
        await question().fill(`UI08 ${outcome}`)
        await button("Отправить").click()
        await page.getByRole("heading", { name: error, exact: true }).waitFor()
        const hash = await page.evaluate(() => location.hash)
        await page.getByRole("tab", { name: /^Чаты/ }).click()
        const row = page.locator(".row").filter({ hasText: `UI08 ${outcome}` })
        await row.getByText(badge, { exact: true }).waitFor()
        assert.equal((await row.innerText()).includes("Готовим ответ"), false)
        await row.click()
        await button("Повторить запрос").click()
        await page.locator(".legal-answer").waitFor()
        await chat(hash)
        await page.getByRole("heading", { name: error, exact: true }).waitFor()
      },
    )
  }
  await check(
    "workspace generation finishes after navigation and can be reopened",
    async () => {
      await chat("#/projects/sever/chat")
      await workspaceMode()
      await question().fill("Неустойка в фоне")
      await button("Отправить").click()
      await page.locator(".answer-progress").waitFor()
      const hash = await page.evaluate(() => location.hash)
      await route("#/projects/sever/docs")
      await page.waitForTimeout(3000)
      await chat(hash)
      await page.locator(".legal-answer").waitFor()
      assert.ok((await page.locator(".answer-sources button").count()) > 0)
    },
  )
  await check(
    "VIEWER can inspect an allowed answer but cannot change scope or send",
    async () => {
      await question().fill("OWNER PRIVATE UNSENT")
      await button("Открыть проекту").click()
      await button("Открыть участникам").click()
      await persona("daria")
      await chat()
      assert.equal(await question().inputValue(), "")
      assert.equal(await question().isDisabled(), true)
      await panel()
      assert.equal(
        await page
          .getByRole("radio", {
            name: "Все готовые документы проекта",
            exact: true,
          })
          .isDisabled(),
        true,
      )
      assert.equal(await button("Отправить").isDisabled(), true)
    },
  )
  await check(
    "revoked and regranted membership cannot revive an unsafe unsent composer",
    async () => {
      await persona("alex")
      await chat("#/projects/sever/chat")
      await send("Начало личного диалога")
      const hash = await page.evaluate(() => location.hash)
      await question().fill("UNSAFE REVOKED UNSENT")
      await persona("elena")
      await route("#/projects/sever/members")
      await page
        .locator(".membership-row")
        .filter({ hasText: "alex@example.test" })
        .getByRole("button", { name: "Удалить доступ", exact: true })
        .click()
      await button("Прекратить доступ").click()
      await page.getByRole("dialog").waitFor({ state: "hidden" })
      await button("Добавить участника").click()
      await page.getByLabel("Сотрудник организации").selectOption("alex")
      await page.getByLabel("Назначаемая роль").selectOption("editor")
      await button("Применить доступ").click()
      await page.getByRole("dialog").waitFor({ state: "hidden" })
      await persona("alex")
      await chat(hash)
      assert.equal(await question().inputValue(), "")
    },
  )
  await check(
    "cancelling a context-free request is not mislabelled as a context answer",
    async () => {
      await chat("#/projects/korp/chat")
      await question().fill("Вопрос для остановки")
      await button("Отправить").click()
      await button("Остановить").click()
      await lastTurn()
        .getByRole("heading", { name: "Запрос остановлен", exact: true })
        .waitFor()
      assert.equal(
        await lastTurn()
          .getByRole("button", { name: "Копировать", exact: true })
          .count(),
        0,
      )
    },
  )
  assert.deepEqual(errors, [])
  console.log(`${checks} UI-08 browser groups passed; no runtime errors`)
} finally {
  await browser.close()
}
