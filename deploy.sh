#!/bin/bash
# Deploy script run on the VPS by the self-hosted GitHub Actions runner
# (via a narrowly-scoped sudoers rule — see .github/workflows/ci.yml).
set -euo pipefail
cd /opt/volt-fitness
git pull --ff-only
docker compose up -d --build
