# HYP-01 — приоритетная очередь по клиентской ценности

**Основание:** пользователь согласился с гипотезой и поручил применить её. Частота и ценность ниже — продуктовые гипотезы, а не статистика использования. Этот документ задаёт порядок дальнейшей проработки, не меняет REG-07, права и границы MVP.

**Ближайший пакет: P0-A (быстрая проверка предпосылок) → P0-B / P0-C — ревизия и доведение Documents → Chat → источники.** Проектный grant больше не является следующим пакетом по умолчанию.

**Продолжение UI-10:** [выбранный scope, фрагменты и безопасность продолжения](neurojurist-spectrum-ui10.md#coverage). Текущий счётчик — 79 «В работе», не «Готово». Шесть карточек получили адресную сверку; JOB-07 остаётся неполным вне живой вкладки. Далее — остаточные JOB-ветви и RAG-08/10 по покарточной проверке, не расширение grant.

**Исторический срез UI-09:** [три остатка UI-08 и границы](neurojurist-spectrum-ui09.md). На этом срезе было 73 «В работе», не «Готово». Приоритетные назначения всех 174 ID не менялись. Дальше — покарточная сверка P0, не автоматический переход к P3. Срезы 62/70 ниже относятся к предыдущим пакетам.

**Продолжение UI-08:** [первый пакет P0-исправлений и остатки](neurojurist-spectrum-ui08.md). Восемь выбранных карточек актуализированы как «В работе»; теперь 70, не «готово». Назначения приоритетов и исходные ID ниже не менялись. Срез 62 рабочих карточек в описании HYP-01 — исторический результат приоритизации, не текущий счётчик после UI-08.

## Как применять

- Исходные 174 ID, названия, якоря и статусы [реестра](neurojurist-spectrum-flow-register.md) сохранены. У каждой карточки добавлено независимое поле «Приоритет HYP-01»; ниже — индекс всех карточек в порядке очереди. Порядок блоков каталога не выдаётся за приоритет.
- Приоритет не означает готовность. Прежние **62 карточки «В работе»**, 112 без полной покарточной приёмки; статусы не повышаются этим пакетом. Это не процент готовности.
- Берём небольшую связанную цепочку, проверяем текущую реализацию и остаточные ветви, затем устраняем конкретные пробелы. Не начинаем заново уже проверенные экраны и не увеличиваем число параллельных административных поверхностей ради покрытия списка.
- Критерии: ценность результата, предполагаемая частота, последствия ошибки и зависимости. Числовые оценки частоты, выдуманные интервью и аналитика не используются.
- P0-S — сквозная проверка в текущем рабочем пакете, а не требование сначала переделать все системные экраны. Сохранение существующего Draft не должно терять текст, даже пока расширение Draft стоит в P1.
- **Дефект доступа, PRIVATE/PERSONAL, отзыва источников, потери данных или обязательного security-аудита повышается в P0 немедленно**, независимо от базового приоритета карточки. Нельзя откладывать защиту grant до P3, если grant уже существует.
- P3 откладывает расширение редких интерфейсов, не отменяет их правила, действующие ограничения и обязательную безопасность. Если карточка нужна как зависимость P0/P1, её минимально необходимая часть поднимается вместе с зависимостью с явным основанием.
- Приоритеты не отменяют утверждённые модули. AUTH-05 остаётся вне публичного MVP, RES-12 и DRF-11 — отложенным экспортом; они сохранены **вне текущей очереди**, не помечены как выполненные.
- Только синтетический UX/UI-макет. Backend, реальные AI, email, хранилище и физическое удаление не подключаются.

## Уровни

| Приоритет | Что получает клиент | Порядок |
|---|---|---|
| P0 | Доступный проект → документ → обработка → вопрос → проверяемый ответ и источник → продолжение; сквозная безопасность и сохранность | Сначала |
| P1 | Рабочий текст Draft/Review, затем проверяемый Research | После основных пробелов P0 |
| P2 | Организация регулярной работы, команда, справочники и вспомогательные настройки | После P0/P1; необходимые зависимости поднимаются раньше |
| P3 | Расширение административных исключений, grant, lifecycle и org-настроек | Позже; критические дефекты защиты не ждут этой очереди |
| Вне очереди | Исключённый публичный bootstrap и отложенный экспорт | Не возвращать в MVP без отдельного решения |

## Рабочие пакеты и гипотезы

Порядок внутри уровня — управленческая гипотеза, не вычисленный рейтинг. Относительная частота Draft и Research должна пересматриваться по наблюдениям за реальными клиентами. Код пакета — служебная группировка, не новый ID пользовательского сценария.

<a id="p0-a"></a>

### P0-A · P0 — Вход и доступный проект

- **Частота (гипотеза):** высокая / при входе.
- **Ценность:** доступ к основной работе.
- **Риск:** блокировка входа или неверный tenant.
- **Зависимости:** контролируемое приглашение/аккаунт и корректный tenant; проверять пробелы, не пересоздавать существующий вход.

| ID | Сценарий | Карточка |
|---|---|---|
| AUTH-01 | Вход в систему | [Открыть](neurojurist-spectrum-flow-register.md#auth-01) |
| AUTH-02 | Неверные данные авторизации | [Открыть](neurojurist-spectrum-flow-register.md#auth-02) |
| AUTH-03 | Восстановление пароля | [Открыть](neurojurist-spectrum-flow-register.md#auth-03) |
| AUTH-07 | Истёкшее или отозванное приглашение | [Открыть](neurojurist-spectrum-flow-register.md#auth-07) |
| AUTH-08 | Истёкшая сессия | [Открыть](neurojurist-spectrum-flow-register.md#auth-08) |
| AUTH-09 | Выход из аккаунта | [Открыть](neurojurist-spectrum-flow-register.md#auth-09) |
| DASH-01 | Первый вход в приложение | [Открыть](neurojurist-spectrum-flow-register.md#dash-01) |
| DASH-02 | Повторный вход | [Открыть](neurojurist-spectrum-flow-register.md#dash-02) |
| DASH-03 | Пустое состояние Dashboard | [Открыть](neurojurist-spectrum-flow-register.md#dash-03) |
| DASH-04 | Быстрый переход к недавнему проекту | [Открыть](neurojurist-spectrum-flow-register.md#dash-04) |
| WS-01 | Создание личного Workspace | [Открыть](neurojurist-spectrum-flow-register.md#ws-01) |
| WS-03 | Открытие Workspace | [Открыть](neurojurist-spectrum-flow-register.md#ws-03) |
| WS-06 | Переключение между Workspace | [Открыть](neurojurist-spectrum-flow-register.md#ws-06) |
| CRM-03 | Создание Workspace без Client | [Открыть](neurojurist-spectrum-flow-register.md#crm-03) |
| E2E-01 | Первый вход и начало работы | [Открыть](neurojurist-spectrum-flow-register.md#e2e-01) |

<a id="p0-b"></a>

### P0-B · P0 — Документы и обработка

- **Частота (гипотеза):** высокая.
- **Ценность:** начало работы с собственным документом.
- **Риск:** блокировка или непонятный результат обработки.
- **Зависимости:** доступный проект P0-A; идти вместе с P0-S.

| ID | Сценарий | Карточка |
|---|---|---|
| DOC-01 | Открытие библиотеки | [Открыть](neurojurist-spectrum-flow-register.md#doc-01) |
| DOC-02 | Загрузка одного документа | [Открыть](neurojurist-spectrum-flow-register.md#doc-02) |
| DOC-04 | Неподдерживаемый формат | [Открыть](neurojurist-spectrum-flow-register.md#doc-04) |
| DOC-05 | Превышение размера | [Открыть](neurojurist-spectrum-flow-register.md#doc-05) |
| DOC-06 | Просмотр карточки документа | [Открыть](neurojurist-spectrum-flow-register.md#doc-06) |
| DOC-07 | Просмотр документа | [Открыть](neurojurist-spectrum-flow-register.md#doc-07) |
| DOC-08 | Поиск документа | [Открыть](neurojurist-spectrum-flow-register.md#doc-08) |
| DOC-11 | Повторная обработка | [Открыть](neurojurist-spectrum-flow-register.md#doc-11) |
| DOC-13 | Обработка документа в фоне | [Открыть](neurojurist-spectrum-flow-register.md#doc-13) |
| DOC-14 | Ошибка OCR или извлечения текста | [Открыть](neurojurist-spectrum-flow-register.md#doc-14) |
| DOC-15 | Повторная загрузка того же файла | [Открыть](neurojurist-spectrum-flow-register.md#doc-15) |
| E2E-08 | Ошибка обработки документа | [Открыть](neurojurist-spectrum-flow-register.md#e2e-08) |

<a id="p0-c"></a>

### P0-C · P0 — Chat и проверяемые источники

- **Частота (гипотеза):** высокая.
- **Ценность:** получение, проверка и продолжение ответа.
- **Риск:** недостоверный контекст, источник или невозможность продолжить.
- **Зависимости:** готовые/явно неготовые материалы P0-B, актуальные версии и ACL; идти вместе с P0-S.

| ID | Сценарий | Карточка |
|---|---|---|
| CHAT-01 | Создание нового чата в Workspace | [Открыть](neurojurist-spectrum-flow-register.md#chat-01) |
| CHAT-03 | Продолжение существующего чата | [Открыть](neurojurist-spectrum-flow-register.md#chat-03) |
| CHAT-06 | Прикрепление документа к сообщению | [Открыть](neurojurist-spectrum-flow-register.md#chat-06) |
| CHAT-07 | Запрос на анализ документа | [Открыть](neurojurist-spectrum-flow-register.md#chat-07) |
| CHAT-08 | Уточнение ответа | [Открыть](neurojurist-spectrum-flow-register.md#chat-08) |
| CHAT-09 | Ссылки на источники в ответе | [Открыть](neurojurist-spectrum-flow-register.md#chat-09) |
| CHAT-10 | Копирование ответа | [Открыть](neurojurist-spectrum-flow-register.md#chat-10) |
| CHAT-11 | Повторная генерация | [Открыть](neurojurist-spectrum-flow-register.md#chat-11) |
| CHAT-12 | Остановка генерации | [Открыть](neurojurist-spectrum-flow-register.md#chat-12) |
| CHAT-13 | Редактирование своего сообщения | [Открыть](neurojurist-spectrum-flow-register.md#chat-13) |
| CHAT-15 | Личный чат внутри командного Workspace | [Открыть](neurojurist-spectrum-flow-register.md#chat-15) |
| CHAT-16 | Переключение контекста чата | [Открыть](neurojurist-spectrum-flow-register.md#chat-16) |
| CHAT-17 | Запрос без достаточного контекста | [Открыть](neurojurist-spectrum-flow-register.md#chat-17) |
| CHAT-18 | Недостаточно прав на источник | [Открыть](neurojurist-spectrum-flow-register.md#chat-18) |
| RAG-01 | Вопрос по всем доступным документам Workspace | [Открыть](neurojurist-spectrum-flow-register.md#rag-01) |
| RAG-02 | Поиск по конкретному документу | [Открыть](neurojurist-spectrum-flow-register.md#rag-02) |
| RAG-03 | Поиск по нескольким выбранным документам | [Открыть](neurojurist-spectrum-flow-register.md#rag-03) |
| RAG-04 | Просмотр источника ответа | [Открыть](neurojurist-spectrum-flow-register.md#rag-04) |
| RAG-05 | Отсутствие подходящих документов | [Открыть](neurojurist-spectrum-flow-register.md#rag-05) |
| RAG-06 | Изменение документа после индексации | [Открыть](neurojurist-spectrum-flow-register.md#rag-06) |
| RAG-07 | Изменение прав доступа | [Открыть](neurojurist-spectrum-flow-register.md#rag-07) |
| RAG-08 | Частично доступные результаты | [Открыть](neurojurist-spectrum-flow-register.md#rag-08) |
| RAG-09 | Просмотр найденных фрагментов | [Открыть](neurojurist-spectrum-flow-register.md#rag-09) |
| RAG-10 | Индексация документа ещё не завершена | [Открыть](neurojurist-spectrum-flow-register.md#rag-10) |
| E2E-02 | Работа с юридическим документом | [Открыть](neurojurist-spectrum-flow-register.md#e2e-02) |

<a id="p0-s"></a>

### P0-S · P0 — Сквозная безопасность и сохранность

- **Частота (гипотеза):** по действию / исключению.
- **Ценность:** права, сохранность работы и понятные состояния.
- **Риск:** утечка, потеря работы или ложный успех.
- **Зависимости:** проверяется во всех остальных пакетах по месту использования, а не после них.

| ID | Сценарий | Карточка |
|---|---|---|
| MEM-05 | Просмотр Workspace пользователем VIEWER | [Открыть](neurojurist-spectrum-flow-register.md#mem-05) |
| MEM-06 | Работа EDITOR | [Открыть](neurojurist-spectrum-flow-register.md#mem-06) |
| DRF-07 | Сохранение документа | [Открыть](neurojurist-spectrum-flow-register.md#drf-07) |
| DRF-08 | Автосохранение | [Открыть](neurojurist-spectrum-flow-register.md#drf-08) |
| DRF-13 | Ошибка сохранения | [Открыть](neurojurist-spectrum-flow-register.md#drf-13) |
| JOB-01 | Запуск AI-задачи | [Открыть](neurojurist-spectrum-flow-register.md#job-01) |
| JOB-02 | Задача начала выполняться | [Открыть](neurojurist-spectrum-flow-register.md#job-02) |
| JOB-03 | Успешное выполнение | [Открыть](neurojurist-spectrum-flow-register.md#job-03) |
| JOB-04 | Ошибка выполнения | [Открыть](neurojurist-spectrum-flow-register.md#job-04) |
| JOB-05 | Отмена задачи | [Открыть](neurojurist-spectrum-flow-register.md#job-05) |
| JOB-06 | Превышение времени | [Открыть](neurojurist-spectrum-flow-register.md#job-06) |
| JOB-07 | Повторный вход во время обработки | [Открыть](neurojurist-spectrum-flow-register.md#job-07) |
| JOB-08 | Частичный результат | [Открыть](neurojurist-spectrum-flow-register.md#job-08) |
| JOB-09 | Повторная обработка | [Открыть](neurojurist-spectrum-flow-register.md#job-09) |
| JOB-10 | Недоступность AI-провайдера | [Открыть](neurojurist-spectrum-flow-register.md#job-10) |
| SEC-12 | Попытка доступа без разрешения | [Открыть](neurojurist-spectrum-flow-register.md#sec-12) |
| SEC-13 | Удаление сотрудника и отзыв доступа | [Открыть](neurojurist-spectrum-flow-register.md#sec-13) |
| SYS-01 | Загрузка страницы | [Открыть](neurojurist-spectrum-flow-register.md#sys-01) |
| SYS-02 | Нет данных | [Открыть](neurojurist-spectrum-flow-register.md#sys-02) |
| SYS-03 | Ошибка сервера | [Открыть](neurojurist-spectrum-flow-register.md#sys-03) |
| SYS-04 | Нет подключения к интернету | [Открыть](neurojurist-spectrum-flow-register.md#sys-04) |
| SYS-05 | Нет прав | [Открыть](neurojurist-spectrum-flow-register.md#sys-05) |
| SYS-06 | Сессия истекла | [Открыть](neurojurist-spectrum-flow-register.md#sys-06) |
| SYS-07 | Запрос выполняется | [Открыть](neurojurist-spectrum-flow-register.md#sys-07) |
| SYS-08 | Запрос завершён | [Открыть](neurojurist-spectrum-flow-register.md#sys-08) |
| SYS-09 | Запрос завершился ошибкой | [Открыть](neurojurist-spectrum-flow-register.md#sys-09) |
| SYS-10 | Превышено время выполнения | [Открыть](neurojurist-spectrum-flow-register.md#sys-10) |
| SYS-11 | Нет результатов поиска | [Открыть](neurojurist-spectrum-flow-register.md#sys-11) |
| SYS-12 | Частичный результат | [Открыть](neurojurist-spectrum-flow-register.md#sys-12) |
| SYS-13 | Конфликт сохранения | [Открыть](neurojurist-spectrum-flow-register.md#sys-13) |
| SYS-14 | Действие необратимо | [Открыть](neurojurist-spectrum-flow-register.md#sys-14) |
| SYS-15 | Действие невозможно | [Открыть](neurojurist-spectrum-flow-register.md#sys-15) |
| SYS-16 | Недоступный источник | [Открыть](neurojurist-spectrum-flow-register.md#sys-16) |
| SYS-17 | Обработка ещё не завершена | [Открыть](neurojurist-spectrum-flow-register.md#sys-17) |
| SYS-18 | Доступ отозван | [Открыть](neurojurist-spectrum-flow-register.md#sys-18) |
| SYS-19 | Приглашение истекло | [Открыть](neurojurist-spectrum-flow-register.md#sys-19) |
| SYS-20 | Пользователь удалён из организации | [Открыть](neurojurist-spectrum-flow-register.md#sys-20) |

<a id="p1-d"></a>

### P1-D · P1 — Draft и Review

- **Частота (гипотеза):** регулярная.
- **Ценность:** получение и правка рабочего текста.
- **Риск:** неполный или непроверяемый рабочий результат.
- **Зависимости:** проект, источники и задачи P0; работающая сохранность P0-S.

| ID | Сценарий | Карточка |
|---|---|---|
| DRF-01 | Создание нового черновика | [Открыть](neurojurist-spectrum-flow-register.md#drf-01) |
| DRF-02 | Создание документа через AI Chat | [Открыть](neurojurist-spectrum-flow-register.md#drf-02) |
| DRF-03 | Редактирование документа вручную | [Открыть](neurojurist-spectrum-flow-register.md#drf-03) |
| DRF-04 | AI-редактирование документа | [Открыть](neurojurist-spectrum-flow-register.md#drf-04) |
| DRF-05 | AI-проверка документа | [Открыть](neurojurist-spectrum-flow-register.md#drf-05) |
| DRF-06 | Использование материалов Workspace | [Открыть](neurojurist-spectrum-flow-register.md#drf-06) |
| DRF-09 | История версий | [Открыть](neurojurist-spectrum-flow-register.md#drf-09) |
| DRF-10 | Сравнение версий | [Открыть](neurojurist-spectrum-flow-register.md#drf-10) |
| E2E-04 | Подготовка юридического документа | [Открыть](neurojurist-spectrum-flow-register.md#e2e-04) |

<a id="p1-r"></a>

### P1-R · P1 — Research

- **Частота (гипотеза):** регулярная; относительная частота требует проверки.
- **Ценность:** правовые источники, актуальность и продолжение исследования.
- **Риск:** непроверяемое исследование или потеря контекста.
- **Зависимости:** проектный контекст, источники и состояния задач P0; честные ограничения синтетического Research.

| ID | Сценарий | Карточка |
|---|---|---|
| RES-01 | Создание нового исследования | [Открыть](neurojurist-spectrum-flow-register.md#res-01) |
| RES-02 | Исследование с дополнительными параметрами | [Открыть](neurojurist-spectrum-flow-register.md#res-02) |
| RES-03 | Поиск нормативных актов | [Открыть](neurojurist-spectrum-flow-register.md#res-03) |
| RES-04 | Просмотр конкретной статьи закона | [Открыть](neurojurist-spectrum-flow-register.md#res-04) |
| RES-05 | Просмотр истории редакций | [Открыть](neurojurist-spectrum-flow-register.md#res-05) |
| RES-06 | Проверка актуальности нормы | [Открыть](neurojurist-spectrum-flow-register.md#res-06) |
| RES-07 | Поиск судебной практики | [Открыть](neurojurist-spectrum-flow-register.md#res-07) |
| RES-08 | Фильтрация судебной практики | [Открыть](neurojurist-spectrum-flow-register.md#res-08) |
| RES-09 | Просмотр источника исследования | [Открыть](neurojurist-spectrum-flow-register.md#res-09) |
| RES-10 | Сохранение исследования | [Открыть](neurojurist-spectrum-flow-register.md#res-10) |
| RES-11 | Продолжение исследования | [Открыть](neurojurist-spectrum-flow-register.md#res-11) |
| RES-13 | Поиск не дал результатов | [Открыть](neurojurist-spectrum-flow-register.md#res-13) |
| RES-14 | Ошибка внешнего источника | [Открыть](neurojurist-spectrum-flow-register.md#res-14) |
| RES-15 | Сохранение исследования как контекста чата | [Открыть](neurojurist-spectrum-flow-register.md#res-15) |
| E2E-03 | Создание юридического исследования | [Открыть](neurojurist-spectrum-flow-register.md#e2e-03) |

<a id="p2-w"></a>

### P2-W · P2 — Организация материалов и проектов

- **Частота (гипотеза):** регулярная вспомогательная.
- **Ценность:** удобство повторной работы и навигации.
- **Риск:** лишние действия; опасное удаление всегда повышается в P0.
- **Зависимости:** базовый поиск/открытие уже входят в P0; здесь оставшиеся удобства и метаданные.

| ID | Сценарий | Карточка |
|---|---|---|
| WS-04 | Переименование Workspace | [Открыть](neurojurist-spectrum-flow-register.md#ws-04) |
| WS-05 | Редактирование описания | [Открыть](neurojurist-spectrum-flow-register.md#ws-05) |
| CHAT-02 | Создание чата с Dashboard | [Открыть](neurojurist-spectrum-flow-register.md#chat-02) |
| CHAT-04 | Переименование чата | [Открыть](neurojurist-spectrum-flow-register.md#chat-04) |
| CHAT-05 | Удаление чата | [Открыть](neurojurist-spectrum-flow-register.md#chat-05) |
| DOC-03 | Массовая загрузка документов | [Открыть](neurojurist-spectrum-flow-register.md#doc-03) |
| DOC-09 | Фильтрация документов | [Открыть](neurojurist-spectrum-flow-register.md#doc-09) |
| DOC-10 | Переименование документа | [Открыть](neurojurist-spectrum-flow-register.md#doc-10) |
| DOC-12 | Удаление документа | [Открыть](neurojurist-spectrum-flow-register.md#doc-12) |
| DRF-12 | Удаление черновика | [Открыть](neurojurist-spectrum-flow-register.md#drf-12) |

<a id="p2-t"></a>

### P2-T · P2 — Команда и приглашения

- **Частота (гипотеза):** периодическая; зависит от клиента.
- **Ценность:** подключение коллег и совместная работа.
- **Риск:** блокировка команды; нарушения ACL всегда повышаются в P0.
- **Зависимости:** вход, разделение org/project membership и действующие ACL; безопасность доступных командных действий P0.

| ID | Сценарий | Карточка |
|---|---|---|
| AUTH-04 | Регистрация нового пользователя | [Открыть](neurojurist-spectrum-flow-register.md#auth-04) |
| AUTH-06 | Приглашение пользователя в существующую организацию | [Открыть](neurojurist-spectrum-flow-register.md#auth-06) |
| WS-02 | Создание командного Workspace | [Открыть](neurojurist-spectrum-flow-register.md#ws-02) |
| MEM-01 | Приглашение участника | [Открыть](neurojurist-spectrum-flow-register.md#mem-01) |
| MEM-02 | Принятие приглашения | [Открыть](neurojurist-spectrum-flow-register.md#mem-02) |
| MEM-03 | Изменение роли участника | [Открыть](neurojurist-spectrum-flow-register.md#mem-03) |
| MEM-04 | Удаление участника | [Открыть](neurojurist-spectrum-flow-register.md#mem-04) |
| MEM-07 | Изменение участников Org Admin | [Открыть](neurojurist-spectrum-flow-register.md#mem-07) |
| CHAT-14 | Общий командный чат | [Открыть](neurojurist-spectrum-flow-register.md#chat-14) |
| SEC-01 | Просмотр состава организации | [Открыть](neurojurist-spectrum-flow-register.md#sec-01) |
| SEC-02 | Приглашение сотрудника | [Открыть](neurojurist-spectrum-flow-register.md#sec-02) |
| E2E-05 | Совместная работа команды | [Открыть](neurojurist-spectrum-flow-register.md#e2e-05) |

<a id="p2-c"></a>

### P2-C · P2 — Client и Matter

- **Частота (гипотеза):** периодическая.
- **Ценность:** организация связанных проектов и справочников.
- **Риск:** нарушение связей; каскадная потеря данных всегда повышается в P0.
- **Зависимости:** самостоятельные Client/Matter и существующие проекты, без каскадного удаления и расширения в CRM.

| ID | Сценарий | Карточка |
|---|---|---|
| WS-07 | Связывание Workspace с Client | [Открыть](neurojurist-spectrum-flow-register.md#ws-07) |
| WS-08 | Привязка Matter к Workspace | [Открыть](neurojurist-spectrum-flow-register.md#ws-08) |
| WS-09 | Связывание одного Matter с несколькими Workspace | [Открыть](neurojurist-spectrum-flow-register.md#ws-09) |
| WS-10 | Удаление связи с Client или Matter | [Открыть](neurojurist-spectrum-flow-register.md#ws-10) |
| CRM-01 | Создание Client | [Открыть](neurojurist-spectrum-flow-register.md#crm-01) |
| CRM-02 | Создание Matter | [Открыть](neurojurist-spectrum-flow-register.md#crm-02) |
| CRM-04 | Создание Workspace с Client | [Открыть](neurojurist-spectrum-flow-register.md#crm-04) |
| CRM-05 | Связывание Matter с Workspace | [Открыть](neurojurist-spectrum-flow-register.md#crm-05) |
| CRM-06 | Просмотр связанных Workspace | [Открыть](neurojurist-spectrum-flow-register.md#crm-06) |
| CRM-07 | Удаление Client или Matter | [Открыть](neurojurist-spectrum-flow-register.md#crm-07) |
| E2E-09 | Работа с несколькими проектами и одним Matter | [Открыть](neurojurist-spectrum-flow-register.md#e2e-09) |

<a id="p2-n"></a>

### P2-N · P2 — Поиск по приложению и личные настройки

- **Частота (гипотеза):** периодическая вспомогательная.
- **Ценность:** удобство и личные предпочтения.
- **Риск:** лишние действия; безопасность сессии и обязательные события остаются P0.
- **Зависимости:** доступный основной путь; не подменять базовый поиск проекта дополнительным глобальным поиском.

| ID | Сценарий | Карточка |
|---|---|---|
| DASH-05 | Поиск по приложению | [Открыть](neurojurist-spectrum-flow-register.md#dash-05) |
| DASH-06 | Уведомления | [Открыть](neurojurist-spectrum-flow-register.md#dash-06) |
| SET-01 | Просмотр профиля | [Открыть](neurojurist-spectrum-flow-register.md#set-01) |
| SET-02 | Изменение имени | [Открыть](neurojurist-spectrum-flow-register.md#set-02) |
| SET-03 | Изменение пароля | [Открыть](neurojurist-spectrum-flow-register.md#set-03) |
| SET-04 | Просмотр активных сессий | [Открыть](neurojurist-spectrum-flow-register.md#set-04) |
| SET-05 | Настройки Workspace | [Открыть](neurojurist-spectrum-flow-register.md#set-05) |
| SET-07 | Настройки уведомлений | [Открыть](neurojurist-spectrum-flow-register.md#set-07) |

<a id="p3-a"></a>

### P3-A · P3 — Расширение grant и административного аудита

- **Частота (гипотеза):** редкая.
- **Ценность:** контролируемые административные исключения.
- **Риск:** высокий при нарушении прав; расширение интерфейса не равно защите.
- **Зависимости:** действующие ACL и независимый approver; расширять scope после основных пробелов P0–P2.

| ID | Сценарий | Карточка |
|---|---|---|
| SEC-04 | Запрос привилегированного доступа | [Открыть](neurojurist-spectrum-flow-register.md#sec-04) |
| SEC-05 | Одобрение административного доступа | [Открыть](neurojurist-spectrum-flow-register.md#sec-05) |
| SEC-06 | Отклонение запроса | [Открыть](neurojurist-spectrum-flow-register.md#sec-06) |
| SEC-07 | Использование одобренного доступа | [Открыть](neurojurist-spectrum-flow-register.md#sec-07) |
| SEC-08 | Истечение административного доступа | [Открыть](neurojurist-spectrum-flow-register.md#sec-08) |
| SEC-09 | Досрочный отзыв доступа | [Открыть](neurojurist-spectrum-flow-register.md#sec-09) |
| SEC-10 | Просмотр истории запросов | [Открыть](neurojurist-spectrum-flow-register.md#sec-10) |
| SEC-11 | Просмотр аудита | [Открыть](neurojurist-spectrum-flow-register.md#sec-11) |
| E2E-06 | Административный доступ к материалам | [Открыть](neurojurist-spectrum-flow-register.md#e2e-06) |

<a id="p3-l"></a>

### P3-L · P3 — Сложное владение, уход и удаление

- **Частота (гипотеза):** редкая.
- **Ценность:** управление исключительными lifecycle-операциями.
- **Риск:** высокий при утрате данных/доступе после отзыва; дефекты повышаются в P0.
- **Зависимости:** актуальный OWNER, принятие передачи, немедленный revoke и действующие правила retention.

| ID | Сценарий | Карточка |
|---|---|---|
| WS-11 | Удаление Workspace | [Открыть](neurojurist-spectrum-flow-register.md#ws-11) |
| MEM-08 | Увольнение сотрудника | [Открыть](neurojurist-spectrum-flow-register.md#mem-08) |
| MEM-09 | Уход OWNER | [Открыть](neurojurist-spectrum-flow-register.md#mem-09) |
| SEC-14 | Удаление данных с подтверждением | [Открыть](neurojurist-spectrum-flow-register.md#sec-14) |
| SEC-15 | Просмотр статуса удаления | [Открыть](neurojurist-spectrum-flow-register.md#sec-15) |
| E2E-07 | Увольнение сотрудника | [Открыть](neurojurist-spectrum-flow-register.md#e2e-07) |

<a id="p3-o"></a>

### P3-O · P3 — Расширенные org-настройки

- **Частота (гипотеза):** редкая.
- **Ценность:** администрирование организации.
- **Риск:** высокий при расширении прав; запреты не откладываются.
- **Зависимости:** разделение org- и проектных ролей; инструкции не отменяют безопасность.

| ID | Сценарий | Карточка |
|---|---|---|
| SEC-03 | Изменение организационной роли | [Открыть](neurojurist-spectrum-flow-register.md#sec-03) |
| SET-06 | Настройки организации | [Открыть](neurojurist-spectrum-flow-register.md#set-06) |

<a id="out"></a>

### OUT · Вне очереди — Исключённое и отложенное

- **Частота (гипотеза):** не оценивается.
- **Ценность:** исходная трассировка, не новый MVP-пакет.
- **Риск:** возврат в scope без отдельного решения запрещён.
- **Зависимости:** отдельное решение о возвращении в scope; исключение не означает готовность.

| ID | Сценарий | Карточка |
|---|---|---|
| AUTH-05 | Создание первой организации | [Открыть](neurojurist-spectrum-flow-register.md#auth-05) |
| RES-12 | Экспорт исследования | [Открыть](neurojurist-spectrum-flow-register.md#res-12) |
| DRF-11 | Экспорт документа | [Открыть](neurojurist-spectrum-flow-register.md#drf-11) |

## Контроль полноты

| Уровень | Карточек |
|---|---:|
| P0 | 89 |
| P1 | 24 |
| P2 | 41 |
| P3 | 17 |
| Вне очереди | 3 |
| **Итого** | **174** |

Это количество приоритетных назначений, не оценка готовности. Один ID находится ровно в одном основном пакете. Повышение конкретного дефекта по риску не создаёт второй карточки.

## Следующий пакет — P0 Documents → Chat → источники

1. **Предпосылки:** быстро проверить вход/tenant, поиск и открытие доступного проекта (P0-A); исправлять только реальные блокеры, не переписывать проверенный UI-03.
2. **Сверка:** пройти текущие Documents → загрузка → обработка → Chat → ответ → источник/использованная версия → продолжение; сопоставить P0-B/P0-C с карточками и существующими проверками UI-01–07.
3. **Список пробелов:** для каждого записать исходный ID, конкретную ветвь, наблюдаемое поведение, клиентское последствие, приоритет дефекта, зависимость и критерий приёмки. Не объявлять все P0-карточки неисправными заранее.
4. **Альтернативы по месту:** пусто, неготовность/OCR, недопустимый файл, ошибка/повтор обработки, новая версия, отсутствие контекста/источника, ошибка/остановка AI, продолжение после ухода, VIEWER/PRIVATE, удаление/отзыв источника и зависимый ответ.
5. **Доработка:** брать сначала блокирующие цепочку и опасные дефекты, затем частые ошибки/возвраты. Не переходить к проектному grant только потому, что он был следующим в UI-07.
6. **Выход:** основной путь и выбранные альтернативы проверены на текущем макете; для каждого выбранного ID есть свидетельство, остаток или явная зависимость. Если пробелов нет, фиксировать результат и переходить к P1, а не выдумывать новый экран. Полная приёмка 174 карточек этим пакетом не заявляется.

## Пересмотр и проверка

Гипотеза пересматривается по интервью, наблюдениям, обращениям и данным использования, когда они появятся. Основание перестановки записывается; безопасность и утверждённый scope молча не меняются. Уже реализованные функции не удаляются из-за понижения очереди их расширения.

Проверка согласованности: `node tests/priority-register.mjs` — уникальность 174 ID, поле каждой карточки, полное соответствие индексу, уровни/пакеты, якоря и исключения. Это проверка документации, не функциональная приёмка макета.

Результат пакета HYP-01: 8 групп проверки документации успешны. Отдельная сверка со снимком до изменений подтвердила сохранение порядка заголовков и исходных тел всех 174 карточек побайтно после удаления нового поля приоритета — включая статусы, шаги, ссылки и критерии. `git diff --check` успешен. Интерфейс и runtime-код не менялись; сборка и браузерные сценарии для этого документального пакета повторно не запускались.
