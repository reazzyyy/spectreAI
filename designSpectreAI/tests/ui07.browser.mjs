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
const nrow = (title) =>
  page.locator(".notification-row").filter({ hasText: title })
async function route(hash) {
  await page.evaluate((h) => {
    location.hash = h
  }, hash)
}
async function org() {
  await route("#/organization")
  await page.locator(".organization-page").waitFor()
}
async function inbox() {
  await button("Уведомления").click()
  await page.locator(".notifications-page").waitFor()
}
async function persona(id) {
  await button("Меню профиля").click()
  await page.locator(".profile-menu summary").click()
  await page.getByLabel("Смотреть как сотрудник").selectOption(id)
  await page.locator(".home h1").waitFor()
}
async function appoint() {
  await org()
  await page.locator(".access-appointments summary").click()
  await page.getByLabel("Сотрудник для назначения").selectOption("daria")
  await button("Назначить согласующего").click()
  await page.locator(".access-appointed").waitFor()
}
async function request() {
  await persona("oleg")
  await org()
  await button("Запросить доступ").click()
  await page.getByLabel("Объект доступа").selectOption("sever-0")
  await page
    .getByLabel("Причина доступа")
    .fill("PRIVATE REASON do not show in inbox")
  await page.getByLabel("Согласующий доступа").selectOption("daria")
  await button("Отправить запрос").click()
  await page.getByRole("dialog").waitFor({ state: "hidden" })
}
async function decide(action = "Одобрить доступ") {
  await persona("daria")
  await inbox()
  await nrow("Запрос на временный доступ").locator(".notification-main").click()
  await page
    .getByRole("dialog", { name: "Решение по запросу доступа" })
    .waitFor()
  await button(action).click()
  await page.getByRole("dialog").waitFor({ state: "hidden" })
}
async function upload(name, outcome = "ready") {
  await route("#/projects/sever/docs")
  await button("Добавить документы").click()
  await page.getByLabel("Файлы для демонстрации").setInputFiles({
    name,
    mimeType: "application/pdf",
    buffer: Buffer.from("synthetic"),
  })
  await page
    .getByLabel("Демонстрационный результат обработки")
    .selectOption(outcome)
  await button("Добавить · 1").click()
}
async function check(name, fn) {
  if (page) await page.close()
  page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  page.on("pageerror", (e) => errors.push(e.message))
  await page.goto(`${base}/#/notifications`)
  await page.locator(".notifications-page").waitFor()
  await fn()
  checks++
  console.log(`PASS ${name}`)
}
try {
  await check("empty, search, error/retry and loading keep state", async () => {
    await page
      .getByRole("heading", { name: "Пока нет уведомлений", exact: true })
      .waitFor()
    await page.getByLabel("Поиск уведомлений").fill("search")
    await page.locator(".notifications-page > details summary").click()
    await page.getByLabel("Состояние уведомлений").selectOption("error")
    await button("Повторить загрузку").click()
    assert.equal(
      await page.getByLabel("Поиск уведомлений").inputValue(),
      "search",
    )
    await page.getByLabel("Состояние уведомлений").selectOption("loading")
    await button("Завершить демозагрузку").click()
    assert.equal(await button("Прочитать все").isDisabled(), true)
  })
  await check(
    "request notification opens exact decision; approval opens no document automatically",
    async () => {
      await appoint()
      await request()
      await inbox()
      assert.equal(
        (await page.locator(".notifications-page").innerText()).includes(
          "PRIVATE REASON",
        ),
        false,
      )
      await decide()
      await persona("oleg")
      await inbox()
      await nrow("Временный доступ одобрен")
        .locator(".notification-main")
        .click()
      assert.ok(page.url().includes("organization?request="))
      await page
        .getByRole("dialog", { name: "Решение по запросу доступа" })
        .waitFor()
      assert.equal(await page.locator(".access-document").count(), 0)
      await page
        .getByRole("dialog")
        .getByRole("button", { name: "Открыть read-only", exact: true })
        .click()
      await page.locator(".access-document").waitFor()
    },
  )
  await check(
    "rejection notification opens current closed request, not content",
    async () => {
      await appoint()
      await request()
      await decide("Отклонить запрос")
      await persona("oleg")
      await inbox()
      await nrow("В запросе доступа отказано")
        .locator(".notification-main")
        .click()
      await page
        .getByRole("dialog")
        .getByText("Отказано", { exact: true })
        .waitFor()
      assert.equal(await button("Открыть read-only").count(), 0)
    },
  )
  await check(
    "expiry notification and old approval both recheck current state",
    async () => {
      await appoint()
      await request()
      await decide()
      await persona("oleg")
      await org()
      await button("Открыть read-only").click()
      await page.locator(".access-view-demo summary").click()
      await button("Истечь сейчас (демо)").click()
      await button("Закрыть просмотр").click()
      await inbox()
      await nrow("Срок временного доступа истёк").waitFor()
      await nrow("Временный доступ одобрен")
        .locator(".notification-main")
        .click()
      await page
        .getByRole("dialog")
        .getByText("Срок истёк", { exact: true })
        .waitFor()
      assert.equal(await button("Открыть read-only").count(), 0)
    },
  )
  await check(
    "revocation is mandatory with all optional settings disabled",
    async () => {
      await appoint()
      await request()
      await decide()
      await persona("oleg")
      await inbox()
      await button("Настройки уведомлений").click()
      await page
        .getByLabel("Показывать результаты обработки документов")
        .uncheck()
      await page.getByLabel("Показывать результаты Chat AI").uncheck()
      assert.equal(
        await page
          .getByLabel("Безопасность и доступ", { exact: false })
          .isDisabled(),
        true,
      )
      await button("Сохранить настройки").click()
      await org()
      await button("Отозвать").click()
      await page
        .getByRole("dialog")
        .getByRole("button", { name: "Подтвердить отзыв", exact: true })
        .click()
      await page.getByRole("dialog").waitFor({ state: "hidden" })
      await inbox()
      await nrow("Временный доступ отозван").waitFor()
      await nrow("Временный доступ отозван")
        .locator(".notification-main")
        .click()
      await page
        .getByRole("dialog")
        .getByText("Отозван", { exact: true })
        .waitFor()
      assert.equal(await page.locator(".access-document").count(), 0)
    },
  )
  await check(
    "read, unread and mark all isolate people and organizations",
    async () => {
      await appoint()
      await request()
      await inbox()
      await button("Прочитать все").click()
      assert.equal(await page.locator(".notification-row.unread").count(), 0)
      await page
        .getByRole("button", {
          name: "Пометить непрочитанным: Запрос на временный доступ",
          exact: true,
        })
        .click()
      assert.equal(await page.locator(".notification-row.unread").count(), 1)
      await persona("daria")
      await inbox()
      assert.ok((await page.locator(".notification-row.unread").count()) >= 2)
      await button("Прочитать все").click()
      await persona("oleg")
      await inbox()
      assert.equal(await page.locator(".notification-row.unread").count(), 1)
      await persona("elena")
      await page.getByLabel("Текущая организация").selectOption("praktika")
      await inbox()
      assert.equal(await page.locator(".notification-row").count(), 0)
    },
  )
  await check(
    "copied request link denies unrelated member and reload has safe missing state",
    async () => {
      await appoint()
      await request()
      const hash = await page
        .locator(".access-request")
        .first()
        .getAttribute("data-request-id")
      await persona("alex")
      await route(`#/organization?request=${hash}`)
      await page.getByText("Запрос недоступен", { exact: true }).waitFor()
      assert.equal(await page.getByRole("dialog").count(), 0)
      assert.equal(
        (await page.locator(".organization-page").innerText()).includes(
          "PRIVATE REASON",
        ),
        false,
      )
      await page.reload()
      await page.getByText("Запрос недоступен", { exact: true }).waitFor()
    },
  )
  await check(
    "document notification uses live exact version and safe text",
    async () => {
      await upload("PRIVATE_FILE.pdf")
      await inbox()
      await nrow("Обработка документа завершена").waitFor()
      assert.equal(
        (await page.locator(".notifications-page").innerText()).includes(
          "PRIVATE_FILE",
        ),
        false,
      )
      await route("#/projects/spor/chats")
      await inbox()
      await nrow("Обработка документа завершена")
        .locator(".notification-main")
        .click()
      await page
        .getByRole("heading", { name: "PRIVATE_FILE.pdf", exact: true })
        .waitFor()
      assert.ok(page.url().includes("/sever/analysis"))
      assert.equal(await page.getByLabel("Версия документа").inputValue(), "1")
    },
  )
  await check(
    "document error and OCR generate actionable results",
    async () => {
      await upload("OCR.pdf", "ocr")
      await inbox()
      await nrow("Для документа требуется OCR").waitFor()
      await upload("ERROR.pdf", "error")
      await inbox()
      await nrow("Ошибка обработки документа").waitFor()
      await nrow("Ошибка обработки документа")
        .locator(".notification-main")
        .click()
      await page
        .getByRole("heading", { name: "ERROR.pdf", exact: true })
        .waitFor()
    },
  )
  await check(
    "Chat AI notification links correct private conversation without copying prompt",
    async () => {
      await route("#/projects/sever/chat")
      await page
        .getByLabel("Ваш вопрос", { exact: true })
        .fill("PRIVATE PROMPT never show")
      await button("Отправить").click()
      await inbox()
      await nrow("Ответ Chat AI готов").waitFor()
      assert.equal(
        (await page.locator(".notifications-page").innerText()).includes(
          "PRIVATE PROMPT",
        ),
        false,
      )
      await route("#/projects/spor/chats")
      await inbox()
      await nrow("Ответ Chat AI готов").locator(".notification-main").click()
      await page.locator(".legal-answer").waitFor()
      assert.ok(page.url().includes("/sever/chat?chat="))
      assert.ok(
        (await page.locator(".chat-workspace").innerText()).includes(
          "PRIVATE PROMPT",
        ),
      )
    },
  )
  await check(
    "settings cancel, failed save and retry affect feed and badge, scoped per person",
    async () => {
      await upload("PREF.pdf")
      await inbox()
      await nrow("Обработка документа завершена").waitFor()
      await button("Настройки уведомлений").click()
      await page
        .getByLabel("Показывать результаты обработки документов")
        .uncheck()
      await button("Отмена").click()
      assert.equal(await nrow("Обработка документа завершена").count(), 1)
      await button("Настройки уведомлений").click()
      await page
        .getByLabel("Показывать результаты обработки документов")
        .uncheck()
      await page.locator(".dialog details summary").click()
      await page.getByLabel("Ошибка сохранения настроек (одна попытка)").check()
      await button("Сохранить настройки").click()
      await page.getByRole("alert").waitFor()
      assert.equal(
        await page
          .getByLabel("Показывать результаты обработки документов")
          .isChecked(),
        false,
      )
      await button("Сохранить настройки").click()
      await page.getByRole("dialog").waitFor({ state: "hidden" })
      assert.equal(await nrow("Обработка документа завершена").count(), 0)
      await persona("daria")
      await inbox()
      await button("Настройки уведомлений").click()
      assert.equal(
        await page
          .getByLabel("Показывать результаты обработки документов")
          .isChecked(),
        true,
      )
      await button("Отмена").click()
      await persona("elena")
      await inbox()
      await button("Настройки уведомлений").click()
      await page
        .getByLabel("Показывать результаты обработки документов")
        .check()
      await button("Сохранить настройки").click()
      await nrow("Обработка документа завершена").waitFor()
    },
  )
  await check(
    "revoked membership notification is safe and cannot reopen project",
    async () => {
      await route("#/projects/sever/members")
      await page
        .locator(".membership-row")
        .filter({ hasText: "daria@example.test" })
        .getByRole("button", { name: "Удалить доступ", exact: true })
        .click()
      await button("Прекратить доступ").click()
      await page.getByRole("dialog").waitFor({ state: "hidden" })
      await persona("daria")
      await inbox()
      await nrow("Ваш доступ к проекту отозван")
        .locator(".notification-main")
        .click()
      await page
        .getByRole("dialog", { name: "Объект уведомления недоступен" })
        .waitFor()
      assert.equal(await page.locator(".project-bar").count(), 0)
    },
  )
  await check(
    "ownership notification connects recipient proposal and acceptance",
    async () => {
      await route("#/projects/sever/members")
      await button("Передать владение").click()
      await page.getByLabel("Получатель владения").selectOption("daria")
      await button("Отправить предложение").click()
      await page.getByRole("dialog").waitFor({ state: "hidden" })
      await persona("daria")
      await inbox()
      await nrow("Предложение передачи владения")
        .locator(".notification-main")
        .click()
      await button("Рассмотреть предложение").click()
      await button("Принять владение").click()
      await page.getByRole("dialog").waitFor({ state: "hidden" })
      await inbox()
      await nrow("Передача владения завершена").waitFor()
      await page.setViewportSize({ width: 1280, height: 1000 })
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
        false,
      )
      await page.screenshot({
        path: "/tmp/ui07-notifications.png",
        fullPage: true,
      })
    },
  )
  await check(
    "deleted document notification cannot expose former content",
    async () => {
      await upload("DELETED.pdf")
      await inbox()
      await nrow("Обработка документа завершена").waitFor()
      await nrow("Обработка документа завершена")
        .locator(".notification-main")
        .click()
      await button("Удалить").click()
      await page
        .getByRole("dialog")
        .getByRole("button", { name: "Удалить", exact: true })
        .click()
      await page.getByRole("dialog").waitFor({ state: "hidden" })
      await inbox()
      await nrow("Обработка документа завершена")
        .locator(".notification-main")
        .click()
      await page
        .getByRole("dialog", { name: "Объект уведомления недоступен" })
        .waitFor()
      assert.equal(
        (await page.getByRole("dialog").innerText()).includes("DELETED.pdf"),
        false,
      )
    },
  )
  await check(
    "new document version notifies processing initiator, not original author",
    async () => {
      await upload("VERSION.pdf")
      await inbox()
      await nrow("Обработка документа завершена").waitFor()
      await route("#/projects/sever/members")
      await page
        .locator(".membership-row")
        .filter({ hasText: "daria@example.test" })
        .getByRole("button", { name: "Изменить роль", exact: true })
        .click()
      await page.getByLabel("Назначаемая роль").selectOption("editor")
      await button("Применить доступ").click()
      await page.getByRole("dialog").waitFor({ state: "hidden" })
      await persona("daria")
      await route("#/projects/sever/docs")
      await button("Добавить документы").click()
      await page.getByLabel("Файлы для демонстрации").setInputFiles({
        name: "VERSION.pdf",
        mimeType: "application/pdf",
        buffer: Buffer.from("synthetic version"),
      })
      await page
        .getByLabel("Дубликат VERSION.pdf", { exact: true })
        .selectOption("version")
      await button("Добавить · 1").click()
      await inbox()
      await nrow("Обработка документа завершена").waitFor()
      await nrow("Обработка документа завершена")
        .locator(".notification-main")
        .click()
      assert.equal(await page.getByLabel("Версия документа").inputValue(), "2")
      await persona("elena")
      await inbox()
      assert.equal(await nrow("Обработка документа завершена").count(), 1)
    },
  )
  await check(
    "pagination, type and unread filters operate on actual event list",
    async () => {
      await route("#/projects/sever/members")
      for (let i = 0; i < 16; i++) {
        await page
          .locator(".membership-row")
          .filter({ hasText: "daria@example.test" })
          .getByRole("button", { name: "Изменить роль", exact: true })
          .click()
        await page
          .getByLabel("Назначаемая роль")
          .selectOption(i % 2 ? "viewer" : "editor")
        await button("Применить доступ").click()
        await page.getByRole("dialog").waitFor({ state: "hidden" })
      }
      await persona("daria")
      await inbox()
      assert.equal(await page.locator(".notification-row").count(), 15)
      await button("Далее").click()
      assert.equal(await page.locator(".notification-row").count(), 1)
      await page.getByLabel("Тип уведомления").selectOption("ai")
      await page
        .getByRole("heading", {
          name: "Нет подходящих уведомлений",
          exact: true,
        })
        .waitFor()
      await button("Сбросить фильтры").click()
      await button("Прочитать все").click()
      await page.getByRole("tab", { name: /Непрочитанные/ }).click()
      await page
        .getByRole("heading", { name: "Всё прочитано", exact: true })
        .waitFor()
    },
  )
  await check(
    "session switch during preference save does not apply stale actor changes",
    async () => {
      await button("Настройки уведомлений").click()
      await page.getByLabel("Показывать результаты Chat AI").uncheck()
      await button("Сохранить настройки").click()
      await button("Меню профиля").evaluate((el) => el.click())
      await page.locator(".profile-menu summary").evaluate((el) => el.click())
      await page.getByLabel("Смотреть как сотрудник").evaluate((el) => {
        el.value = "daria"
        el.dispatchEvent(new Event("change", { bubbles: true }))
      })
      await page.locator(".home h1").waitFor()
      await page.waitForTimeout(450)
      await inbox()
      await button("Настройки уведомлений").click()
      assert.equal(
        await page.getByLabel("Показывать результаты Chat AI").isChecked(),
        true,
      )
      await button("Отмена").click()
      await persona("elena")
      await inbox()
      await button("Настройки уведомлений").click()
      assert.equal(
        await page.getByLabel("Показывать результаты Chat AI").isChecked(),
        true,
      )
    },
  )
  await check(
    "deletion receipt notification focuses permitted operation, not removed content",
    async () => {
      await route("#/projects/sever/chats")
      await page
        .getByRole("button", { name: "Действия: Проект Север", exact: true })
        .click()
      await page
        .getByRole("menuitem", { name: "Удалить проект", exact: true })
        .click()
      await page.getByLabel("Я понимаю последствия", { exact: false }).check()
      await button("Подтвердить намерение").click()
      await page
        .getByLabel("Введите точное название проекта")
        .fill("Проект Север")
      await button("Удалить без восстановления").click()
      await page.getByText("Завершено (демо)", { exact: true }).waitFor()
      await inbox()
      await nrow("Удаление проекта завершено в демомодели")
        .locator(".notification-main")
        .click()
      await page.locator(".audit-operation").waitFor()
      assert.equal(
        await page.getByLabel("Область аудита").inputValue(),
        "sever",
      )
      assert.equal(await page.locator(".project-bar").count(), 0)
    },
  )
  assert.deepEqual(errors, [])
  console.log(`${checks} UI-07 browser groups passed; no runtime errors`)
} finally {
  await browser.close()
}
