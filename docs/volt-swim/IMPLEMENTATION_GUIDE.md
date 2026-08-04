# VOLT Swim Implementation Guide

## Source of truth

Desktop approved designs and the documents in this folder are the source of truth. Codex should not reinterpret the visual direction or invent an unrelated component language.

## Integration rules

- Implement Swim inside the existing VOLT shell.
- Reuse the global navigation and product identity.
- Keep Swim contextual navigation inside the module.
- Do not create a separate application shell.

## Responsive behaviour

Mobile adaptation is implementation-led rather than a separate visual concept.

Requirements:

- Preserve the pool background with stronger dark overlay.
- Collapse global navigation into the existing VOLT mobile pattern.
- Stack cards by priority, not by desktop coordinate order.
- Keep the primary action visible without covering content.
- Avoid horizontal overflow at 360, 390 and 430 px.
- Charts must simplify labels and gridlines on narrow screens.

## Workout flow

`Начать тренировку`:

- creates/activates the workout session;
- starts a persistent timer;
- must survive navigation and page refresh;
- does not mark individual swim sets complete.

`Завершить тренировку`:

- stops the timer;
- moves the session to `awaiting_confirmation`;
- opens confirmation/result flow;
- attaches imported Garmin/FIT metrics when available.

## Garmin/FIT boundaries

- FIT is metric input only.
- FIT must not independently create or complete a workout.
- Plan snapshot remains server-owned.
- Confirmation must remain idempotent and create one final workout log.

## Visual QA checklist

- No people or swimmer imagery.
- Pool background remains readable and restrained.
- Cards use consistent radius, border, blur and spacing.
- No unexplained decorative lines in charts.
- History and Analytics remain functionally distinct.
- Hover and motion respect the motion contract.
- Reduced-motion mode works.
- No fake AI text or invented health conclusions.

## Suggested delivery order

1. Shared Swim shell and visual tokens.
2. Главная.
3. План тренировок.
4. Детали тренировки.
5. Сегодняшняя тренировка and timer state.
6. Завершение / confirmation.
7. История.
8. Аналитика.
9. Рекорды.
10. AI Coach.
11. Motion polish and responsive QA.
