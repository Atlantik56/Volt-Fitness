import { db } from "@/lib/db"; import { isAuthenticated, USERNAME } from "@/lib/auth";
export const runtime="nodejs";
export async function GET(){return Response.json({setupRequired:!db.prepare("SELECT 1 FROM auth_user WHERE username=?").get(USERNAME),authenticated:await isAuthenticated(),username:USERNAME})}
