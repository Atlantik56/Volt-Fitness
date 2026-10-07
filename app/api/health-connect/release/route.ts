import { requireHealthBridgeDownloadAuth } from "@/lib/health-bridge-download-auth";
import { HEALTH_BRIDGE_RELEASE, HEALTH_BRIDGE_DOWNLOAD_URL } from "@/lib/health-bridge-release";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const denied = await requireHealthBridgeDownloadAuth(req);
  if (denied) return denied;
  return Response.json({ ...HEALTH_BRIDGE_RELEASE, downloadPath: HEALTH_BRIDGE_DOWNLOAD_URL }, {
    headers: { "cache-control": "private, no-store", "x-content-type-options": "nosniff" },
  });
}
