import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

process.env.DATA_DIR = mkdtempSync(path.join(tmpdir(), "volt-oauth-"));
const { db } = await import("@/lib/db.ts");
const { USERNAME } = await import("@/lib/user.ts");
const {
  createAuthorizationCode, exchangeAuthorizationCode, getOAuthClient, normalizeScope, registerOAuthClient,
  revokeOAuthToken, rotateRefreshToken, validateAccessToken, validateAuthorizationRequest, verifyPkce,
} = await import("@/lib/volt-oauth.ts");

db.prepare("INSERT INTO auth_user(username,password_hash,salt) VALUES(?,?,?)").run(USERNAME, "hash", "salt");
const verifier = "v".repeat(64);
const challenge = createHash("sha256").update(verifier).digest("base64url");

test("OAuth client registration accepts HTTPS callbacks and rejects unsafe callbacks", () => {
  const client = registerOAuthClient(db, { clientName: "Codex", redirectUris: ["https://chatgpt.com/connector/callback"] });
  assert.equal(getOAuthClient(db, client.clientId)?.clientName, "Codex");
  assert.throws(() => registerOAuthClient(db, { redirectUris: ["http://example.com/callback"] }), /invalid_redirect_uris/);
  assert.throws(() => normalizeScope("volt.training.read unknown"), /invalid_scope/);
});

test("authorization code requires PKCE S256, is single-use, and stores no plaintext bearer", () => {
  const client = registerOAuthClient(db, { clientName: "ChatGPT", redirectUris: ["https://chatgpt.com/connector/callback"] });
  const validated = validateAuthorizationRequest(db, {
    clientId: client.clientId, redirectUri: client.redirectUris[0], responseType: "code",
    codeChallenge: challenge, codeChallengeMethod: "S256", scope: "volt.training.read",
  });
  assert.equal(validated.scope, "volt.training.read");
  assert.equal(verifyPkce(verifier, challenge), true);
  assert.equal(verifyPkce("wrong".repeat(13), challenge), false);

  const code = createAuthorizationCode(db, {
    clientId: client.clientId, redirectUri: client.redirectUris[0], codeChallenge: challenge, scope: validated.scope,
  });
  const pair = exchangeAuthorizationCode(db, {
    code, clientId: client.clientId, redirectUri: client.redirectUris[0], codeVerifier: verifier,
  });
  assert.deepEqual(validateAccessToken(db, pair.access_token)?.scopes, ["volt.training.read"]);
  assert.equal(JSON.stringify(db.prepare("SELECT * FROM oauth_tokens").all()).includes(pair.access_token), false);
  assert.equal(JSON.stringify(db.prepare("SELECT * FROM oauth_authorization_codes").all()).includes(code), false);
  assert.throws(() => exchangeAuthorizationCode(db, {
    code, clientId: client.clientId, redirectUri: client.redirectUris[0], codeVerifier: verifier,
  }), /invalid_grant/);
});

test("refresh tokens rotate and replay revokes the whole token family", () => {
  const client = registerOAuthClient(db, { clientName: "Codex", redirectUris: ["https://chatgpt.com/connector/callback"] });
  const code = createAuthorizationCode(db, {
    clientId: client.clientId, redirectUri: client.redirectUris[0], codeChallenge: challenge, scope: "volt.analytics.read",
  });
  const first = exchangeAuthorizationCode(db, { code, clientId: client.clientId, redirectUri: client.redirectUris[0], codeVerifier: verifier });
  const second = rotateRefreshToken(db, { refreshToken: first.refresh_token, clientId: client.clientId });
  assert.ok(validateAccessToken(db, second.access_token));
  assert.throws(() => rotateRefreshToken(db, { refreshToken: first.refresh_token, clientId: client.clientId }), /invalid_grant/);
  assert.equal(validateAccessToken(db, second.access_token), null);
});

test("revocation invalidates access and refresh tokens from the same family", () => {
  const client = registerOAuthClient(db, { clientName: "Codex", redirectUris: ["https://chatgpt.com/connector/callback"] });
  const code = createAuthorizationCode(db, {
    clientId: client.clientId, redirectUri: client.redirectUris[0], codeChallenge: challenge, scope: "volt.profile.read",
  });
  const pair = exchangeAuthorizationCode(db, { code, clientId: client.clientId, redirectUri: client.redirectUris[0], codeVerifier: verifier });
  revokeOAuthToken(db, pair.refresh_token);
  assert.equal(validateAccessToken(db, pair.access_token), null);
  assert.throws(() => rotateRefreshToken(db, { refreshToken: pair.refresh_token, clientId: client.clientId }), /invalid_grant/);
});
