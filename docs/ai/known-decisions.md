# Known decisions

This is a short decision index. Follow the linked source for rationale and
update the canonical document when a decision changes.

| Decision | Consequence | Source |
|---|---|---|
| Self-hosted and local-first | SQLite, uploads and Lite Coach work without an external AI service. | [`../../README.md`](../../README.md), [`../AI_PRINCIPLES.md`](../AI_PRINCIPLES.md) |
| Code calculates; LLM explains | Models receive compact prepared facts and cannot directly change plans or data. | [`../AI_PRINCIPLES.md`](../AI_PRINCIPLES.md) |
| One AI context path | Chat, MCP and reports reuse the shared context loader/projection instead of parallel SQL. | [`../AI_CONTEXT.md`](../AI_CONTEXT.md) |
| Existing engines evolve | Reuse domain analyzers; do not create broad replacement engines or merge domains with different safety rules. | [`../AI_ARCHITECTURE.md`](../AI_ARCHITECTURE.md) |
| VOLT Swim is a module on shared data | Swim uses shared workout logs and services, with separate routes and versioned program definitions. | [`../volt-swim/ARCHITECTURE.md`](../volt-swim/ARCHITECTURE.md) |
| Swim design evolves the approved reference | Preserve composition, calm dark palette, navigation and restrained motion; no unrelated redesign. | [`../design/VOLT_SWIM.md`](../design/VOLT_SWIM.md) |
| `main` is production-bound | A successful push to `main` deploys automatically; normal feature work should be reviewed from a branch. | [CI workflow](../../.github/workflows/ci.yml) |

Record only durable decisions here. Sprint results and implementation status
belong in the canonical roadmaps, not in this index.
