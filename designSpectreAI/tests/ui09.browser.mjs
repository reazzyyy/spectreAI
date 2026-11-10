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
const question = () => page.getByLabel("Ваш вопрос", { exact: true })
const last = () => page.locator(".conversation-turn").last()
async function route(hash) {
  await page.evaluate((h) => {
    location.hash = h
  }, hash)
}
async function chat(hash = "#/projects/korp/chat") {
  await route(hash)
  await question().waitFor()
}
async function openPanel() {
  await page.locator(".context-line").click()
}
async function workspace() {
  await openPanel()
  await page
    .getByRole("radio", { name: "Все готовые документы проекта", exact: true })
    .check()
}
async function send(text, error = false) {
  const count = await page.locator(".conversation-turn").count()
  await question().fill(text)
  await button("Отправить").click()
  await page.waitForFunction(
    (n) => document.querySelectorAll(".conversation-turn").length > n,
    count,
  )
  await last()
    .locator(error ? ".retrieval-error" : ".legal-answer")
    .waitFor()
}
async function upload(name, outcome = "ready", duplicate, project = "korp") {
  await route(`#/projects/${project}/docs`)
  await button("Добавить документы").click()
  await page.getByLabel("Файлы для демонстрации").setInputFiles({
    name,
    mimeType: "application/pdf",
    buffer: Buffer.from("synthetic demo only"),
  })
  await page
    .getByLabel("Демонстрационный результат обработки")
    .selectOption(outcome)
  if (duplicate)
    await page
      .getByLabel(`Дубликат ${name}`, { exact: true })
      .selectOption(duplicate)
  await button("Добавить · 1").click()
  await page
    .locator(".document-row")
    .filter({ hasText: name })
    .getByText(outcome === "partial" ? "Готов частично" : "Готов к работе", {
      exact: true,
    })
    .waitFor()
}
async function partialChat(project = "korp") {
  await upload("Частичный_образец.pdf", "partial", undefined, project)
  await page
    .locator(".document-row")
    .filter({ hasText: "Частичный_образец.pdf" })
    .locator(".document-main")
    .click()
  await button("Обсудить в чате").click()
  await send("Проверьте неустойку")
}
async function copyCapture() {
  await page.evaluate(() =>
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async (text) => {
          window.__ui09Copy = text
        },
      },
    }),
  )
}
async function bulk() {
  await openPanel()
  await page.locator(".context-panel .work-demo-details summary").click()
  await button("Добавить 30 демодокументов").click()
  await page.getByLabel("Фильтр материалов контекста").selectOption("ready")
  await page.waitForFunction(
    () =>
      Number(
        document
          .querySelector(".chat-material-count")
          ?.textContent.match(/Строк: (\d+)/)?.[1],
      ) >= 30,
  )
}
async function persona(userId) {
  await button("Меню профиля").click()
  await page.locator(".profile-menu summary").click()
  await page.getByLabel("Смотреть как сотрудник").selectOption(userId)
  await page.locator(".home h1").waitFor()
}
async function check(name, fn, initial = "#/projects/korp/chat") {
  if (process.env.UI09_CASE && !name.includes(process.env.UI09_CASE)) return
  if (page) await page.close()
  page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  page.on("pageerror", (e) => errors.push(e.message))
  await page.goto(`${base}/${initial}`)
  await question().waitFor()
  await fn()
  checks++
  console.log(`PASS ${name}`)
}
try {
  await check(
    "retrieval failure has no generated answer, sources or copy and retry is a new attempt",
    async () => {
      await upload("Контекст.pdf")
      await chat()
      await workspace()
      await page
        .getByLabel("Демо-сценарий поиска источников")
        .selectOption("failed")
      await page.getByLabel("Демо-сценарий AI").selectOption("failed")
      await button("Закрыть панель").click()
      await send("Неустойка при сбое поиска", true)
      const failedHash = await page.evaluate(() => location.hash)
      assert.equal(
        await last().locator(".legal-answer, .answer-sources").count(),
        0,
      )
      assert.equal(
        await last()
          .getByRole("button", { name: "Копировать", exact: true })
          .count(),
        0,
      )
      assert.ok((await last().innerText()).includes("AI-ответ не создавался"))
      await button("Повторить поиск").click()
      await page.locator(".answer-sources button").waitFor()
      assert.notEqual(await page.evaluate(() => location.hash), failedHash)
      await chat(failedHash)
      await page
        .getByRole("heading", {
          name: "Поиск источников не выполнен",
          exact: true,
        })
        .waitFor()
    },
  )
  await check(
    "retrieval status appears in project list and failure applies once",
    async () => {
      await workspace()
      await page
        .getByLabel("Демо-сценарий поиска источников")
        .selectOption("failed")
      await button("Закрыть панель").click()
      await send("UI09 ошибка поиска", true)
      const hash = await page.evaluate(() => location.hash)
      await openPanel()
      assert.equal(
        await page.getByLabel("Демо-сценарий поиска источников").inputValue(),
        "ready",
      )
      await button("Закрыть панель").click()
      await page.getByRole("tab", { name: /^Чаты/ }).click()
      await page
        .locator(".row")
        .filter({ hasText: "UI09 ошибка поиска" })
        .getByText("Ошибка поиска", { exact: true })
        .waitFor()
      await chat(hash)
      await send("Неустойка без второго сбоя")
      await last()
        .getByRole("heading", {
          name: "Нет готовых документов для поиска",
          exact: true,
        })
        .waitFor()
    },
  )
  await check(
    "empty manual scope never applies disabled search failure setting",
    async () => {
      await workspace()
      await page
        .getByLabel("Демо-сценарий поиска источников")
        .selectOption("failed")
      await page
        .getByRole("radio", { name: "Выбранные документы", exact: true })
        .check()
      assert.equal(
        await page.getByLabel("Демо-сценарий поиска источников").isDisabled(),
        true,
      )
      await button("Закрыть панель").click()
      await send("Без документов")
      await last()
        .getByRole("heading", {
          name: "Для проверки нужен контекст",
          exact: true,
        })
        .waitFor()
      assert.equal(await last().locator(".retrieval-error").count(), 0)
    },
  )
  await check(
    "cancelling a retrieval attempt is not relabelled as no results",
    async () => {
      await workspace()
      await page
        .getByLabel("Демо-сценарий поиска источников")
        .selectOption("failed")
      await button("Закрыть панель").click()
      await question().fill("Остановить поиск")
      await button("Отправить").click()
      await button("Остановить").click()
      await last()
        .getByRole("heading", { name: "Запрос остановлен", exact: true })
        .waitFor()
      assert.equal(
        await last().locator(".retrieval-error, .chat-search-summary").count(),
        0,
      )
    },
  )
  await check(
    "large picker is paginated and preserves selection across pages, search and filters",
    async () => {
      await bulk()
      assert.equal(await page.locator(".material-choice").count(), 12)
      const firstName = await page
        .locator(".material-choice strong")
        .first()
        .innerText()
      await page.getByRole("checkbox").first().check()
      await button("Следующие материалы").click()
      await page.getByRole("checkbox").first().check()
      await button("Предыдущие материалы").click()
      assert.equal(await page.getByRole("checkbox").first().isChecked(), true)
      await page.getByLabel("Поиск материалов контекста").fill("Демо_набор_30_")
      assert.equal(await page.locator(".material-choice").count(), 1)
      await page
        .getByLabel("Поиск материалов контекста")
        .fill("Нет такого файла")
      await page.getByText("Материалы не найдены", { exact: true }).waitFor()
      await button("Сбросить поиск материалов").click()
      await page
        .getByLabel("Фильтр материалов контекста")
        .selectOption("selected")
      assert.equal(await page.locator(".material-choice").count(), 2)
      assert.ok(
        (await page.locator(".chat-material-picker").innerText()).includes(
          firstName,
        ),
      )
      await button("Закрыть панель").click()
      await send("Неустойка выбранных документов")
      assert.equal(await last().locator(".answer-sources button").count(), 2)
    },
  )
  await check(
    "manual cap never truncates 11 sources silently and workspace cap travels with copy",
    async () => {
      await bulk()
      for (let i = 0; i < 11; i++)
        await page.getByRole("checkbox").nth(i).check()
      await button("Закрыть панель").click()
      await question().fill("Неустойка большого набора")
      assert.equal(await button("Отправить").isDisabled(), true)
      await page
        .locator(".chat-composer-area")
        .getByRole("alert")
        .filter({ hasText: "демо-лимит" })
        .waitFor()
      assert.equal(await page.locator(".conversation-turn").count(), 0)
      await openPanel()
      await button("Снять весь выбор").click()
      assert.ok(
        (await page.locator(".context-summary").innerText()).includes(
          "Выбрано: 0",
        ),
      )
      assert.equal(await question().inputValue(), "Неустойка большого набора")
      await page
        .getByRole("radio", {
          name: "Все готовые документы проекта",
          exact: true,
        })
        .check()
      await button("Закрыть панель").click()
      assert.equal(await question().inputValue(), "Неустойка большого набора")
      await send("Неустойка большого набора")
      assert.equal(await last().locator(".answer-sources button").count(), 3)
      await copyCapture()
      await last()
        .getByRole("button", { name: "Копировать", exact: true })
        .click()
      assert.ok(
        (await page.evaluate(() => window.__ui09Copy)).includes("3 из 30"),
      )
      await last()
        .getByRole("button", { name: "Создать черновик", exact: true })
        .click()
      await button("Создать в проекте").click()
      assert.ok(
        (
          await page
            .getByLabel("Текст юридического документа", { exact: true })
            .inputValue()
        ).includes("не полная проверка"),
      )
    },
  )
  await check(
    "unavailable metadata is not searchable and picker remains within desktop width",
    async () => {
      await openPanel()
      assert.equal(
        (await page.locator(".context-panel").innerText()).includes(
          "Конфиденциальный документ",
        ),
        false,
      )
      await page
        .getByLabel("Поиск материалов контекста")
        .fill("Конфиденциальный")
      assert.equal(await page.locator(".material-choice").count(), 0)
      await page
        .getByLabel("Поиск материалов контекста")
        .fill("UNRELATED UNKNOWN")
      assert.equal(await page.locator(".material-choice").count(), 0)
      for (const width of [1280, 1440]) {
        await page.setViewportSize({ width, height: 1000 })
        assert.equal(
          await page.evaluate(
            () => document.documentElement.scrollWidth > innerWidth,
          ),
          false,
        )
      }
    },
    "#/projects/sever/chat",
  )
  await check(
    "partial processing is visible in library, document, filter and risk limits",
    async () => {
      await upload("Неполный.pdf", "partial")
      await page.getByLabel("Статус документа").selectOption("partial")
      assert.equal(await page.locator(".document-row").count(), 1)
      await page.locator(".document-main").click()
      await page.getByText("Текст извлечён частично", { exact: true }).waitFor()
      await page
        .getByText("Неполное извлечение версии 1", { exact: true })
        .waitFor()
      assert.equal(
        (await page.locator(".document-paper pre").innerText()).includes(
          "5.2.",
        ),
        false,
      )
      await page
        .locator(".pdf-pagination")
        .getByRole("button", { name: "Далее", exact: true })
        .click()
      await page
        .getByText("Фрагмент страницы не извлечён", { exact: true })
        .waitFor()
      await button("Анализ рисков").click()
      assert.equal(await page.locator(".risk-card").count(), 0)
      await page
        .getByText("Полная проверка рисков невозможна", { exact: false })
        .waitFor()
    },
  )
  await check(
    "partial answer, source, clipboard and Draft all preserve the extraction warning",
    async () => {
      await partialChat()
      await last()
        .getByRole("heading", {
          name: "Предварительная оценка извлечённого фрагмента",
          exact: true,
        })
        .waitFor()
      await last()
        .getByText("Неполное извлечение — предварительный вывод", {
          exact: true,
        })
        .waitFor()
      await last().locator(".answer-sources button").click()
      await page
        .getByText("Текст этой версии извлечён частично", { exact: true })
        .waitFor()
      await copyCapture()
      await last()
        .getByRole("button", { name: "Копировать", exact: true })
        .click()
      assert.ok(
        (await page.evaluate(() => window.__ui09Copy)).startsWith(
          "Неполное извлечение",
        ),
      )
      await last()
        .getByRole("button", { name: "Создать черновик", exact: true })
        .click()
      await button("Создать в проекте").click()
      assert.ok(
        (
          await page
            .getByLabel("Текст юридического документа", { exact: true })
            .inputValue()
        ).includes("Таблицы, приложения"),
      )
      await page
        .getByLabel("Текст юридического документа", { exact: true })
        .fill("Самостоятельный текст без оговорки")
      await page
        .getByText("Основания черновика извлечены частично", { exact: true })
        .waitFor()
    },
  )
  await check(
    "partial workspace no-match never becomes proof about unextracted sections",
    async () => {
      await upload("Неполный_поиск.pdf", "partial")
      await chat()
      await workspace()
      await button("Закрыть панель").click()
      await send("убытков")
      await last()
        .getByRole("heading", {
          name: "Подходящих фрагментов не найдено",
          exact: true,
        })
        .waitFor()
      await last()
        .getByText("Поиск не проверял пропущенные фрагменты", { exact: false })
        .waitFor()
      assert.equal(
        await last()
          .getByRole("button", { name: "Копировать", exact: true })
          .count(),
        0,
      )
      assert.equal(
        await last()
          .getByRole("button", { name: "Создать черновик", exact: true })
          .count(),
        0,
      )
    },
  )
  await check(
    "new full version does not rewrite historical partial provenance",
    async () => {
      await partialChat()
      const hash = await page.evaluate(() => location.hash)
      await upload("Частичный_образец.pdf", "ready", "version")
      await chat(hash)
      await workspace()
      await button("Закрыть панель").click()
      await send("Уточни неустойку")
      assert.equal(await last().locator(".extraction-warning").count(), 0)
      assert.ok(
        (await last().locator(".answer-sources").innerText()).includes(
          "Версия 2",
        ),
      )
      const old = page.locator(".conversation-turn").first()
      await old
        .getByText("Неполное извлечение — предварительный вывод", {
          exact: true,
        })
        .waitFor()
      await old.locator(".answer-sources button").click()
      await page.getByText("Использована версия 1", { exact: true }).waitFor()
      await page
        .getByText("Текст этой версии извлечён частично", { exact: true })
        .waitFor()
      await page.screenshot({
        path: "/tmp/ui09-partial-history.png",
        fullPage: true,
        animations: "disabled",
      })
    },
  )
  await check(
    "deleting a partial source closes all derived answer actions",
    async () => {
      await partialChat()
      const hash = await page.evaluate(() => location.hash)
      await last().locator(".answer-sources button").click()
      await button("Открыть использованную версию").click()
      await button("Удалить").click()
      await page
        .getByRole("dialog")
        .getByRole("button", { name: "Удалить", exact: true })
        .click()
      await chat(hash)
      await last()
        .getByText("Ответ закрыт: источник недоступен", { exact: true })
        .waitFor()
      assert.equal(
        await last()
          .locator(".legal-answer, .extraction-warning, .answer-actions")
          .count(),
        0,
      )
    },
  )
  await check(
    "document and Chat notifications distinguish incomplete extraction and retrieval failure",
    async () => {
      await partialChat()
      await button("Уведомления").click()
      await page
        .locator(".notification-row")
        .filter({ hasText: "Документ извлечён частично" })
        .waitFor()
      await page
        .locator(".notification-row")
        .filter({ hasText: "Предварительный ответ Chat готов" })
        .waitFor()
      await chat()
      await workspace()
      await page
        .getByLabel("Демо-сценарий поиска источников")
        .selectOption("failed")
      await button("Закрыть панель").click()
      await send("Неустойка после сбоя", true)
      await button("Уведомления").click()
      await page
        .locator(".notification-row")
        .filter({ hasText: "Не удалось найти источники для Chat" })
        .waitFor()
    },
  )
  await check(
    "VIEWER reads allowed partial history but cannot seed data or query",
    async () => {
      await partialChat("sever")
      const hash = await page.evaluate(() => location.hash)
      await button("Открыть проекту").click()
      await button("Открыть участникам").click()
      await persona("daria")
      await chat(hash)
      await last()
        .getByText("Неполное извлечение — предварительный вывод", {
          exact: true,
        })
        .waitFor()
      assert.equal(await button("Отправить").isDisabled(), true)
      await openPanel()
      assert.equal(
        await page.getByLabel("Демо-сценарий поиска источников").isDisabled(),
        true,
      )
      await page.locator(".context-panel .work-demo-details summary").click()
      assert.equal(
        await button("Добавить 30 демодокументов").isDisabled(),
        true,
      )
    },
  )
  await check(
    "VIEWER cannot retry a shared retrieval failure",
    async () => {
      await workspace()
      await page
        .getByLabel("Демо-сценарий поиска источников")
        .selectOption("failed")
      await button("Закрыть панель").click()
      await send("Неустойка для общего сбоя", true)
      const hash = await page.evaluate(() => location.hash)
      await button("Открыть проекту").click()
      await button("Открыть участникам").click()
      await persona("daria")
      await chat(hash)
      assert.equal(await button("Повторить поиск").isDisabled(), true)
      assert.equal(await last().locator(".legal-answer").count(), 0)
    },
    "#/projects/sever/chat",
  )
  await check(
    "temporary read-only grant also preserves exact-version extraction warning",
    async () => {
      await upload("Частичный_grant.pdf", "partial", undefined, "sever")
      await route("#/organization")
      await page.locator(".access-appointments summary").click()
      await page.getByLabel("Сотрудник для назначения").selectOption("daria")
      await button("Назначить согласующего").click()
      await page.locator(".access-appointed").waitFor()
      await persona("oleg")
      await route("#/organization")
      await button("Запросить доступ").click()
      const options = await page
        .getByLabel("Объект доступа")
        .locator("option")
        .evaluateAll((rows) => rows.map((o) => o.value))
      const objectId = options.find((value) => /^[0-9a-f]{8}-/.test(value))
      assert.ok(objectId)
      await page.getByLabel("Объект доступа").selectOption(objectId)
      await page
        .getByLabel("Причина доступа")
        .fill("Синтетическая проверка полноты версии")
      await page.getByLabel("Согласующий доступа").selectOption("daria")
      await button("Отправить запрос").click()
      await page.getByRole("dialog").waitFor({ state: "hidden" })
      await persona("daria")
      await route("#/organization")
      await button("Рассмотреть запрос").click()
      await button("Одобрить доступ").click()
      await page.getByRole("dialog").waitFor({ state: "hidden" })
      await persona("oleg")
      await route("#/organization")
      await button("Открыть read-only").click()
      await page
        .getByText("Текст согласованной версии извлечён частично", {
          exact: true,
        })
        .waitFor()
      assert.equal(
        (await page.locator(".access-document").innerText()).includes("5.2."),
        false,
      )
    },
  )
  assert.deepEqual(errors, [])
  console.log(`${checks} UI-09 browser groups passed; no runtime errors`)
} finally {
  await browser.close()
}
