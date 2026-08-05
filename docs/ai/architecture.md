# Architecture map

Use this map to find the relevant area without scanning the full repository.

| Area | Primary paths | Canonical detail |
|---|---|---|
| App and UI | `app/` | [`../README.md`](../README.md) |
| HTTP routes | `app/api/` | route code and tests |
| Domain/server logic | `lib/` | domain document where present |
| SQLite and migrations | `lib/db.ts` | existing migrations and migration tests |
| AI context and Coach | `lib/ai-*`, `lib/coach*`, `mcp-server.ts` | [`../AI_ARCHITECTURE.md`](../AI_ARCHITECTURE.md) |
| VOLT Swim | `app/swim/`, `lib/swim/`, swim API routes | [`../volt-swim/ARCHITECTURE.md`](../volt-swim/ARCHITECTURE.md) |
| Tests | `tests/*.test.ts` | nearest domain tests |
| CI/deploy | `.github/workflows/ci.yml`, Docker files | [`../../README.md`](../../README.md) |

## Stable boundaries

- UI/routes call domain services; business rules should not be duplicated in
  components or separate routes.
- SQLite is authoritative for local data. Schema changes are additive,
  migration-backed and tested against existing data.
- Deterministic code calculates facts, trends and safety decisions; an LLM may
  explain compact prepared facts but must not replace those calculations.
- Missing values remain missing (`null`), not zero. Secrets, photos and raw
  histories do not enter LLM context by default.
- Extend existing domain modules before creating another engine or parallel
  data-loading path.
