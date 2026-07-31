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
