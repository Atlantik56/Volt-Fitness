import webpush from "web-push";
import { db } from "./db";

const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "";
const privateKey = process.env.VAPID_PRIVATE_KEY || "";
const subject = process.env.VAPID_SUBJECT || "mailto:admin@volt-trainer.duckdns.org";
if (publicKey && privateKey) webpush.setVapidDetails(subject, publicKey, privateKey);

export async function sendToAll(payload: { title: string; body: string }) {
  if (!publicKey || !privateKey) return;
  const subs = db.prepare("SELECT id,endpoint,p256dh,auth FROM push_subscriptions").all() as any[];
  for (const s of subs) {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        JSON.stringify(payload)
      );
    } catch (err: any) {
      if (err?.statusCode === 404 || err?.statusCode === 410) {
        db.prepare("DELETE FROM push_subscriptions WHERE id=?").run(s.id);
      }
    }
  }
}

export function localTimeParts(tz: string) {
  const fmt = new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false, year: "numeric", month: "2-digit", day: "2-digit" });
  const parts = Object.fromEntries(fmt.formatToParts(new Date()).map((p) => [p.type, p.value]));
  return { hour: Number(parts.hour), minute: Number(parts.minute), date: `${parts.year}-${parts.month}-${parts.day}` };
}

export async function checkAndSendReminder() {
  const tz = process.env.REMINDER_TZ || "Europe/Moscow";
  const hour = Number(process.env.REMINDER_HOUR ?? 19);
  const { hour: h, date } = localTimeParts(tz);
  if (h !== hour) return;
  const state = db.prepare("SELECT last_sent_date FROM reminder_state WHERE id=1").get() as any;
  if (state?.last_sent_date === date) return;
  const todayWorkout = db.prepare("SELECT 1 FROM workout_logs WHERE date=?").get(date);
  if (todayWorkout) {
    db.prepare("UPDATE reminder_state SET last_sent_date=? WHERE id=1").run(date);
    return;
  }
  await sendToAll({ title: "VOLT", body: "20 минут с гантелями — прежде чем сесть за компьютер. Ты сильнее, чем кажется сегодня." });
  db.prepare("UPDATE reminder_state SET last_sent_date=? WHERE id=1").run(date);
}
