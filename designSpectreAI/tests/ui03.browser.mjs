// Synthetic auth/membership only; uses the supervised preview and no real email.
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
const password = "SpectrumDemo1!"
const button = (name) => page.getByRole("button", { name, exact: true })
const member = (name) =>
  page.locator(".membership-row").filter({ hasText: name })
const docRow = (name) => page.locator(".document-row").filter({ hasText: name })
const editor = () =>
  page.getByLabel("Текст юридического документа", { exact: true })
let checks = 0
let resetToken
let freshInviteToken
let privateHash
let publicHash
async function check(name, fn) {
  await fn()
  checks++
  console.log(`PASS ${name}`)
}
async function route(hash) {
  await page.evaluate((h) => {
    location.hash = h
  }, hash)
  await page.waitForTimeout(150)
}
async function login(email = "elena@example.test", pass = password) {
  await page.getByLabel("Рабочий email", { exact: true }).fill(email)
  await page.getByLabel("Пароль", { exact: true }).fill(pass)
  await button("Войти").click()
  await page.locator(".home h1").waitFor()
  assert.equal(await page.evaluate(() => location.hash), "#/")
}
async function persona(name) {
  await button("Меню профиля").click()
  await page.locator(".profile-menu summary").click()
  const option = page
    .getByLabel("Смотреть как сотрудник")
    .locator("option")
    .filter({ hasText: name })
    .first()
  await page
    .getByLabel("Смотреть как сотрудник")
    .selectOption(await option.getAttribute("value"))
  await page.locator(".home h1").waitFor()
}
async function logout() {
  await button("Меню профиля").click()
  await button("Выйти").click()
  await page
    .getByRole("heading", { name: "Войти в Спектр", exact: true })
    .waitFor()
}
try {
  await page.goto(`${base}/#/login`)
  await check(
    "login validates input, credentials and network failure without enumeration",
    async () => {
      await button("Войти").click()
      await page
        .getByRole("alert")
        .filter({ hasText: "корректный email" })
        .waitFor()
      await page
        .getByLabel("Рабочий email", { exact: true })
        .fill("unknown@example.test")
      await page.getByLabel("Пароль", { exact: true }).fill("wrong-password")
      await button("Войти").click()
      await page
        .getByRole("alert")
        .filter({ hasText: "Не удалось войти." })
        .waitFor()
      await button("Заполнить демоданные").click()
      await page.locator(".auth-demo-states summary").click()
      await page.getByLabel("Ошибка сервиса при отправке").check()
      await button("Войти").click()
      await page
        .getByRole("alert")
        .filter({ hasText: "Сервис временно недоступен" })
        .waitFor()
      assert.equal(
        await page.getByLabel("Рабочий email", { exact: true }).inputValue(),
        "elena@example.test",
      )
      await page.getByLabel("Ошибка сервиса при отправке").uncheck()
      await button("Войти").click()
      await page.locator(".home h1").waitFor()
      assert.equal(await page.evaluate(() => location.hash), "#/")
    },
  )
  await check(
    "logout hides protected content even after browser back",
    async () => {
      await route("#/projects/sever/docs")
      await page
        .getByRole("heading", { name: "Документы", exact: true })
        .waitFor()
      await logout()
      await page.goBack()
      await page.waitForTimeout(250)
      assert.equal(await page.locator(".document-row").count(), 0)
      assert.equal(await page.locator(".project-bar").count(), 0)
      await page
        .getByRole("heading", { name: "Войти в Спектр", exact: true })
        .waitFor()
      await login()
    },
  )
  await check(
    "expired session clears unsafe working text and reauth always opens Home",
    async () => {
      await route("#/projects/sever/draft?draft=d1")
      const original = await editor().inputValue()
      await page.locator(".draft-side-panel .work-demo-details summary").click()
      await page.getByLabel("Демо сохранения").selectOption("error")
      await editor().fill("Несохранённый секретный ввод UI03")
      await button("Меню профиля").click()
      await page.locator(".profile-menu summary").click()
      await button("Истечение сессии (демо)").click()
      await page.getByText("Сессия истекла", { exact: true }).waitFor()
      assert.equal(await editor().count(), 0)
      await login()
      await route("#/projects/sever/draft?draft=d1")
      assert.equal(await editor().inputValue(), original)
      await page.locator(".draft-side-panel .work-demo-details summary").click()
      await page.getByLabel("Демо сохранения").selectOption("success")
    },
  )
  await check(
    "password recovery is generic, validates confirmation and uses one-time link",
    async () => {
      await logout()
      await button("Забыли пароль?").click()
      await page
        .getByLabel("Рабочий email", { exact: true })
        .fill("elena@example.test")
      await button("Получить инструкции").click()
      await page
        .getByText("Если аккаунт с указанным email существует,", {
          exact: false,
        })
        .waitFor()
      await button("Показать образец письма").click()
      await button("Открыть ссылку из демописьма").click()
      resetToken = new URL(page.url()).hash
      await page
        .getByLabel("Новый пароль", { exact: true })
        .fill("NewSpectrum2!")
      await page.getByLabel("Повторите пароль").fill("mismatch")
      await button("Обновить пароль").click()
      await page
        .getByRole("alert")
        .filter({ hasText: "Пароли не совпадают" })
        .waitFor()
      await page.getByLabel("Повторите пароль").fill("NewSpectrum2!")
      await button("Обновить пароль").click()
      await page
        .getByRole("heading", { name: "Пароль обновлён", exact: true })
        .waitFor()
      await button("Перейти ко входу").click()
      await route(resetToken)
      await page
        .getByRole("heading", {
          name: "Ссылка недействительна или истекла",
          exact: true,
        })
        .waitFor()
      await button("Запросить новую ссылку").click()
    },
  )
  await check(
    "unknown recovery email does not reveal account; reset can expire",
    async () => {
      await page
        .getByLabel("Рабочий email", { exact: true })
        .fill("nobody@example.test")
      await button("Получить инструкции").click()
      await page
        .getByText("Если аккаунт с указанным email существует,", {
          exact: false,
        })
        .waitFor()
      await button("Показать образец письма").click()
      await button("Открыть ссылку из демописьма").click()
      await page.locator(".auth-demo-states summary").click()
      await button("Истечь сроку ссылки (демо)").click()
      await page
        .getByRole("heading", {
          name: "Ссылка недействительна или истекла",
          exact: true,
        })
        .waitFor()
      await route("#/login")
      await login("elena@example.test", "NewSpectrum2!")
    },
  )
  await check(
    "organization switching isolates projects and keeps Home at one project",
    async () => {
      await page.getByLabel("Текущая организация").selectOption("praktika")
      await page.locator(".home h1").waitFor()
      assert.equal(await page.evaluate(() => location.hash), "#/")
      await page
        .locator(".home .rows")
        .getByText("Правовое заключение", { exact: true })
        .waitFor()
      assert.equal(
        await page
          .locator(".home .rows")
          .getByText("Проект Север", { exact: true })
          .count(),
        0,
      )
      await route("#/projects/sever/docs")
      await page
        .getByRole("heading", { name: "Проект недоступен", exact: true })
        .waitFor()
      await button("Главная").click()
      await page.getByLabel("Текущая организация").selectOption("vector")
    },
  )
  await check(
    "new invitation creates account only by token, gives no TEAM automatically",
    async () => {
      await logout()
      await route("#/invite?token=invite-irina")
      await page
        .getByRole("heading", { name: "Присоединиться к команде", exact: true })
        .waitFor()
      await page.getByLabel("Имя и фамилия").fill("Ирина Новикова")
      await page.getByLabel("Новый пароль", { exact: true }).fill(password)
      await page.getByLabel("Повторите пароль").fill("different")
      await button("Создать аккаунт и принять приглашение").click()
      await page
        .getByRole("alert")
        .filter({ hasText: "Пароли не совпадают" })
        .waitFor()
      await page.getByLabel("Повторите пароль").fill(password)
      await button("Создать аккаунт и принять приглашение").click()
      await page.locator(".home h1").filter({ hasText: "Ирина" }).waitFor()
      assert.equal(await page.evaluate(() => location.hash), "#/")
      await page
        .getByRole("heading", { name: "У вас пока нет проектов", exact: true })
        .waitFor()
      await route("#/projects/sever/docs")
      await page
        .getByRole("heading", { name: "Проект недоступен", exact: true })
        .waitFor()
      await button("Главная").click()
      await logout()
      await route("#/invite?token=invite-irina")
      await page
        .getByRole("heading", { name: "Приглашение уже принято", exact: true })
        .waitFor()
      await button("Перейти ко входу").click()
      await login("elena@example.test", "NewSpectrum2!")
    },
  )
  await check(
    "existing account accepts organization invite, not private project contents",
    async () => {
      await logout()
      await route("#/invite?token=invite-existing")
      await page
        .getByRole("heading", { name: "Принять приглашение", exact: true })
        .waitFor()
      await page.getByLabel("Пароль", { exact: true }).fill("wrong")
      await button("Войти и принять приглашение").click()
      await page
        .getByRole("alert")
        .filter({ hasText: "Не удалось подтвердить аккаунт" })
        .waitFor()
      await page.getByLabel("Пароль", { exact: true }).fill(password)
      await button("Войти и принять приглашение").click()
      await page.locator(".home h1").filter({ hasText: "Алексей" }).waitFor()
      assert.equal(
        await page.getByLabel("Текущая организация").inputValue(),
        "praktika",
      )
      await page
        .getByRole("heading", { name: "У вас пока нет проектов", exact: true })
        .waitFor()
      await persona("Елена Крылова")
    },
  )
  await check(
    "owner invitation creation handles failure, duplicate and keeps email",
    async () => {
      await route("#/organization")
      await page
        .locator(".organization-page > .work-demo-details summary")
        .click()
      await page.getByLabel("Ошибка подготовки приглашения").check()
      await button("Пригласить сотрудника").click()
      await page.getByLabel("Email приглашения").fill("new.person@example.test")
      await button("Создать приглашение").click()
      await page
        .getByRole("alert")
        .filter({ hasText: "Не удалось подготовить приглашение" })
        .waitFor()
      assert.equal(
        await page.getByLabel("Email приглашения").inputValue(),
        "new.person@example.test",
      )
      await button("Создать приглашение").click()
      await page
        .getByRole("dialog", { name: "Демонстрационное письмо приглашения" })
        .waitFor()
      await button("Закрыть").click()
      await button("Пригласить сотрудника").click()
      await page.getByLabel("Email приглашения").fill("new.person@example.test")
      await button("Создать приглашение").click()
      await page
        .getByRole("alert")
        .filter({ hasText: "действующее приглашение" })
        .waitFor()
      await button("Отмена").click()
    },
  )
  await check(
    "revoked invitation cannot grant access; reissue invalidates old link",
    async () => {
      const inviteRow = page
        .locator(".invite-row")
        .filter({ hasText: "new.person@example.test" })
        .first()
      await inviteRow
        .getByRole("button", { name: "Демописьмо", exact: true })
        .click()
      await button("Открыть как получатель (демо)").click()
      const oldHash = await page.evaluate(() => location.hash)
      await page.locator(".auth-demo-states summary").click()
      await button("Истечь сроку приглашения (демо)").click()
      await page
        .getByRole("heading", {
          name: "Приглашение недействительно или истекло",
          exact: true,
        })
        .waitFor()
      await button("Запросить новое приглашение").click()
      await button("Запрос отмечен в макете").waitFor()
      await button("Перейти ко входу").click()
      await login("elena@example.test", "NewSpectrum2!")
      await route("#/organization")
      await page
        .locator(".invite-row")
        .filter({ hasText: "new.person@example.test" })
        .getByRole("button", { name: "Выдать заново", exact: true })
        .click()
      await button("Открыть как получатель (демо)").click()
      freshInviteToken = await page.evaluate(() => location.hash)
      assert.notEqual(freshInviteToken, oldHash)
      await route(oldHash)
      await page
        .getByRole("heading", { name: "Приглашение отозвано", exact: true })
        .waitFor()
      await button("Перейти ко входу").click()
      await login("elena@example.test", "NewSpectrum2!")
    },
  )
  await check(
    "explicit revoke has confirmation and keeps current staff unchanged",
    async () => {
      await route("#/organization")
      const before = await page.locator(".org-person").count()
      const row = page
        .locator(".invite-row")
        .filter({ hasText: "new.person@example.test" })
        .filter({ has: page.getByText("Ожидает принятия", { exact: true }) })
      await row.getByRole("button", { name: "Отозвать", exact: true }).click()
      await button("Отмена").click()
      await row.getByRole("button", { name: "Отозвать", exact: true }).click()
      await button("Отозвать приглашение").click()
      assert.equal(await page.locator(".org-person").count(), before)
      await logout()
      await route(freshInviteToken)
      await page
        .getByRole("heading", { name: "Приглашение отозвано", exact: true })
        .waitFor()
      await button("Перейти ко входу").click()
      await login("elena@example.test", "NewSpectrum2!")
    },
  )
  await check(
    "project membership is separate; picker offers only org staff and no OWNER role",
    async () => {
      await route("#/projects/sever/members")
      assert.equal(await page.locator(".membership-row").count(), 4)
      assert.equal(
        await member("Елена Крылова")
          .getByRole("button", { name: "Удалить доступ", exact: true })
          .count(),
        0,
      )
      await button("Добавить участника").click()
      await page
        .getByLabel("Сотрудник организации")
        .selectOption({ label: "Ирина Новикова · irina@example.test" })
      assert.equal(
        await page
          .getByLabel("Назначаемая роль")
          .locator('option[value="owner"]')
          .count(),
        0,
      )
      await page.getByLabel("Назначаемая роль").selectOption("viewer")
      await button("Применить доступ").click()
      await member("Ирина Новикова")
        .getByText("Просмотр", { exact: true })
        .waitFor()
      await persona("Ирина Новикова")
      await logout()
      await login("irina@example.test")
      assert.equal(
        await page
          .locator(".home .rows")
          .getByText("Проект Север", { exact: true })
          .count(),
        1,
      )
      assert.equal(await page.evaluate(() => location.hash), "#/")
      await route("#/projects/sever/docs")
      assert.equal(await button("Добавить документы").isDisabled(), true)
      await persona("Елена Крылова")
    },
  )
  await check(
    "member change failure is retryable, role filter and removal confirmation work",
    async () => {
      await route("#/projects/sever/members")
      await page.locator(".members-layout .work-demo-details summary").click()
      await page.getByLabel("Ошибка изменения состава").check()
      await member("Дарья Смирнова")
        .getByRole("button", { name: "Изменить роль", exact: true })
        .click()
      await page.getByLabel("Назначаемая роль").selectOption("editor")
      await button("Применить доступ").click()
      await page
        .getByRole("alert")
        .filter({ hasText: "Изменение не применено" })
        .waitFor()
      assert.equal(
        await page.getByLabel("Назначаемая роль").inputValue(),
        "editor",
      )
      await button("Применить доступ").click()
      await member("Дарья Смирнова")
        .getByText("Редактор", { exact: true })
        .waitFor()
      await page.getByLabel("Фильтр роли участника").selectOption("owner")
      assert.equal(await page.locator(".membership-row").count(), 1)
      await page.getByLabel("Фильтр роли участника").selectOption("all")
      await member("Дарья Смирнова")
        .getByRole("button", { name: "Изменить роль", exact: true })
        .click()
      await page.getByLabel("Назначаемая роль").selectOption("viewer")
      await button("Применить доступ").click()
      await member("Ирина Новикова")
        .getByRole("button", { name: "Удалить доступ", exact: true })
        .click()
      await button("Отмена").click()
      assert.equal(await member("Ирина Новикова").count(), 1)
    },
  )
  await check(
    "EDITOR and VIEWER see same documents with different actions, cannot manage members",
    async () => {
      await persona("Алексей Волков")
      await route("#/projects/sever/docs")
      assert.equal(await button("Добавить документы").isDisabled(), false)
      const docNames = await page
        .locator(".document-main strong")
        .allTextContents()
      await route("#/projects/sever/members")
      assert.equal(await button("Добавить участника").isDisabled(), true)
      await persona("Дарья Смирнова")
      await route("#/projects/sever/docs")
      assert.deepEqual(
        await page.locator(".document-main strong").allTextContents(),
        docNames,
      )
      assert.equal(await button("Добавить документы").isDisabled(), true)
      await route("#/projects/sever/draft?draft=d1")
      assert.equal(await editor().getAttribute("readonly"), "")
      assert.equal(await button("Сохранить").isDisabled(), true)
      await route("#/projects/sever/members")
      assert.equal(await button("Добавить участника").isDisabled(), true)
    },
  )
  await check(
    "PRIVATE chats stay private; explicit WORKSPACE sharing changes only selected chat",
    async () => {
      await persona("Алексей Волков")
      await route("#/projects/sever/chats")
      assert.equal(
        await page
          .getByText("Риски условия о неустойке", { exact: true })
          .count(),
        0,
      )
      await button("Начать диалог").click()
      await page
        .getByLabel("Ваш вопрос", { exact: true })
        .fill("Личный вопрос Алексея UI03")
      await button("Отправить").click()
      await page.locator(".legal-answer").waitFor()
      privateHash = await page.evaluate(() => location.hash)
      await button("Новый чат").click()
      await page
        .getByLabel("Ваш вопрос", { exact: true })
        .fill("Общий вопрос команды UI03")
      await button("Отправить").click()
      await page.locator(".legal-answer").waitFor()
      publicHash = await page.evaluate(() => location.hash)
      await button("Открыть проекту").click()
      await button("Открыть участникам").click()
      await persona("Елена Крылова")
      await route("#/projects/sever/chats")
      await page
        .locator(".row")
        .getByText("Общий вопрос команды UI03", { exact: true })
        .waitFor()
      assert.equal(
        await page
          .getByText("Личный вопрос Алексея UI03", { exact: true })
          .count(),
        0,
      )
      await route(privateHash)
      await page
        .getByRole("heading", { name: "Диалог недоступен", exact: true })
        .waitFor()
    },
  )
  await check(
    "removing membership revokes project and private chat, not shared materials or authorship",
    async () => {
      await persona("Алексей Волков")
      await route("#/projects/sever/docs")
      await button("Добавить документы").click()
      await button("Или добавить демонстрационный образец").click()
      await button("Добавить · 1").click()
      await docRow("Договор_поставки_образец.docx")
        .getByText("Готов к работе", { exact: true })
        .waitFor()
      await persona("Елена Крылова")
      await route("#/projects/sever/members")
      await member("Алексей Волков")
        .getByRole("button", { name: "Удалить доступ", exact: true })
        .click()
      await button("Прекратить доступ").click()
      await page
        .getByRole("status")
        .filter({ hasText: "Доступ участника к проекту прекращён." })
        .waitFor()
      await route("#/projects/sever/docs")
      await docRow("Договор_поставки_образец.docx")
        .getByText("Алексей Волков", { exact: true })
        .waitFor()
      await persona("Алексей Волков")
      await route(privateHash)
      await page
        .getByRole("heading", { name: "Проект недоступен", exact: true })
        .waitFor()
      await persona("Елена Крылова")
      await route("#/projects/sever/members")
      await button("Добавить участника").click()
      await page.getByLabel("Сотрудник организации").selectOption("alex")
      await page.getByLabel("Назначаемая роль").selectOption("editor")
      await button("Применить доступ").click()
      await member("Алексей Волков")
        .getByText("Редактор", { exact: true })
        .waitFor()
      await persona("Алексей Волков")
      await route(privateHash)
      await page
        .locator(".question-bubble")
        .getByText("Личный вопрос Алексея UI03", { exact: true })
        .waitFor()
    },
  )
  await check(
    "Org Admin manages membership metadata without reading content or assigning self",
    async () => {
      await persona("Олег Соколов")
      await page
        .getByRole("heading", { name: "У вас пока нет проектов", exact: true })
        .waitFor()
      await route("#/organization")
      assert.equal(await button("Пригласить сотрудника").isDisabled(), true)
      await page
        .locator(".org-project-row")
        .filter({ hasText: "Проект Север" })
        .click()
      await page
        .getByText("Административное управление без чтения содержимого", {
          exact: true,
        })
        .waitFor()
      assert.equal(await page.locator(".project-bar").count(), 0)
      await button("Добавить участника").click()
      assert.equal(
        await page
          .getByLabel("Сотрудник организации")
          .locator('option[value="oleg"]')
          .count(),
        0,
      )
      await button("Отмена").click()
      await member("Ирина Новикова")
        .getByRole("button", { name: "Изменить роль", exact: true })
        .click()
      await page.getByLabel("Назначаемая роль").selectOption("editor")
      await button("Применить доступ").click()
      await member("Ирина Новикова")
        .getByText("Редактор", { exact: true })
        .waitFor()
      await route("#/projects/sever/docs")
      await page
        .getByRole("heading", { name: "Проект недоступен", exact: true })
        .waitFor()
      assert.equal(await page.locator(".document-row").count(), 0)
    },
  )
  await check(
    "personal projects remain single-owner and pins do not leak between people",
    async () => {
      await persona("Елена Крылова")
      await route("#/projects/p-1/members")
      assert.equal(await page.locator(".membership-row").count(), 1)
      assert.equal(await button("Добавить участника").isDisabled(), true)
      await button("Главная").click()
      await page
        .getByRole("button", {
          name: "Закрепить проект Проект Север",
          exact: true,
        })
        .click()
      await persona("Дарья Смирнова")
      assert.equal(
        await page.getByText("Закреплённые · 1", { exact: true }).count(),
        0,
      )
    },
  )
  await check(
    "matching display names do not grant ownership of another employee's materials",
    async () => {
      await persona("Елена Крылова")
      await route("#/organization")
      await button("Пригласить сотрудника").click()
      await page.getByLabel("Email приглашения").fill("clone@example.test")
      await button("Создать приглашение").click()
      await button("Открыть как получатель (демо)").click()
      await page.getByLabel("Имя и фамилия").fill("Елена Крылова")
      await page.getByLabel("Новый пароль", { exact: true }).fill(password)
      await page.getByLabel("Повторите пароль").fill(password)
      await button("Создать аккаунт и принять приглашение").click()
      await page.locator(".home h1").waitFor()
      await persona("elena@example.test")
      await route("#/projects/sever/members")
      await button("Добавить участника").click()
      await page
        .getByLabel("Сотрудник организации")
        .selectOption({ label: "Елена Крылова · clone@example.test" })
      await page.getByLabel("Назначаемая роль").selectOption("editor")
      await button("Применить доступ").click()
      await page
        .locator(".membership-row")
        .filter({ hasText: "clone@example.test" })
        .getByText("Редактор", { exact: true })
        .waitFor()
      await persona("clone@example.test")
      await route("#/projects/sever/draft?draft=d1")
      assert.equal(await button("Удалить черновик").isDisabled(), true)
      await route("#/projects/sever/docs")
      await docRow("Договор_поставки_демо.docx")
        .locator(".document-main")
        .click()
      assert.equal(await button("Удалить").isDisabled(), true)
    },
  )
  await check(
    "invitation expiry during submission is rechecked before granting membership",
    async () => {
      await persona("elena@example.test")
      await route("#/organization")
      await button("Пригласить сотрудника").click()
      await page.getByLabel("Email приглашения").fill("race@example.test")
      await button("Создать приглашение").click()
      await button("Открыть как получатель (демо)").click()
      await page.getByLabel("Имя и фамилия").fill("Тестовый сотрудник")
      await page.getByLabel("Новый пароль", { exact: true }).fill(password)
      await page.getByLabel("Повторите пароль").fill(password)
      await page.locator(".auth-demo-states summary").click()
      await button("Создать аккаунт и принять приглашение").click()
      await button("Истечь сроку приглашения (демо)").click()
      await page.waitForTimeout(750)
      await page
        .getByRole("heading", {
          name: "Приглашение недействительно или истекло",
          exact: true,
        })
        .waitFor()
      assert.equal(await page.locator(".home").count(), 0)
      await button("Перейти ко входу").click()
      await login("elena@example.test", "NewSpectrum2!")
      await route("#/organization")
      await page
        .getByLabel("Поиск сотрудников организации")
        .fill("race@example.test")
      assert.equal(await page.locator(".org-person").count(), 0)
    },
  )
  await check("auth and member layouts fit agreed desktop widths", async () => {
    await persona("Елена Крылова")
    for (const width of [1280, 1440]) {
      await page.setViewportSize({ width, height: 1000 })
      await route("#/projects/sever/members")
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
        false,
      )
      await route("#/organization")
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
        false,
      )
    }
    await logout()
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    )
    assert.equal(await button("Зарегистрироваться").count(), 0)
  })
  assert.deepEqual(errors, [])
  console.log(`PASS ${checks} UI-03 scenario groups; no browser runtime errors`)
} catch (error) {
  console.error("Failure URL:", page.url())
  console.error((await page.locator("body").innerText()).slice(-8000))
  await page.screenshot({ path: "/tmp/neuro-ui03-failure.png", fullPage: true })
  throw error
} finally {
  await browser.close()
}
