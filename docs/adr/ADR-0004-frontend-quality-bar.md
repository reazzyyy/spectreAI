# ADR-0004: Quality bar frontend (`apps/web`)

Статус: **CONFIRMED** по журналу (**D-024**). Дата: 2026-11-06.

## Контекст

FSD (**D-023** / ADR-0002) задаёт слои, но не закрывает стиль, UI-kit, формы, серверный стейт и пирамиду тестов. В `docs/21` пункты **FE-002**, **FE-003**, **FE-006** и связанные строки стека оставались OPEN/PROPOSED; в AS-IS `apps/web` — CSS Modules без SCSS, без Vitest/Storybook/Playwright. Эталон владельца: дисциплина `interview-platform` (Next/FSD/Zod) + требования к декомпозиции и тест-гейтам из учебного `ulbi`, без устаревшего Loki и без обязательного shadcn.

## Решение

1. **Стили:** SCSS Modules (`.module.scss`) + глобальные SCSS-токены (CSS custom properties). Новые UI-слайсы не добавляют plain CSS Modules / Tailwind как норму стиля. Миграция существующего CSS Modules — отдельными срезами; AS-IS не подменяет канон.
2. **UI-kit:** собственный `shared/ui` на токенах продукта. **shadcn / Base UI / иные UI-kit не являются обязательным каноном.** Переиспользование через декомпозицию примитивов, не через копирование разметки экрана.
3. **Формы:** React Hook Form + Zod для стандартных и сложных форм; клиентская валидация не заменяет backend.
4. **Серверные данные:** TanStack Query — нормативный слой кэша/синхронизации для клиентских запросов к API (поверх согласованного `fetch`-клиента). Локальный UI-state — React state/Context. Ключи кэша учитывают org/workspace/user; backend остаётся источником прав.
5. **Типизация:** TypeScript strict; props UI — через `interface`; контракты форм/валидации — Zod + `z.infer`; без обхода через `any` / отключение проверок.
6. **Тесты (целевой бар):**
   - unit/component — **Vitest + React Testing Library**;
   - UI-каталог и визуал компонентов — **Storybook + Chromatic**;
   - E2E и критические пользовательские потоки — **Playwright**.
7. **Внедрение:** тулчейн и покрытие наращиваются **срезами** вместе с фичами; канон описывает цель. Не объявлять в AS-IS реализованным то, чего ещё нет в репозитории.
8. **Отклонено как норма:** Loki (устаревший для нового Storybook-стека); обязательный shadcn; «только CSS Modules» как долгосрочный стандарт.

## Альтернативы

### Loki + Storybook (как в ulbi)
- Плюсы: бесплатный screenshot-гейт в CI без SaaS.
- Минусы: pre-1.0, отстаёт от Storybook majors, нет современного review UX.
- Отклонено: не актуальный tool-of-choice для нового канона.

### shadcn как база UI
- Плюсы: скорость старта, как в interview-platform.
- Минусы: второй язык стилей рядом с продуктовыми токенами макета; риск дрейфа от визуальной системы Spectre.
- Отклонено как обязательный канон; точечное заимствование паттернов не запрещено, если результат остаётся в `shared/ui` + SCSS modules.

### Только Next.js fetch/cache без TanStack Query
- Плюсы: меньше зависимостей.
- Минусы: слабее единый клиентский кэш, invalidation и polling для workspace/chat/docs.
- Отклонено как единственная норма для клиентских серверных данных.

## Последствия

- Обновить `docs/21`, `docs/22` (TEST-002/TEST-003), `AGENTS.md`, правила frontend, README `apps/web`.
- Закрыть **FE-002**, **FE-003**, **FE-006** в пользу этого ADR; **TEST-002** / **TEST-003** — CONFIRMED для frontend tooling.
- Следующие срезы кода: Sass/stylelint, `shared/ui`, Query/RHF/Zod, Vitest, Storybook, Chromatic, Playwright — без объявления полной готовности до появления в AS-IS.
- FE-004 (стриминг), FE-005 (OpenAPI types), FE-007–FE-010 остаются отдельными решениями.

## Связанные документы

- `docs/decisions-log.md` — **D-024**
- `docs/21-frontend-architecture.md` — канон frontend
- `docs/22-testing-and-quality-strategy.md` — стратегия тестов
- `docs/adr/ADR-0002-frontend-fsd.md` — слои FSD (не отменяется)
- `docs/26-codebase-current-state.md` — факт vs норма
