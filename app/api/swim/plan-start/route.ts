import { requireAuth, sameOrigin } from "@/lib/auth";
import { startSwimPlan } from "@/lib/swim/services";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const denied = await requireAuth();
  if (denied) return denied;
  if (!sameOrigin(request)) return new Response(null, { status: 403 });
  const body = await request.json().catch(() => ({}));
  const result = startSwimPlan(typeof body.startedAt === "string" ? body.startedAt : "");
  if (!result.ok) return Response.json({ error: result.error, startedAt: result.startedAt ?? null }, { status: result.status });
  return Response.json({ ok: true, startedAt: result.startedAt }, { status: 201 });
}
