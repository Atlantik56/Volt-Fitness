import { sql } from "drizzle-orm";
import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const profile = sqliteTable("profile", {
  id: integer("id").primaryKey(), name: text("name").notNull().default("Илья"), height: real("height").notNull().default(167), startWeight: real("start_weight").notNull().default(86), targetWeight: real("target_weight").notNull().default(67), programStart: text("program_start").notNull().default("2026-07-21"), createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`)
});
export const workoutLogs = sqliteTable("workout_logs", { id: integer("id").primaryKey({autoIncrement:true}), date:text("date").notNull(), type:text("type").notNull(), title:text("title").notNull(), completed:text("completed").notNull().default("[]"), rounds:integer("rounds").notNull().default(1), createdAt:text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`) });
export const measurements = sqliteTable("measurements", { id:integer("id").primaryKey({autoIncrement:true}), date:text("date").notNull(), weight:real("weight"), waist:real("waist"), chest:real("chest"), biceps:real("biceps"), thigh:real("thigh"), neck:real("neck"), createdAt:text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`) });
export const photos = sqliteTable("photos", { id:integer("id").primaryKey({autoIncrement:true}), objectKey:text("object_key").notNull(), date:text("date").notNull(), contentType:text("content_type").notNull(), createdAt:text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`) });
export const dailyActivity = sqliteTable("daily_activity", { id:integer("id").primaryKey({autoIncrement:true}), date:text("date").notNull().unique(), steps:integer("steps").notNull().default(0), activeMinutes:integer("active_minutes").notNull().default(0), calories:integer("calories").notNull().default(0), createdAt:text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`) });
