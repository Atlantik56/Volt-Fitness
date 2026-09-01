import assert from "node:assert/strict";
import test from "node:test";
import { randomBytes } from "node:crypto";
import { decryptStravaToken, encryptStravaToken, parseStravaEncryptionKey } from "@/lib/strava-crypto.ts";

test("Strava tokens шифруются AES-GCM и не сохраняются открытым текстом",()=>{
 const key=randomBytes(32),token="secret-refresh-token";
 const encrypted=encryptStravaToken(token,key);
 assert.match(encrypted,/^v1\./);
 assert.equal(encrypted.includes(token),false);
 assert.equal(decryptStravaToken(encrypted,key),token);
 assert.throws(()=>decryptStravaToken(encrypted,randomBytes(32)),/Unable to decrypt/);
});

test("encryption key принимает ровно 32 байта",()=>{
 const key=randomBytes(32);
 assert.deepEqual(parseStravaEncryptionKey(key.toString("base64")),key);
 assert.deepEqual(parseStravaEncryptionKey(key.toString("hex")),key);
 assert.throws(()=>parseStravaEncryptionKey("short"),/32 bytes/);
});
