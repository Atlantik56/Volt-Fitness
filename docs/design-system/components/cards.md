# Cards

Карточка группирует связанную информацию, а не дробит любой контент на плитки.

## Утверждённые роли

- base/section panel;
- metric: label, value, unit, period, delta/target и честное `no data`;
- workout/program: контекст, статус, основные параметры и следующий шаг;
- progress/goal: значение, цель, период и доступное текстовое объяснение;
- Coach insight: summary, evidence, next step и источник.

Одинаковые роли используют одинаковые radius, border, depth и padding. Важные
состояния не передаются только цветом. Loading сохраняет геометрию; empty state
объясняет причину и следующее действие.

Swim-роли подробно перечислены в [`../../design/COMPONENTS.md`](../../design/COMPONENTS.md).
