import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

process.env.DATA_DIR=mkdtempSync(path.join(tmpdir(),"volt-oauth-boundaries-"));
const {db}=await import("@/lib/db.ts");
const {USERNAME}=await import("@/lib/user.ts");
const oauth=await import("@/lib/volt-oauth.ts");
db.prepare("INSERT INTO auth_user(username,password_hash,salt) VALUES(?,?,?)").run(USERNAME,"fixture","fixture");
const verifier="v".repeat(64),challenge=createHash("sha256").update(verifier).digest("base64url");

test("authorization rejects different redirect URI, client and expired code",()=>{
 const a=oauth.registerOAuthClient(db,{redirectUris:["https://example.test/callback"]});
 const b=oauth.registerOAuthClient(db,{redirectUris:["https://example.test/callback"]});
 const input={clientId:a.clientId,redirectUri:a.redirectUris[0],responseType:"code",codeChallenge:challenge,codeChallengeMethod:"S256",scope:"volt.training.read"};
 assert.throws(()=>oauth.validateAuthorizationRequest(db,{...input,redirectUri:"https://example.test/callback?other=1"}));
 assert.throws(()=>oauth.validateAuthorizationRequest(db,{...input,codeChallengeMethod:"plain"}));
 const code=oauth.createAuthorizationCode(db,{...input,scope:input.scope});
 const exchange={code,clientId:a.clientId,redirectUri:a.redirectUris[0],codeVerifier:verifier};
 assert.throws(()=>oauth.exchangeAuthorizationCode(db,{...exchange,clientId:b.clientId}));
 assert.throws(()=>oauth.exchangeAuthorizationCode(db,{...exchange,codeVerifier:"x".repeat(64)}));
 db.prepare("UPDATE oauth_authorization_codes SET expires_at=0").run();
 assert.throws(()=>oauth.exchangeAuthorizationCode(db,exchange));
});

test("expired access tokens cannot authorize MCP",()=>{
 const client=oauth.registerOAuthClient(db,{redirectUris:["https://example.test/callback"]});
 const code=oauth.createAuthorizationCode(db,{clientId:client.clientId,redirectUri:client.redirectUris[0],codeChallenge:challenge,scope:"volt.training.read"});
 const pair=oauth.exchangeAuthorizationCode(db,{code,clientId:client.clientId,redirectUri:client.redirectUris[0],codeVerifier:verifier});
 db.prepare("UPDATE oauth_tokens SET expires_at=0 WHERE kind='access'").run();
 assert.equal(oauth.validateAccessToken(db,pair.access_token),null);
});

test("unauthenticated dynamic registration is bounded in persistent storage",()=>{
 const insert=db.prepare("INSERT INTO oauth_clients(client_id,client_name,redirect_uris,created_at) VALUES(?,?,?,?)");
 for(let i=0;i<60;i++)insert.run(`limit-${i}`,"test","[]",Date.now());
 assert.throws(()=>oauth.registerOAuthClient(db,{redirectUris:["https://example.test/callback"]}),/registration_rate_limited/);
});
