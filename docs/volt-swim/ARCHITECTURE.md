# VOLT Swim — архитектура модуля

Статус: справочный документ (не дизайн-контракт — тот остаётся в
[`../design/VOLT_SWIM.md`](../design/VOLT_SWIM.md)). Описывает, почему модуль
устроен так, а не иначе, чтобы Sprint 3+ не переизобретали эти решения заново.

## Зачем появился `/swim`

VOLT — один client-компонент (`app/page.tsx`), переключающий разделы через
`useState`, без реальных маршрутов. Для VOLT Swim это не подошло: у модуля
собственная многошаговая навигация (главная → тренировки → программа →
конкретная тренировка → шаги интервалов → подтверждение), и кодирование всего
этого в ещё один `nav`-стейт внутри уже большого `page.tsx` сделало бы файл
нечитаемым и рискованным для правок остальной части приложения. `/swim` —
первые настоящие вложенные маршруты App Router в проекте: `app/swim/layout.tsx`
→ `app/swim/page.tsx` / `app/swim/workouts/page.tsx` →
`app/swim/workouts/[programId]/page.tsx` →
`app/swim/workouts/[programId]/[workoutId]/page.tsx`.

## Почему отдельная маршрутизация, а не ещё один `nav`

- Глубина модуля (программа → неделя → тренировка → шаг) требует URL,
  который можно обновить/поделиться/вернуться назад браузерной кнопкой —
  локальный `useState` в `page.tsx` этого не даёт.
- Изоляция: правки внутри `app/swim/**` не трогают `app/page.tsx` и не могут
  случайно сломать силовые тренировки, FIT-импорт или AI Hub.
- Глобальная навигация не дублируется — `SwimGlobalNav`
  (`app/swim/swim-global-nav.tsx`) визуально повторяет `.sidebar`/`.mobile-nav`
  из `app/page.tsx` через общие CSS-классы (см. `app/globals.css`, селекторы
  `.side-nav a`/`.mobile-nav a`, добавленные рядом с уже существующими
  `button`-правилами), но остаётся тем же самым сайдбаром, а не второй
  постоянной панелью.

## Слои модуля

```
app/swim/**                 — маршруты и presentation-компоненты (без бизнес-логики)
lib/swim/types.ts           — доменные типы (Program/Week/Workout/Interval/Insight)
lib/swim/exercise-catalog.ts— единственный источник упражнений
lib/swim/program-engine.ts  — чистые функции: программы, поиск тренировки, прогресс
lib/swim/workout-engine.ts  — мост к существующему draft-движку (snapshot/planKey)
lib/swim/insight-service.ts — AI Coach контракт (Sprint 4 наполнит реализацию)
lib/swim/services.ts        — единственное место lib/swim/*, читающее БД
lib/swim-data.ts            — сборка SwimHomeData для главной страницы
lib/swim-metrics.ts         — форматирование/расчёт метрик (тестируемые чистые функции)
lib/swim-classify.ts        — определение "это заплыв?" по type/title
app/api/swim/**             — тонкие GET-обёртки над lib/swim/services.ts
```

Компоненты не считают ничего сами — вся арифметика (дистанция, темп,
прогресс программы, planKey) живёт в `lib/swim/*` и покрыта unit-тестами в
`tests/`.

## Почему тренировки не завели отдельное хранилище

Sprint 2 сознательно не добавляет `swim_workouts`/`swim_intervals` таблицы.
Тренировка программы упаковывается в `WorkoutSnapshot` — тот же формат,
что уже использует силовая тренировка (`lib/active-workout-service.ts`), и
идёт через тот же `startWorkoutDraft` → `finishWorkoutDraft` →
`confirmWorkoutDraft` (`workout_drafts` → `workout_logs`). Это даёт бесплатно:
идемпотентное подтверждение, защиту от двойного сохранения, совместимость с
AI-9 (`metrics_source`, `WorkoutDetailSource`) и с уже существующим
FIT-импортом (`app/api/workout-imports`) — плаванию не нужен собственный
экран импорта.

Единственная новая колонка — `workout_logs.notes` (миграция версии 18,
аддитивная, `NOT NULL DEFAULT ''`): в существующей схеме не было места для
свободной заметки после тренировки, а поле относится к любой тренировке, не
только к плаванию, поэтому это не swim-специфичная таблица.

## Как модуль будет масштабироваться дальше

- **Несколько программ одновременно** (Sprint 3+): `lib/swim/services.ts`
  сейчас берёт первую программу со `status:"available"` — когда программ
  станет больше одной, здесь появится выбор активной программы пользователя
  (сохранённой явно, а не угаданной), остальной код (`program-engine.ts`,
  UI) менять не придётся.
- **История/аналитика/рекорды** (Sprint 3): читают те же `workout_logs`,
  что и Sprint 1 (`lib/swim-data.ts`), плюс `workout_logs.distance_meters`,
  теперь действительно заполняемый через `confirmWorkoutDraft` для заплывов.
- **AI Coach** (Sprint 4): реализует `lib/swim/insight-service.ts#getSwimInsights`
  по контракту `SwimInsight`, который уже прокинут через `/api/swim` →
  `AiCoachPreview` — подключение не потребует менять типы или компоненты.
- **Правка программы задним числом**: `SwimProgramDef.version` входит в
  `snapshot.type` (`lib/swim/workout-engine.ts#swimWorkoutType`) — увеличение
  версии не переписывает `planKey` уже пройденных тренировок пользователя.
