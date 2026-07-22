import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import path from "node:path";

const dataDir = path.resolve(process.env.DATA_DIR || "data");
export const uploadsDir = path.join(dataDir, "uploads");
mkdirSync(uploadsDir, { recursive: true, mode: 0o700 });

const globalDb = globalThis as unknown as { voltDb?: Database.Database };
export const db = globalDb.voltDb || new Database(path.join(dataDir, "volt.sqlite"));
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
