function splitEmails(raw: string | undefined): string[] {
  return (raw || "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

function env(name: string): string | undefined {
  const v = Deno.env.get(name);
  return v && v.trim() ? v.trim() : undefined;
}

export function getAdminEmails(): string[] {
  const seen = new Set<string>();
  for (const e of [...splitEmails(env("ADMIN_EMAILS")), ...splitEmails(env("NEXT_PUBLIC_ADMIN_EMAILS"))]) {
    seen.add(e);
  }
  return [...seen];
}

export function isAdminEmailsConfigured(): boolean {
  return getAdminEmails().length > 0;
}

export const ADMIN_EMAILS_WARNING =
  "ADMIN_EMAILS is not configured. Admin dashboard access requires manual role assignment.";
