import AuthGate from "@/app/auth-gate.tsx";
import { db } from "@/lib/db.ts";
import { validateAuthorizationRequest } from "@/lib/volt-oauth.ts";

export const dynamic = "force-dynamic";

const scopeLabels: Record<string, string> = {
  "volt.profile.read": "профиль и измерения",
  "volt.training.read": "план и подтверждённые тренировки",
  "volt.analytics.read": "аналитика, прогресс и рекорды",
};

type Search = Record<string, string | string[] | undefined>;
const one = (value: string | string[] | undefined) => typeof value === "string" ? value : "";

export default async function OAuthAuthorizePage({ searchParams }: { searchParams: Promise<Search> }) {
  const params = await searchParams;
  const input = {
    clientId: one(params.client_id), redirectUri: one(params.redirect_uri), responseType: one(params.response_type),
    codeChallenge: one(params.code_challenge), codeChallengeMethod: one(params.code_challenge_method), scope: one(params.scope) || null,
  };
  let authorization: ReturnType<typeof validateAuthorizationRequest> | null = null;
  try { authorization = validateAuthorizationRequest(db, input); } catch { /* rendered below */ }
  if (!authorization) {
    return <main className="auth-screen"><div className="auth-card"><span className="auth-logo volt-mark" aria-hidden="true"/><h1>Не удалось подключить</h1><p>Запрос авторизации некорректен или устарел. Вернитесь в ChatGPT/Codex и запустите подключение ещё раз.</p></div></main>;
  }
  return <AuthGate><main className="auth-screen"><form className="auth-card" method="post" action="/oauth/authorize/submit">
      <span className="auth-logo volt-mark" aria-hidden="true" />
      <p className="eyebrow">VOLT</p>
      <h1>Подключить ИИ</h1>
      <p><b>{authorization.client.clientName}</b> запрашивает доступ только для чтения:</p>
      <ul>{authorization.scope.split(" ").map(scope => <li key={scope}>{scopeLabels[scope] ?? scope}</li>)}</ul>
      <input type="hidden" name="client_id" value={input.clientId}/>
      <input type="hidden" name="redirect_uri" value={input.redirectUri}/>
      <input type="hidden" name="response_type" value={input.responseType}/>
      <input type="hidden" name="code_challenge" value={input.codeChallenge}/>
      <input type="hidden" name="code_challenge_method" value={input.codeChallengeMethod}/>
      <input type="hidden" name="scope" value={authorization.scope}/>
      <input type="hidden" name="state" value={one(params.state)}/>
      <button type="submit">Разрешить доступ</button>
      <small>Плагин не может менять тренировки, профиль или расписание.</small>
    </form></main></AuthGate>;
}
