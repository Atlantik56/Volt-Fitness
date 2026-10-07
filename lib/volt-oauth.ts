import type Database from "better-sqlite3";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { USERNAME } from "./user.ts";

export const VOLT_SCOPES = [
  "volt.profile.read",
  "volt.training.read",
  "volt.analytics.read",
] as const;

export type VoltScope = (typeof VOLT_SCOPES)[number];
export const DEFAULT_VOLT_SCOPE = VOLT_SCOPES.join(" ");
const ACCESS_TTL_MS = 60 * 60 * 1000;
const REFRESH_TTL_MS = 180 * 24 * 60 * 60 * 1000;
const CODE_TTL_MS = 10 * 60 * 1000;

const digest = (value: string) => createHash("sha256").update(value).digest("hex");
const opaqueToken = () => randomBytes(32).toString("base64url");
const safeEqual = (left: string, right: string) => {
  const a = Buffer.from(left), b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
};

export function publicBaseUrl(): string {
  const configured = process.env.PUBLIC_BASE_URL?.trim();
  const url = new URL(configured || "https://volt-trainer.duckdns.org");
  const local = process.env.NODE_ENV !== "production" && url.protocol === "http:" && ["localhost","127.0.0.1","[::1]"].includes(url.hostname);
  if ((url.protocol !== "https:" && !local) || url.username || url.password || url.search || url.hash || url.pathname !== "/") throw new Error("Invalid PUBLIC_BASE_URL");
  return url.origin;
}

export function normalizeScope(value: string | null | undefined): string {
  const requested = (value?.trim() || DEFAULT_VOLT_SCOPE).split(/\s+/).filter(Boolean);
  const unique = [...new Set(requested)];
  if (!unique.length || unique.some((scope) => !VOLT_SCOPES.includes(scope as VoltScope))) {
    throw new Error("invalid_scope");
  }
  return VOLT_SCOPES.filter((scope) => unique.includes(scope)).join(" ");
}

export function validRedirectUri(value: string): boolean {
  try {
    const url = new URL(value);
    if (url.username || url.password || url.hash) return false;
    return url.protocol === "https:" || (url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname));
  } catch {
    return false;
  }
}

export function registerOAuthClient(db: Database.Database, input: { clientName?: unknown; redirectUris?: unknown }) {
  const redirectUris = Array.isArray(input.redirectUris)
    ? [...new Set(input.redirectUris.filter((uri): uri is string => typeof uri === "string"))]
    : [];
  if (!redirectUris.length || redirectUris.length > 10 || redirectUris.some((uri) => uri.length > 2048 || !validRedirectUri(uri))) {
    throw new Error("invalid_redirect_uris");
  }
  const clientName = typeof input.clientName === "string" && input.clientName.trim()
    ? input.clientName.trim().slice(0, 120)
    : "VOLT client";
  const clientId = opaqueToken();
  const recent = db.prepare("SELECT count(*) n FROM oauth_clients WHERE created_at>?").get(Date.now()-3_600_000) as {n:number};
  if (recent.n >= 60) throw new Error("registration_rate_limited");
  db.prepare("INSERT INTO oauth_clients(client_id,client_name,redirect_uris,created_at) VALUES(?,?,?,?)")
    .run(clientId, clientName, JSON.stringify(redirectUris), Date.now());
  return { clientId, clientName, redirectUris };
}

type OAuthClientRow = { clientId: string; clientName: string; redirectUris: string };
export function getOAuthClient(db: Database.Database, clientId: string): { clientId: string; clientName: string; redirectUris: string[] } | null {
  const row = db.prepare("SELECT client_id clientId,client_name clientName,redirect_uris redirectUris FROM oauth_clients WHERE client_id=?")
    .get(clientId) as OAuthClientRow | undefined;
  if (!row) return null;
  try {
    const redirectUris = JSON.parse(row.redirectUris);
    return Array.isArray(redirectUris) ? { ...row, redirectUris } : null;
  } catch {
    return null;
  }
}

export function validateAuthorizationRequest(db: Database.Database, input: {
  clientId: string; redirectUri: string; responseType: string; codeChallenge: string; codeChallengeMethod: string; scope?: string | null;
}) {
  const client = getOAuthClient(db, input.clientId);
  if (!client || !client.redirectUris.includes(input.redirectUri)) throw new Error("invalid_client");
  if (input.responseType !== "code") throw new Error("unsupported_response_type");
  if (input.codeChallengeMethod !== "S256" || !/^[A-Za-z0-9_-]{43}$/.test(input.codeChallenge)) throw new Error("invalid_request");
  return { client, scope: normalizeScope(input.scope) };
}

export function createAuthorizationCode(db: Database.Database, input: {
  clientId: string; redirectUri: string; codeChallenge: string; scope: string;
}) {
  const code = opaqueToken(), now = Date.now();
  db.prepare("DELETE FROM oauth_authorization_codes WHERE expires_at<? OR used_at IS NOT NULL").run(now);
  db.prepare(`INSERT INTO oauth_authorization_codes
    (code_hash,client_id,redirect_uri,code_challenge,scope,username,expires_at,created_at)
    VALUES(?,?,?,?,?,?,?,?)`).run(digest(code), input.clientId, input.redirectUri, input.codeChallenge, input.scope, USERNAME, now + CODE_TTL_MS, now);
  return code;
}

export function verifyPkce(verifier: string, challenge: string): boolean {
  if (!/^[A-Za-z0-9._~-]{43,128}$/.test(verifier)) return false;
  const actual = createHash("sha256").update(verifier).digest("base64url");
  return safeEqual(actual, challenge);
}

type CodeRow = { clientId: string; redirectUri: string; codeChallenge: string; scope: string; username: string; expiresAt: number; usedAt: number | null };
type TokenPair = { access_token: string; token_type: "Bearer"; expires_in: number; refresh_token: string; scope: string };

function issueTokenPair(db: Database.Database, input: { clientId: string; username: string; scope: string; familyId?: string }, now: number): TokenPair {
  const access = opaqueToken(), refresh = opaqueToken(), familyId = input.familyId || opaqueToken();
  const insert = db.prepare(`INSERT INTO oauth_tokens
    (token_hash,kind,client_id,username,scope,family_id,expires_at,created_at) VALUES(?,?,?,?,?,?,?,?)`);
  insert.run(digest(access), "access", input.clientId, input.username, input.scope, familyId, now + ACCESS_TTL_MS, now);
  insert.run(digest(refresh), "refresh", input.clientId, input.username, input.scope, familyId, now + REFRESH_TTL_MS, now);
  return { access_token: access, token_type: "Bearer", expires_in: ACCESS_TTL_MS / 1000, refresh_token: refresh, scope: input.scope };
}

export function exchangeAuthorizationCode(db: Database.Database, input: {
  code: string; clientId: string; redirectUri: string; codeVerifier: string;
}): TokenPair {
  const now = Date.now(), codeHash = digest(input.code);
  const exchange = db.transaction(() => {
    const row = db.prepare(`SELECT client_id clientId,redirect_uri redirectUri,code_challenge codeChallenge,scope,username,
      expires_at expiresAt,used_at usedAt FROM oauth_authorization_codes WHERE code_hash=?`).get(codeHash) as CodeRow | undefined;
    if (!row || row.usedAt || row.expiresAt <= now || row.clientId !== input.clientId || row.redirectUri !== input.redirectUri) throw new Error("invalid_grant");
    if (!verifyPkce(input.codeVerifier, row.codeChallenge)) throw new Error("invalid_grant");
    const consumed = db.prepare("UPDATE oauth_authorization_codes SET used_at=? WHERE code_hash=? AND used_at IS NULL").run(now, codeHash);
    if (consumed.changes !== 1) throw new Error("invalid_grant");
    return issueTokenPair(db, { clientId: row.clientId, username: row.username, scope: row.scope }, now);
  });
  return exchange();
}

type StoredToken = { clientId: string; username: string; scope: string; familyId: string; expiresAt: number; revokedAt: number | null };
export function rotateRefreshToken(db: Database.Database, input: { refreshToken: string; clientId: string }): TokenPair {
  const now = Date.now(), tokenHash = digest(input.refreshToken);
  const rotate = db.transaction(() => {
    const row = db.prepare(`SELECT client_id clientId,username,scope,family_id familyId,expires_at expiresAt,revoked_at revokedAt
      FROM oauth_tokens WHERE token_hash=? AND kind='refresh'`).get(tokenHash) as StoredToken | undefined;
    if (!row || row.clientId !== input.clientId || row.expiresAt <= now) return null;
    if (row.revokedAt) {
      db.prepare("UPDATE oauth_tokens SET revoked_at=COALESCE(revoked_at,?) WHERE family_id=?").run(now, row.familyId);
      return null;
    }
    const revoked = db.prepare("UPDATE oauth_tokens SET revoked_at=? WHERE token_hash=? AND revoked_at IS NULL").run(now, tokenHash);
    if (revoked.changes !== 1) return null;
    return issueTokenPair(db, { clientId: row.clientId, username: row.username, scope: row.scope, familyId: row.familyId }, now);
  });
  const result = rotate();
  if (!result) throw new Error("invalid_grant");
  return result;
}

export function validateAccessToken(db: Database.Database, token: string): { clientId: string; username: string; scopes: string[]; expiresAt: number } | null {
  if (!token) return null;
  const row = db.prepare(`SELECT client_id clientId,username,scope,expires_at expiresAt FROM oauth_tokens
    WHERE token_hash=? AND kind='access' AND revoked_at IS NULL AND expires_at>?`).get(digest(token), Date.now()) as Omit<StoredToken, "familyId"|"revokedAt"> | undefined;
  return row ? { clientId: row.clientId, username: row.username, scopes: row.scope.split(" ").filter(Boolean), expiresAt: row.expiresAt } : null;
}

export function revokeOAuthToken(db: Database.Database, token: string): void {
  if (!token) return;
  const now = Date.now(), tokenHash = digest(token);
  const row = db.prepare("SELECT family_id familyId FROM oauth_tokens WHERE token_hash=?").get(tokenHash) as { familyId: string } | undefined;
  if (row) db.prepare("UPDATE oauth_tokens SET revoked_at=COALESCE(revoked_at,?) WHERE family_id=?").run(now, row.familyId);
}
