import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const VERSION="v1";

export function parseStravaEncryptionKey(raw=process.env.STRAVA_TOKEN_ENCRYPTION_KEY||""){
 const value=raw.trim();
 const key=/^[0-9a-f]{64}$/i.test(value)?Buffer.from(value,"hex"):Buffer.from(value,"base64");
 if(key.length!==32)throw new Error("STRAVA_TOKEN_ENCRYPTION_KEY must contain exactly 32 bytes");
 return key;
}

export function encryptStravaToken(token:string,key=parseStravaEncryptionKey()){
 if(!token)throw new Error("Cannot encrypt an empty Strava token");
 const iv=randomBytes(12),cipher=createCipheriv("aes-256-gcm",key,iv);
 const encrypted=Buffer.concat([cipher.update(token,"utf8"),cipher.final()]);
 return [VERSION,iv.toString("base64url"),cipher.getAuthTag().toString("base64url"),encrypted.toString("base64url")].join(".");
}

export function decryptStravaToken(value:string,key=parseStravaEncryptionKey()){
 const [version,ivRaw,tagRaw,ciphertextRaw,...rest]=String(value).split(".");
 if(version!==VERSION||!ivRaw||!tagRaw||!ciphertextRaw||rest.length)throw new Error("Unsupported encrypted Strava token");
 try{
  const decipher=createDecipheriv("aes-256-gcm",key,Buffer.from(ivRaw,"base64url"));
  decipher.setAuthTag(Buffer.from(tagRaw,"base64url"));
  return Buffer.concat([decipher.update(Buffer.from(ciphertextRaw,"base64url")),decipher.final()]).toString("utf8");
 }catch{
  throw new Error("Unable to decrypt Strava token");
 }
}
