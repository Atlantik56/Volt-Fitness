# VOLT PWA

Production: https://volt-trainer.duckdns.org/ (primary 144.31.18.121).

The manifest keeps id and scope `/`, with versioned PNG icons in any and maskable variants. A new origin is a separate installation; existing host cookies, push subscriptions and launcher icons do not transfer. Sign in on the new domain and enable notifications there if needed.

The shared PWA provider captures beforeinstallprompt. The login and profile show installation controls; eligible users also get a dismissible promotion on other screens. A successful prompt choice is only a request, while appinstalled confirms installation. Without a browser event, the UI explains the manual flow and does not create a shortcut or claim success.

The worker precaches a small public offline document; icon failures are optional and large backgrounds cache on demand. Navigations remain network-only with a public offline fallback. API, non-GET and cross-origin requests are not intercepted. Authenticated HTML is never cached. Activation removes only owned media cache versions. Worker updates follow the normal lifecycle, without forced reloads during workouts or edits.

Both TLS certificates use the existing certbot webroot /var/www/volt-acme. HTTP is handled by nginx, HTTPS by velocore-caddy using /opt/velocore-caddy-test/Caddyfile. Preserve unrelated domains and technical HA lock records. Keep the RITMOVIS domain for migration redirects and existing API clients; do not delete it before those clients are moved.

Validation: production build and lint; clean Chromium installability, actual beforeinstallprompt, 320/390/768/1440 responsive widths, simulated cancellation and appinstalled, offline navigation. Worker tests cover optional asset failure, scoped cache cleanup, API/POST exclusion and no HTML caching. Physical Xperia WebAPK installation still requires device confirmation.

## VOLT restoration — 2026-10-07

The public name is VOLT again. The primary origin is volt-trainer.duckdns.org.
RITMOVIS page navigation redirects to the primary domain with path and query
preserved; existing API endpoints on both domains remain proxied for client
compatibility. Redirects apply only to GET/HEAD requests for application pages.
The service worker uses volt-media-v19 and removes previous owned VOLT/RITMOVIS
media caches without forcing reloads during workouts. Icon URLs are versioned
with volt-20261007. Existing origin-bound cookies, push subscriptions and PWA
installations remain separate; stored training records are not migrated.
