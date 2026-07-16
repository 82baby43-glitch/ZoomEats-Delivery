"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import Header from "@/components/Header";
import { useAuth } from "@/lib/auth";
import {
  signInWithGoogle,
  signInWithEmail,
  signUpWithEmail,
  resetPassword,
} from "@/lib/auth";

export default function LoginPage({ title, subtitle, defaultRedirect = "/", signupMode = false }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { refresh } = useAuth();
  const redirect = searchParams.get("redirect") || defaultRedirect;
  const errorCode = searchParams.get("error");
  const errorReason = searchParams.get("reason");
  const [mode, setMode] = useState(signupMode ? "signup" : "login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [remember, setRemember] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState(() => {
    if (errorCode === "auth_failed") {
      const reason = errorReason ? decodeURIComponent(errorReason) : "";
      if (/redirect_uri_mismatch/i.test(reason)) {
        return "Google sign-in failed: redirect URI mismatch. Contact support if this continues.";
      }
      if (/access_denied|access blocked/i.test(reason)) {
        return "Google sign-in was blocked. Try again or use email sign-in.";
      }
      return reason
        ? `Sign in failed: ${reason}`
        : "Sign in failed. Please try again or use email sign-in.";
    }
    if (errorCode === "session_expired") return "Your session has expired. Please sign in again.";
    if (errorCode === "account_suspended") return "Your account has been suspended.";
    return "";
  });

  const finish = () => router.replace(redirect);

  const onGoogle = async () => {
    setBusy(true);
    setError("");
    try {
      sessionStorage.setItem("auth_redirect", redirect);
      await signInWithGoogle();
    } catch (e) {
      console.error("[auth] Google sign-in error:", e);
      setError(e?.message || "Google sign-in failed. Please try again.");
      setBusy(false);
    }
  };

  const onEmail = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      if (mode === "login") {
        await signInWithEmail(email, password, { remember });
        await refresh();
        finish();
      } else if (mode === "signup") {
        await signUpWithEmail(email, password, { name });
        setMessage("Check your email to confirm your account, or sign in if confirmation is disabled.");
        setMode("login");
      } else {
        await resetPassword(email);
        setMessage("Password reset email sent.");
      }
    } catch (err) {
      setError(err?.message || "Authentication failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <Header />
      <div className="max-w-md mx-auto px-6 py-16 login-page">
        <div className="login-auth-card card p-6 md:p-8">
        <h1 className="font-display text-3xl font-bold">{title}</h1>
        <p className="mt-2 text-sm" style={{ color: "var(--muted)" }}>{subtitle}</p>

        {error && <div className="mt-4 text-sm text-red-400">{error}</div>}
        {message && <div className="mt-4 text-sm text-green-400">{message}</div>}

        <button className="btn-primary w-full mt-6 login-auth-btn" onClick={onGoogle} disabled={busy}>
          Continue with Google
        </button>

        <div className="my-6 text-center text-xs" style={{ color: "var(--muted)" }}>or</div>

        <form onSubmit={onEmail} className="space-y-4">
          {mode === "signup" && (
            <div>
              <label className="label">Full name</label>
              <input className="input-field w-full" value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
          )}
          <div>
            <label className="label">Email</label>
            <input type="email" className="input-field w-full" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          {mode !== "reset" && (
            <div>
              <label className="label">Password</label>
              <input type="password" className="input-field w-full" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
            </div>
          )}
          {mode === "login" && (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
              Remember me
            </label>
          )}
          <button className="btn-primary w-full login-auth-btn" type="submit" disabled={busy}>
            {mode === "login" ? "Sign in" : mode === "signup" ? "Create account" : "Send reset link"}
          </button>
        </form>

        <div className="mt-6 flex flex-col gap-2 text-sm" style={{ color: "var(--muted)" }}>
          {mode === "login" && (
            <>
              <button type="button" className="text-left hover:underline" onClick={() => setMode("signup")}>Create an account</button>
              <button type="button" className="text-left hover:underline" onClick={() => setMode("reset")}>Forgot password?</button>
            </>
          )}
          {mode !== "login" && (
            <button type="button" className="text-left hover:underline" onClick={() => setMode("login")}>Back to sign in</button>
          )}
          <Link href="/" className="hover:underline">← Back to home</Link>
        </div>
        </div>
      </div>
    </div>
  );
}
