# Motion

Motion объясняет смену состояния и подтверждает действие. Канонические значения
и ограничения находятся в [`../design/ANIMATIONS.md`](../design/ANIMATIONS.md).

- `80ms`: press/локальный feedback.
- `160ms`: hover, focus, icon/state.
- `240ms`: panel, tab, step transition.
- `400ms`: hero/result reveal и подтверждённый progress.

Предпочитать transform/opacity. Переходы прерываемы и не задерживают navigation,
сохранение, таймер или ошибку. При `prefers-reduced-motion: reduce` убрать
translate, ripple, shimmer, parallax и ambient movement; оставить мгновенную
смену либо opacity `0–80ms`.

Бесконечные частицы, glow-pulse, bouncing/spring, confetti и motion поверх текста
не являются частью VOLT 2.0.
