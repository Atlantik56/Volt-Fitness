import type Database from "better-sqlite3";

export function buildUserDataExport(database: Database.Database, exportedAt = new Date().toISOString()) {
  return database.transaction(() => ({
    format: "volt-user-data",
    version: 1,
    exportedAt,
    profile: database.prepare("SELECT name,height,start_weight,target_weight,program_start FROM profile WHERE id=1").get() ?? null,
    workouts: database.prepare(`SELECT id,date,type,title,completed,rounds,details,duration_seconds,rest_seconds,
      min_heart_rate,avg_heart_rate,max_heart_rate,calories,distance_meters,avg_speed,effort,pain_after,
      notes,load_feedback,metrics_source,external_activity_source,created_at
      FROM workout_logs ORDER BY date,id`).all(),
    measurements: database.prepare("SELECT id,date,weight,waist,chest,biceps,thigh,neck,created_at FROM measurements ORDER BY date,id").all(),
    activity: database.prepare(`SELECT date,steps,active_minutes,calories,beers,sleep_hours,
      work_end_time,first_drink_time,dinner,walk,water_liters,sleep_start,sleep_end,sleep_minutes,
      sleep_quality,water_logged,alcohol_type,alcohol_servings,alcohol_serving_volume_ml,
      alcohol_relative_amount,alcohol_logged,day_factor,day_factor_note
      FROM daily_activity ORDER BY date`).all(),
    photos: database.prepare("SELECT id,date,content_type,created_at FROM photos ORDER BY date,id").all(),
    photoFilesIncluded: false,
  }))();
}
