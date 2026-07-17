"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { LogOut, Repeat, Bell, MapPin, CreditCard, ShoppingBag, Star } from "lucide-react";
import Header from "@/components/Header";
import InstallAppCard from "@/components/account/AddToHomeScreenCard";
import WhyZoomEatsDisclosure from "@/components/account/WhyZoomEatsDisclosure";
import ProfilePhotoUploader from "@/components/profile/ProfilePhotoUploader";
import VehicleManager from "@/components/profile/VehicleManager";
import UserAvatar from "@/components/profile/UserAvatar";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";
import { getClientAppType, getPwaConfig } from "@/lib/pwa/appContext";
import { normalizeRole } from "@/lib/compliance/authz";
import { LoadingSkeleton } from "@/components/ui/PageStates";

const ROLE_LABELS = {
  customer: "Customer",
  delivery: "Driver",
  vendor: "Restaurant Owner",
  restaurant: "Restaurant Owner",
  admin: "Administrator",
  dispatcher: "Dispatcher",
};

function formatMemberSince(value) {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleDateString(undefined, { month: "long", year: "numeric" });
  } catch {
    return "—";
  }
}

export default function AccountPage() {
  const { user, logout, loading, refresh } = useAuth();
  const router = useRouter();
  const appType = getClientAppType();
  const config = getPwaConfig(appType);
  const loginPath = config.loginPath;
  const [profile, setProfile] = useState(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ first_name: "", last_name: "", display_name: "", phone: "" });
  const [saveMessage, setSaveMessage] = useState("");

  const loadProfile = useCallback(async () => {
    setProfileLoading(true);
    try {
      const r = await api.get("/profile");
      const data = r?.data;
      setProfile(data);
      setForm({
        first_name: data?.first_name || "",
        last_name: data?.last_name || "",
        display_name: data?.display_name || "",
        phone: data?.phone || "",
      });
    } catch {
      setProfile(null);
    } finally {
      setProfileLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!loading && !user) {
      router.replace(`${loginPath}?redirect=${encodeURIComponent("/account")}`);
    }
  }, [loading, user, router, loginPath]);

  useEffect(() => {
    if (user) loadProfile();
  }, [user, loadProfile]);

  const saveProfile = async () => {
    setSaving(true);
    setSaveMessage("");
    try {
      const r = await api.put("/profile", form);
      setProfile(r?.data);
      setSaveMessage("Profile saved");
      await refresh();
    } catch (e) {
      setSaveMessage(e?.message || "Could not save profile");
    } finally {
      setSaving(false);
    }
  };

  if (loading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-4 border-t-transparent animate-spin" style={{ borderColor: "var(--primary)" }} />
      </div>
    );
  }

  const role = normalizeRole(user.role);
  const roleLabel = ROLE_LABELS[role] || user.role;

  return (
    <div className="min-h-screen pb-24 md:pb-12">
      <Header />
      <div className="max-w-2xl mx-auto px-6 py-8 space-y-6" data-testid="account-page">
        <div>
          <h1 className="font-display text-3xl font-bold">Account</h1>
          <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
            Manage your ZoomEats profile, preferences, and account settings.
          </p>
        </div>

        <div className="flex justify-end" data-testid="account-scroll-strip">
          <WhyZoomEatsDisclosure />
        </div>

        {profileLoading ? (
          <LoadingSkeleton label="Loading profile…" rows={4} />
        ) : (
          <>
            <div className="card p-5 space-y-5">
              <ProfilePhotoUploader
                profile={profile || user}
                onUpdated={(next) => {
                  setProfile((prev) => ({ ...prev, ...next }));
                  refresh();
                }}
              />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <input className="input-field" placeholder="First name" value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} />
                <input className="input-field" placeholder="Last name" value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} />
                <input className="input-field md:col-span-2" placeholder="Display name" value={form.display_name} onChange={(e) => setForm({ ...form, display_name: e.target.value })} />
                <input className="input-field" placeholder="Phone number" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
                <input className="input-field" value={profile?.email || user.email} disabled />
              </div>
              <div className="flex flex-wrap gap-3 text-sm" style={{ color: "var(--muted)" }}>
                <span className="badge">{roleLabel}</span>
                <span>Member since {formatMemberSince(profile?.member_since || user.created_at)}</span>
                <span>Status: {profile?.account_status || "active"}</span>
              </div>
              <button type="button" className="btn-primary" disabled={saving} onClick={saveProfile}>
                {saving ? "Saving…" : "Save profile"}
              </button>
              {saveMessage && <p className="text-sm" style={{ color: saveMessage.includes("saved") ? "#4ade80" : "#f87171" }}>{saveMessage}</p>}
            </div>

            {role === "customer" && (
              <div className="card p-5 space-y-3">
                <h2 className="font-display text-lg font-bold">Customer profile</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <Link href="/orders" className="btn-ghost justify-start !py-3 text-sm inline-flex items-center gap-2"><ShoppingBag size={16} /> Order history</Link>
                  <button type="button" className="btn-ghost justify-start !py-3 text-sm inline-flex items-center gap-2" disabled><MapPin size={16} /> Saved addresses</button>
                  <button type="button" className="btn-ghost justify-start !py-3 text-sm inline-flex items-center gap-2" disabled><Star size={16} /> Favorite restaurants</button>
                  <button type="button" className="btn-ghost justify-start !py-3 text-sm inline-flex items-center gap-2" disabled><CreditCard size={16} /> Payment methods</button>
                  <button type="button" className="btn-ghost justify-start !py-3 text-sm inline-flex items-center gap-2" disabled><Bell size={16} /> Notification preferences</button>
                </div>
              </div>
            )}

            {role === "delivery" && (
              <div className="card p-5 space-y-4">
                <h2 className="font-display text-lg font-bold">Driver profile</h2>
                {profile?.driver_stats && (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {[
                      ["Rating", `⭐ ${profile.driver_stats.rating ?? "—"}`],
                      ["Deliveries", profile.driver_stats.total_deliveries ?? 0],
                      ["Completion", `${profile.driver_stats.completion_rate ?? 0}%`],
                      ["Status", profile.driver_stats.online ? "Online" : "Offline"],
                    ].map(([label, val]) => (
                      <div key={label} className="text-center p-3 rounded-xl" style={{ background: "var(--surface-2)" }}>
                        <div className="text-lg font-bold">{val}</div>
                        <div className="text-xs mt-1" style={{ color: "var(--muted)" }}>{label}</div>
                      </div>
                    ))}
                  </div>
                )}
                <VehicleManager />
              </div>
            )}

            {(role === "vendor" || role === "restaurant") && (
              <div className="card p-5 space-y-4">
                <h2 className="font-display text-lg font-bold">Merchant profile</h2>
                <div className="flex items-center gap-4">
                  <UserAvatar name={profile?.merchant?.restaurant_name || profile?.display_name} src={profile?.merchant?.logo_url} size={72} />
                  <div>
                    <div className="font-bold">{profile?.merchant?.restaurant_name || "Your restaurant"}</div>
                    <div className="text-sm" style={{ color: "var(--muted)" }}>{profile?.merchant?.phone || form.phone || "Add contact phone"}</div>
                  </div>
                </div>
                <Link href="/restaurant/dashboard" className="btn-secondary text-sm inline-flex">Open merchant dashboard</Link>
              </div>
            )}

            {role === "admin" && (
              <div className="card p-5 space-y-3">
                <h2 className="font-display text-lg font-bold">Administrator</h2>
                <Link href="/admin/profiles" className="btn-secondary text-sm inline-flex">Profile & vehicle moderation</Link>
                <Link href="/admin" className="btn-ghost text-sm inline-flex">Admin dashboard</Link>
              </div>
            )}
          </>
        )}

        <InstallAppCard />

        <div className="card overflow-hidden">
          <button type="button" className="w-full text-left px-4 py-4 flex items-center gap-3 text-sm border-b hover:bg-black/30" style={{ borderColor: "var(--border)" }} onClick={() => router.push("/onboarding")} data-testid="account-switch-mode">
            <Repeat size={18} /> Switch mode
          </button>
          <button type="button" className="w-full text-left px-4 py-4 flex items-center gap-3 text-sm hover:bg-black/30 text-red-400" onClick={logout} data-testid="account-sign-out">
            <LogOut size={18} /> Sign out
          </button>
        </div>
      </div>
    </div>
  );
}
