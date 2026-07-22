export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { checkAndSendReminder } = await import("./lib/push");
  setInterval(() => { checkAndSendReminder().catch(() => {}); }, 60_000);
}
