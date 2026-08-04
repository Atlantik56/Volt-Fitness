# VOLT Swim — обязательные компоненты

Компоненты реализуют [дизайн-контракт](VOLT_SWIM.md). Названия ниже описывают
публичные роли; конкретное размещение в коде определяется текущей архитектурой.
Не создавать локальный вариант, если роль покрывается существующим компонентом.

## Основа

| Компонент | Обязательные варианты | Обязательные состояния |
|---|---|---|
| `SwimShell` | desktop, tablet, mobile | online, offline |
| `SwimNavigation` | rail, section-tabs, compact | default, active, focus |
| `SwimPageHeader` | standard, compact/workout | default, with-status |
| `SwimHero` | workout, program, progress, completion | loading, ready, complete, unavailable |
| `GlassPanel` | base, raised, interactive | default, hover, focus, pressed, disabled |
| `SwimButton` | primary, secondary, ghost, danger | idle, hover, focus, pressed, loading, disabled |
| `StatusBadge` | neutral, success, warning, error, synced | icon + text, never color-only |

## Тренировочный путь

- `ProgramCard` — программа, длительность, уровень, прогресс, следующий шаг.
- `WeekSelector` — 6 недель Foundation, текущая/завершённая/заблокированная.
- `WorkoutPreview` — цель, объём, длительность, состав блоков, основное действие.
- `WorkoutBlock` — warm-up, main, kick, cool-down, control; тип всегда подписан.
- `IntervalStep` — повторения, дистанция, стиль/упражнение, темп, отдых, подсказка.
- `ActiveStepHero` — самое читаемое у бортика текущее задание.
- `WorkoutControls` — start, pause, resume, skip, repeat, finish; destructive
  действие требует подтверждения.
- `RestTimer` — крупное время, progress без постоянной декоративной анимации.
- `ProgressTrack` — мотив дорожки бассейна; program, week и workout варианты.
- `WorkoutSummary` — план/факт, ключевые метрики, следующий шаг, источник данных.
- `FitImportPreview` — файл, сопоставление, различия и явное подтверждение.

## Метрики, аналитика и AI

- `MetricCard`: value, delta, target; compact и standard. Всегда label, единица,
  период и честное состояние `no data`.
- `MetricGroup`: 1–3 приоритетных метрики; не бесконечная карточная сетка.
- `TrendChart`: line, area-range, bars; legend, units, accessible summary.
- `PlanActualChart`: план/факт различаются цветом и формой/штрихом.
- `HistoryList` и `HistoryItem`: list/table на desktop, stacked rows на mobile.
- `CoachInsightCard`: summary, evidence, next-step, unavailable/error; Coach
  отмечается тонким lime-маркером, но остаётся частью общей системы.
- `ReadinessCard`: value/range, входные факторы, неопределённость, источник.
- `Achievement`: inline и completion; не модальное конфетти по умолчанию.

## Правила композиции

- Страница собирается из `SwimShell` → `SwimPageHeader` → одного `SwimHero` →
  секций с `GlassPanel`/специализированными компонентами.
- Основной CTA существует один на смысловой блок. `SwimButton` не вкладывается
  в другую интерактивную поверхность.
- Loading сохраняет геометрию контента; skeleton не shimmer-анимируется при
  reduced motion. Empty state объясняет причину и следующий доступный шаг.
- Ошибка не удаляет уже сохранённые данные и содержит восстановление.
- Иконки сопровождают, но не заменяют label для незнакомых действий.

## API и токены

- Визуальные значения поступают из общих семантических CSS-токенов, а не из
  inline hex/blur/shadow в JSX.
- Варианты задаются явным API (`variant`, `size`, `state`), а не произвольными
  className-переопределениями.
- Интерактивные компоненты поддерживают ref, keyboard, accessible name и
  disabled/loading семантику.
- Новая роль добавляется сюда до реализации. Визуальный дубль существующей
  роли считается несоответствием.
