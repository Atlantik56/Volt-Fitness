# Strava integration

Strava is a read-only external activity source for the existing VOLT flow:

`Strava webhook / manual sync → transient External Activity cache → normalization → matcher → explicit confirmation → workout history`

An import never creates or confirms a workout by itself. Swim, Cycling, Gym and
other activities use the same `ActivityFamily` mapping and the existing draft
matching rules. Under the API Policy effective 2026-06-01, Strava data and data
derived from it are explicitly excluded from VOLT Analytics and AI Coach.

## Local setup

1. Create a Strava API application at <https://www.strava.com/settings/api>.
2. Set its callback domain to `localhost`.
3. Copy `.env.example` to the local environment and set:
   - `STRAVA_CLIENT_ID`;
   - `STRAVA_CLIENT_SECRET`;
   - `STRAVA_REDIRECT_URI` (for example,
     `http://localhost:3000/api/strava/callback`);
   - `STRAVA_TOKEN_ENCRYPTION_KEY` (generate once with
     `openssl rand -base64 32`);
   - optional `STRAVA_ACTIVITY_SCOPE=activity:read_all` when private
     activities are required. The default is the smaller `activity:read`.
   - `STRAVA_WEBHOOK_VERIFY_TOKEN` (random, at least 16 characters);
   - `STRAVA_WEBHOOK_PROCESS_TOKEN` (a different random value, at least 24 characters);
   - `STRAVA_WEBHOOK_CALLBACK_URL=https://<host>/api/strava/webhook`.
4. Restart VOLT, sign in, open Profile → Integrations → Strava, connect the
   account and run a manual sync.

The redirect URI must exactly match the application and the local port. HTTP is
accepted only for `localhost` / `127.0.0.1`; all other callbacks require HTTPS.

## Security and data lifecycle

- OAuth uses a short-lived, HttpOnly, SameSite state cookie.
- Access and refresh tokens are stored separately from connection metadata and
  encrypted with AES-256-GCM. Tokens and client secrets never reach the browser.
- Access tokens are refreshed with a one-hour safety window. The latest rotated
  refresh token always replaces the previous one.
- The default scope is `activity:read`; there is no profile or write permission.
- GPS coordinates, maps, photos, segment efforts and social fields are not
  stored.
- Deduplication uses `(source='strava', Strava activity id)`. The provider's
  upload/external id remains in bounded metadata.
- Disconnect uses Strava's current `/oauth/revoke` endpoint, deletes tokens and
  `workout_imports`, and clears Strava-derived metrics from confirmed workouts
  while preserving the user's workout, notes and exercise results.
- Strava activity records are a transient cache with an absolute seven-day TTL.
  A delete event, disconnect, remote deauthorization or TTL expiry removes the
  cached activity and clears Strava-derived duration, heart-rate, calorie,
  distance and speed values. The independent workout shell, notes, effort,
  pain/load feedback and manually entered exercise sets remain.
- A failed/invalid refresh or an authorization 401/403 sets `needs_reauth` and
  stops further refresh attempts until OAuth is completed again.
- Strava rows are filtered out before all Analytics, insight and AI context
  construction. Manual Garmin FIT data keeps its existing behavior.

## Manual sync behavior

- Initial sync requests up to 60 activities from the latest 90 days.
- Incremental sync overlaps the previous successful sync by two days to catch
  delayed updates.
- The list endpoint is followed by the detailed activity endpoint for every
  considered item.
- Rate-limit headers are parsed. Sync stops with headroom before the 15-minute
  read limit and reports partial completion instead of retrying aggressively.
- Manual sync is also the initial import and catch-up path. It drains due
  webhook events first and retains the 90-day / 60-activity bounds.

## Event Subscription and automatic sync

The callback supports Strava's GET validation handshake and activity
`create`, `update`, and `delete` events. It also handles the athlete
`authorized=false` event as remote revocation.

1. Deploy the HTTPS callback and test validation locally against
   `/api/strava/webhook?hub.mode=subscribe&hub.challenge=test&hub.verify_token=<verify-token>`.
2. Create the application's single subscription with URL-encoded form data:

   ```sh
   curl -X POST https://www.strava.com/api/v3/push_subscriptions \
     -F client_id="$STRAVA_CLIENT_ID" \
     -F client_secret="$STRAVA_CLIENT_SECRET" \
     -F callback_url="$STRAVA_WEBHOOK_CALLBACK_URL" \
     -F verify_token="$STRAVA_WEBHOOK_VERIFY_TOKEN"
   ```

3. Put the returned numeric id into `STRAVA_WEBHOOK_SUBSCRIPTION_ID` and restart.
   Events with another subscription id are rejected.
4. Call the private drain endpoint at least every five minutes from the existing
   platform scheduler. This handles retries and enforces retention even while
   no user is opening VOLT:

   ```sh
   curl -X POST https://<host>/api/strava/process-events \
     -H "Authorization: Bearer $STRAVA_WEBHOOK_PROCESS_TOKEN"
   ```

The public webhook only validates and inserts a normalized inbox row, then
returns 200. Next.js `after()` starts a fast drain outside the request path.
The private scheduled drain is the recovery path for 429/5xx backoff or process
restarts. Backoff is exponential from 60 seconds to six hours, with at most
eight scheduled retries. Duplicate deliveries share a deterministic SHA-256
event id. Raw payloads and secrets are never persisted.

Processing always maps `owner_id` to a server-side connection before fetching
the activity with that athlete's encrypted token. The client payload cannot
choose a VOLT user or token. Strava does not document a POST signature; the
configured subscription id, strict schema, durable dedup and server-side fetch
are therefore the relevant trust boundaries.

To inspect the existing subscription, GET the same push-subscriptions endpoint
with `client_id` and `client_secret`. To remove it, call DELETE on
`/api/v3/push_subscriptions/<id>` with those two values as query parameters,
then clear `STRAVA_WEBHOOK_SUBSCRIPTION_ID`.

## Matcher and review

`lib/activity-matcher.ts` assigns a deterministic 0–1 score and reports reasons
for sport, planned-day, start-time, duration, distance and subtype compatibility.
Confidence is `high`, `medium`, `low`, or `no_match`. Even `high` only proposes a
candidate. Profile → Integrations lets the user link another awaiting draft,
leave the activity separate, dismiss the notice, or open Plan for the existing
manual confirmation flow. Webhook updates refresh only the transient import and
never silently overwrite a confirmed workout.

## Current Strava constraints (checked 2026-09-01)

- Access tokens expire after six hours; refresh tokens can rotate on every
  refresh: <https://developers.strava.com/docs/authentication/>.
- Default read limits are 100 requests / 15 minutes and 1,000 / day:
  <https://developers.strava.com/docs/rate-limits/>.
- New applications start in single-player mode.
- The current API base is `https://www.strava.com/api/v3`. Strava says the new
  `https://api-v3.strava.com` base becomes available on 2027-01-04:
  <https://developers.strava.com/docs/changelog/>.
- The 2026 API Policy places strict limits on retaining Strava data and requires
  deletion after revocation: <https://www.strava.com/legal/api_policy>.
- Policy 5.3 prohibits any Strava or Strava-derived data in an AI application;
  policy 5.4 prohibits analytics/analysis and combining it with other customer
  data; policy 6.2 limits cache retention to seven days; policy 6.3 requires a
  Strava deletion to be reflected within 48 hours; policy 7.4 requires prompt
  permanent deletion after revoke/deauthorization.
- Webhook callbacks must acknowledge within two seconds and Strava retries up
  to three deliveries: <https://developers.strava.com/docs/webhooks/>.
- Production remains conditional on a lawful privacy policy, support contact,
  user deletion confirmation flow, active scheduled drain, Developer Portal
  subscription, branding review and the required Strava access tier. VOLT must
  not re-enable Strava data for Analytics/Coach without written Strava terms
  that expressly permit it.
