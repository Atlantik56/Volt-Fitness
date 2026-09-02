import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { linkLegacyStrengthLogs } from "./strength-log-linking.ts";

// DATA_DIR is a runtime-only persistent volume; it must not be bundled into the standalone trace.
const buildDatabase = process.env.VOLT_BUILD_DATABASE === "1";
const dataDir = buildDatabase ? "/tmp/volt-build" : path.resolve(/* turbopackIgnore: true */ process.env.DATA_DIR || "data");
export const uploadsDir = path.join(dataDir, "uploads");
mkdirSync(uploadsDir, { recursive: true, mode: 0o700 });

const globalDb = globalThis as unknown as { voltDb?: Database.Database };
export const db = globalDb.voltDb || new Database(buildDatabase ? ":memory:" : path.join(dataDir, "volt.sqlite"));
if (process.env.NODE_ENV !== "production") globalDb.voltDb = db;
db.pragma("busy_timeout = 10000");
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");
db.exec(`
CREATE TABLE IF NOT EXISTS auth_user (username TEXT PRIMARY KEY, password_hash TEXT NOT NULL, salt TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, username TEXT NOT NULL, expires_at INTEGER NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(username) REFERENCES auth_user(username) ON DELETE CASCADE);
CREATE TABLE IF NOT EXISTS auth_attempts (key TEXT PRIMARY KEY, failures INTEGER NOT NULL DEFAULT 0, blocked_until INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS profile (id INTEGER PRIMARY KEY, name TEXT NOT NULL DEFAULT 'Илья', height REAL NOT NULL DEFAULT 167, start_weight REAL NOT NULL DEFAULT 86, target_weight REAL NOT NULL DEFAULT 67, program_start TEXT NOT NULL DEFAULT '2026-07-21');
CREATE TABLE IF NOT EXISTS workout_logs (id INTEGER PRIMARY KEY AUTOINCREMENT, date TEXT NOT NULL, type TEXT NOT NULL, title TEXT NOT NULL, completed TEXT NOT NULL DEFAULT '[]', rounds INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS measurements (id INTEGER PRIMARY KEY AUTOINCREMENT, date TEXT NOT NULL, weight REAL, waist REAL, chest REAL, biceps REAL, thigh REAL, neck REAL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS photos (id INTEGER PRIMARY KEY AUTOINCREMENT, filename TEXT NOT NULL, date TEXT NOT NULL, content_type TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS daily_activity (id INTEGER PRIMARY KEY AUTOINCREMENT, date TEXT NOT NULL UNIQUE, steps INTEGER NOT NULL DEFAULT 0, active_minutes INTEGER NOT NULL DEFAULT 0, calories INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS food_logs (id INTEGER PRIMARY KEY AUTOINCREMENT, date TEXT NOT NULL, raw_text TEXT NOT NULL, items_json TEXT NOT NULL, calories REAL NOT NULL DEFAULT 0, protein REAL NOT NULL DEFAULT 0, fat REAL NOT NULL DEFAULT 0, carbs REAL NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS mood_logs (id INTEGER PRIMARY KEY AUTOINCREMENT, date TEXT NOT NULL, mood TEXT NOT NULL, note TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS push_subscriptions (id INTEGER PRIMARY KEY AUTOINCREMENT, endpoint TEXT NOT NULL UNIQUE, p256dh TEXT NOT NULL, auth TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS reminder_state (id INTEGER PRIMARY KEY CHECK(id=1), last_sent_date TEXT NOT NULL DEFAULT '');
INSERT OR IGNORE INTO profile (id,name,height,start_weight,target_weight,program_start) VALUES (1,'Илья',167,86,67,'2026-07-21');
INSERT OR IGNORE INTO workout_logs (id,date,type,title,completed,rounds) VALUES (1,'2026-07-21','Силовая','Гантели по кругу','[]',2);
INSERT OR IGNORE INTO measurements (id,date,weight) VALUES (1,'2026-07-21',85.9);
INSERT OR IGNORE INTO reminder_state (id,last_sent_date) VALUES (1,'');
`);
try{db.exec("ALTER TABLE food_logs ADD COLUMN meal_type TEXT NOT NULL DEFAULT 'Перекус'")}catch{}
try{db.exec("ALTER TABLE daily_activity ADD COLUMN beers INTEGER NOT NULL DEFAULT 0")}catch{}
try{db.exec("ALTER TABLE workout_logs ADD COLUMN duration_seconds INTEGER NOT NULL DEFAULT 0")}catch{}
try{db.exec("ALTER TABLE workout_logs ADD COLUMN rest_seconds INTEGER NOT NULL DEFAULT 0")}catch{}
try{db.exec("ALTER TABLE workout_logs ADD COLUMN details TEXT NOT NULL DEFAULT '{}'")}catch{}
try{db.exec("ALTER TABLE workout_logs ADD COLUMN min_heart_rate INTEGER NOT NULL DEFAULT 0")}catch{}
try{db.exec("ALTER TABLE workout_logs ADD COLUMN avg_heart_rate INTEGER NOT NULL DEFAULT 0")}catch{}
try{db.exec("ALTER TABLE workout_logs ADD COLUMN max_heart_rate INTEGER NOT NULL DEFAULT 0")}catch{}
try{db.exec("ALTER TABLE workout_logs ADD COLUMN calories INTEGER NOT NULL DEFAULT 0")}catch{}
try{db.exec("ALTER TABLE workout_logs ADD COLUMN distance_meters REAL NOT NULL DEFAULT 0")}catch{}
try{db.exec("ALTER TABLE workout_logs ADD COLUMN avg_speed REAL NOT NULL DEFAULT 0")}catch{}
try{db.exec("ALTER TABLE daily_activity ADD COLUMN sleep_hours REAL NOT NULL DEFAULT 0")}catch{}
try{db.exec("ALTER TABLE daily_activity ADD COLUMN work_end_time TEXT NOT NULL DEFAULT ''")}catch{}
try{db.exec("ALTER TABLE daily_activity ADD COLUMN first_drink_time TEXT NOT NULL DEFAULT ''")}catch{}
try{db.exec("ALTER TABLE daily_activity ADD COLUMN dinner INTEGER NOT NULL DEFAULT 0")}catch{}
try{db.exec("ALTER TABLE daily_activity ADD COLUMN walk INTEGER NOT NULL DEFAULT 0")}catch{}
try{db.exec("ALTER TABLE daily_activity ADD COLUMN water_liters REAL NOT NULL DEFAULT 0")}catch{}
try{db.exec("CREATE TABLE IF NOT EXISTS strength_logs (id INTEGER PRIMARY KEY AUTOINCREMENT, date TEXT NOT NULL, exercise TEXT NOT NULL, weight REAL NOT NULL, reps INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)")}catch{}

db.exec("CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)");
const migrations:{version:number;sql?:string;run?:(database:Database.Database)=>void}[]=[
 {version:1,sql:`CREATE TABLE IF NOT EXISTS wellness_logs (id INTEGER PRIMARY KEY AUTOINCREMENT,date TEXT NOT NULL UNIQUE,energy INTEGER NOT NULL DEFAULT 3,pain INTEGER NOT NULL DEFAULT 0,pain_area TEXT NOT NULL DEFAULT '',note TEXT NOT NULL DEFAULT '',created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
 CREATE TABLE IF NOT EXISTS schedule_overrides (id INTEGER PRIMARY KEY AUTOINCREMENT,original_date TEXT NOT NULL UNIQUE,scheduled_date TEXT NOT NULL,plan_title TEXT NOT NULL,replacement_title TEXT NOT NULL DEFAULT '',created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);`},
 {version:2,sql:`ALTER TABLE workout_logs ADD COLUMN effort TEXT NOT NULL DEFAULT '';ALTER TABLE workout_logs ADD COLUMN pain_after INTEGER NOT NULL DEFAULT 0;`},
 {version:3,sql:`ALTER TABLE food_logs ADD COLUMN note TEXT NOT NULL DEFAULT '';`},
 {version:4,sql:`ALTER TABLE strength_logs ADD COLUMN difficulty TEXT NOT NULL DEFAULT 'Нормально';`},
 {version:5,sql:`CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);`},
 {version:6,sql:`CREATE TABLE IF NOT EXISTS coach_conversation (id INTEGER PRIMARY KEY AUTOINCREMENT, role TEXT NOT NULL CHECK(role IN ('user','assistant')), text TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);`},
 {version:7,sql:`
  CREATE TABLE IF NOT EXISTS progression_decisions (
   id INTEGER PRIMARY KEY AUTOINCREMENT,
   workout_id INTEGER NOT NULL,
   exercise TEXT NOT NULL,
   action TEXT NOT NULL CHECK(action IN ('increase','maintain','decrease','deload','no-change')),
   reason_code TEXT NOT NULL,
   reason TEXT NOT NULL,
   used_signals TEXT NOT NULL DEFAULT '[]',
   limited_data INTEGER NOT NULL DEFAULT 0,
   from_weight REAL NOT NULL,
   from_reps INTEGER NOT NULL,
   to_weight REAL NOT NULL,
   to_reps INTEGER NOT NULL,
   pain_after REAL NOT NULL DEFAULT 0,
   effort TEXT NOT NULL DEFAULT '',
   workout_complete INTEGER NOT NULL DEFAULT 1,
   coach_action TEXT NOT NULL DEFAULT '',
   target_max_reps INTEGER,
   status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','accepted','rejected','cancelled')),
   created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
   decided_at TEXT
  );
  CREATE TABLE IF NOT EXISTS exercise_load_overrides (
   exercise TEXT PRIMARY KEY,
   weight REAL NOT NULL,
   reps INTEGER NOT NULL,
   source_decision_id INTEGER NOT NULL,
   created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
 `},
 {version:8,sql:`ALTER TABLE strength_logs ADD COLUMN workout_id INTEGER REFERENCES workout_logs(id) ON DELETE CASCADE;`},
 // Links pre-existing strength_logs (workout_id IS NULL) to workout_logs, only where
 // unambiguous — see lib/strength-log-linking.ts. Runs once; safe to no-op on a fresh DB.
 {version:9,run:(database:Database.Database)=>{linkLegacyStrengthLogs(database)}},
 // Sprint 7 — user-authored history of program stages (старт/дома/бассейн/зал/свой).
 // Pure metadata: no FK to workout_logs/measurements, so editing a stage never
 // rewrites past plans or results.
 {version:10,sql:`CREATE TABLE IF NOT EXISTS program_stages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL CHECK(kind IN ('start','home','pool','gym','custom')),
  title TEXT NOT NULL,
  start_date TEXT NOT NULL,
  end_date TEXT,
  note TEXT NOT NULL DEFAULT '',
  goal TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
 );`},
 // Sprint AI-3 — адаптивный вечерний чек-ин. Аддитивно расширяет daily_activity:
 // legacy sleep_hours/beers/first_drink_time/water_liters продолжают читаться как
 // раньше, ничего не бэкфилится задним числом. sleep_quality — единственная
 // по-настоящему nullable колонка здесь (как measurements.weight): нет осмысленного
 // 0-default для "оценка не указана". Остальные новые поля — NOT NULL DEFAULT '' /
 // 0, тот же стиль, что и у существующих колонок этой таблицы; отличие "не
 // отвечено" от "явный ноль" обеспечивают выделенные *_logged флаги, а не сами
 // значения (см. lib/evening-checkin.ts).
 {version:11,sql:`
  ALTER TABLE daily_activity ADD COLUMN sleep_start TEXT NOT NULL DEFAULT '';
  ALTER TABLE daily_activity ADD COLUMN sleep_end TEXT NOT NULL DEFAULT '';
  ALTER TABLE daily_activity ADD COLUMN sleep_minutes INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE daily_activity ADD COLUMN sleep_quality INTEGER;
  ALTER TABLE daily_activity ADD COLUMN water_logged INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE daily_activity ADD COLUMN alcohol_type TEXT NOT NULL DEFAULT '';
  ALTER TABLE daily_activity ADD COLUMN alcohol_servings INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE daily_activity ADD COLUMN alcohol_serving_volume_ml INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE daily_activity ADD COLUMN alcohol_relative_amount TEXT NOT NULL DEFAULT '';
  ALTER TABLE daily_activity ADD COLUMN alcohol_logged INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE daily_activity ADD COLUMN day_factor TEXT NOT NULL DEFAULT '';
  ALTER TABLE daily_activity ADD COLUMN day_factor_note TEXT NOT NULL DEFAULT '';
 `},
 // Sprint AI-5 — Coach Memory. Аддитивная таблица: не меняет и не бэкфилит
 // никакие существующие данные. Уникальность по (insight_id, evidence_hash) —
 // естественная защита от дублей при повторных/конкурентных upsert (см.
 // lib/insight-memory-store.ts). *_at — NULL означает "ещё не произошло", а не
 // 0/пустую строку (различение null/0/undefined из docs/MEMORY_ENGINE.md).
 {version:12,sql:`
  CREATE TABLE IF NOT EXISTS insight_log (
   id INTEGER PRIMARY KEY AUTOINCREMENT,
   insight_id TEXT NOT NULL,
   evidence_hash TEXT NOT NULL,
   source_revision TEXT NOT NULL,
   first_shown_at TEXT,
   last_shown_at TEXT,
   dismissed_at TEXT,
   resolved_at TEXT,
   show_count INTEGER NOT NULL DEFAULT 0,
   created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE UNIQUE INDEX IF NOT EXISTS idx_insight_log_pair ON insight_log(insight_id, evidence_hash);
  CREATE INDEX IF NOT EXISTS idx_insight_log_insight_id ON insight_log(insight_id);
 `},
 // Sprint AI-6 — ручные Milestones (docs/MILESTONES.md). Автоматические вехи
 // НЕ хранятся здесь — они всегда пересчитываются из measurements/workout_logs/
 // strength_logs/program_stages/photos (lib/milestones.ts). Эта таблица — только
 // для того, что невозможно восстановить из источников: пользовательский
 // заголовок/заметка/категория ручной вехи.
 {version:13,sql:`
  CREATE TABLE IF NOT EXISTS milestones (
   id INTEGER PRIMARY KEY AUTOINCREMENT,
   occurred_at TEXT NOT NULL,
   title TEXT NOT NULL,
   note TEXT NOT NULL DEFAULT '',
   category TEXT NOT NULL DEFAULT 'личное',
   created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_milestones_occurred_at ON milestones(occurred_at);
 `},
 // AI-7 — server-side draft and immutable plan snapshot. Actual workout/strength
 // rows are deliberately not created until explicit confirmation.
 {version:14,sql:`
  CREATE TABLE IF NOT EXISTS workout_drafts (
   id INTEGER PRIMARY KEY AUTOINCREMENT,
   date TEXT NOT NULL,
   plan_key TEXT NOT NULL,
   status TEXT NOT NULL CHECK(status IN ('planned','active','awaiting_confirmation','completed','cancelled')),
   snapshot TEXT NOT NULL,
   started_at TEXT,
   finished_at TEXT,
   confirmed_at TEXT,
   cancelled_at TEXT,
   workout_id INTEGER REFERENCES workout_logs(id),
   created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
   updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE UNIQUE INDEX IF NOT EXISTS idx_workout_drafts_open_plan
   ON workout_drafts(date,plan_key)
   WHERE status IN ('planned','active','awaiting_confirmation');
  CREATE INDEX IF NOT EXISTS idx_workout_drafts_recent
   ON workout_drafts(date DESC,id DESC);
 `},
 // AI-8 — provider-independent evidence imported from FIT. Raw files are never
 // persisted; workout_logs remain the only source of confirmed workouts.
 {version:15,sql:`
  CREATE TABLE IF NOT EXISTS workout_imports (
   id INTEGER PRIMARY KEY AUTOINCREMENT,
   source TEXT NOT NULL,
   external_id TEXT,
   fingerprint TEXT NOT NULL,
   started_at TEXT NOT NULL,
   duration_seconds INTEGER NOT NULL,
   activity_type TEXT NOT NULL,
   average_heart_rate INTEGER,
   max_heart_rate INTEGER,
   calories INTEGER,
   average_cadence REAL,
   training_effect REAL,
   metadata TEXT NOT NULL DEFAULT '{}',
   draft_id INTEGER REFERENCES workout_drafts(id),
   created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE UNIQUE INDEX IF NOT EXISTS idx_workout_imports_fingerprint
   ON workout_imports(source,fingerprint);
  CREATE INDEX IF NOT EXISTS idx_workout_imports_draft
   ON workout_imports(draft_id);
 `},
 // AI-9 доработка — происхождение метрик тренировки (Garmin/FIT vs ручной ввод).
 // Аддитивная колонка с безопасным дефолтом; старые записи читаются как 'manual'.
 {version:16,sql:`ALTER TABLE workout_logs ADD COLUMN metrics_source TEXT NOT NULL DEFAULT 'manual';`},
 // AI-11 — Гибкая неделя. Хранит только пользовательские изменения текущей
 // недели относительно канонической программы (app/personal-data.ts,
 // buildHomeWeek); сама программа остаётся неизменной и не копируется сюда.
 // date — календарная дата, UNIQUE: одна дата — одно актуальное изменение,
 // upsert по date даёт идемпотентность без дублей. assigned_source_day — номер
 // дня недели (1..7) программы, чей план теперь показывается в эту дату
 // (NULL — назначен отдых); для action='replace' и 'swap' это конкретный день
 // из homeWeek, для 'rest' — всегда NULL. swap_with_date — вторая дата пары
 // при обмене днями, NULL для остальных действий. reason_code — необязательный
 // ограниченный список причин (см. app/week-schedule-model.ts); используется
 // только как контекст для Coach, не для аналитики или диагностики.
 {version:17,sql:`
  CREATE TABLE IF NOT EXISTS week_schedule_changes (
   id INTEGER PRIMARY KEY AUTOINCREMENT,
   date TEXT NOT NULL UNIQUE,
   action TEXT NOT NULL CHECK(action IN ('replace','swap','rest')),
   assigned_source_day INTEGER,
   swap_with_date TEXT,
   reason_code TEXT NOT NULL DEFAULT '',
   created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
   updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_week_schedule_changes_date ON week_schedule_changes(date);
 `},
 // VOLT Swim Sprint 2 — свободные заметки после подтверждения тренировки
 // (lib/active-workout-service.ts confirmWorkoutDraft). Аддитивная колонка на
 // существующей таблице, а не отдельная swim-таблица: заметка — атрибут любой
 // тренировки, не только плавательной, и не имеет смысла без своего workout_log.
 {version:18,sql:`ALTER TABLE workout_logs ADD COLUMN notes TEXT NOT NULL DEFAULT '';`},
 // VOLT Swim — одноразовая дата активации Foundation. После появления общего
 // versioned program layer это не отдельный Week 1 anchor: календарная неделя
 // определяется program_start, а поле только включает Swim flow. Схема и
 // записанное значение сохраняются для обратной совместимости.
 {version:19,sql:`ALTER TABLE profile ADD COLUMN swim_plan_started_at TEXT;`},
 // VOLT Cycling — общий, а не discipline-specific, сигнал переносимости
 // нагрузки. Пустая строка означает, что пользователь ещё не оставил feedback.
 // Forward-only enum не меняет семантику отдельного числового pain_after.
 {version:20,sql:`ALTER TABLE workout_logs ADD COLUMN load_feedback TEXT NOT NULL DEFAULT '' CHECK(load_feedback IN ('','calm','discomfort','pain'));`},
 // Plan v3 включается только явным действием пользователя. NULL означает, что
 // новый план доступен лишь для preview; миграция не назначает его задним числом.
 {version:21,sql:`ALTER TABLE profile ADD COLUMN training_plan_v3_started_at TEXT;`},
 // Retry одного и того же Coach-запроса должен быть идемпотентным: ответ и
 // история сохраняются ровно один раз, а зависший processing можно подобрать.
 {version:22,sql:`
  CREATE TABLE IF NOT EXISTS coach_chat_requests (
   request_id TEXT PRIMARY KEY,
   status TEXT NOT NULL CHECK(status IN ('processing','completed')),
   response_json TEXT NOT NULL DEFAULT '',
   created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
   completed_at TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_coach_chat_requests_completed_at ON coach_chat_requests(completed_at);
 `},
 // Strava OAuth and provider-neutral activity provenance. OAuth credentials are
 // kept in their own encrypted-token table; workout_imports remains the common
 // staging layer and workout_logs only receives imported metrics after explicit
 // confirmation. The source columns make provider data removable on disconnect
 // without deleting the user's manually confirmed workout/exercise history.
 {version:23,sql:`
  CREATE TABLE IF NOT EXISTS strava_connections (
   username TEXT PRIMARY KEY,
   athlete_id TEXT NOT NULL,
   athlete_name TEXT NOT NULL DEFAULT '',
   scopes TEXT NOT NULL,
   connected_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
   updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
   last_synced_at TEXT,
   last_sync_error TEXT NOT NULL DEFAULT '',
   FOREIGN KEY(username) REFERENCES auth_user(username) ON DELETE CASCADE
  );
  CREATE TABLE IF NOT EXISTS strava_oauth_tokens (
   username TEXT PRIMARY KEY,
   access_token_encrypted TEXT NOT NULL,
   refresh_token_encrypted TEXT NOT NULL,
   expires_at INTEGER NOT NULL,
   updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
   FOREIGN KEY(username) REFERENCES strava_connections(username) ON DELETE CASCADE
  );
  CREATE UNIQUE INDEX IF NOT EXISTS idx_workout_imports_strava_activity
   ON workout_imports(source,external_id)
   WHERE source='strava' AND external_id IS NOT NULL;
  ALTER TABLE workout_logs ADD COLUMN external_activity_source TEXT;
  ALTER TABLE workout_logs ADD COLUMN external_activity_id TEXT;
 `},
 // Strava 2A/2B — transient provider cache, explicit authorization state and
 // a minimal durable webhook inbox. The inbox stores normalized identifiers
 // only (never the raw payload or credentials) and is safe to drain after the
 // webhook request has already been acknowledged.
 {version:24,sql:`
  ALTER TABLE strava_connections ADD COLUMN status TEXT NOT NULL DEFAULT 'connected';
  ALTER TABLE strava_connections ADD COLUMN needs_reauth_at TEXT;
  ALTER TABLE strava_connections ADD COLUMN last_webhook_at TEXT;
  -- SQLite rejects a non-constant default in ALTER TABLE when the table already
  -- contains rows. Use a constant migration-safe default, then preserve the
  -- original import timestamp for existing records. Application inserts set
  -- updated_at explicitly below.
  ALTER TABLE workout_imports ADD COLUMN updated_at TEXT NOT NULL DEFAULT '';
  UPDATE workout_imports SET updated_at=created_at WHERE updated_at='';
  ALTER TABLE workout_imports ADD COLUMN cache_expires_at TEXT;
  ALTER TABLE workout_imports ADD COLUMN review_status TEXT NOT NULL DEFAULT 'new';
  CREATE TABLE IF NOT EXISTS strava_webhook_events (
   event_id TEXT PRIMARY KEY,
   subscription_id TEXT NOT NULL,
   object_id TEXT NOT NULL,
   object_type TEXT NOT NULL,
   aspect_type TEXT NOT NULL,
   owner_id TEXT NOT NULL,
   event_time INTEGER NOT NULL,
   updates_json TEXT NOT NULL DEFAULT '{}',
   received_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
   processed_at TEXT,
   status TEXT NOT NULL DEFAULT 'pending',
   retry_count INTEGER NOT NULL DEFAULT 0,
   next_retry_at TEXT,
   last_error TEXT NOT NULL DEFAULT ''
  );
  CREATE INDEX IF NOT EXISTS idx_strava_webhook_events_due
   ON strava_webhook_events(status,next_retry_at,received_at);
  CREATE INDEX IF NOT EXISTS idx_workout_imports_strava_expiry
   ON workout_imports(source,cache_expires_at);
 `},
 // Plan v3 restart history. A cycle row preserves every previous activation
 // boundary, so restarting the current plan never rewrites historical
 // plan-vs-fact analytics. profile.training_plan_v3_started_at remains the
 // backwards-compatible pointer to the active cycle.
 {version:25,sql:`
  CREATE TABLE IF NOT EXISTS training_plan_cycles (
   id INTEGER PRIMARY KEY AUTOINCREMENT,
   program_id TEXT NOT NULL,
   program_version INTEGER NOT NULL,
   started_at TEXT NOT NULL,
   ended_at TEXT,
   restarted_from_cycle_id INTEGER REFERENCES training_plan_cycles(id),
   created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
   CHECK(ended_at IS NULL OR ended_at >= started_at)
  );
  CREATE UNIQUE INDEX IF NOT EXISTS idx_training_plan_cycles_open
   ON training_plan_cycles(program_id,program_version)
   WHERE ended_at IS NULL;
  CREATE INDEX IF NOT EXISTS idx_training_plan_cycles_dates
   ON training_plan_cycles(program_id,program_version,started_at,ended_at);
  INSERT INTO training_plan_cycles(program_id,program_version,started_at)
   SELECT 'volt-training',3,training_plan_v3_started_at FROM profile
   WHERE id=1 AND training_plan_v3_started_at IS NOT NULL
    AND NOT EXISTS(SELECT 1 FROM training_plan_cycles WHERE program_id='volt-training' AND program_version=3);
 `},
 // Состояние синхронизации с intervals.icu (docs/GARMIN_BRIDGE.md). Ключ API
 // живёт только в переменных окружения и сюда не попадает — таблица хранит
 // лишь прогресс и последнюю ошибку, чтобы показать статус в профиле и
 // продолжить инкрементальную синхронизацию после перезапуска.
 {version:26,sql:`
  CREATE TABLE IF NOT EXISTS intervals_connection (
   id INTEGER PRIMARY KEY CHECK(id=1),
   athlete_id TEXT NOT NULL DEFAULT '',
   last_synced_at TEXT,
   last_activity_date TEXT,
   last_sync_error TEXT NOT NULL DEFAULT '',
   status TEXT NOT NULL DEFAULT 'idle' CHECK(status IN ('idle','ok','sync_error','unauthorized')),
   updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  INSERT OR IGNORE INTO intervals_connection(id) VALUES(1);
 `},
 // AI-13 — измеренные сигналы восстановления с часов (docs/AI_12_ADAPTIVE_PROGRESSION.md).
 // Отдельно от daily_activity: там ручной ввод пользователя, здесь данные
 // устройства. Источник хранится явно, чтобы не смешивать их в расчётах.
 // Все метрики nullable: Garmin отдаёт разный набор в разные дни, и отсутствие
 // значения должно читаться как «нет данных», а не как ноль.
 {version:27,sql:`
  CREATE TABLE IF NOT EXISTS daily_health (
   date TEXT PRIMARY KEY,
   sleep_seconds INTEGER,
   sleep_score INTEGER,
   hrv_rmssd REAL,
   resting_hr INTEGER,
   source TEXT NOT NULL DEFAULT 'intervals',
   updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_daily_health_date ON daily_health(date DESC);
 `},
];
for(const migration of migrations){
 if(!db.prepare("SELECT 1 FROM schema_migrations WHERE version=?").get(migration.version)){
  const apply=db.transaction(()=>{
   if(migration.sql)for(const statement of migration.sql.split(";").map(x=>x.trim()).filter(Boolean)){try{db.exec(statement)}catch(error){if(!String(error).includes("duplicate column"))throw error}}
   if(migration.run)migration.run(db);
   db.prepare("INSERT OR IGNORE INTO schema_migrations(version) VALUES(?)").run(migration.version);
  });
  apply();
 }
}
