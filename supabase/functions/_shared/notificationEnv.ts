/** Read notification provider secrets — never commit real values. */
export function getResendApiKey(): string {
  return (
    Deno.env.get("RESEND_API_KEY") ||
    Deno.env.get("Resend_Api_Key") ||
    ""
  );
}

export function getResendFromEmail(): string {
  return (
    Deno.env.get("RESEND_FROM_EMAIL") ||
    Deno.env.get("NOTIFICATION_FROM_EMAIL") ||
    "ZoomEats <notifications@zoomeats.app>"
  );
}

export function getTwilioAccountSid(): string {
  return Deno.env.get("TWILIO_ACCOUNT_SID") || Deno.env.get("Twilio_Account_Sid") || "";
}

export function getTwilioAuthToken(): string {
  return Deno.env.get("TWILIO_AUTH_TOKEN") || Deno.env.get("Twilio_Auth_Token") || "";
}

export function getTwilioFromNumber(): string {
  return Deno.env.get("TWILIO_FROM_NUMBER") || Deno.env.get("Twilio_From_Number") || "";
}

export function getAppUrl(): string {
  return Deno.env.get("NEXT_PUBLIC_APP_URL") || "https://zoom-eats-delivery.vercel.app";
}
