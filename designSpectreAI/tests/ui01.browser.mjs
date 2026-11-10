// Uses the already running preview; installs no packages and starts no server.
// PLAYWRIGHT_MODULE may point to an externally installed playwright-core/index.mjs.
import assert from "node:assert/strict"
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE ?? "playwright-core"
)
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? "/usr/bin/chromium",
  args: ["--no-sandbox"],
})
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
const errors = []
page.on("pageerror", (error) => errors.push(error.message))
const base = process.env.PREVIEW_URL ?? "http://localhost:3000"
let checks = 0
async function check(name, fn) {
  await fn()
  checks++
  console.log(`PASS ${name}`)
}
async function route(hash) {
  await page.evaluate((hash) => {
    location.hash = hash
  }, hash)
  await page.waitForTimeout(120)
}
const button = (name) => page.getByRole("button", { name, exact: true })
const row = (name) => page.locator(".document-row").filter({ hasText: name })
async function upload(name, outcome = "ready", duplicate) {
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
}
try {
  await page.goto(`${base}/#/projects/sever/docs`)
  await page.getByRole("heading", { name: "Документы", exact: true }).waitFor()
  await check("library layout at 1280 and 1440", async () => {
    for (const width of [1280, 1440]) {
      await page.setViewportSize({ width, height: 1000 })
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
        false,
      )
    }
  })
  await check("file processing continues after leaving library", async () => {
    await upload("Рабочий_образец.pdf")
    await row("Рабочий_образец.pdf")
      .getByText("В очереди", { exact: true })
      .waitFor()
    await page.getByRole("tab", { name: /^Чаты/ }).click()
    await page.waitForTimeout(3700)
    await page.getByRole("tab", { name: /^Документы/ }).click()
    await row("Рабочий_образец.pdf").getByText("Готов к работе").waitFor()
  })
  await check("duplicate creates version without extra document", async () => {
    const count = await page.locator(".document-row").count()
    await upload("Рабочий_образец.pdf", "ready", "version")
    await row("Рабочий_образец.pdf")
      .getByText("Версия 2", { exact: false })
      .waitFor()
    assert.equal(await page.locator(".document-row").count(), count)
    await row("Рабочий_образец.pdf").getByText("Готов к работе").waitFor()
  })
  await check("mixed invalid uploads and 10-file limit", async () => {
    await button("Добавить документы").click()
    await page.getByLabel("Файлы для демонстрации").setInputFiles([
      {
        name: "unsupported.exe",
        mimeType: "application/octet-stream",
        buffer: Buffer.from("demo"),
      },
      {
        name: "valid.txt",
        mimeType: "text/plain",
        buffer: Buffer.from("demo"),
      },
      { name: "empty.txt", mimeType: "text/plain", buffer: Buffer.alloc(0) },
      {
        name: "large.pdf",
        mimeType: "application/pdf",
        buffer: Buffer.alloc(25 * 1024 * 1024 + 1),
      },
    ])
    await page
      .getByRole("alert")
      .getByText(/поддерживаются только/)
      .waitFor()
    await page
      .getByRole("alert")
      .getByText(/размер превышает/)
      .waitFor()
    await page
      .getByRole("alert")
      .getByText(/файл пуст/)
      .waitFor()
    await button("Добавить · 1").click()
    assert.equal(await row("unsupported.exe").count(), 0)
    await row("valid.txt").waitFor()
    await button("Добавить документы").click()
    await page.getByLabel("Файлы для демонстрации").setInputFiles(
      Array.from({ length: 11 }, (_, i) => ({
        name: `file${i}.txt`,
        mimeType: "text/plain",
        buffer: Buffer.from("demo"),
      })),
    )
    await page
      .getByRole("alert")
      .getByText(/не более 10/)
      .waitFor()
    assert.equal(await button("Добавить").isDisabled(), true)
    await button("Отмена").click()
  })
  await check("OCR is excluded; processing error can be retried", async () => {
    await upload("Скан.pdf", "ocr")
    await row("Скан.pdf").getByText("Требуется OCR").waitFor()
    await upload("Ошибка.pdf", "error")
    await row("Ошибка.pdf").getByText("Ошибка обработки").waitFor()
    await row("Ошибка.pdf").locator(".document-main").click()
    await button("Повторить обработку").click()
    await page.getByText("Готов к работе", { exact: true }).waitFor()
    await button("Документы проекта").click()
  })
  await check("search content, no-results and filters", async () => {
    await page.getByLabel("Поиск документов").fill("несуществующая строка")
    await page.getByRole("heading", { name: "Документы не найдены" }).waitFor()
    await button("Сбросить фильтры").click()
    await page.getByLabel("Поиск документов").fill("неустойку")
    assert.ok((await page.locator(".document-row").count()) > 0)
    await page.getByLabel("Поиск документов").fill("")
    await page.getByLabel("Формат документа").selectOption("pdf")
    assert.equal(await row("Договор_поставки_демо.docx").count(), 0)
    await page.getByLabel("Формат документа").selectOption("all")
    await page.getByLabel("Статус документа").selectOption("ocr")
    assert.equal(await page.locator(".document-row").count(), 1)
    await page.getByLabel("Статус документа").selectOption("all")
    await page.getByLabel("Автор документа").selectOption("Елена Крылова")
    assert.equal(await row("Приложение_2_демо.pdf").count(), 0)
    await page.getByLabel("Автор документа").selectOption("all")
  })
  let chatHash
  await check(
    "document → chat → automatic answer → versioned source",
    async () => {
      await row("Рабочий_образец.pdf").locator(".document-main").click()
      await page.getByLabel("Версия документа").selectOption("1")
      assert.equal(await button("Обсудить в чате").isDisabled(), true)
      await page.getByLabel("Версия документа").selectOption("2")
      await button("Обсудить в чате").click()
      await page
        .getByLabel("Ваш вопрос", { exact: true })
        .fill("Проверь ответственность по образцу")
      await button("Отправить").click()
      await page.locator(".legal-answer").waitFor()
      chatHash = await page.evaluate(() => location.hash)
      await page.locator(".answer-sources button").first().click()
      await button("Открыть использованную версию").click()
      assert.equal(await page.getByLabel("Версия документа").inputValue(), "2")
      await page.getByRole("tab", { name: /^Чаты/ }).click()
      await page
        .locator(".row")
        .filter({ hasText: "Проверь ответственность по образцу" })
        .click()
      await page.locator(".legal-answer").waitFor()
    },
  )
  await check(
    "source version stays pinned when a newer version is added",
    async () => {
      await page.getByRole("tab", { name: /^Документы/ }).click()
      await upload("Рабочий_образец.pdf", "ready", "version")
      await row("Рабочий_образец.pdf").getByText("Готов к работе").waitFor()
      await route(chatHash)
      await page.locator(".answer-sources button").first().click()
      await page.getByText("Использована версия 2", { exact: true }).waitFor()
      await page
        .getByText("В проекте есть более новая версия.", { exact: false })
        .waitFor()
      await button("Закрыть панель").click()
      await page.locator(".context-line").click()
      const material = page.getByRole("checkbox", {
        name: /Рабочий_образец.pdf/,
      })
      await material.uncheck()
      await material.check()
      assert.equal(
        await page.getByRole("checkbox", { name: /Скан.pdf/ }).isDisabled(),
        true,
      )
      assert.equal(
        await page
          .getByRole("checkbox", { name: /Документ недоступен/ })
          .isDisabled(),
        true,
      )
      await button("Закрыть панель").click()
    },
  )
  await check(
    "next question and explicit branch preserve history",
    async () => {
      await page
        .getByLabel("Ваш вопрос", { exact: true })
        .fill("Уточни предел ответственности")
      await button("Отправить").click()
      await page.waitForFunction(
        () => document.querySelectorAll(".legal-answer").length === 2,
      )
      await button("Изменить вопрос").first().click()
      await page
        .getByLabel("Ваш вопрос", { exact: true })
        .fill("Изменённый вопрос — новая ветка")
      await button("Отправить").click()
      await page.locator(".legal-answer").waitFor()
      await route(chatHash)
      assert.equal(await page.locator(".conversation-turn").count(), 2)
    },
  )
  await check("PRIVATE disclosure requires confirmation", async () => {
    await button("Открыть проекту").click()
    await page
      .getByRole("dialog", { name: "Открыть историю участникам проекта" })
      .waitFor()
    await button("Отмена").click()
    assert.ok(await button("Открыть проекту").isVisible())
    await button("Открыть проекту").click()
    await button("Открыть участникам").click()
    await page.locator(".chat-meta").getByText("Участники проекта").waitFor()
  })
  await check(
    "running task cancellation retains partial and can restart",
    async () => {
      await page
        .getByLabel("Ваш вопрос", { exact: true })
        .fill("Следующий вопрос о неустойке для остановки")
      await button("Отправить").click()
      await page
        .getByText("Готовим демонстрационный ответ", { exact: true })
        .waitFor()
      await button("Остановить").click()
      await page
        .getByRole("heading", { name: "Незавершённый результат" })
        .waitFor()
      await page.getByText("Результат не завершён.", { exact: false }).waitFor()
      await button("Повторить в новой ветке").last().click()
      await page.locator(".legal-answer").waitFor()
    },
  )
  await check(
    "AI failure and timeout preserve question and allow successful retry",
    async () => {
      for (const outcome of ["failed", "timed_out"]) {
        await page.locator(".context-line").click()
        await page
          .getByLabel("Демо-сценарий AI", { exact: true })
          .selectOption(outcome)
        await button("Закрыть панель").click()
        await page
          .getByLabel("Ваш вопрос", { exact: true })
          .fill(`Проверка ${outcome}`)
        await button("Отправить").click()
        await page
          .getByRole("heading", {
            name:
              outcome === "failed"
                ? "Не удалось подготовить ответ"
                : "Время ожидания истекло",
            exact: true,
          })
          .waitFor()
        await page
          .getByText(`Проверка ${outcome}`, { exact: true })
          .last()
          .waitFor()
        await button("Повторить запрос").click()
        await page.locator(".legal-answer").waitFor()
      }
    },
  )
  await check(
    "deleting source closes historical dependent answers",
    async () => {
      await page.getByRole("tab", { name: /^Документы/ }).click()
      await row("Рабочий_образец.pdf").locator(".document-main").click()
      await button("Удалить").click()
      await page
        .getByRole("dialog")
        .getByRole("button", { name: "Удалить", exact: true })
        .click()
      assert.equal(await row("Рабочий_образец.pdf").count(), 0)
      await route(chatHash)
      await page
        .getByText("Ответ закрыт: источник недоступен", { exact: true })
        .first()
        .waitFor()
      assert.equal(await page.locator(".legal-answer").count(), 0)
    },
  )
  await check(
    "EDITOR cannot rename project or delete another author material",
    async () => {
      await route("#/projects/spor/docs")
      await page.getByLabel("Действия: Спор о поставке").click()
      assert.equal(
        await page
          .getByRole("menuitem", { name: "Переименовать", exact: true })
          .isDisabled(),
        true,
      )
      assert.equal(
        await page
          .getByRole("menuitem", { name: "Изменить видимость" })
          .count(),
        0,
      )
      await page.getByLabel("Действия: Спор о поставке").click()
      await row("Акт_сверки_демо.pdf").locator(".document-main").click()
      assert.equal(await button("Удалить").isDisabled(), true)
    },
  )
  await check("VIEWER cannot upload, submit or apply AI changes", async () => {
    await route("#/projects/p-3/docs")
    assert.equal(await button("Добавить документы").isDisabled(), true)
    await route("#/projects/p-3/chat?view=new")
    assert.equal(await button("Отправить").isDisabled(), true)
    await route("#/projects/p-3/draft?view=suggest")
    assert.equal(await button("Принять").isDisabled(), true)
    assert.equal(
      await page
        .getByLabel("Текст юридического документа")
        .getAttribute("readonly"),
      "",
    )
  })
  await check(
    "home quick task selects project and empty attention is clear",
    async () => {
      await route("#/")
      await button("Новая задача").click()
      await button("Задать вопрос").click()
      await page
        .getByRole("dialog", { name: "Выберите проект для задачи" })
        .waitFor()
      await button("Отмена").click()
      await button("Состояния").click()
      await page
        .getByRole("menuitemcheckbox", { name: "Нет проектов", exact: true })
        .click()
      await button("Состояния").click()
      await page
        .getByText("Нет задач, требующих внимания.", { exact: true })
        .waitFor()
      assert.equal(await page.locator(".row.attention").count(), 0)
    },
  )
  await check("narrow screen explicitly explains desktop scope", async () => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page
      .getByRole("heading", {
        name: "Рабочее пространство для большого экрана",
      })
      .waitFor()
  })
  assert.deepEqual(errors, [])
  console.log(`PASS ${checks} scenario groups; no browser runtime errors`)
} catch (error) {
  console.error("Failure URL:", page.url())
  console.error((await page.locator(".main").innerText()).slice(-6000))
  await page.screenshot({ path: "/tmp/neuro-ui01-failure.png", fullPage: true })
  throw error
} finally {
  await browser.close()
}
