import { authenticateHealthDevice } from "@/lib/health-connect";

/** The companion uses its existing pairing; the PWA uses its login session. */
export async function requireHealthBridgeDownloadAuth(req: Request) {
  if (req.headers.has("authorization")) {
    if (authenticateHealthDevice(req)) return null;
    return Response.json({ error: "Устройство Health Bridge не авторизовано" }, {
      status: 401, headers: { "cache-control": "private, no-store" },
    });
  }
  const { requireAuth } = await import("@/lib/auth");
  return requireAuth();
}
