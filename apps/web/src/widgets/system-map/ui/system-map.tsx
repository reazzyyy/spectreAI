import { SyntheticModeBanner } from "@/shared/ui";
import { ArchitectureDiagram } from "./architecture-diagram";
import styles from "./system-map.module.scss";

/**
 * Onboarding map of Spectre AS-IS for frontend-minded readers.
 * Static: reflects scaffold after Phase 2 S0–S4c; not a live status API.
 */
export function SystemMap() {
  return (
    <div className={styles.page}>
      <div className={styles.banner}>
        <SyntheticModeBanner />
      </div>

      <p className={styles.kicker}>Карта системы · scaffold</p>
      <h1 className={styles.title}>Что мы строим и что уже есть</h1>
      <p className={styles.lead}>
        Это не «готовый продукт», а каркас. Ниже — system design схема: блоки, стрелки,
        сценарии с анимацией потока. Потом — те же идеи текстом, без бэкендерского жаргона.
      </p>

      <ul className={styles.nav} aria-label="Разделы">
        <li>
          <a href="#diagram">Схема</a>
        </li>
        <li>
          <a href="#stack">Слои</a>
        </li>
        <li>
          <a href="#domain">Сущности</a>
        </li>
        <li>
          <a href="#journey">Путь запроса</a>
        </li>
        <li>
          <a href="#status">Что есть / будет</a>
        </li>
        <li>
          <a href="#roadmap">Дорожная карта</a>
        </li>
        <li>
          <a href="/">← На главную</a>
        </li>
      </ul>

      <section className={styles.section} aria-labelledby="legend-heading">
        <h2 id="legend-heading" className={styles.sectionTitle}>
          Легенда
        </h2>
        <ul className={styles.legend}>
          <li>
            <span className={`${styles.chip} ${styles.chipNow}`}>
              <span className={styles.chipDot} aria-hidden />
              Есть сейчас
            </span>
          </li>
          <li>
            <span className={`${styles.chip} ${styles.chipPartial}`}>
              <span className={styles.chipDot} aria-hidden />
              Частично
            </span>
          </li>
          <li>
            <span className={`${styles.chip} ${styles.chipLater}`}>
              <span className={styles.chipDot} aria-hidden />
              Потом
            </span>
          </li>
        </ul>
      </section>

      <section className={styles.section} id="diagram" aria-labelledby="diagram-heading">
        <h2 id="diagram-heading" className={styles.sectionTitle}>
          System design
        </h2>
        <p className={styles.sectionLead}>
          Классическая картинка «что с чем разговаривает». Runtime — живые процессы; Домен —
          сущности в БД; сценарии подсвечивают путь конкретного запроса.
        </p>
        <ArchitectureDiagram />
      </section>

      <section className={styles.section} id="stack" aria-labelledby="stack-heading">
        <h2 id="stack-heading" className={styles.sectionTitle}>
          Слои: как устроен «сайт»
        </h2>
        <p className={styles.sectionLead}>
          Фронт здесь — только витрина. Настоящие правила («можно ли смотреть это дело?»)
          живут на сервере. Браузер не считается доверенным — как и на любом нормальном
          продукте с чужими данными.
        </p>

        <ol className={styles.stack}>
          <li className={styles.stackItem}>
            <span className={styles.stackRank} aria-hidden>
              1
            </span>
            <div className={styles.stackBody}>
              <h3>
                Браузер{" "}
                <span className={`${styles.chip} ${styles.chipNow}`}>Есть</span>
              </h3>
              <p>
                Ты открываешь Next.js на порту 3001. Страницы: вход, «я в сессии», эта карта.
                Запросы к API идут на тот же origin: <code>/api/v1/…</code> — Next просто
                переписывает их на Nest (как прокси в nginx, только встроенный).
              </p>
            </div>
          </li>
          <li className={styles.stackArrow} aria-hidden>
            ↓ cookie сессии + CSRF-токен на «опасных» методах
          </li>
          <li className={styles.stackItem}>
            <span className={styles.stackRank} aria-hidden>
              2
            </span>
            <div className={styles.stackBody}>
              <h3>
                API (NestJS){" "}
                <span className={`${styles.chip} ${styles.chipNow}`}>Есть</span>
              </h3>
              <p>
                Порт 3000, префикс <code>/api/v1</code>. Здесь логин, клиенты, дела,
                пространства, приглашения. Каждый защищённый маршрут сначала понимает:
                «кто ты и из какой организации» — из cookie, не из того, что написал фронт
                в body.
              </p>
            </div>
          </li>
          <li className={styles.stackArrow} aria-hidden>
            ↓ проверка прав + контекст актёра в транзакции
          </li>
          <li className={styles.stackItem}>
            <span className={styles.stackRank} aria-hidden>
              3
            </span>
            <div className={styles.stackBody}>
              <h3>
                База (PostgreSQL){" "}
                <span className={`${styles.chip} ${styles.chipPartial}`}>Частично</span>
              </h3>
              <p>
                Prisma-модели и миграции. Дополнительно включён Row Level Security: даже если
                код ошибётся, БД не должна отдавать чужую организацию. Пока это «ограда по
                организации», не полная матрица прав на каждый документ.
              </p>
            </div>
          </li>
          <li className={styles.stackArrow} aria-hidden>
            ↓ очередь имени есть, обработчика нет
          </li>
          <li className={styles.stackItem}>
            <span className={styles.stackRank} aria-hidden>
              4
            </span>
            <div className={styles.stackBody}>
              <h3>
                Redis / очередь AI{" "}
                <span className={`${styles.chip} ${styles.chipPartial}`}>Частично</span>
              </h3>
              <p>
                Redis поднят локально. Очередь называется <code>ai-jobs</code>, но воркера,
                который бы брал задачи и гонял документы через ИИ, ещё нет. Это заготовка
                «розетка в стене без прибора».
              </p>
            </div>
          </li>
        </ol>
      </section>

      <section className={styles.section} id="domain" aria-labelledby="domain-heading">
        <h2 id="domain-heading" className={styles.sectionTitle}>
          Сущности: на каком языке говорит продукт
        </h2>
        <p className={styles.sectionLead}>
          Аналогия с фронтом: Organization — это «тенант / аккаунт компании». Внутри неё
          лежат справочники и рабочие пространства. Чужой UUID в URL не даёт доступа — как
          чужой id в REST без проверки на бэке.
        </p>

        <div className={styles.domain}>
          <article className={styles.domainCard}>
            <h3>
              Организация{" "}
              <span className={`${styles.chip} ${styles.chipNow}`}>Есть</span>
            </h3>
            <p>
              Юрлицо / команда в системе. Пользователь входит не «просто email», а email +
              пароль + id организации. Так мы не путаем людей из разных фирм.
            </p>
          </article>

          <article className={styles.domainCard}>
            <h3>
              Пользователь и членство{" "}
              <span className={`${styles.chip} ${styles.chipNow}`}>Есть</span>
            </h3>
            <p>
              Аккаунт + связь «я состою в этой организации». Без активного членства логин
              не пускает. Публичной регистрации нет: только bootstrap в dev и приглашения.
            </p>
          </article>

          <article className={styles.domainCard}>
            <h3>
              Клиент{" "}
              <span className={`${styles.chip} ${styles.chipNow}`}>Есть</span>
            </h3>
            <p>
              Контрагент бюро (компания или человек, для которого ведут дела). Список /
              создание / правка через API. Удаления «в ноль» пока нет.
            </p>
          </article>

          <article className={styles.domainCard}>
            <h3>
              Дело (Matter){" "}
              <span className={`${styles.chip} ${styles.chipNow}`}>Есть</span>
            </h3>
            <p>
              Конкретное дело внутри организации, привязано к клиенту. Можно связать с
              одним или несколькими пространствами (связь M:N).
            </p>
          </article>

          <article className={`${styles.domainCard} ${styles.wide}`}>
            <h3>
              Рабочее пространство (Workspace){" "}
              <span className={`${styles.chip} ${styles.chipPartial}`}>Частично</span>
            </h3>
            <p>
              Место, где потом будут чаты и документы. Сейчас: создать личное (PERSONAL),
              смотреть свои, участников, привязку дел. Командное (TEAM) создать через API
              пока нельзя — ждём отдельного решения «кто имеет право». UI списка пространств
              на фронте ещё нет (есть только API).
            </p>
          </article>

          <article className={styles.domainCard}>
            <h3>
              Приглашения{" "}
              <span className={`${styles.chip} ${styles.chipPartial}`}>Частично</span>
            </h3>
            <p>
              Owner организации может создать invite по API. В БД хранится хеш токена, не
              сам секрет. Письма наружу пока stub: в dev можно получить токен в ответе.
              Экрана «принять приглашение» на фронте нет.
            </p>
          </article>

          <article className={styles.domainCard}>
            <h3>
              Документы / чат / grant{" "}
              <span className={`${styles.chip} ${styles.chipLater}`}>Потом</span>
            </h3>
            <p>
              Загрузка файлов, OCR, чат в пространстве, временный доступ админа к контенту —
              следующие фазы roadmap. В схеме Prisma их ещё нет.
            </p>
          </article>
        </div>
      </section>

      <section className={styles.section} id="journey" aria-labelledby="journey-heading">
        <h2 id="journey-heading" className={styles.sectionTitle}>
          Путь запроса: «я логинюсь и прошу список пространств»
        </h2>
        <p className={styles.sectionLead}>
          Так же, как на фронте цепочка «форма → fetch → store», здесь цепочка
          «cookie → кто я → политика доступа → БД». Если на любом шаге «нет» — наружу
          одинаковый отказ, без подсказки «существует, но не твоё».
        </p>

        <ol className={styles.journey}>
          <li>
            <strong>POST /auth/login</strong>
            <span>
              Email, пароль, organizationId. Сервер проверяет хеш пароля и членство, кладёт
              HttpOnly cookie <code>spectre_sid</code> и CSRF-cookie. Фронт пароль дальше не
              хранит.
            </span>
          </li>
          <li>
            <strong>Каждый следующий запрос</strong>
            <span>
              Браузер сам шлёт cookie. Nest достаёт сессию, собирает «актёра» (userId +
              organizationId). Подставить чужую организацию в теле запроса бесполезно —
              её игнорируют.
            </span>
          </li>
          <li>
            <strong>CSRF на мутациях</strong>
            <span>
              POST/PATCH/DELETE (кроме самого login) ждут заголовок{" "}
              <code>X-CSRF-Token</code> = значение cookie. Плюс Origin из allowlist. Это
              защита от «злой сайт заставил твой браузер дернуть наш API».
            </span>
          </li>
          <li>
            <strong>Политика доступа (@spectre/access)</strong>
            <span>
              Общий пакет правил: Client/Matter — в рамках своей org; Workspace — только то,
              что тебе видно по роли. Org Admin может управлять участниками пространства, но
              не читать чужой контент «просто потому что админ».
            </span>
          </li>
          <li>
            <strong>Ответ наружу</strong>
            <span>
              Успех — данные. Чужой id — обычно <code>404</code>, кривой ввод —{" "}
              <code>422</code>, без сессии — <code>401</code>. Ошибки в одном JSON-формате с
              кодом, без стектрейса.
            </span>
          </li>
        </ol>

        <p className={styles.callout}>
          Про ИИ: эндпоинт <code>POST /ai/generate</code> есть, но это Synthetic — эхо без
          сети и без OpenAI. Реальные документы туда слать нельзя, пока не закроют правовой
          блок (O-002). Для UI достаточно помнить: сейчас «режим синтетики», не прод-модель.
        </p>
      </section>

      <section className={styles.section} id="status" aria-labelledby="status-heading">
        <h2 id="status-heading" className={styles.sectionTitle}>
          Сводка для фронтендера
        </h2>
        <p className={styles.sectionLead}>
          Что можно опираться в UI уже сейчас, а где рано рисовать экраны.
        </p>

        <ul className={styles.statusList}>
          <li className={styles.statusRow}>
            <span className={`${styles.chip} ${styles.chipNow}`}>Есть</span>
            <p>
              Login / me / logout UI. Cookie-сессия. API клиентов, дел, персональных
              пространств, участников, связей дело↔пространство, приглашений (API). CSRF на
              mutating fetch уже учтён в shared client.
            </p>
          </li>
          <li className={styles.statusRow}>
            <span className={`${styles.chip} ${styles.chipPartial}`}>Частично</span>
            <p>
              Workspace без TEAM-create и без экранов. RLS «по организации», не полный ACL
              контента. Invite без email-провайдера и без accept-UI. AI без воркера и без
              auth на <code>/ai/*</code> (долг).
            </p>
          </li>
          <li className={styles.statusRow}>
            <span className={`${styles.chip} ${styles.chipLater}`}>Потом</span>
            <p>
              Загрузка файлов, OCR, очередь с воркером, чат, поиск, черновики, admin grant,
              удаление по D-019, MFA/SSO, production в РФ, настоящий OpenAI.
            </p>
          </li>
        </ul>
      </section>

      <section className={styles.section} id="roadmap" aria-labelledby="roadmap-heading">
        <h2 id="roadmap-heading" className={styles.sectionTitle}>
          Куда едем (упрощённо)
        </h2>
        <p className={styles.sectionLead}>
          Фазы из <code>tasks/roadmap.md</code>. Сейчас закрываем контур «пространство и
          членство»; дальше — файлы и обработка.
        </p>

        <ul className={styles.phases}>
          <li className={`${styles.phase} ${styles.phaseNow}`}>
            <strong>0–1 · Каркас и вход</strong>
            <span>Монорепо, сессия, login UI — сделано.</span>
          </li>
          <li className={`${styles.phase} ${styles.phasePartial}`}>
            <strong>2 · Пространство и членство</strong>
            <span>
              S0–S4c в main: схема, доступ, HTTP Workspace, CSRF, bootstrap, invitations API.
              Ещё: дотянуть RLS-тесты, решить TEAM create, UI пространств.
            </span>
          </li>
          <li className={`${styles.phase} ${styles.phaseLater}`}>
            <strong>3–4 · Файлы и воркер</strong>
            <span>Приём PDF/DOCX/TXT, приватное хранение, извлечение текста, AIJob.</span>
          </li>
          <li className={`${styles.phase} ${styles.phaseLater}`}>
            <strong>5–8 · Чат, поиск, черновики</strong>
            <span>Сначала Synthetic-чат в пространстве; поиск и research — следом.</span>
          </li>
          <li className={`${styles.phase} ${styles.phaseLater}`}>
            <strong>9–12 · Grant, удаление, аудит, прод</strong>
            <span>Временный доступ админа, purge, хостинг в РФ — после правовых ворот.</span>
          </li>
        </ul>
      </section>

      <p className={styles.footerNote}>
        Источник фактов: <code>docs/26-codebase-current-state.md</code> (AS-IS после merge
        S4c). Если карта и код разойдутся — верь AS-IS и правь эту страницу в том же PR, где
        меняется поведение.
      </p>
    </div>
  );
}
