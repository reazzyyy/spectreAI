// Synthetic UI workflow only; no production authorization guarantees.
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
const row = () => page.locator(".access-request").first()
async function org() {
  await page.evaluate(() => {
    location.hash = "#/organization"
  })
  await page.locator(".organization-page").waitFor()
}
async function persona(id) {
  await button("Меню профиля").click()
  await page.locator(".profile-menu summary").click()
  await page.getByLabel("Смотреть как сотрудник").selectOption(id)
  await page.locator(".home h1").waitFor()
  await org()
}
async function appoint(id = "daria") {
  await page.locator(".access-appointments summary").click()
  await page.getByLabel("Сотрудник для назначения").selectOption(id)
  await button("Назначить согласующего").click()
  await page.locator(".access-appointed").waitFor()
}
async function request(
  minutes = "15",
  reason = "Проверить обработку документа",
) {
  await persona("oleg")
  await button("Запросить доступ").click()
  await page.getByLabel("Объект доступа").selectOption("sever-0")
  await page.getByLabel("Причина доступа").fill(reason)
  await page.getByLabel("Срок доступа", { exact: true }).selectOption(minutes)
  await page.getByLabel("Согласующий доступа").selectOption("daria")
  await button("Отправить запрос").click()
  await row().waitFor()
  await page.getByRole("dialog").waitFor({ state: "hidden" })
}
async function approve() {
  await persona("daria")
  await button("Рассмотреть запрос").click()
  await button("Одобрить доступ").click()
  await page.getByRole("dialog").waitFor({ state: "hidden" })
  await row().getByText("Доступ действует", { exact: true }).waitFor()
}
async function openView() {
  await persona("oleg")
  await button("Открыть read-only").click()
  await page.locator(".access-document").waitFor()
}
async function check(name, fn) {
  if (page) await page.close()
  page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  page.on("pageerror", (e) => errors.push(e.message))
  await page.goto(`${base}/#/organization`)
  await page.locator("#admin-access").waitFor()
  await fn()
  checks++
  console.log(`PASS ${name}`)
}
try {
  await check("no independent approver means no access", async () => {
    await button("Запросить доступ").click()
    assert.equal(await button("Отправить запрос").isDisabled(), true)
    await page
      .getByText("Нет независимого согласующего — нет доступа.", {
        exact: false,
      })
      .waitFor()
    assert.equal(await page.locator(".access-document").count(), 0)
    assert.equal(
      await page
        .getByLabel("Объект доступа")
        .locator("option")
        .filter({ hasText: /PERSONAL|Конфиденциальный/ })
        .count(),
      0,
    )
  })
  await check("owner can appoint self but cannot self-approve", async () => {
    await appoint("elena")
    await button("Запросить доступ").click()
    assert.equal(
      await page.getByLabel("Согласующий доступа").isDisabled(),
      true,
    )
    assert.equal(await button("Отправить запрос").isDisabled(), true)
  })
  await check(
    "pending, safe identifiers, requester cannot decide",
    async () => {
      await appoint()
      await request()
      await row().getByText("Ожидает решения", { exact: true }).waitFor()
      assert.equal(await button("Открыть read-only").count(), 0)
      await button("Детали запроса").click()
      await page
        .getByText("Самосогласование запрещено.", { exact: false })
        .waitFor()
      assert.equal(await button("Одобрить доступ").count(), 0)
      assert.equal(
        await page
          .getByRole("dialog")
          .getByText("Договор_поставки_демо.docx")
          .count(),
        0,
      )
    },
  )
  for (const minutes of ["15", "30", "60"])
    await check(
      `grant ${minutes} min, exact read-only scope, expiry hides open text`,
      async () => {
        await appoint()
        await request(minutes)
        await approve()
        await openView()
        await page
          .getByRole("heading", {
            name: "Договор_поставки_демо.docx",
            exact: true,
          })
          .waitFor()
        assert.ok(
          (await page.locator(".access-document").innerText()).includes(
            "ДЕМОНСТРАЦИОННЫЙ ДОГОВОР",
          ),
        )
        assert.equal(
          await page
            .getByRole("dialog")
            .locator("textarea, [contenteditable=true]")
            .count(),
          0,
        )
        if (minutes === "15")
          await page.screenshot({
            path: "/tmp/neuro-ui05-viewer.png",
            animations: "disabled",
            fullPage: true,
          })
        await page.locator(".access-view-demo summary").click()
        await button("Истечь сейчас (демо)").click()
        await page
          .getByRole("heading", { name: "Доступ прекращён", exact: true })
          .waitFor()
        assert.equal(await page.locator(".access-document").count(), 0)
        await button("Закрыть просмотр").click()
        await row().getByText("Срок истёк", { exact: true }).waitFor()
        await page.evaluate(() => {
          location.hash = "#/projects/sever/docs"
        })
        await page
          .getByRole("heading", { name: "Проект недоступен", exact: true })
          .waitFor()
      },
    )
  await check(
    "audit failure blocks approval, preserves pending, retry works",
    async () => {
      await appoint()
      await request()
      await persona("daria")
      await page.locator("#admin-access .work-demo-details summary").click()
      await page.getByLabel("Ошибка обязательного аудита доступа").check()
      await button("Рассмотреть запрос").click()
      await button("Одобрить доступ").click()
      await page
        .getByRole("alert")
        .filter({ hasText: "Решение не применено; доступ не выдан" })
        .waitFor()
      await button("Закрыть").click()
      await row().getByText("Ожидает решения", { exact: true }).waitFor()
      await page.getByLabel("Ошибка обязательного аудита доступа").uncheck()
      await button("Рассмотреть запрос").click()
      await button("Одобрить доступ").click()
      await page.getByRole("dialog").waitFor({ state: "hidden" })
      await row().getByText("Доступ действует", { exact: true }).waitFor()
    },
  )
  await check(
    "audit request failure keeps form and never creates grant",
    async () => {
      await appoint()
      await persona("oleg")
      await page.locator("#admin-access .work-demo-details summary").click()
      await page.getByLabel("Ошибка обязательного аудита доступа").check()
      await button("Запросить доступ").click()
      await page.getByLabel("Объект доступа").selectOption("sever-0")
      await page.getByLabel("Причина доступа").fill("Сохранённая причина")
      await page.getByLabel("Согласующий доступа").selectOption("daria")
      await button("Отправить запрос").click()
      await page
        .getByRole("alert")
        .filter({ hasText: "Запрос не отправлен" })
        .waitFor()
      assert.equal(
        await page.getByLabel("Причина доступа").inputValue(),
        "Сохранённая причина",
      )
      assert.equal(await page.locator(".access-request").count(), 0)
    },
  )
  await check("reject and new request, filtered history", async () => {
    await appoint()
    await request()
    await persona("daria")
    await button("Рассмотреть запрос").click()
    await button("Отклонить запрос").click()
    await page.getByRole("dialog").waitFor({ state: "hidden" })
    await row().getByText("Отказано", { exact: true }).waitFor()
    await request("30")
    assert.equal(await page.locator(".access-request").count(), 2)
    await page.getByLabel("Статус запросов доступа").selectOption("rejected")
    assert.equal(await page.locator(".access-request").count(), 1)
    await row().getByText("Отказано", { exact: true }).waitFor()
  })
  await check(
    "revocation removes already open content despite audit failure",
    async () => {
      await appoint()
      await request()
      await approve()
      await persona("oleg")
      await button("Открыть read-only").click()
      await page.locator(".access-document").waitFor()
      await button("Закрыть просмотр").click()
      await page.locator("#admin-access .work-demo-details summary").click()
      await page.getByLabel("Ошибка обязательного аудита доступа").check()
      await button("Открыть read-only").click()
      await page
        .getByRole("alert")
        .filter({ hasText: "Материалы не открыты" })
        .waitFor()
      await page.getByLabel("Ошибка обязательного аудита доступа").uncheck()
      await button("Открыть read-only").click()
      await page.locator(".access-document").waitFor()
      await page.locator(".access-view-demo summary").click()
      await page.getByLabel("Сбой аудита после открытия (демо)").check()
      await button("Внешний отзыв (демо)").click()
      await page
        .getByRole("heading", { name: "Доступ прекращён", exact: true })
        .waitFor()
      assert.equal(await page.locator(".access-document").count(), 0)
    },
  )
  await check(
    "assigned approver can revoke; owner revoking authority stops access",
    async () => {
      await appoint()
      await request()
      await approve()
      await button("Отозвать").click()
      await button("Подтвердить отзыв").click()
      await page.getByRole("dialog").waitFor({ state: "hidden" })
      await row().getByText("Отозван", { exact: true }).waitFor()
      await request()
      await approve()
      await persona("elena")
      await page.locator(".access-appointments summary").click()
      await button("Снять полномочие").click()
      await page.locator(".access-appointed").waitFor({ state: "hidden" })
      await persona("oleg")
      await row().getByText("Отозван", { exact: true }).waitFor()
      assert.equal(await button("Открыть read-only").count(), 0)
    },
  )
  await check(
    "org owner can revoke without reading another user's grant",
    async () => {
      await appoint()
      await request()
      await approve()
      await persona("elena")
      await row().getByText("Доступ действует", { exact: true }).waitFor()
      assert.equal(await button("Открыть read-only").count(), 0)
      await page
        .locator(".access-request")
        .getByRole("button", { name: "Отозвать", exact: true })
        .click()
      await button("Подтвердить отзыв").click()
      await page.getByRole("dialog").waitFor({ state: "hidden" })
      await row().getByText("Отозван", { exact: true }).waitFor()
      await persona("oleg")
      assert.equal(await button("Открыть read-only").count(), 0)
    },
  )
  await check("unrelated staff see no requests or content", async () => {
    await appoint()
    await request()
    await persona("alex")
    assert.equal(await page.locator("#admin-access").count(), 0)
  })
  await check(
    "long reason, duplicate prevention, safe revoke confirmation",
    async () => {
      await appoint()
      await request("60", "Обоснование ".repeat(40))
      await button("Запросить доступ").click()
      await page.getByLabel("Объект доступа").selectOption("sever-0")
      await page.getByLabel("Причина доступа").fill("Повтор")
      await page.getByLabel("Согласующий доступа").selectOption("daria")
      await button("Отправить запрос").click()
      await page
        .getByRole("alert")
        .filter({ hasText: "Продление запрещено" })
        .waitFor()
      assert.equal(
        await page.locator("#admin-access .success-message").count(),
        0,
      )
      await button("Отмена").click()
      await button("Отозвать").click()
      await button("Отмена").click()
      await row().getByText("Ожидает решения", { exact: true }).waitFor()
      await button("Отозвать").click()
      await button("Подтвердить отзыв").click()
      await page.getByRole("dialog").waitFor({ state: "hidden" })
      await row().getByText("Отозван", { exact: true }).waitFor()
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
        false,
      )
      await page.setViewportSize({ width: 1280, height: 900 })
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
        false,
      )
      await page.screenshot({
        path: "/tmp/neuro-ui05-history.png",
        fullPage: true,
      })
    },
  )
  await check(
    "natural clock expiry hides open text without a demo action",
    async () => {
      await page.clock.install()
      await appoint()
      await request()
      await approve()
      await openView()
      await page.clock.fastForward(15 * 60_000 + 1000)
      await page
        .getByRole("heading", { name: "Доступ прекращён", exact: true })
        .waitFor()
      assert.equal(await page.locator(".access-document").count(), 0)
      await button("Закрыть просмотр").click()
      await row().getByText("Срок истёк", { exact: true }).waitFor()
    },
  )
  assert.deepEqual(errors, [])
  console.log(`PASS ${checks} UI-05 browser groups; no runtime errors`)
} catch (error) {
  console.error("Failure URL:", page?.url())
  if (page) {
    console.error((await page.locator("body").innerText()).slice(-9000))
    await page.screenshot({
      path: "/tmp/neuro-ui05-failure.png",
      fullPage: true,
    })
  }
  throw error
} finally {
  await browser.close()
}
