/** Admin email allowlist — used for role bootstrap and launch validation. */

function splitEmails(raw: string | undefined): string[] {
  return (raw || "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function getAdminEmails(): string[] {
  return splitEmails(process.env.ADMIN_EMAILS);
}

export function isAdminEmailsConfigured(): boolean {
  return getAdminEmails().length > 0;
}

export const ADMIN_EMAILS_WARNING =
  "ADMIN_EMAILS is not configured. Admin dashboard access requires manual role assignment.";
