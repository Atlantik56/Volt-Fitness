# Документация VOLT

Этот файл — индекс актуальной документации. Claude Code должен начинать работу
с него, затем читать `AI_PRINCIPLES.md`, `ROADMAP_AI.md` и документ текущего
спринта.

## Текущий план AI-развития

1. [`AI_PRINCIPLES.md`](AI_PRINCIPLES.md) — неизменяемые продуктовые и
   инженерные ограничения.
2. [`AI_ARCHITECTURE.md`](AI_ARCHITECTURE.md) — целевая эволюционная
   архитектура.
3. [`ROADMAP_AI.md`](ROADMAP_AI.md) — порядок AI-1…AI-6, статусы и правило
   перехода между спринтами.
4. [`AI_CONTEXT.md`](AI_CONTEXT.md) — задание Sprint AI-2.
5. [`EVENING_CHECKIN.md`](EVENING_CHECKIN.md) — задание Sprint AI-3.
6. [`INSIGHT_ENGINE.md`](INSIGHT_ENGINE.md) — задание Sprint AI-4 и часть AI-6.
7. [`MEMORY_ENGINE.md`](MEMORY_ENGINE.md) — задание Sprint AI-5.
8. [`MILESTONES.md`](MILESTONES.md) — задание второй части Sprint AI-6.
9. [`ACTIVE_WORKOUT_SPRINTS.md`](ACTIVE_WORKOUT_SPRINTS.md) — задания Sprint
   AI-7…AI-9 (активная тренировка, Garmin/FIT, быстрое подтверждение) и раздел
   «Доработка AI-9» с закрытыми пробелами production.
10. [`AI_10_CONSTRUCTIVE_FEEDBACK.md`](AI_10_CONSTRUCTIVE_FEEDBACK.md) —
    правила обоснованной и конструктивной обратной связи Coach и раздел
    «Доработка» с усилением проверяемости.
11. [`AI_12_ADAPTIVE_PROGRESSION.md`](AI_12_ADAPTIVE_PROGRESSION.md) —
    задания спринтов AI-12…AI-16: адаптивная прогрессия в зале, бассейне и на
    вело по данным Garmin и отметке самочувствия.

## Другие действующие документы

- [`design/VOLT_BACKGROUND.md`](design/VOLT_BACKGROUND.md) — канонический
  визуальный контракт и утверждённые ассеты фона для будущего редизайна
  VOLT 2.0; ассеты пока не подключены к приложению.
- [`design/VOLT_SWIM.md`](design/VOLT_SWIM.md) — обязательный визуальный и UX
  контракт VOLT Swim; рядом находятся
  [`COMPONENTS.md`](design/COMPONENTS.md),
  [`ANIMATIONS.md`](design/ANIMATIONS.md) и
  [приложенный макет](design/volt-swim/volt-swim-concept-v17.jpg).
- [`volt-swim/SPRINTS.md`](volt-swim/SPRINTS.md) — действующие пять спринтов
  VOLT Swim вокруг 8-недельной программы Foundation.
- [`GARMIN_BRIDGE.md`](GARMIN_BRIDGE.md) — автоматический импорт тренировок,
  сна и HRV из Garmin Connect (и WattAttack через него) через intervals.icu;
  разобранные альтернативы и причины отказа от Strava.
- [`TRAINING_PROGRAM_ARCHITECTURE.md`](TRAINING_PROGRAM_ARCHITECTURE.md) —
  canonical program layer, versioning, effective programs и правила добавления
  следующих версий без изменения истории; текущий 8-недельный Plan v3
  запускается пользователем и связывает зал, Endurance Swim и велосипед в
  одном относительном календаре.
- [`ANALYTICS.md`](ANALYTICS.md) — provider-neutral Analytics Foundation:
  периоды, plan-vs-fact, Gym/Swim/Cycling, trends/comparisons, data coverage,
  Strava isolation и подготовленный aggregate-only Coach context.
- [`STRAVA_INTEGRATION.md`](STRAVA_INTEGRATION.md) — read-only OAuth,
  encrypted token lifecycle, manual activity sync, provider-neutral mapping,
  local setup and the production retention gate required by Strava's 2026 API
  Policy.
- [`volt-swim/ARCHITECTURE.md`](volt-swim/ARCHITECTURE.md) — почему `/swim`
  устроен как отдельные маршруты, как устроены слои `lib/swim/*` и как модуль
  масштабируется в следующих спринтах.
- [`VOLT_ROADMAP.md`](VOLT_ROADMAP.md) — исторический продуктовый roadmap и
  журнал реализованных Sprint 1–8; новые AI-работы ведутся только в
  `ROADMAP_AI.md`.
- [`VOLT_FORGE.md`](VOLT_FORGE.md) — отложенная концепция Volt Forge, не входит
  в AI-1…AI-6.
- [`История Volt.md`](История%20Volt.md) — личная история проекта, не
  техническое задание.

## Архив

Завершённые и исторические спринтовые документы перенесены в
[`archive/sprints/`](archive/sprints/README.md). Архив не удаляется и не
переписывается под текущую архитектуру.

## Рабочий протокол Claude Code

Перед каждым спринтом:

1. Убедиться, что предыдущий спринт завершён и его критерии готовности
   подтверждены.
2. Прочитать принципы, roadmap, архитектуру и профильный документ спринта.
3. Сверить перечисленные файлы с текущим репозиторием: пути являются
   ожидаемыми точками изменения, а не разрешением менять их все.
4. До кода кратко зафиксировать найденное текущее состояние и минимальный план.
5. Выполнить только один спринт, не начинать следующий автоматически.
6. Запустить предусмотренные проверки и обновить статус/фактический результат
   в `ROADMAP_AI.md`.
7. Не деплоить и не пушить без отдельного указания пользователя.
