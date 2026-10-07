# VOLT private AI plugin

The plugin exposes six read-only MCP tools for an authenticated owner. Model execution stays in the connected AI product; no model API key is needed in VOLT. This branch prepares the backend and plugin package. It does not install a connector or enable production access.

## Endpoints after deployment

- MCP: `https://volt-trainer.duckdns.org/mcp`
- Protected-resource metadata: `/.well-known/oauth-protected-resource` and `/.well-known/oauth-protected-resource/mcp`
- Authorization-server metadata: `/.well-known/oauth-authorization-server`
- OAuth: `/oauth/register`, `/oauth/authorize`, `/oauth/token`, `/oauth/revoke`

Public clients use authorization codes and PKCE S256, one-hour access tokens, rotating 180-day refresh tokens, and hashed code/token storage. Consent requires the existing VOLT login session and a same-origin submission. Refresh replay revokes the token family. Registration is limited to 60 clients per hour. Request bodies are bounded by bytes while streaming. Migration 32 adds the OAuth tables; Health Connect reserves migration 33.

## Tools and scopes

| Tool | Required scope |
| --- | --- |
| `get_today_summary` | `volt.profile.read`, `volt.training.read` |
| `get_week_plan` | `volt.training.read` |
| `get_recent_workouts` | `volt.training.read` |
| `get_training_load` | `volt.analytics.read` |
| `get_progress_summary` | `volt.profile.read`, `volt.analytics.read` |
| `get_records` | `volt.analytics.read` |

All tools are read-only and exclude workouts whose `external_activity_source` is `strava`. Existing stdio `mcp-server.ts`, `volt://snapshot`, and `get_volt_context` remain available.

## Validation

Run `npm test`, `npm run typecheck`, `npm run lint`, and `npm run build`. The tests cover scopes, owner isolation, dates, OAuth expiry, exact redirect/client/PKCE matching, code replay, refresh rotation/replay, revocation, registration limits, and bounded streaming bodies.

Local HTTP validation with the MCP SDK and synthetic data covered discovery, consent authentication/origin checks, PKCE exchange, six tools, and refresh replay revocation. Production deployment still requires discovery, consent, token exchange/revocation, and MCP initialization checks on the public HTTPS origin. Never log credential values.
