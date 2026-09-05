import webpush from "web-push";
import { db } from "./db";

const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "";
const privateKey = process.env.VAPID_PRIVATE_KEY || "";
const subject = process.env.VAPID_SUBJECT || "mailto:admin@volt-trainer.duckdns.org";
if (publicKey && privateKey) webpush.setVapidDetails(subject, publicKey, privateKey);

const PUSH_SEND_TIMEOUT_MS = 10_000;

// Push endpoints are handed out by browser vendors (FCM, Mozilla, Apple, Windows) and are
// always public HTTPS hostnames, never raw IPs or loopback/internal addresses. Rejecting
// anything else stops a stored endpoint from being used to make the server request an
// internal-only address (SSRF) when a reminder is sent.
export function isSafePushEndpoint(endpoint: string): boolean {
  let url: URL;
  try { url = new URL(endpoint); } catch { return false; }
  if (url.protocol !== "https:") return false;
  const host = url.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) return false;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return false; // IPv4 literal
  if (host.includes(":")) return false; // IPv6 literal (always bracketed in a URL, so a literal colon here means an IPv6 host)
  return true;
}

export async function sendToAll(payload: { title: string; body: string }) {
  if (!publicKey || !privateKey) return;
  const subs = db.prepare("SELECT id,endpoint,p256dh,auth FROM push_subscriptions").all() as any[];
  for (const s of subs) {
    if (!isSafePushEndpoint(s.endpoint)) { db.prepare("DELETE FROM push_subscriptions WHERE id=?").run(s.id); continue; }
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        JSON.stringify(payload),
        { timeout: PUSH_SEND_TIMEOUT_MS }
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
  await sendToAll({ title: "RITMOVIS", body: "Проверь план на сегодня и выбери спокойную нагрузку без боли. Регулярность важнее максимума." });
  db.prepare("UPDATE reminder_state SET last_sent_date=? WHERE id=1").run(date);
}
