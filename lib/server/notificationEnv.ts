/** Read notification provider secrets — never commit real values. */
export function getResendApiKey(): string {
  return (
    process.env.RESEND_API_KEY ||
    process.env.Resend_Api_Key ||
    ""
  );
}

export function getResendFromEmail(): string {
  return (
    process.env.RESEND_FROM_EMAIL ||
    process.env.NOTIFICATION_FROM_EMAIL ||
    "ZoomEats <notifications@zoomeats.app>"
  );
}

export function getTwilioAccountSid(): string {
  return process.env.TWILIO_ACCOUNT_SID || process.env.Twilio_Account_Sid || "";
}

export function getTwilioAuthToken(): string {
  return process.env.TWILIO_AUTH_TOKEN || process.env.Twilio_Auth_Token || "";
}

export function getTwilioFromNumber(): string {
  return process.env.TWILIO_FROM_NUMBER || process.env.Twilio_From_Number || "";
}

export function getAppUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL || "https://zoom-eats-delivery.vercel.app";
}
