# Инструкция по интеграции

**Статус: PROPOSED**

## Согласованные решения интеграции (2026-10-29)

- **A1:** нормативная классификация — **D0–D4** (`docs/03-data-security.md`); C0–C4 только mapping в `data-classification.md`.
- **B1:** `docs/security/` остаётся PROPOSED-дополнением; приоритет `decisions-log` → канон → `docs/security/`.
- **C1:** обновлены `DOCUMENTATION-GOVERNANCE.md`, корневой `README.md`, `AGENTS.md` и документы внутри `docs/security/`. Статусы D-001–D-022 и O-001–O-010 не менялись.

Сверка: `CONTRADICTIONS-AND-INTEGRATION-PLAN.md`. Открытые operational-вопросы: `DECISIONS-TO-REVIEW.md`.

## Правила (сохраняются)

1. Прочитать `AGENTS.md`, `docs/decisions-log.md`, `docs/DOCUMENTATION-GOVERNANCE.md`.
2. Сопоставить каждый файл пакета с действующими каноническими документами. Архивные документы не считать нормативными.
3. Не заменять и не дублировать без необходимости `docs/03-data-security.md`, `docs/07-access-control-matrix.md`, `docs/08-data-lifecycle-and-deletion.md`, `docs/09-threat-model.md`, `docs/14-ai-provider-and-model-gateway.md`, `docs/22-testing-and-quality-strategy.md`, `docs/23-deployment-and-infrastructure.md`, `docs/25-logging-monitoring-and-audit.md`.
4. Не менять статусы решений и не превращать `PROPOSED` в утверждённые требования без явного согласования.
5. Не менять прикладной код, зависимости, схему БД или конфигурацию деплоя в рамках интеграции документации.
6. Не включать реальные OpenAI-вызовы и не отправлять реальные юридические документы внешнему AI на основании этого пакета (**O-002** / **D-012**).
7. После изменений проверить внутренние ссылки и сообщить: изменённые файлы, конфликты, открытые вопросы, команды/проверки, которые реально запускались.

Ветка: `docs/security-governance-package`; показать diff до коммита/слияния.
