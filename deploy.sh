#!/bin/bash
# Deploy script run on the VPS by the self-hosted GitHub Actions runner
# (via a narrowly-scoped sudoers rule — see .github/workflows/ci.yml).
set -euo pipefail

readonly APP_DIR=/opt/volt-fitness
readonly BACKUP_DIR="$APP_DIR/backups"
readonly HEALTH_URL=http://127.0.0.1:3000/

cd "$APP_DIR"
old_sha="$(git rev-parse HEAD)"
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
backup_name="volt-${timestamp}-${old_sha:0:8}.sqlite"
install -d -m 700 "$BACKUP_DIR"
find "$BACKUP_DIR" -type f -name 'volt-*.sqlite' -exec chmod 600 {} +

# SQLite online backup: consistent even while the current container is serving traffic.
container_id="$(docker compose ps -q volt)"
if [[ -n "$container_id" ]]; then
  docker compose exec -T volt node -e \
    "const Database=require('better-sqlite3');const db=new Database('/app/data/volt.sqlite');db.backup('/app/data/${backup_name}').then(()=>db.close()).catch(e=>{console.error(e);process.exit(1)})"
  docker cp "$container_id:/app/data/$backup_name" "$BACKUP_DIR/$backup_name"
  chmod 600 "$BACKUP_DIR/$backup_name"
  docker compose exec -T volt rm -f "/app/data/$backup_name"
  docker compose exec -T volt sh -c 'chmod 700 /app/data; for file in /app/data/volt.sqlite /app/data/volt.sqlite-wal /app/data/volt.sqlite-shm; do [ ! -e "$file" ] || chmod 600 "$file"; done'
fi

rollback() {
  trap - ERR
  echo "Deploy failed; rolling application code back to $old_sha" >&2
  git reset --hard "$old_sha"
  docker compose up -d --build
  exit 1
}
trap rollback ERR

git pull --ff-only
docker compose up -d --build

healthy=0
for _ in {1..30}; do
  if curl --fail --silent --show-error --output /dev/null "$HEALTH_URL"; then
    healthy=1
    break
  fi
  sleep 2
done
if [[ "$healthy" -ne 1 ]]; then
  echo "Healthcheck failed: $HEALTH_URL" >&2
  false
fi

# Keep a rolling 30-day recovery window outside the Docker volume.
find "$BACKUP_DIR" -type f -name 'volt-*.sqlite' -mtime +30 -delete
echo "Deploy healthy; backup: $BACKUP_DIR/$backup_name"
