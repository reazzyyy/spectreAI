# Пакет security governance для «НейроЮрист Спектр»

Статус всех документов: **PROPOSED — на рассмотрение**. Пакет **дополняет**, но **не заменяет** канонические документы репозитория.

Приоритет при конфликте: `docs/decisions-log.md` → канон области (`docs/DOCUMENTATION-GOVERNANCE.md` §2) → `docs/security/`.

## Состав
- `security-overview.md` — область действия и базовые принципы.
- `data-flow-and-data-inventory.md` — потоки и реестр данных.
- `data-classification.md` — mapping к нормативной шкале **D0–D4** (`docs/03-data-security.md`); C0–C4 не нормативны.
- `encryption-and-secrets.md` — шифрование и управление секретами.
- `privileged-access-and-support.md` — выжимка привилегированного доступа (норматив — `docs/07-access-control-matrix.md`).
- `subprocessors-and-vendors.md` — поставщики и субпроцессоры.
- `vulnerability-management.md` — управление уязвимостями.
- `incident-response.md` — реагирование на инциденты.
- `business-continuity-and-disaster-recovery.md` — непрерывность бизнеса и восстановление (цели D-019/D-020/D-022).
- `ai-risk-management.md` — риски AI (каноны угроз/gateway: `09`, `14`, `16`).
- `security-testing.md` — чек-лист security-проверок (стратегия тестов — `docs/22-testing-and-quality-strategy.md`).
- `security-evidence.md` — реестр доказательств и проверок.
- `DECISIONS-TO-REVIEW.md` — вопросы для согласования (сверены с журналом).
- `INTEGRATION-NOTES.md` — инструкция по интеграции.
- `CONTRADICTIONS-AND-INTEGRATION-PLAN.md` — отчёт сверки с каноном и решения A1/B1/C1.

## Ограничения
Это проект документации, а не подтверждение реализованных технических контролей, юридическое заключение или завершённый аудит. Не включать реальные документы клиентов в тесты и не отправлять их внешнему AI до закрытия **O-002**; до этого — только `SyntheticAIProvider` (**D-012**).
