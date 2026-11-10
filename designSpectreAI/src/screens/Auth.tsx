import { useState } from "react"
import { useApp } from "../app-context"
import { DEMO_PASSWORD, organizations } from "../data/identity"
import { Icon } from "../components/ui"

export function AuthScreen() {
  const ctx = useApp()
  const id = ctx.identity
  const view = ctx.route.authView ?? "login"
  const token = ctx.route.token ?? ""
  const invite = id.invitations.find((i) => i.id === token)
  const reset = id.resets.find((r) => r.id === token)
  const known = id.people.find((p) => p.email === invite?.email)
  const [email, setEmail] = useState(invite?.email ?? "")
  const [name, setName] = useState("")
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [sentId, setSentId] = useState("")
  const [mailOpen, setMailOpen] = useState(false)
  const [done, setDone] = useState(false)
  const [networkError, setNetworkError] = useState(false)
  const inviteValid =
    invite?.status === "pending" && invite.expiresAt > Date.now()
  const resetValid = !!reset && !reset.used && reset.expiresAt > Date.now()
  const needsNewPassword = view === "reset" || (view === "invite" && !known)
  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (busy) return
    setError("")
    if (
      (view === "login" || view === "forgot") &&
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
    ) {
      setError("Укажите корректный email.")
      return
    }
    if (
      needsNewPassword &&
      (password.length < 8 ||
        confirm !== password ||
        (view === "invite" && !name.trim()))
    ) {
      setError(
        view === "invite" && !name.trim()
          ? "Укажите имя и фамилию."
          : password.length < 8
            ? "Для демонстрации используйте пароль от 8 символов."
            : "Пароли не совпадают.",
      )
      return
    }
    if ((view === "login" || (view === "invite" && known)) && !password) {
      setError("Введите демонстрационный пароль.")
      return
    }
    setBusy(true)
    await new Promise((r) => setTimeout(r, 550))
    if (networkError) {
      setBusy(false)
      setError(
        "Сервис временно недоступен. Данные формы сохранены в этой странице — повторите попытку.",
      )
      return
    }
    if (view === "login") {
      const personId = id.authenticate(email, password)
      if (personId) ctx.login(personId)
      else
        setError(
          "Не удалось войти. Проверьте email и пароль или восстановите доступ.",
        )
    } else if (view === "forgot") {
      setSentId(id.requestReset(email))
    } else if (view === "reset") {
      if (id.completeReset(token, password)) {
        setPassword("")
        setConfirm("")
        setDone(true)
      } else setError("Ссылка недействительна. Запросите новую.")
    } else if (invite) {
      const existingId = known
        ? id.authenticate(invite.email, password)
        : undefined
      if (known && !existingId)
        setError(
          "Не удалось подтвердить аккаунт. Используйте email приглашения и корректный пароль.",
        )
      else {
        const personId = id.acceptInvitation(token, name, password, existingId)
        if (personId) ctx.finishInvite()
        else setError("Приглашение больше недействительно. Запросите новое.")
      }
    }
    setBusy(false)
  }
  const fillDemo = () => {
    setEmail(invite?.email ?? "elena@example.test")
    setPassword(DEMO_PASSWORD)
    setConfirm(DEMO_PASSWORD)
    setName("Ирина Новикова")
    setError("")
  }
  const heading =
    view === "invite"
      ? known
        ? "Принять приглашение"
        : "Присоединиться к команде"
      : view === "forgot"
        ? sentId
          ? "Проверьте почту"
          : "Восстановить доступ"
        : view === "reset"
          ? done
            ? "Пароль обновлён"
            : "Новый пароль"
          : "Войти в Спектр"
  const invalid =
    (view === "invite" && !inviteValid) ||
    (view === "reset" && !resetValid && !done)
  return (
    <div className="auth-layout">
      <aside className="auth-story">
        <div className="auth-brand">
          <span className="brand-mark">С</span>
          <strong>НейроЮрист Спектр</strong>
        </div>
        <div className="auth-story-content">
          <div className="eyebrow">Юридическая работа · единый контекст</div>
          <h1>
            От материалов дела
            <br />к проверяемой позиции.
          </h1>
          <p>
            Документы, исследования и черновики — в проекте. Доступ к каждому
            рабочему контексту назначается отдельно.
          </p>
          <div className="auth-context-diagram">
            <div>
              <Icon name="users" size={19} />
              <span>Организация</span>
              <small>Сотрудники и политики</small>
            </div>
            <Icon name="chevron" size={16} />
            <div>
              <Icon name="folder" size={19} />
              <span>Проект</span>
              <small>Участники и материалы</small>
            </div>
          </div>
          <div className="auth-security-note">
            <Icon name="lock" size={17} />
            <p>
              Членство в организации и административная роль не дают
              автоматического доступа к содержимому проектов.
            </p>
          </div>
        </div>
        <p className="auth-story-footer">
          Светлая рабочая среда для российских юридических команд
        </p>
      </aside>
      <main className="auth-main">
        <span className="demo-tag">UX-макет · без реальной авторизации</span>
        <div className="auth-card">
          <div className="eyebrow">
            {view === "invite"
              ? "Вход по приглашению"
              : "Рабочее пространство команды"}
          </div>
          <h2>{heading}</h2>
          {view === "login" && id.session === "expired" && (
            <div className="auth-notice" role="alert">
              <Icon name="lock" size={17} />
              <div>
                <strong>Сессия истекла</strong>
                <p>
                  Войдите заново. После входа откроется Главная, не прежний
                  объект. Несохранённый ввод не восстанавливается из
                  небезопасного кэша.
                </p>
              </div>
            </div>
          )}
          {view === "login" && id.session === "revoked" && (
            <p className="form-error">
              Доступ к организации прекращён. Материалы недоступны.
            </p>
          )}
          {invalid ? (
            <div className="auth-result">
              <span className="state-icon">
                <Icon name="warning" size={24} />
              </span>
              <h3>
                {view === "invite"
                  ? invite?.status === "accepted"
                    ? "Приглашение уже принято"
                    : invite?.status === "revoked"
                      ? "Приглашение отозвано"
                      : "Приглашение недействительно или истекло"
                  : "Ссылка недействительна или истекла"}
              </h3>
              <p>
                Доступ не предоставлен.{" "}
                {view === "invite"
                  ? "Обратитесь к отправителю за новым приглашением."
                  : "Запросите новую ссылку восстановления."}
              </p>
              {view === "invite" && invite && invite.status !== "accepted" && (
                <button
                  className="button primary"
                  onClick={() => id.requestInvitation(invite.id)}
                >
                  {invite.requested
                    ? "Запрос отмечен в макете"
                    : "Запросить новое приглашение"}
                </button>
              )}
              <button
                className="button"
                onClick={() =>
                  ctx.openAuth(view === "reset" ? "forgot" : "login")
                }
              >
                {view === "reset"
                  ? "Запросить новую ссылку"
                  : "Перейти ко входу"}
              </button>
              <p className="help">
                Письма и запросы в этой демонстрации не отправляются.
              </p>
            </div>
          ) : view === "reset" && done ? (
            <div className="auth-result">
              <span className="state-icon accent">
                <Icon name="check" size={24} />
              </span>
              <p>
                Демонстрационный пароль изменён в памяти макета. Теперь войдите
                с новым паролем.
              </p>
              <button
                className="button primary"
                onClick={() => ctx.openAuth("login")}
              >
                Перейти ко входу
              </button>
            </div>
          ) : view === "forgot" && sentId ? (
            <div className="auth-result">
              <p>
                Если аккаунт с указанным email существует, на него отправляются
                инструкции. Ссылка действует 1 час.
              </p>
              <div className="auth-demo-mail">
                <Icon name="file" size={20} />
                <div>
                  <strong>Образец письма восстановления</strong>
                  <p>{email}</p>
                  <small>Реальная почта не подключена</small>
                </div>
              </div>
              {mailOpen && (
                <div className="auth-mail-body">
                  <strong>Восстановление доступа в Спектр</strong>
                  <p>
                    Для установки нового пароля перейдите по ссылке. Не
                    передавайте её другим людям.
                  </p>
                  <button
                    className="button primary"
                    onClick={() => ctx.openAuth("reset", sentId)}
                  >
                    Открыть ссылку из демописьма
                  </button>
                </div>
              )}
              <button className="button" onClick={() => setMailOpen(!mailOpen)}>
                {mailOpen ? "Скрыть образец письма" : "Показать образец письма"}
              </button>
              <button
                className="text-action"
                onClick={() => {
                  setSentId("")
                  setMailOpen(false)
                }}
              >
                Отправить запрос ещё раз
              </button>
              <button
                className="text-action"
                onClick={() => ctx.openAuth("login")}
              >
                Назад ко входу
              </button>
            </div>
          ) : (
            <form
              className="auth-form"
              onSubmit={submit}
              noValidate
              aria-busy={busy}
            >
              {view === "invite" ? (
                <>
                  <p className="auth-intro">
                    Организация{" "}
                    <strong>
                      {organizations.find((o) => o.id === invite?.orgId)?.name}
                    </strong>{" "}
                    приглашает вас стать сотрудником. Назначение в TEAM-проект
                    выполняется отдельно.
                  </p>
                  <div className="invite-identity">
                    <Icon name="user" size={20} />
                    <div>
                      <strong>{invite?.email}</strong>
                      <small>
                        {known
                          ? "Подтвердите существующий аккаунт"
                          : "Email подтверждается принятием приглашения"}
                      </small>
                    </div>
                  </div>
                  {!known && (
                    <label className="field">
                      <span>Имя и фамилия</span>
                      <input
                        aria-label="Имя и фамилия"
                        value={name}
                        maxLength={100}
                        disabled={busy}
                        onChange={(e) => setName(e.target.value)}
                        autoComplete="name"
                      />
                    </label>
                  )}
                </>
              ) : (
                <>
                  <p className="auth-intro">
                    {view === "forgot"
                      ? "Введите email. Ответ не раскрывает, существует ли такая учётная запись."
                      : view === "reset"
                        ? "Ссылка одноразовая и действует 1 час. После смены пароля потребуется новый вход."
                        : "Используйте аккаунт своей организации. Свободной регистрации в MVP нет."}
                  </p>
                  {view !== "reset" && (
                    <label className="field">
                      <span>Рабочий email</span>
                      <input
                        type="email"
                        aria-label="Рабочий email"
                        value={email}
                        disabled={busy}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="name@example.test"
                        autoComplete="username"
                      />
                    </label>
                  )}
                </>
              )}
              {view !== "forgot" && (
                <label className="field">
                  <span>{needsNewPassword ? "Новый пароль" : "Пароль"}</span>
                  <div className="password-field">
                    <input
                      aria-label={needsNewPassword ? "Новый пароль" : "Пароль"}
                      type={showPassword ? "text" : "password"}
                      value={password}
                      disabled={busy}
                      onChange={(e) => setPassword(e.target.value)}
                      autoComplete={
                        needsNewPassword ? "new-password" : "current-password"
                      }
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                    >
                      {showPassword ? "Скрыть" : "Показать"}
                    </button>
                  </div>
                </label>
              )}
              {needsNewPassword && (
                <label className="field">
                  <span>Повторите пароль</span>
                  <input
                    aria-label="Повторите пароль"
                    type="password"
                    value={confirm}
                    disabled={busy}
                    onChange={(e) => setConfirm(e.target.value)}
                    autoComplete="new-password"
                  />
                </label>
              )}
              {view === "login" && (
                <button
                  className="text-action auth-forgot"
                  type="button"
                  onClick={() => ctx.openAuth("forgot")}
                >
                  Забыли пароль?
                </button>
              )}
              {error && (
                <p className="form-error" role="alert">
                  {error}
                </p>
              )}
              <button
                className="button primary auth-submit"
                type="submit"
                disabled={busy}
              >
                {busy
                  ? "Обрабатываем…"
                  : view === "login"
                    ? "Войти"
                    : view === "forgot"
                      ? "Получить инструкции"
                      : view === "reset"
                        ? "Обновить пароль"
                        : known
                          ? "Войти и принять приглашение"
                          : "Создать аккаунт и принять приглашение"}
                <Icon name="arrow" size={16} />
              </button>
              {view !== "login" && (
                <button
                  type="button"
                  className="text-action"
                  onClick={() => ctx.openAuth("login")}
                >
                  Назад ко входу
                </button>
              )}
              <div className="auth-demo-tools">
                <p>
                  Макет: вводите только тестовые данные. Пароли не передаются на
                  сервер и сбрасываются при перезагрузке.
                </p>
                <button
                  type="button"
                  className="text-action"
                  onClick={fillDemo}
                >
                  Заполнить демоданные
                </button>
              </div>
            </form>
          )}
          <details className="work-demo-details auth-demo-states">
            <summary>Демонстрационные сценарии</summary>
            {view === "login" && (
              <>
                <label className="field">
                  <span>Демоаккаунт</span>
                  <select
                    aria-label="Демоаккаунт для входа"
                    onChange={(e) => {
                      setEmail(e.target.value)
                      setPassword(DEMO_PASSWORD)
                    }}
                    value={
                      id.people.some((p) => p.email === email) ? email : ""
                    }
                  >
                    <option value="">Выберите сотрудника</option>
                    {id.people.map((p) => (
                      <option key={p.id} value={p.email}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  className="text-action"
                  onClick={() => ctx.openAuth("invite", "invite-irina")}
                >
                  Открыть демоприглашение
                </button>
                <button
                  className="text-action"
                  onClick={() => ctx.openAuth("invite", "invite-existing")}
                >
                  Приглашение существующему аккаунту
                </button>
              </>
            )}
            <label className="demo-check">
              <input
                type="checkbox"
                checked={networkError}
                onChange={(e) => setNetworkError(e.target.checked)}
              />
              Ошибка сервиса при отправке
            </label>
            {view === "invite" && invite && invite.status === "pending" && (
              <button
                className="text-action"
                onClick={() => id.expireInvitation(invite.id)}
              >
                Истечь сроку приглашения (демо)
              </button>
            )}
            {view === "reset" && reset && !reset.used && (
              <button
                className="text-action"
                onClick={() => id.expireReset(reset.id)}
              >
                Истечь сроку ссылки (демо)
              </button>
            )}
          </details>
        </div>
        <p className="auth-main-footer">
          <Icon name="lock" size={13} />
          Только демонстрация UX. Не является системой аутентификации.
        </p>
      </main>
    </div>
  )
}
