# Принципы дизайна

1. Один главный фокус и один основной CTA на смысловой блок.
2. Стабильная сетка, повторяемые линии выравнивания и спокойный ритм секций.
3. Сначала иерархия и читаемость, затем стекло, свечение и motion.
4. Состояния loading, empty, error, offline, disabled и complete проектируются
   вместе с основным состоянием.
5. Desktop задаёт полную композицию; mobile сохраняет смысл и функции, а не
   имитирует отдельный продукт.
6. Цвет, hover, motion и жест не являются единственными носителями смысла.
7. Новые паттерны, цвета и роли компонентов требуют явного утверждения.

## App Background Architecture

- The approved premium gym background image is an architectural layer of the
  application, not the content of any individual component.
- There must be a single background image for the page/application.
- Hero, cards, and all UI surfaces are rendered above this shared background.
- No component (Hero, card, section) owns or embeds the gym image.
- Do not create split layouts with a separate photo area.
- Do not duplicate or repeat the background image in multiple components.
- The background should create a continuous premium fitness-club atmosphere
  across the page, while glass panels, overlays, and local darkening preserve
  readability.
- If a visual implementation conflicts with this rule, this architectural rule
  takes precedence over component-level interpretation.

Для Swim действуют дополнительные обязательные правила из
[`../design/VOLT_SWIM.md`](../design/VOLT_SWIM.md).
