import type Database from "better-sqlite3";

type WorkoutRow = { id: number; details: string };

function detailsMatchExercise(detailsJson: string, exercise: string): boolean {
 let details: any;
 try { details = JSON.parse(detailsJson) } catch { return false }
 if (!Array.isArray(details)) return false;
 return details.some((d: any) => d && (d.originalName === exercise || d.name === exercise));
}

// Migration v9 — links legacy strength_logs (workout_id IS NULL) to workout_logs only
// when the match is unambiguous: same date, exercise present in the workout's
// details (by originalName or name), and exactly one candidate workout on that date.
// Ambiguous matches and manual entries with no matching workout are left untouched.
export function linkLegacyStrengthLogs(db: Database.Database): number {
 const orphans = db.prepare("SELECT id,date,exercise FROM strength_logs WHERE workout_id IS NULL").all() as { id: number; date: string; exercise: string }[];
 const candidatesByDate = db.prepare("SELECT id,details FROM workout_logs WHERE date=? AND type='Силовая'");
 const link = db.prepare("UPDATE strength_logs SET workout_id=? WHERE id=?");
 let linked = 0;
 for (const orphan of orphans) {
  const candidates = (candidatesByDate.all(orphan.date) as WorkoutRow[]).filter(w => detailsMatchExercise(w.details, orphan.exercise));
  if (candidates.length === 1) {
   link.run(candidates[0].id, orphan.id);
   linked++;
  }
 }
 return linked;
}
