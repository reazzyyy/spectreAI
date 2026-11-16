# Интеграция Stage 1 audit и Stage 2 контрактов

**Дата:** 2026-11-17  
**Статус:** документационная интеграция. Контракты остаются **PROPOSED**. Код, Prisma и D/O/H не менялись.

## Что сверено с копией GPT

Каталог `C:\Users\user\Downloads\spectreAI-stage1-audit\spectreAI-main` сравнен с этим репозиторием по содержимому (без учёта CRLF).

- `docs/06`, `docs/17`, `docs/33`, `docs/34`, `docs/decisions-log.md`, `AGENTS.md`, `tasks/phase5-6-gaps.md`, `apps/api/src/worker/extract-worker.ts` **совпадают**.
- Единственный добавленный GPT файл — аудит этапа 1. Его текст совпадает с `docs/2026-11-16-stage1-consolidation.md`. В копии он лежал как `docs/ai/retrieval/audits/2026-11-16-stage1-consolidation.md`; канонический путь в этом репозитории — файл в `docs/`.
- Исправлений кода и правок канона из копии переносить нечего: GPT описал находки и явно запретил на этом этапе менять D/O/H, схему и `docs/34` задним числом.

## Куда легли находки аудита

| Аудит | Куда попало в добавленных документах | Статус после интеграции |
|---|---|---|
| A-01 ACL до выдачи кандидатов | `2026-11-17-acl-retrieval-scope-contract.md` | PROPOSED. `docs/17` не переписан |
| A-02 `ready` ≠ searchable | lifecycle + `2026-11-17-document-readiness-consistency-decision.md` | PROPOSED, ждёт явного согласия |
| A-03 две legal-модели | не закрыто отдельным crosswalk | OPEN до O-006 |
| A-04 единый temporal glossary | частично в `docs/ai/retrieval` v0.2 | PROPOSED, не полный glossary |
| A-05 evaluation schema | `2026-11-17-evaluation-framework-contract.md` | PROPOSED |
| A-06 relevance ≠ authority | evidence + claim taxonomy | PROPOSED |
| A-07 три уровня проверки цитаты | `2026-11-17-evidence-validation-contract.md` | PROPOSED |
| A-08 chunking candidates | без нового решения | FILE-009 OPEN |
| A-09 parser quality / locators | `2026-11-17-extraction-quality-parser-contract.md` | PROPOSED |
| A-10 retry extract worker | в контрактах нет фикса кода | открытый дефект надёжности, не чинился этой интеграцией |
| A-11 `docs/34` устарел | шапка `docs/34` указывает на `docs/26` и трекер | снимок 2026-11-10 сохранён |

Дальше сверка самих контрактов (`2026-11-17-cross-contract-consistency-review.md`) нашла расхождения между ними. Их закрывают ещё два addendum, тоже PROPOSED:

- `2026-11-17-claim-support-applicability-taxonomy.md` — единые enum Claim Support / Applicability (CCR-01, CCR-02)
- `2026-11-17-extraction-eligibility-immutable-evidence-binding.md` — допуск к индексу и неизменяемая привязка locator (CCR-04, CCR-05)
- `2026-11-17-document-readiness-consistency-decision.md` — семантика `ready` (CCR-03)

## Как читать

1. `decisions-log.md`
2. Канон области (`17`, `18`, `33` для Phase 6)
3. Аудит: `2026-11-16-stage1-consolidation.md`
4. Пять контрактов Stage 2 и три addendum — только как пакет. Не реализовывать один файл в отрыве от consistency review.
5. AS-IS: `docs/26` и `tasks/phase5-6-gaps.md`. `docs/34` — история на 2026-11-10.

## Что нельзя делать, пока владелец не подтвердит контракты

- Не заводить Prisma enum Claim Support / Applicability / readiness.
- Не менять публичный смысл `Document.status = ready` в API.
- Не индексировать документы со статусом качества `review_required` молча.
- Не считать user-document ACL покрытием правового корпуса (**O-006**).
- Не создавать второй index manifest рядом с `docs/28`.
- Не выбирать chunk size, embedding и ParadeDB.

A-10 (retry extraction: БД `queued` при уже завершённом BullMQ job) остаётся отдельным фиксом кода с тестом. Эта интеграция его не закрывает.
