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
async function panel() {
  await page.locator(".context-line").click()
}
async function choose(names) {
  await panel()
  await page
    .getByRole("radio", { name: "Выбранные документы", exact: true })
    .check()
  if (await button("Снять весь выбор").count())
    await button("Снять весь выбор").click()
  for (const name of names) {
    await page.getByLabel("Поиск материалов контекста").fill(name)
    await page
      .getByRole("checkbox", { name: new RegExp(name.replace(/\./g, "\\.")) })
      .check()
  }
  await page.getByLabel("Поиск материалов контекста").fill("")
  await button("Закрыть панель").click()
}
async function send(text, type = "answer") {
  const count = await page.locator(".conversation-turn").count()
  await question().fill(text)
  await button("Отправить").click()
  await page.waitForFunction(
    (n) => document.querySelectorAll(".conversation-turn").length > n,
    count,
  )
  await last()
    .locator(
      type === "retrieval"
        ? ".retrieval-error"
        : type === "ai"
          ? ".ai-error"
          : ".legal-answer",
    )
    .waitFor()
}
async function upload(name, outcome = "ready", duplicate, project = "korp") {
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
  await page
    .locator(".document-row")
    .filter({ hasText: name })
    .getByText(outcome === "partial" ? "Готов частично" : "Готов к работе", {
      exact: true,
    })
    .waitFor()
}
async function removeDocument(name, project = "korp") {
  await route(`#/projects/${project}/docs`)
  await page
    .locator(".document-row")
    .filter({ hasText: name })
    .locator(".document-main")
    .click()
  await button("Удалить").click()
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Удалить", exact: true })
    .click()
  await page.getByRole("dialog").waitFor({ state: "hidden" })
}
async function persona(id) {
  await button("Меню профиля").click()
  await page.locator(".profile-menu summary").click()
  await page.getByLabel("Смотреть как сотрудник").selectOption(id)
  await page.locator(".home h1").waitFor()
}
async function logout() {
  await button("Меню профиля").click()
  await button("Выйти").click()
  await page
    .getByRole("heading", { name: "Войти в Спектр", exact: true })
    .waitFor()
}
async function login() {
  await button("Заполнить демоданные").click()
  await button("Войти").click()
  await page.locator(".home h1").waitFor()
  assert.equal(await page.evaluate(() => location.hash), "#/")
}
async function captureCopy() {
  await page.evaluate(() =>
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async (value) => {
          window.__ui10Copy = value
        },
      },
    }),
  )
}
async function check(name, fn, initial = "#/projects/korp/chat") {
  if (process.env.UI10_CASE && !name.includes(process.env.UI10_CASE)) return
  if (page) await page.close()
  page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  page.on("pageerror", (e) => errors.push(e.message))
  await page.goto(`${base}/${initial}`)
  await question().waitFor()
  await fn()
  checks++
  console.log(`PASS ${name}`)
}
async function freezeJobClock() {
  await page.evaluate(() => {
    let now = Date.now()
    Date.now = () => now
    window.__ui10Advance = (ms) => {
      now += ms
    }
  })
}
try {
  await check(
    "single selected document negative lookup retains selection and creates no fake evidence",
    async () => {
      await upload("Выбранный.pdf")
      await chat()
      await choose(["Выбранный.pdf"])
      await send("Квазикристаллическая телепортация")
      await last()
        .getByRole("heading", {
          name: "Подходящих фрагментов не найдено",
          exact: true,
        })
        .waitFor()
      assert.equal(await last().locator(".answer-sources button").count(), 0)
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
      await panel()
      assert.equal(
        await page.getByRole("checkbox", { name: /Выбранный.pdf/ }).isChecked(),
        true,
      )
      await button("Закрыть панель").click()
      await send("Неустойка")
      assert.equal(await last().locator(".answer-sources button").count(), 1)
      assert.equal(
        await page
          .locator(".conversation-turn")
          .first()
          .locator(".answer-sources button")
          .count(),
        0,
      )
    },
  )
  await check(
    "unselected matching document cannot supply an answer for a different selected version",
    async () => {
      await upload("Частичный.pdf", "partial")
      await upload("Полный.pdf")
      await chat()
      await choose(["Частичный.pdf"])
      await send("Убытков")
      await last()
        .getByRole("heading", {
          name: "Подходящих фрагментов не найдено",
          exact: true,
        })
        .waitFor()
      assert.equal(await last().locator(".answer-sources button").count(), 0)
      assert.equal((await last().innerText()).includes("Полный.pdf"), false)
    },
  )
  await check(
    "selected and used subsets stay distinct and copy carries coverage limits",
    async () => {
      await upload("Полный.pdf")
      await upload("Частичный.pdf", "partial")
      await chat()
      await choose(["Полный.pdf", "Частичный.pdf"])
      await send("Убытков")
      assert.equal(await last().locator(".answer-sources button").count(), 1)
      assert.ok(
        (await last().locator(".answer-sources").innerText()).includes(
          "Полный.pdf",
        ),
      )
      assert.equal(
        (await last().locator(".answer-sources").innerText()).includes(
          "Частичный.pdf",
        ),
        false,
      )
      assert.equal(await last().locator(".extraction-warning").count(), 0)
      await last()
        .getByText("Не весь выбранный набор дал совпадения", { exact: false })
        .waitFor()
      await panel()
      assert.equal(
        await page
          .getByRole("checkbox")
          .evaluateAll((rows) => rows.filter((e) => e.checked).length),
        2,
      )
      await button("Закрыть панель").click()
      await captureCopy()
      await last()
        .getByRole("button", { name: "Копировать", exact: true })
        .click()
      assert.ok(
        (await page.evaluate(() => window.__ui10Copy)).includes(
          "Не весь выбранный набор",
        ),
      )
      await button("Создать черновик").click()
      await button("Создать в проекте").click()
      const draftText = await page
        .getByLabel("Текст юридического документа", { exact: true })
        .inputValue()
      assert.ok(draftText.includes("Не весь выбранный набор"))
      assert.equal(draftText.includes("Частичный.pdf"), false)
    },
  )
  await check(
    "source excerpt follows the matched clause and exact version",
    async () => {
      await upload("Фрагменты.pdf")
      await chat()
      await choose(["Фрагменты.pdf"])
      await send("Убытков")
      await last().locator(".answer-sources button").click()
      const text = await page.locator(".source-excerpt blockquote").innerText()
      assert.ok(text.includes("5.2."))
      assert.equal(text.includes("5.1."), false)
      for (const width of [1280, 1440]) {
        await page.setViewportSize({ width, height: 1000 })
        await page.screenshot({
          path: `/tmp/ui10-source-${width}.png`,
          fullPage: true,
          animations: "disabled",
        })
        assert.equal(
          await page.evaluate(
            () => document.documentElement.scrollWidth > innerWidth,
          ),
          false,
          `Source panel overflows at ${width}px`,
        )
      }
      await page.screenshot({
        path: "/tmp/ui10-selected-evidence.png",
        fullPage: true,
        animations: "disabled",
      })
      await button("Открыть использованную версию").click()
      assert.equal(await page.getByLabel("Версия документа").inputValue(), "1")
    },
  )
  await check(
    "manual retrieval failure retries the requested set, not an empty scope",
    async () => {
      await upload("Первый.pdf")
      await upload("Второй.pdf")
      await chat()
      await choose(["Первый.pdf", "Второй.pdf"])
      await panel()
      assert.equal(
        await page.getByLabel("Демо-сценарий поиска источников").isDisabled(),
        false,
      )
      await page
        .getByLabel("Демо-сценарий поиска источников")
        .selectOption("failed")
      await button("Закрыть панель").click()
      await send("Неустойка", "retrieval")
      const hash = await page.evaluate(() => location.hash)
      await button("Повторить поиск").click()
      await page.waitForFunction(
        () => document.querySelectorAll(".answer-sources button").length === 2,
      )
      assert.notEqual(await page.evaluate(() => location.hash), hash)
      await chat(hash)
      await last()
        .getByRole("heading", {
          name: "Поиск источников не выполнен",
          exact: true,
        })
        .waitFor()
    },
  )
  await check(
    "manual failure retry preserves historical versions after a full new version is added",
    async () => {
      await upload("История.pdf", "partial")
      await chat()
      await choose(["История.pdf"])
      await panel()
      await page
        .getByLabel("Демо-сценарий поиска источников")
        .selectOption("failed")
      await button("Закрыть панель").click()
      await send("Убытков", "retrieval")
      const hash = await page.evaluate(() => location.hash)
      await upload("История.pdf", "ready", "version")
      await chat(hash)
      await button("Повторить поиск").click()
      await page
        .getByRole("heading", {
          name: "Подходящих фрагментов не найдено",
          exact: true,
        })
        .waitFor()
      assert.equal(await page.locator(".answer-sources button").count(), 0)
    },
  )
  await check(
    "editing a failed request recovers its question before repairing a missing selection",
    async () => {
      await upload("Удаляемый.pdf")
      await upload("Замена.pdf")
      await chat()
      await choose(["Удаляемый.pdf"])
      await panel()
      await page
        .getByLabel("Демо-сценарий поиска источников")
        .selectOption("failed")
      await button("Закрыть панель").click()
      await send("Неустойка для исправления", "retrieval")
      const hash = await page.evaluate(() => location.hash)
      await removeDocument("Удаляемый.pdf")
      await chat(hash)
      assert.equal(await button("Повторить поиск").isDisabled(), true)
      await button("Изменить вопрос").click()
      assert.equal(await question().inputValue(), "Неустойка для исправления")
      await page
        .locator(".chat-composer-area")
        .getByRole("button", {
          name: "Убрать недоступные материалы",
          exact: true,
        })
        .click()
      await choose(["Замена.pdf"])
      await button("Отправить").click()
      await page.locator(".answer-sources button").waitFor()
      assert.ok(
        (await page.locator(".answer-sources").innerText()).includes(
          "Замена.pdf",
        ),
      )
      assert.notEqual(await page.evaluate(() => location.hash), hash)
    },
  )
  await check(
    "normal next question requires explicit version repair while old answer keeps its source",
    async () => {
      await upload("Версия.pdf", "partial")
      await chat()
      await choose(["Версия.pdf"])
      await send("Неустойка")
      const hash = await page.evaluate(() => location.hash)
      await upload("Версия.pdf", "ready", "version")
      await chat(hash)
      await question().fill("Убытков")
      assert.equal(await button("Отправить").isDisabled(), true)
      await panel()
      await button("Обновить выбранные версии").click()
      await button("Закрыть панель").click()
      await button("Отправить").click()
      await last().locator(".legal-answer").waitFor()
      assert.ok(
        (await last().locator(".answer-sources").innerText()).includes(
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
    "source deleted during generation never appears through the completed result",
    async () => {
      await upload("Во_время.pdf")
      await chat()
      await choose(["Во_время.pdf"])
      await freezeJobClock()
      await question().fill("Неустойка")
      await button("Отправить").click()
      await page.locator(".answer-progress").waitFor()
      const hash = await page.evaluate(() => location.hash)
      await removeDocument("Во_время.pdf")
      await chat(hash)
      await last()
        .getByText("Ответ закрыт: источник недоступен", { exact: true })
        .waitFor()
      await page.evaluate(() => window.__ui10Advance(3000))
      await page.getByRole("tab", { name: /^Чаты/ }).click()
      await page
        .locator(".row")
        .filter({ hasText: "Неустойка" })
        .getByText("Ответ готов", { exact: true })
        .waitFor()
      await chat(hash)
      assert.equal(
        await last().locator(".legal-answer, .answer-actions").count(),
        0,
      )
    },
  )
  await check(
    "deleting an actually used source closes both answer and derived Draft",
    async () => {
      await upload("Основание.pdf")
      await chat()
      await choose(["Основание.pdf"])
      await send("Неустойка")
      const hash = await page.evaluate(() => location.hash)
      await button("Создать черновик").click()
      await button("Создать в проекте").click()
      await page
        .getByLabel("Текст юридического документа", { exact: true })
        .waitFor()
      const draftHash = await page.evaluate(() => location.hash)
      await removeDocument("Основание.pdf")
      await chat(hash)
      await last()
        .getByText("Ответ закрыт: источник недоступен", { exact: true })
        .waitFor()
      await route(draftHash)
      await page
        .getByRole("heading", { name: "Черновик недоступен", exact: true })
        .waitFor()
      assert.equal(
        await page
          .getByLabel("Текст юридического документа", { exact: true })
          .count(),
        0,
      )
    },
  )
  await check(
    "unused selected document is not fabricated as evidence, stale next scope is repairable",
    async () => {
      await upload("Использованный.pdf")
      await upload("Неиспользованный.pdf", "partial")
      await chat()
      await choose(["Использованный.pdf", "Неиспользованный.pdf"])
      await send("Убытков")
      const hash = await page.evaluate(() => location.hash)
      await question().fill("Уточни убытков")
      await removeDocument("Неиспользованный.pdf")
      await chat(hash)
      assert.equal(await last().locator(".answer-sources button").count(), 1)
      assert.equal(
        (await last().locator(".answer-sources").innerText()).includes(
          "Неиспользованный.pdf",
        ),
        false,
      )
      assert.equal(await button("Отправить").isDisabled(), true)
      await page
        .locator(".chat-composer-area")
        .getByRole("button", {
          name: "Убрать недоступные материалы",
          exact: true,
        })
        .click()
      assert.equal(await question().inputValue(), "Уточни убытков")
      await button("Отправить").click()
      await page.waitForFunction(
        () => document.querySelectorAll(".conversation-turn").length === 2,
      )
      await last().locator(".legal-answer").waitFor()
      assert.equal(await last().locator(".answer-sources button").count(), 1)
    },
  )
  await check(
    "PRIVATE question is not copied into shared Draft title or team-visible body",
    async () => {
      await chat("#/projects/sever/chat")
      await choose(["Договор_поставки_демо.docx"])
      await send("PRIVATE_MARKER_UI10 Неустойка")
      const privateHash = await page.evaluate(() => location.hash)
      await button("Создать черновик").click()
      await page
        .getByText("PRIVATE-вопрос не копируется", { exact: false })
        .waitFor()
      await button("Создать в проекте").click()
      assert.equal(
        await page
          .getByLabel("Название черновика", { exact: true })
          .inputValue(),
        "Черновик из ответа",
      )
      const draftHash = await page.evaluate(() => location.hash)
      assert.equal(
        (
          await page
            .getByLabel("Текст юридического документа", { exact: true })
            .inputValue()
        ).includes("PRIVATE_MARKER_UI10"),
        false,
      )
      await persona("daria")
      await route(draftHash)
      await page
        .getByLabel("Текст юридического документа", { exact: true })
        .waitFor()
      assert.equal(
        await page
          .getByLabel("Название черновика", { exact: true })
          .inputValue(),
        "Черновик из ответа",
      )
      assert.equal(
        (await page.locator(".draft-workspace").innerText()).includes(
          "PRIVATE_MARKER_UI10",
        ),
        false,
      )
      await route(privateHash)
      await page
        .getByRole("heading", { name: "Диалог недоступен", exact: true })
        .waitFor()
      assert.equal(await question().count(), 0)
    },
  )
  await check("VIEWER cannot launch or retry selected retrieval", async () => {
    await chat("#/projects/sever/chat")
    await choose(["Договор_поставки_демо.docx"])
    await panel()
    await page
      .getByLabel("Демо-сценарий поиска источников")
      .selectOption("failed")
    await button("Закрыть панель").click()
    await send("Неустойка", "retrieval")
    const hash = await page.evaluate(() => location.hash)
    await button("Открыть проекту").click()
    await button("Открыть участникам").click()
    await persona("daria")
    await chat(hash)
    assert.equal(await button("Повторить поиск").isDisabled(), true)
    assert.equal(await button("Изменить вопрос").isDisabled(), true)
    assert.equal(await button("Отправить").isDisabled(), true)
  })
  await check(
    "same-session relogin returns to Home and preserves job identity without duplicate request",
    async () => {
      await chat("#/projects/sever/chat")
      await choose(["Договор_поставки_демо.docx"])
      await question().fill("Неустойка после входа")
      await button("Отправить").click()
      await page.locator(".answer-progress").waitFor()
      const hash = await page.evaluate(() => location.hash)
      await logout()
      await page.waitForTimeout(2800)
      await login()
      await chat(hash)
      await page.locator(".answer-sources button").waitFor()
      assert.equal(await page.locator(".conversation-turn").count(), 1)
      assert.equal(await page.evaluate(() => location.hash), hash)
      await page.reload()
      await page
        .getByRole("heading", { name: "Диалог недоступен", exact: true })
        .waitFor()
      assert.equal(await page.locator(".legal-answer").count(), 0)
      assert.equal(await question().count(), 0)
    },
  )
  await check(
    "role loss during a running job cancels explicitly instead of pretending a pre-start user stop",
    async () => {
      await persona("alex")
      await chat("#/projects/sever/chat")
      await choose(["Договор_поставки_демо.docx"])
      await freezeJobClock()
      await question().fill("Неустойка до изменения доступа")
      await button("Отправить").click()
      await page.evaluate(() => window.__ui10Advance(1000))
      await page
        .getByText("Готовим демонстрационный ответ", { exact: true })
        .waitFor()
      const hash = await page.evaluate(() => location.hash)
      await persona("elena")
      await route("#/projects/sever/members")
      await page
        .locator(".membership-row")
        .filter({ hasText: "alex@example.test" })
        .getByRole("button", { name: "Изменить роль", exact: true })
        .click()
      await page.getByLabel("Назначаемая роль").selectOption("viewer")
      await button("Применить доступ").click()
      await page.getByRole("dialog").waitFor({ state: "hidden" })
      await persona("alex")
      await chat(hash)
      await last()
        .getByRole("heading", {
          name: "Задача остановлена из-за изменения доступа",
          exact: true,
        })
        .waitFor()
      assert.equal(await question().isDisabled(), true)
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
  assert.deepEqual(errors, [])
  console.log(`${checks} UI-10 browser groups passed; no runtime errors`)
} finally {
  await browser.close()
}
