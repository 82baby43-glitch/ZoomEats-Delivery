/** Encrypt Uber Direct secrets at rest — replace with KMS in production. */

export function encryptUberSecret(plain: string): string {
  const key = process.env.COMPLIANCE_ENCRYPT_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "zoomeats-dev-key";
  const encoded = Buffer.from(plain, "utf8").toString("base64");
  let out = "";
  for (let i = 0; i < encoded.length; i++) {
    out += String.fromCharCode(encoded.charCodeAt(i) ^ key.charCodeAt(i % key.length));
  }
  return Buffer.from(out, "binary").toString("base64");
}

export function decryptUberSecret(cipher: string): string {
  const key = process.env.COMPLIANCE_ENCRYPT_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "zoomeats-dev-key";
  const raw = Buffer.from(cipher, "base64").toString("binary");
  let out = "";
  for (let i = 0; i < raw.length; i++) {
    out += String.fromCharCode(raw.charCodeAt(i) ^ key.charCodeAt(i % key.length));
  }
  return Buffer.from(out, "base64").toString("utf8");
}
