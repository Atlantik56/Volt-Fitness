# VOLT — контекст для Claude Code

Этот файл — оперативная память между сессиями: кто мы, где что лежит, как
деплоить и куда смотреть за планом работ. Читай его в начале любой сессии по
этому проекту, вместо того чтобы заново спрашивать пользователя.

## Что это за проект

VOLT — self-hosted персональный фитнес-трекер (Next.js + TypeScript + SQLite +
PWA + Docker Compose), проект пользователя (Илья). Разрабатывается спринтами;
внутри спринтов — VOLT Coach, детерминированный локальный "ИИ-тренер" плюс
опциональный LLM-чат поверх него. Чат работает через AI Hub с Anthropic в
качестве основной модели и MWS GPT в качестве дополнительной.

Индекс действующей документации — [`docs/README.md`](docs/README.md).
Обязательные ограничения AI («код считает, ИИ объясняет», локальность,
минимизация токенов и отсутствие оценки пользователя) — в
[`docs/AI_PRINCIPLES.md`](docs/AI_PRINCIPLES.md). Исторический handoff по AI
Hub сохранён в
[`docs/archive/sprints/AI_HUB_HANDOFF.md`](docs/archive/sprints/AI_HUB_HANDOFF.md);
перед изменением LLM-чата сверяй его с актуальным кодом и текущей
AI-архитектурой.

## Roadmap и статус спринтов

**Текущий план AI-работ — [`docs/ROADMAP_AI.md`](docs/ROADMAP_AI.md).**
История выполненных продуктовых Sprint 1–8 остаётся в
[`docs/VOLT_ROADMAP.md`](docs/VOLT_ROADMAP.md). Для ответа «что дальше» используй
`ROADMAP_AI.md`; для ответа «почему старое решение было принято» — продуктовый
roadmap и [`docs/archive/sprints/`](docs/archive/sprints/README.md).

AI-спринты выполняются строго по одному в порядке AI-1…AI-6. Перед кодом
прочитай `AI_PRINCIPLES.md`, `AI_ARCHITECTURE.md`, `ROADMAP_AI.md` и профильный
документ текущего спринта. Не начинай следующий спринт автоматически.

## Репозиторий и git

- GitHub: `git@github.com:Atlantik56/Volt-Fitness.git` (приватный), ветка `main`.
- Локальная рабочая копия на этой машине: `/Users/igoncharov/Volt-Fitness`.
- Обычный процесс: коммит и `git push` в `main` — деплой на прод происходит
  **автоматически** (см. ниже), ручной SSH-деплой не нужен в норме.
- Коммиты подписывай `Co-Authored-By: Claude <...>` как обычно; отдельная
  ветка/PR не требуется, проект однопользовательский, пушим прямо в `main`.

## VPS и деплой

- Прод: VPS `144.31.18.121`, домен `https://volt-trainer.duckdns.org` (Caddy
  на порту 443 проксирует на `127.0.0.1:3000`, TLS через Let's Encrypt/acme.sh
  с авто-reload хуком).
- Код на сервере: `/opt/volt-fitness` (та же ветка `main`, свой клон).
- SSH-доступ (root, для ручной диагностики и первичной настройки):
  `ssh -i ~/.ssh/fitness_vps_ed25519 root@144.31.18.121`
- Приложение — Docker Compose (`docker-compose.yml`), контейнер
  `volt-fitness-volt-1`, том `volt-fitness_volt-data` (SQLite + аплоады),
  секреты — в `/opt/volt-fitness/.env` (не коммитится).

### Непрерывный деплой (CD) — настроен, ничего вручную делать не нужно

После каждого `push` в `main`:
1. GitHub Actions job `build` (`.github/workflows/ci.yml`) — lint, typecheck,
   test, production build.
2. Если `build` зелёный — job `deploy` запускается на **self-hosted runner**,
   установленном прямо на VPS (systemd-сервис `actions.runner.Atlantik56-Volt-Fitness.volt-vps-runner`,
   работает от пользователя `gha-runner`, лейбл `volt-vps`).
3. Runner выполняет ровно одну команду: `sudo /opt/volt-fitness/deploy.sh`
   (git pull --ff-only && docker compose up -d --build), разрешённую точечным
   sudoers-правилом (`/etc/sudoers.d/gha-runner-deploy`). `gha-runner` не в
   группе docker, не имеет своего git-доступа — привилегия сведена к одному
   фиксированному скрипту.
4. Job `deploy` условен на `push` в `main` (не на `pull_request`) — runner
   никогда не чекаутит и не исполняет код PR.

Проверить статус: `gh run list --repo Atlantik56/Volt-Fitness --limit 5`
(или `gh run watch <id>`). Раннер числится в
`gh api repos/Atlantik56/Volt-Fitness/actions/runners`.

**Если CD почему-то не сработал**, ручной фолбэк (тот же эффект):
```bash
ssh -i ~/.ssh/fitness_vps_ed25519 root@144.31.18.121 "cd /opt/volt-fitness && git pull && docker compose up -d --build"
```

## Локальный dev-стенд

- `.claude/launch.json` в `/Users/igoncharov/ClaudeCode` содержит конфиг
  `volt-fitness-dev` — `npm --prefix /Users/igoncharov/Volt-Fitness run dev -- -p 3010`.
  Запускать через `preview_start` (Browser pane), не через голый Bash.
- У dev-стенда **своя** SQLite-база (`Volt-Fitness/data/volt.sqlite`),
  отдельная от прода — свой логин/пароль. Если пароль неизвестен, можно
  сбросить `auth_user`/`sessions`/`auth_attempts` в этой локальной базе
  (только `data/volt.sqlite`, не трогать прод) и завести пароль заново через
  экран "Задайте пароль" — пользователь вводит его сам в браузере.
- После значимых UI-изменений — визуальная проверка в Browser pane (desktop +
  мобильная ширина 360–412px), не полагаться только на typecheck/lint/build.

## Полезные команды

```bash
# тесты/типы/линт/сборка (то же самое гоняет CI)
cd /Users/igoncharov/Volt-Fitness && npm test && npm run typecheck && npm run lint && npm run build

# статус последнего деплоя
gh run list --repo Atlantik56/Volt-Fitness --limit 3

# диагностика на проде (read-only, безопасно)
ssh -i ~/.ssh/fitness_vps_ed25519 root@144.31.18.121 "docker ps --filter name=volt && curl -s -o /dev/null -w 'HTTP %{http_code}\n' http://localhost:3000"
```

## Что НЕ делать без явного запроса пользователя

- Не менять/не удалять sudoers-правило `gha-runner-deploy` и не расширять
  права `gha-runner` (сейчас — минимально необходимые, обсуждалось явно).
- Не трогать другие сервисы на этом VPS (там же крутятся VeloCore,
  Telegram-прокси, VPN) — они не относятся к VOLT.
- Не пушить в `main`, минуя обычный процесс, если пользователь просит иное
  (например, отдельную ветку для эксперимента).
