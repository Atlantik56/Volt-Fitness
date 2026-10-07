import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { requireAuth } from "@/lib/auth";
import { HEALTH_BRIDGE_RELEASE } from "@/lib/health-bridge-release";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const denied = await requireAuth();
  if (denied) return denied;

  const release = HEALTH_BRIDGE_RELEASE;
  const file = path.join(process.cwd(), "releases", "health-bridge", release.filename);
  try {
    const info = await stat(file);
    if (!info.isFile() || info.size !== release.bytes) throw new Error("APK unavailable");
    const stream = Readable.toWeb(createReadStream(file)) as ReadableStream<Uint8Array>;
    return new Response(stream, {
      headers: {
        "content-type": "application/vnd.android.package-archive",
        "content-disposition": `attachment; filename="${release.filename}"`,
        "content-length": String(info.size),
        "cache-control": "private, no-store",
        "x-content-type-options": "nosniff",
        "x-checksum-sha256": release.sha256,
      },
    });
  } catch {
    return Response.json({ error: "APK временно недоступен" }, {
      status: 503,
      headers: { "cache-control": "private, no-store" },
    });
  }
}
