# Импорт из Garmin — автоматический, без ручной загрузки

Задача: тренировки и суточные метрики попадают в VOLT сами. WattAttack
выгружает заезды в Garmin Connect, поэтому отдельного коннектора для него не
нужно — достаточно одного пути из Garmin.

```
WattAttack ─┐
             ├─→ Garmin Connect ─→ intervals.icu ─→ VOLT
Часы/датчики ┘      (авто-синк)     (FIT + wellness)
```

## Выбранный путь: intervals.icu

[intervals.icu](https://www.intervals.icu/) — бесплатная платформа для
триатлона и велоспорта с официальной интеграцией Garmin Connect и
[открытым API](https://www.intervals.icu/features/open-api/).

Почему именно она:

- **Оба перехода официальные.** Garmin → intervals.icu — санкционированный
  синк, активность доезжает за ~5 минут. intervals.icu → VOLT — их публичный
  API, рассчитанный в том числе на личное использование.
- **Личный API-ключ**, генерируется владельцем в Settings → Developer
  Settings. Ни партнёрского соглашения, ни модерации.
- **Бесплатно**, без платных тиров.
- **Отдаёт активности в FIT.** Значит `importFit` из
  [`lib/fit-import-service.ts`](../lib/fit-import-service.ts) используется
  как есть: `parseFit` проставляет `source:"garmin_fit"`, дедупликация по
  fingerprint и сопоставление с черновиками уже работают.
- **Wellness**: вес, пульс покоя, HRV, шаги — чтение и запись.
- **Вебхуки** на загрузку активности: опрос по расписанию не нужен.
- Обычный HTTPS с заголовком авторизации прямо из Next.js. Ни отдельного
  контейнера, ни Python, ни браузера.

### Контракт API (проверено по `https://intervals.icu/api/v1/docs`)

Аутентификация — HTTP Basic: логин буквально `API_KEY`, пароль — личный ключ
владельца из `/settings`.

| Назначение | Эндпоинт |
|---|---|
| Список активностей за период | `GET /api/v1/athlete/{id}/activities?oldest=&newest=&limit=` |
| **Оригинальный** файл активности | `GET /api/v1/activity/{id}/file` |
| Перегенерированный FIT (запасной) | `GET /api/v1/activity/{id}/fit-file` |
| Wellness за период | `GET /api/v1/athlete/{id}/wellness{ext}?oldest=&newest=` |
| Wellness за дату | `GET /api/v1/athlete/{id}/wellness/{date}` |

Берём `/file`: это настоящий FIT с часов, `parseFit` получает максимум данных.
`/fit-file` — перерисовка самой intervals.icu, используется только если
оригинала нет.

Wellness отдаёт `sleepSecs`, `sleepScore`, `sleepQuality`, `avgSleepingHR`,
`hrv`, `hrvSDNN`, `restingHR`, `readiness`, `weight`, `steps`, `spO2`,
`respiration`, `vo2max`, `ctl`, `atl`. Сон присутствует — **Health Connect для
задачи не нужен.**

## Не понадобилось: Health Connect (начатая ветка)

В ветке `feature/health-bridge-sprint-1` (коммит `2cea1c8`, ~1544 строки, в
`main` не влита) лежит готовый наполовину мост через Android Health Connect,
куда приложение Garmin пишет данные само.

Уже написано:

- [`lib/health-connect.ts`](../lib/health-connect.ts) — типы записей
  `exercise`, `sleep` (со стадиями), `heart_rate`, `resting_heart_rate`,
  `heart_rate_variability`, `weight`, `steps`, калории; валидация через zod.
- Сопряжение устройства: `createHealthPairing` → `claimHealthPairing` →
  `authenticateHealthDevice`, токены устройств, отзыв доступа.
- Роуты `/api/health-connect/pair`, `/pairing`, `/sync`; экран
  `health-connect-settings.tsx`; миграции; тесты
  `tests/health-connect-ingest.test.ts`.
- Каркас Android-приложения на Kotlin в `android/health-bridge/`.

Плюс: путь полностью официальный и не зависит от третьей стороны. Минус:
нужно собрать, подписать и держать на телефоне Android-приложение, и данные
идут только когда телефон в сети.

**Решение:** intervals.icu закрывает и тренировки, и сон с HRV, поэтому для
текущей задачи Health Connect не нужен. Ветку не удаляем: это готовый наполовину
путь без внешних зависимостей, полезный, если intervals.icu когда-нибудь
перестанет устраивать.

## Отвергнутые варианты

- **Официальный Garmin Health API** — требует партнёрского соглашения,
  для личного проекта недоступен.
- **Strava.** С 2026-06-01 требует платную подписку (~$12/мес) даже для
  доступа к собственным данным. Плюс в VOLT её данные намеренно исключены из
  Analytics и AI Coach (см. [`STRAVA_INTEGRATION.md`](STRAVA_INTEGRATION.md))
  и живут транзиентным кэшем 7 дней. Цели «коуч видит вело и пульс» не
  достигает даже за деньги.
- **`python-garminconnect` напрямую.** В марте 2026 Garmin включил Cloudflare
  TLS-fingerprinting и заблокировал не-браузерные клиенты; `garth` из-за этого
  закрыт. Библиотека выжила через `curl_cffi`, имитирующий на уровне TLS
  официальное Android-приложение. Работает, но это обход активной блокировки:
  сломается при следующем изменении у Garmin, требует отдельного Python-
  контейнера и хранения сессии Garmin. При наличии intervals.icu — лишний
  риск без выигрыша.

## Этап 1 — тренировки

1. Владелец подключает Garmin Connect в intervals.icu и генерирует API-ключ.
2. `INTERVALS_API_KEY` и `INTERVALS_ATHLETE_ID` в `.env`.
3. `lib/intervals-client.ts` — список активностей за период, скачивание FIT по
   activity id. Ключ только на сервере, в браузер не попадает.
4. `lib/intervals-service.ts` — инкрементальная синхронизация: с момента
   `last_sync_at` (при первом запуске — 90 дней назад), FIT → `importFit`,
   дубли отсекает существующий fingerprint.
5. Таблица `intervals_connection`: `status`, `last_sync_at`, `last_error`.
6. Роут `/api/intervals/webhook` для вебхука + ручная синхронизация как
   запасной путь и первичный импорт.
7. Экран подключения в профиле рядом с существующей интеграцией Strava.

После этапа тренировки с часов и заезды WattAttack приходят сами и участвуют
в аналитике и контексте коуча наравне с ручным FIT.

## Этап 2 — сон, HRV, готовность

1. Таблица `daily_health`: `date` UNIQUE, `sleep_seconds`, фазы сна,
   `hrv_overnight_avg`, `resting_hr`, `source`.
2. Забор wellness из intervals.icu по диапазону дат.
3. [`lib/readiness.ts`](../lib/readiness.ts) — поле `sleepHours` в формуле
   **уже есть**. Меняется только источник: измеренный сон вместо самоотчёта, с
   откатом на самоотчёт, если данных за дату нет. Формулу не трогаем.
4. [`lib/ai-context.ts`](../lib/ai-context.ts) — добавить сон и HRV в
   `AiCoachContext` и в рендер рядом с блоком `wellness`.

Ограничение из [`AI_PRINCIPLES.md`](AI_PRINCIPLES.md) сохраняется: считает код,
ИИ объясняет. Готовность остаётся детерминированной функцией.

## Definition of Done

- [ ] Тренировка с часов появляется в VOLT без ручных действий.
- [ ] Заезд WattAttack доезжает тем же путём и определяется как `bike`.
- [ ] Повторная синхронизация не создаёт дублей.
- [ ] Недоступность intervals.icu не роняет VOLT: статус виден в профиле,
      `last_error` заполнен, приложение работает.
- [ ] `INTERVALS_API_KEY` не утекает в браузер и в логи.
- [ ] Сон подставляется в готовность, при отсутствии данных — самоотчёт.
