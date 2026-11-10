// Run against the existing preview. No server or real provider is started.
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
page.on("pageerror", (e) => errors.push(e.message))
const base = process.env.PREVIEW_URL ?? "http://localhost:3000"
const button = (name) => page.getByRole("button", { name, exact: true })
const editor = () =>
  page.getByLabel("Текст юридического документа", { exact: true })
const saved = () =>
  page
    .getByTestId("save-status")
    .filter({ hasText: "Сохранено в макете" })
    .waitFor()
let checks = 0
let researchHash
let chatHash
let draftHash
async function check(name, fn) {
  await fn()
  checks++
  console.log(`PASS ${name}`)
}
async function route(hash) {
  await page.evaluate((h) => {
    location.hash = h
  }, hash)
  await page.waitForTimeout(180)
}
async function draftDemo() {
  const details = page.locator(".draft-side-panel .work-demo-details")
  if (
    !(await details.getAttribute("open")) &&
    (await details.getAttribute("open")) !== ""
  )
    await details.locator("summary").click()
}
async function newResearch(outcome = "success") {
  await route("#/projects/sever/research?new=1")
  await button("Использовать демонстрационный вопрос").click()
  if (outcome !== "success") {
    await page.locator(".research-form .work-demo-details summary").click()
    await page
      .getByLabel("Результат исследования", { exact: true })
      .selectOption(outcome)
  }
  await button("Начать исследование").click()
}
try {
  await page.goto(`${base}/#/projects/sever/research`)
  await check(
    "research list, required parameters and background completion",
    async () => {
      await page
        .getByRole("heading", { name: "Исследования", exact: true })
        .waitFor()
      await button("Новое исследование").click()
      assert.equal(await button("Начать исследование").isDisabled(), true)
      await button("Использовать демонстрационный вопрос").click()
      await page.getByLabel("Нормативные акты", { exact: true }).uncheck()
      await page.getByLabel("Судебная практика", { exact: true }).uncheck()
      assert.equal(await button("Начать исследование").isDisabled(), true)
      await page.getByLabel("Нормативные акты", { exact: true }).check()
      await page.getByLabel("Судебная практика", { exact: true }).check()
      await button("Начать исследование").click()
      researchHash = await page.evaluate(() => location.hash)
      await button("Исследования проекта").click()
      await page.getByText("Выполняется", { exact: true }).waitFor()
      await page.getByText("Результат готов", { exact: true }).waitFor()
      await page.locator(".work-card").click()
      assert.equal(await page.locator(".research-source-card").count(), 4)
    },
  )
  await check(
    "source details, revisions comparison and honest actuality status",
    async () => {
      await page.locator(".research-source-card").first().click()
      await page
        .getByRole("dialog", { name: "Источник исследования" })
        .waitFor()
      await page.getByLabel("Редакция нормы").selectOption("previous")
      await page
        .getByText(
          "Предыдущая условная редакция: дополнительные обстоятельства не перечислены.",
          { exact: false },
        )
        .waitFor()
      await button("Сравнить редакции нормы").click()
      assert.equal(await page.locator(".text-comparison > section").count(), 2)
      await button("Проверить актуальность").click()
      await page
        .getByRole("status")
        .filter({ hasText: "Официальная проверка не подключена" })
        .waitFor()
      await page
        .getByText("Актуальность не подтверждена", { exact: true })
        .waitFor()
      await button("Закрыть").click()
    },
  )
  await check("result filters affect court and year sources", async () => {
    await page.getByLabel("Тип источника", { exact: true }).selectOption("case")
    await page.getByLabel("Фильтр судов").selectOption("supreme")
    assert.equal(await page.locator(".research-source-card").count(), 1)
    await page.getByLabel("Фильтр года").selectOption("2025")
    await page
      .getByText("Нет источников под выбранные фильтры.", { exact: true })
      .waitFor()
    await page.getByLabel("Тип источника", { exact: true }).selectOption("all")
    await page.getByLabel("Фильтр судов").selectOption("all")
    await page.getByLabel("Фильтр года").selectOption("all")
    await button("Сохранить исследование").click()
    await button("Исследования проекта").click()
    await page.getByText("Сохранено", { exact: true }).waitFor()
    await page.locator(".work-card").click()
  })
  await check(
    "saved research becomes explicit chat context and separate Draft",
    async () => {
      await button("Продолжить в чате").click()
      await page
        .getByText("Контекст: сохранённый этап исследования", { exact: true })
        .waitFor()
      await button("Отправить").click()
      await page.locator(".legal-answer").waitFor()
      chatHash = await page.evaluate(() => location.hash)
      await page
        .locator(".answer-sources")
        .getByRole("button", { name: /Сохранённое исследование/ })
        .waitFor()
      await button("Создать черновик").click()
      await page
        .getByRole("dialog", { name: "Создать черновик из ответа" })
        .waitFor()
      await button("Создать в проекте").click()
      draftHash = await page.evaluate(() => location.hash)
      assert.ok(
        (await editor().inputValue()).includes("демонстрационном исследовании"),
      )
      await page.getByRole("tab", { name: "Основания", exact: true }).click()
      await page
        .getByRole("button", { name: /^Связанное исследование/ })
        .click()
    },
  )
  await check(
    "continuation preserves runs and earlier chat context snapshot",
    async () => {
      await page
        .getByLabel("Уточняющий вопрос")
        .fill("Что изменится при частичной поставке?")
      await button("Продолжить исследование").click()
      await page.getByRole("button", { name: /Этап 2/ }).waitFor()
      await page.locator(".research-result").waitFor()
      await button("Сохранить исследование").click()
      await route(chatHash)
      await page
        .locator(".research-chat-context")
        .getByText(/этап 1/)
        .waitFor()
      await route(researchHash)
      await page.getByRole("button", { name: /Этап 1/ }).click()
      await page.getByRole("button", { name: /Этап 2/ }).click()
    },
  )
  await check(
    "partial result is explicit; source failure, timeout and cancellation retry",
    async () => {
      await newResearch("partial")
      await page
        .getByText("Получен частичный результат", { exact: true })
        .waitFor()
      assert.equal(await page.locator(".research-source-card").count(), 1)
      await button("Повторить недоступный поиск").click()
      await page.waitForFunction(
        () => document.querySelectorAll(".research-source-card").length === 4,
      )
      for (const outcome of ["failed", "timed_out"]) {
        await newResearch(outcome)
        await page
          .getByRole("heading", {
            name:
              outcome === "failed"
                ? "Источник не ответил"
                : "Время исследования истекло",
          })
          .waitFor()
        await button("Повторить исследование").click()
        await page.locator(".research-result").waitFor()
      }
      await newResearch()
      await button("Остановить исследование").click()
      await page
        .getByRole("heading", { name: "Исследование остановлено" })
        .waitFor()
      await button("Повторить исследование").click()
      await page.locator(".research-result").waitFor()
    },
  )
  await check(
    "no results and legal date really limit sample coverage",
    async () => {
      await newResearch("empty")
      await page
        .getByRole("heading", {
          name: "По заданным параметрам ничего не найдено",
        })
        .waitFor()
      await button("Изменить параметры").click()
      await button("Использовать демонстрационный вопрос").click()
      await page.getByLabel("Правовая дата", { exact: true }).fill("2010-01-01")
      await button("Начать исследование").click()
      await page
        .getByRole("heading", {
          name: "По заданным параметрам ничего не найдено",
        })
        .waitFor()
    },
  )
  await check(
    "initial research scope, court and year constrain actual sources",
    async () => {
      await route("#/projects/sever/research?new=1")
      await button("Использовать демонстрационный вопрос").click()
      await page.getByLabel("Нормативные акты", { exact: true }).uncheck()
      await page.getByLabel("Суды исследования").selectOption("supreme")
      await page.getByLabel("Год исследования").selectOption("2024")
      await button("Начать исследование").click()
      await page.locator(".research-result").waitFor()
      assert.equal(await page.locator(".research-source-card").count(), 1)
      await page
        .locator(".research-source-card")
        .getByText("Определение № ДЕМО-305-2024", { exact: true })
        .waitFor()
    },
  )
  await check(
    "standalone draft creation and two-second autosave without checkpoint spam",
    async () => {
      await route("#/projects/sever/drafts")
      await button("Новый черновик").click()
      await page
        .getByLabel("Название нового черновика")
        .fill("Рабочее заключение UI-02")
      await button("Создать").click()
      draftHash = await page.evaluate(() => location.hash)
      await editor().fill("Первый абзац о неустойке.\n\nВторая часть позиции.")
      await page
        .getByTestId("save-status")
        .filter({ hasText: "Есть несохранённые изменения" })
        .waitFor()
      await page.waitForTimeout(1300)
      assert.equal(
        await page.getByTestId("save-status").innerText(),
        "Есть несохранённые изменения",
      )
      await saved()
      await editor().fill(
        "Первый абзац о неустойке.\n\nВторая часть позиции уточнена.",
      )
      await saved()
      await button("История").click()
      assert.equal(await page.locator(".version-item").count(), 1)
      await button("Сохранить").click()
      await saved()
      assert.equal(await page.locator(".version-item").count(), 2)
      await button("Черновики проекта").click()
      await page
        .locator(".work-card")
        .filter({ hasText: "Рабочее заключение UI-02" })
        .click()
      assert.ok((await editor().inputValue()).includes("уточнена"))
    },
  )
  await check(
    "AI proposal comparison, stale guard and safe acceptance",
    async () => {
      await button("Уточнить с AI").click()
      await editor().fill(
        (await editor().inputValue()) + "\n\nРучная правка во время AI.",
      )
      await button("Принять").waitFor()
      assert.equal(await button("Принять").isDisabled(), true)
      await page.getByText("Результат устарел:", { exact: false }).waitFor()
      await button("Пересоздать по текущему тексту").click()
      await button("Принять").waitFor({ state: "visible" })
      await button("Сравнить с исходным").click()
      assert.ok((await page.locator(".diff-added").count()) > 0)
      await button("Принять AI-правки").click()
      assert.ok(
        (await editor().inputValue()).includes("Уточнение для обсуждения"),
      )
      assert.ok(
        (await editor().inputValue()).includes("Ручная правка во время AI."),
      )
      await saved()
      await button("История").click()
      await page.getByText("Принятые AI-правки", { exact: true }).waitFor()
    },
  )
  await check(
    "Review comments, stale review, empty check, AI failure and cancellation",
    async () => {
      await button("Проверить с AI").click()
      await page.getByText("2 замечания", { exact: true }).waitFor()
      await button("Показать фрагмент текста").click()
      await editor().fill(
        (await editor().inputValue()) + "\n\nУточнение после проверки.",
      )
      assert.equal(await button("Предложить уточнение").isDisabled(), true)
      await saved()
      await draftDemo()
      await page.getByLabel("Демо AI черновика").selectOption("empty")
      await button("Проверить с AI").click()
      await page
        .getByRole("heading", { name: "Замечаний в образце не найдено" })
        .waitFor()
      await page.getByLabel("Демо AI черновика").selectOption("failed")
      await button("Уточнить с AI").click()
      await page
        .getByRole("heading", { name: "AI-действие не выполнено" })
        .waitFor()
      await button("Повторить AI-действие").click()
      await button("Принять").waitFor()
      await button("Отклонить").click()
      await page.getByLabel("Демо AI черновика").selectOption("success")
      await button("Сократить").click()
      await button("Остановить AI").click()
      await page
        .getByRole("heading", { name: "AI-действие остановлено" })
        .waitFor()
    },
  )
  await check(
    "history comparison and restore preserve autosaved working edition",
    async () => {
      await editor().fill("Автосохранённый текст перед восстановлением.")
      await saved()
      await button("История").click()
      const before = await page.locator(".version-item").count()
      await page
        .locator(".version-item")
        .last()
        .getByRole("button", { name: "Сравнить", exact: true })
        .click()
      await page.getByLabel("Левая версия").selectOption("1")
      await button("Закрыть").click()
      await page
        .locator(".version-item")
        .last()
        .getByRole("button", { name: "Восстановить", exact: true })
        .click()
      await button("Восстановить новой версией").click()
      await saved()
      assert.equal(await editor().inputValue(), "")
      assert.equal(await page.locator(".version-item").count(), before + 2)
      await page
        .getByText("Рабочая редакция перед восстановлением", { exact: true })
        .waitFor()
    },
  )
  await check(
    "save error guards navigation and retries without losing text",
    async () => {
      await draftDemo()
      await page.getByLabel("Демо сохранения").selectOption("error")
      await editor().fill("Текст, который нельзя потерять при ошибке.")
      await page
        .getByRole("alert")
        .filter({ hasText: "Изменения не сохранены" })
        .waitFor()
      await button("Черновики проекта").click()
      await page
        .getByRole("dialog", { name: "Несохранённые изменения" })
        .waitFor()
      await button("Остаться").click()
      assert.ok((await editor().inputValue()).includes("нельзя потерять"))
      await button("Повторить сохранение").click()
      await saved()
      await button("Черновики проекта").click()
      await page
        .locator(".work-card")
        .filter({ hasText: "Рабочее заключение UI-02" })
        .click()
      assert.ok((await editor().inputValue()).includes("нельзя потерять"))
    },
  )
  await check(
    "browser hash navigation is guarded, save-and-leave is explicit",
    async () => {
      await draftDemo()
      await page.getByLabel("Демо сохранения").selectOption("error")
      await editor().fill("Рабочая редакция для выхода с сохранением.")
      await page.getByRole("alert").waitFor()
      await route("#/projects/sever/docs")
      await page
        .getByRole("dialog", { name: "Несохранённые изменения" })
        .waitFor()
      assert.ok(page.url().includes("draft="))
      await button("Сохранить и выйти").click()
      await page
        .getByRole("heading", { name: "Документы", exact: true })
        .waitFor()
      await route(draftHash)
      assert.equal(
        await editor().inputValue(),
        "Рабочая редакция для выхода с сохранением.",
      )
    },
  )
  await check(
    "conflict comparison preserves both editions and resolves explicitly",
    async () => {
      await draftDemo()
      await page.getByLabel("Демо сохранения").selectOption("conflict")
      await editor().fill("Моя конфликтующая редакция.")
      await page
        .getByRole("alert")
        .filter({ hasText: "Обнаружена другая сохранённая редакция" })
        .waitFor()
      assert.equal(await editor().inputValue(), "Моя конфликтующая редакция.")
      await button("Сравнить и разрешить").click()
      await page.getByRole("dialog", { name: "Разрешение конфликта" }).waitFor()
      await page
        .locator(".text-comparison")
        .getByText("Моя конфликтующая редакция.", { exact: true })
        .waitFor()
      await button("Мою — новой версией").click()
      await saved()
      await button("История").click()
      await page
        .getByText("Изменения другого редактора", { exact: true })
        .waitFor()
      await page
        .getByText("Разрешение конфликта — моя редакция", { exact: true })
        .waitFor()
    },
  )
  await check(
    "discard before navigation returns to last saved text",
    async () => {
      await draftDemo()
      await page.getByLabel("Демо сохранения").selectOption("error")
      await editor().fill("Эти локальные правки явно отклонены.")
      await page.getByRole("alert").waitFor()
      await button("Черновики проекта").click()
      await button("Выйти без изменений").click()
      await route(draftHash)
      assert.equal(await editor().inputValue(), "Моя конфликтующая редакция.")
    },
  )
  await check("draft deletion is confirmed and originals remain", async () => {
    await button("Удалить черновик").click()
    await page.getByRole("dialog", { name: "Удалить черновик" }).waitFor()
    await button("Отмена").click()
    await button("Удалить черновик").click()
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Удалить", exact: true })
      .click()
    assert.equal(
      await page
        .locator(".work-card")
        .filter({ hasText: "Рабочее заключение UI-02" })
        .count(),
      0,
    )
    await page.getByRole("tab", { name: /^Документы/ }).click()
    assert.ok((await page.locator(".document-row").count()) > 0)
  })
  await check(
    "VIEWER cannot research, save, accept AI or restore",
    async () => {
      await route("#/projects/p-3/research?new=1")
      assert.equal(await button("Начать исследование").isDisabled(), true)
      await route("#/projects/p-3/draft?draft=d-view&view=suggest")
      assert.equal(await editor().getAttribute("readonly"), "")
      assert.equal(await button("Сохранить").isDisabled(), true)
      assert.equal(await button("Принять").isDisabled(), true)
      await button("История").click()
      assert.equal(
        await page
          .locator(".version-item")
          .first()
          .getByRole("button", { name: "Восстановить", exact: true })
          .isDisabled(),
        true,
      )
      assert.equal(await button("Удалить черновик").isDisabled(), true)
    },
  )
  await check(
    "new screens fit desktop widths without horizontal overflow",
    async () => {
      for (const width of [1280, 1440]) {
        await page.setViewportSize({ width, height: 1000 })
        await route("#/projects/sever/research?new=1")
        assert.equal(
          await page.evaluate(
            () => document.documentElement.scrollWidth > innerWidth,
          ),
          false,
        )
        await route("#/projects/sever/draft?draft=d1")
        await page.waitForTimeout(250)
        assert.equal(
          await page.evaluate(
            () => document.documentElement.scrollWidth > innerWidth,
          ),
          false,
        )
      }
      assert.equal(
        await page
          .getByRole("button", { name: "Экспорт", exact: true })
          .count(),
        0,
      )
    },
  )
  await check(
    "deleted document cannot be read through a derived Draft",
    async () => {
      await route("#/projects/sever/chat?chat=ch1")
      await button("Создать черновик").click()
      await button("Создать в проекте").click()
      const derivedHash = await page.evaluate(() => location.hash)
      await page.getByRole("tab", { name: /^Документы/ }).click()
      await page
        .locator(".document-row")
        .filter({ hasText: "Договор_поставки_демо.docx" })
        .locator(".document-main")
        .click()
      await button("Удалить").click()
      await page
        .getByRole("dialog")
        .getByRole("button", { name: "Удалить", exact: true })
        .click()
      await route(derivedHash)
      await page
        .getByRole("heading", { name: "Черновик недоступен", exact: true })
        .waitFor()
      assert.equal(await editor().count(), 0)
      assert.equal(
        await page.getByLabel("Название черновика", { exact: true }).count(),
        0,
      )
    },
  )
  assert.deepEqual(errors, [])
  console.log(`PASS ${checks} UI-02 scenario groups; no browser runtime errors`)
} catch (error) {
  console.error("Failure URL:", page.url())
  console.error((await page.locator(".main").innerText()).slice(-6500))
  await page.screenshot({ path: "/tmp/neuro-ui02-failure.png", fullPage: true })
  throw error
} finally {
  await browser.close()
}
