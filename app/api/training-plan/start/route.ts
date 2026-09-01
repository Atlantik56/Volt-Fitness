import { requireAuth, sameOrigin } from "@/lib/auth";
import { moscowIsoDate, restartTrainingPlanV3, startTrainingPlanV3 } from "@/lib/training-plan-activation";

export const runtime = "nodejs";

export async function GET() {
  const denied=await requireAuth();
  if(denied)return denied;
  return Response.json({date:moscowIsoDate()},{headers:{"cache-control":"no-store"}});
}

export async function POST(request: Request) {
  const denied = await requireAuth();
  if (denied) return denied;
  if (!sameOrigin(request)) return new Response(null, { status: 403 });
  const body=await request.json().catch(()=>({}));
  if(body?.action==="restart"){
    if(typeof body.expectedStartedAt!=="string")return Response.json({error:"Некорректная дата текущего цикла"},{status:400});
    const restarted=restartTrainingPlanV3(body.expectedStartedAt);
    return restarted.ok?Response.json(restarted,{status:201}):Response.json({error:restarted.error},{status:restarted.status});
  }
  const result = startTrainingPlanV3();
  if (!result) return Response.json({ error: "Профиль не найден" }, { status: 404 });
  return Response.json({ ok: true, ...result }, { status: result.alreadyStarted ? 200 : 201 });
}
