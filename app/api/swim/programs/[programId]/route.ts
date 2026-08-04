import { requireAuth } from "@/lib/auth";
import { getProgramProgress } from "@/lib/swim/services";
export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: Promise<{ programId: string }> }) {
  const denied = await requireAuth();
  if (denied) return denied;
  const { programId } = await params;
  const progress = getProgramProgress(programId);
  if (!progress) return Response.json({ error: "Программа не найдена" }, { status: 404 });
  return Response.json({ progress }, { headers: { "cache-control": "no-store" } });
}
