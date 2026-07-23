export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { checkAndSendReminder } = await import("./lib/push");
  let running = false;
  setInterval(() => {
    if (running) return; // a previous run (e.g. a slow/hanging push send) is still in flight — skip this tick instead of piling up
    running = true;
    checkAndSendReminder().catch(() => {}).finally(() => { running = false; });
  }, 60_000);
}
