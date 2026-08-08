# VOLT Design System 2.0

Канонический индекс дизайн-системы VOLT. Документы фиксируют только уже
утверждённые решения и реализованные общие паттерны; отсутствие спецификации не
является разрешением на новый дизайн.

## Как пользоваться

1. Прочитать эту страницу и только документы, относящиеся к задаче.
2. Для общего UI выбрать нужную основу (`colors`, `typography`, `spacing`,
   `glass-system`, `motion`),
   [Reference Implementation](08-reference-implementation.md), компонент и
   спецификацию экрана.
3. Для VOLT Swim дополнительно обязательно прочитать
   [`../volt-swim/SPRINTS.md`](../volt-swim/SPRINTS.md) и канонический
   [`../design/VOLT_SWIM.md`](../design/VOLT_SWIM.md).
4. Сравнить результат с утверждённым изображением, если оно указано в screen spec.

## Разделы

- Основа: [философия](00-philosophy.md),
  [принципы](01-design-principles.md), [цвет](02-colors.md),
  [типографика](03-typography.md), [отступы](04-spacing.md),
  [VOLT Glass](05-glass-system.md), [motion](06-motion.md),
  [Reference Implementation](08-reference-implementation.md).
- Компоненты: [buttons](components/buttons.md), [cards](components/cards.md),
  [hero](components/hero.md), [charts](components/charts.md),
  [navigation](components/navigation.md), [dialogs](components/dialogs.md),
  [AI](components/ai.md).
- Экраны: [home](screens/home.md), [workouts](screens/workouts.md),
  [roadmap](screens/roadmap.md), [journey](screens/journey.md),
  [nutrition](screens/nutrition.md), [analytics](screens/analytics.md),
  [profile](screens/profile.md).
- Правила: [делать](rules/do.md), [не делать](rules/dont.md),
  [Claude Code и Codex](rules/ai-rules.md),
  [реализация](rules/implementation.md).

## Источники истины

Документ [Reference Implementation VOLT 2.0](08-reference-implementation.md)
входит в официальный дизайн-контракт. Утверждённый Home задаёт обязательный
визуальный язык новых экранов; отклонение требует функционального основания или
прямого правила применимого дизайн-контракта.

Текущая реализация остаётся источником фактических токенов до их отдельной
миграции. Swim-контракт и утверждённые Swim-макеты имеют приоритет в Swim-задачах.
При конфликте остановиться и запросить решение, а не смешивать варианты.

## Эталонные изображения

Утверждённые файлы не перегенерировать, не ретушировать и не заменять похожими.
Хранить их в Git рядом с соответствующей спецификацией либо в указанном
каноническом каталоге. Новое изображение получает статус эталона только после
явного утверждения и добавления ссылки в screen spec.

### Индекс утверждённых экранов VOLT 2.0

| Экран | Обязательный визуальный референс | Screen spec |
|---|---|---|
| Главная | [home-approved.png](assets/approved-screens/home-approved.png) | [Home](screens/home.md) |
| Тренировки | [workouts-approved.png](assets/approved-screens/workouts-approved.png) | [Workouts](screens/workouts.md) |
| Дорожная карта | [roadmap-approved.png](assets/approved-screens/roadmap-approved.png) | [Roadmap](screens/roadmap.md) |
| Мой путь | [journey-approved.png](assets/approved-screens/journey-approved.png) | [Journey](screens/journey.md) |
| Питание | [nutrition-approved.png](assets/approved-screens/nutrition-approved.png) | [Nutrition](screens/nutrition.md) |
| Профиль и настройки | [profile-settings-approved.png](assets/approved-screens/profile-settings-approved.png) | [Profile](screens/profile.md) |
| Аналитика + AI Coach | [analytics-ai-coach-approved.png](assets/approved-screens/analytics-ai-coach-approved.png) | [Analytics](screens/analytics.md) |

Эти семь изображений имеют статус утверждённых эталонов. Реализация должна
сохранять их визуальный язык и композицию, используя существующие данные и
поведение приложения.

## Фон обычного VOLT

- [Контракт VOLT 2.0](../design/VOLT_BACKGROUND.md)
- [WebP для реализации](../../public/backgrounds/volt-2-gym-neon.webp)
- [PNG-исходник 1672×941](../../public/backgrounds/volt-2-gym-neon.png)

Это действующий общий фон приложения и полезный визуальный reference для
композиции, затемнения и Glass 2.0. Он не заменяет утверждённые изображения
отдельных экранов и не разрешает переносить людей из фона в другие иллюстрации.
