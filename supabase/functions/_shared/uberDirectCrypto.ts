/** Encrypt Uber Direct secrets at rest — Deno mirror of lib/server/uberDirectCrypto.ts */

function encryptKey(): string {
  return Deno.env.get("COMPLIANCE_ENCRYPT_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "zoomeats-dev-key";
}

function xorTransform(input: string, key: string): string {
  let out = "";
  for (let i = 0; i < input.length; i++) {
    out += String.fromCharCode(input.charCodeAt(i) ^ key.charCodeAt(i % key.length));
  }
  return out;
}

export function encryptUberSecret(plain: string): string {
  const key = encryptKey();
  const encoded = btoa(plain);
  const xored = xorTransform(encoded, key);
  return btoa(xored);
}

export function decryptUberSecret(cipher: string): string {
  const key = encryptKey();
  const raw = atob(cipher);
  const decoded = xorTransform(raw, key);
  return atob(decoded);
}
