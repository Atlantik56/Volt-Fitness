# Design contract router

This file is a compact entry point, not a replacement for design sources.

## General UI work

- Preserve the current visual language, navigation and responsive behaviour.
- Reuse existing components and tokens; do not redesign unrelated screens.
- Check loading, empty, error, offline, disabled and completed states where
  applicable.
- Verify desktop, 360–412 px mobile, keyboard/focus, contrast and reduced
  motion.

## VOLT Swim UI work

Before editing a Swim page, component, style or animation, read:

1. [`../design/VOLT_SWIM.md`](../design/VOLT_SWIM.md) — canonical contract and
   page Definition of Done.
2. [`../design/COMPONENTS.md`](../design/COMPONENTS.md) — component rules.
3. [`../design/ANIMATIONS.md`](../design/ANIMATIONS.md) — motion rules.
4. [`../volt-swim/SPRINTS.md`](../volt-swim/SPRINTS.md) — current scope.
5. [Approved visual reference](../design/volt-swim/volt-swim-concept-v17.jpg).

The contract has priority over visual improvisation. New visual patterns,
navigation or tokens require a documented proposal and explicit user approval
before implementation.
