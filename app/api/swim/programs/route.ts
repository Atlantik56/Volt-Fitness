import { requireAuth } from "@/lib/auth";
import { listProgramsWithProgress } from "@/lib/swim/services";
export const runtime = "nodejs";

export async function GET() {
  const denied = await requireAuth();
  if (denied) return denied;
  const programs = listProgramsWithProgress().map((progress) => ({
    id: progress.program.id,
    name: progress.program.name,
    description: progress.program.description,
    level: progress.program.level,
    status: progress.program.status,
    completedCount: progress.completedCount,
    totalCount: progress.totalCount,
  }));
  return Response.json({ programs }, { headers: { "cache-control": "no-store" } });
}
