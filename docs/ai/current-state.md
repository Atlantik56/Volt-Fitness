# Current state

Updated from `main` at commit `a5e1bc4` (2026-08-05). Verify this snapshot
against the branch and canonical roadmaps before starting work.

## Product baseline

- The app is a self-hosted Next.js/TypeScript fitness tracker backed by local
  SQLite; production runs through Docker Compose.
- AI roadmap items AI-1 through AI-10 and the AI-9/AI-10 follow-up are recorded
  complete. AI-11 is not started.
- VOLT Swim has `/swim`, program, workout-detail, active/confirmation flows,
  schedule integration, Garmin/FIT matching and a deterministic insight
  service. The five-sprint plan remains the canonical scope document and does
  not yet record a simple per-sprint status table.
- Pushing to `main` triggers CI and, after success, production deployment.
  Feature work should use a branch/PR unless the user explicitly directs
  otherwise.

## Sources of truth

- Documentation index: [`../README.md`](../README.md)
- Current AI status: [`../ROADMAP_AI.md`](../ROADMAP_AI.md)
- AI principles: [`../AI_PRINCIPLES.md`](../AI_PRINCIPLES.md)
- VOLT Swim plan: [`../volt-swim/SPRINTS.md`](../volt-swim/SPRINTS.md)
- VOLT Swim design: [`../design/VOLT_SWIM.md`](../design/VOLT_SWIM.md)

Do not copy completed sprint reports into this file. Update only the snapshot
and links when the active baseline changes.
