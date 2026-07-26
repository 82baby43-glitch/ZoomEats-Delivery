"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { api, clearApiCache } from "@/lib/api";
import Header from "@/components/Header";
import { LoadingSkeleton, ErrorState } from "@/components/ui/PageStates";
import { ImageIcon, Trash2, Upload, Store, Eye, EyeOff, RotateCcw } from "lucide-react";

const DEFAULT_HERO_IMG = "/images/hero-zoomeats.webp";

export default function AdminHero() {
  const [restaurants, setRestaurants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [restaurantId, setRestaurantId] = useState("");
  const [useRestaurantImage, setUseRestaurantImage] = useState(true);
  const [customImageUrl, setCustomImageUrl] = useState("");
  const [showMerchantGrid, setShowMerchantGrid] = useState(true);
  const [hiddenRestaurantIds, setHiddenRestaurantIds] = useState([]);
  const [message, setMessage] = useState("");

  const applyHeroState = (data) => {
    setEnabled(Boolean(data?.enabled));
    setRestaurantId(data?.restaurant_id || "");
    setUseRestaurantImage(data?.use_restaurant_image !== false);
    setCustomImageUrl(data?.custom_image_url || "");
    setShowMerchantGrid(data?.show_merchant_grid !== false);
    setHiddenRestaurantIds(Array.isArray(data?.hidden_restaurant_ids) ? data.hidden_restaurant_ids : []);
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [heroRes, restRes] = await Promise.all([
        api.get("/admin/hero"),
        api.get("/admin/restaurants"),
      ]);
      const data = heroRes?.data ?? heroRes;
      applyHeroState(data);
      setRestaurants(Array.isArray(restRes?.data) ? restRes.data : []);
      setError(false);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const hiddenSet = useMemo(() => new Set(hiddenRestaurantIds), [hiddenRestaurantIds]);

  const visibleMerchants = useMemo(
    () => restaurants.filter((r) => !hiddenSet.has(r.restaurant_id)),
    [restaurants, hiddenSet]
  );

  const hiddenMerchants = useMemo(
    () => restaurants.filter((r) => hiddenSet.has(r.restaurant_id)),
    [restaurants, hiddenSet]
  );

  const selectedRestaurant = useMemo(
    () => restaurants.find((r) => r.restaurant_id === restaurantId) || null,
    [restaurants, restaurantId]
  );

  const previewImage = useMemo(() => {
    if (!enabled || !restaurantId) return DEFAULT_HERO_IMG;
    if (!useRestaurantImage && customImageUrl) return customImageUrl;
    return selectedRestaurant?.image_url || selectedRestaurant?.cover_url || customImageUrl || DEFAULT_HERO_IMG;
  }, [enabled, restaurantId, useRestaurantImage, customImageUrl, selectedRestaurant]);

  const save = async () => {
    const wantsEnabled = enabled && Boolean(restaurantId);
    setBusy(true);
    setMessage("");
    try {
      const res = await api.put("/admin/hero", {
        enabled: wantsEnabled,
        restaurant_id: wantsEnabled ? restaurantId : null,
        use_restaurant_image: useRestaurantImage,
        image_url: wantsEnabled ? (customImageUrl || null) : null,
        show_merchant_grid: showMerchantGrid,
        hidden_restaurant_ids: hiddenRestaurantIds,
      });
      clearApiCache();
      applyHeroState(res?.data ?? res);
      setMessage(wantsEnabled ? "Hero image updated." : "Hero image cleared. Default homepage image is active.");
    } catch (e) {
      alert(e?.message || "Could not save hero settings");
    } finally {
      setBusy(false);
    }
  };

  const removeHeroImage = async () => {
    if (!confirm("Remove the featured store image from the homepage hero?")) return;
    setBusy(true);
    setMessage("");
    try {
      const res = await api.post("/admin/hero/clear", {});
      clearApiCache();
      applyHeroState(res?.data ?? res);
      setMessage("Hero image cleared. Default homepage image is active.");
    } catch (e) {
      alert(e?.message || "Could not clear hero image");
    } finally {
      setBusy(false);
    }
  };

  const hideMerchant = async (rid) => {
    setBusy(true);
    setMessage("");
    try {
      const res = await api.post("/admin/hero/merchants/hide", { restaurant_id: rid });
      clearApiCache();
      applyHeroState(res?.data ?? res);
      setMessage("Store removed from homepage listings.");
    } catch (e) {
      alert(e?.message || "Could not hide store");
    } finally {
      setBusy(false);
    }
  };

  const showMerchant = async (rid) => {
    setBusy(true);
    setMessage("");
    try {
      const res = await api.post("/admin/hero/merchants/show", { restaurant_id: rid });
      clearApiCache();
      applyHeroState(res?.data ?? res);
      setShowMerchantGrid(true);
      setMessage("Store restored on homepage listings.");
    } catch (e) {
      alert(e?.message || "Could not restore store");
    } finally {
      setBusy(false);
    }
  };

  const clearAllMerchants = async () => {
    if (!confirm("Remove all stores from the homepage merchant grid?")) return;
    setBusy(true);
    setMessage("");
    try {
      const res = await api.post("/admin/hero/merchants/clear-all", {});
      clearApiCache();
      applyHeroState(res?.data ?? res);
      setMessage("All stores removed from homepage listings.");
    } catch (e) {
      alert(e?.message || "Could not clear homepage listings");
    } finally {
      setBusy(false);
    }
  };

  const restoreAllMerchants = async () => {
    setBusy(true);
    setMessage("");
    try {
      const res = await api.post("/admin/hero/merchants/restore-all", {});
      clearApiCache();
      applyHeroState(res?.data ?? res);
      setMessage("All stores restored on homepage listings.");
    } catch (e) {
      alert(e?.message || "Could not restore homepage listings");
    } finally {
      setBusy(false);
    }
  };

  const uploadImage = async (file) => {
    if (!file) return;
    setBusy(true);
    try {
      const presign = await api.post("/admin/hero/image/presign", {
        file_name: file.name,
        content_type: file.type || "image/jpeg",
      });
      const data = presign?.data ?? presign;
      const uploadRes = await fetch(data.upload_url, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": file.type || "image/jpeg" },
      });
      if (!uploadRes.ok) throw new Error("Image upload failed");
      setCustomImageUrl(data.public_url);
      setUseRestaurantImage(false);
    } catch (e) {
      alert(e?.message || "Upload failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <Header />
      <div className="max-w-7xl mx-auto px-6 md:px-12 py-12">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="label-eyebrow">Admin</div>
            <h1 className="font-display text-4xl font-black tracking-tight flex items-center gap-2">
              <ImageIcon size={28} /> Homepage Hero
            </h1>
            <p className="mt-2 max-w-3xl" style={{ color: "var(--muted)" }}>
              Control the homepage in two separate areas: the top-right hero image and the merchant cards shown under &ldquo;Merchants near you.&rdquo;
            </p>
          </div>
          <Link href="/admin" className="btn-secondary text-sm">Back to admin</Link>
        </div>

        {loading && <div className="mt-6"><LoadingSkeleton label="Loading hero settings…" rows={4} /></div>}
        {error && <div className="mt-6"><ErrorState title="Could not load hero settings" onRetry={load} /></div>}

        {!loading && !error && (
          <div className="mt-6 space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="card p-6 space-y-5" data-testid="admin-hero-controls">
                <div>
                  <h2 className="font-display text-xl font-bold">Hero image (top right)</h2>
                  <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
                    This only changes the large image next to &ldquo;Eat well, delivered fast.&rdquo;
                  </p>
                </div>

                <label className="flex items-center justify-between gap-4">
                  <div>
                    <div className="font-bold">Show featured store on hero image</div>
                  </div>
                  <button
                    type="button"
                    className={`badge ${enabled ? "ring-2 ring-[var(--primary)]" : ""}`}
                    onClick={() => setEnabled((v) => !v)}
                    data-testid="hero-enabled-toggle"
                  >
                    {enabled ? "On" : "Off"}
                  </button>
                </label>

                <div>
                  <label className="text-sm font-bold block mb-2">Featured restaurant / store</label>
                  <select
                    className="input-field"
                    value={restaurantId}
                    onChange={(e) => {
                      const next = e.target.value;
                      setRestaurantId(next);
                      if (!next) setEnabled(false);
                    }}
                    data-testid="hero-restaurant-select"
                  >
                    <option value="">Choose a store…</option>
                    {restaurants.map((r) => (
                      <option key={r.restaurant_id} value={r.restaurant_id}>{r.name}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-3">
                  <div className="font-bold text-sm">Hero image source</div>
                  <label className="flex items-center gap-2 text-sm">
                    <input type="radio" checked={useRestaurantImage} onChange={() => setUseRestaurantImage(true)} />
                    Use store photo from listing
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input type="radio" checked={!useRestaurantImage} onChange={() => setUseRestaurantImage(false)} />
                    Use custom uploaded image
                  </label>
                  <label className="btn-secondary inline-flex items-center gap-2 text-sm cursor-pointer">
                    <Upload size={16} />
                    Upload hero image
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      disabled={busy}
                      onChange={(e) => uploadImage(e.target.files?.[0])}
                      data-testid="hero-image-upload"
                    />
                  </label>
                </div>

                <div className="flex flex-wrap gap-3 pt-2">
                  <button type="button" className="btn-primary" disabled={busy} onClick={save} data-testid="hero-save">
                    Save hero image
                  </button>
                  <button
                    type="button"
                    className="btn-secondary flex items-center gap-2"
                    disabled={busy}
                    onClick={removeHeroImage}
                    data-testid="hero-remove"
                  >
                    <Trash2 size={16} /> Clear hero image
                  </button>
                </div>
              </div>

              <div className="card p-6" data-testid="admin-hero-preview">
                <div className="font-bold mb-4">Hero image preview</div>
                <div className="rounded-3xl overflow-hidden border relative" style={{ borderColor: "var(--border)" }}>
                  <img src={previewImage} alt="Hero preview" className="w-full h-[360px] object-cover" />
                  {enabled && selectedRestaurant && (
                    <div className="absolute inset-x-0 bottom-0 p-5 bg-gradient-to-t from-black/80 to-transparent">
                      <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-white/80">
                        <Store size={14} /> Featured on hero image
                      </div>
                      <div className="font-display text-2xl font-black text-white mt-1">{selectedRestaurant.name}</div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="card p-6 space-y-5" data-testid="admin-homepage-merchants">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h2 className="font-display text-xl font-bold">Homepage merchant listings</h2>
                  <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
                    These are the store cards under &ldquo;Merchants near you.&rdquo; Removing here does not delete the store — it only hides it from the homepage.
                  </p>
                </div>
                <label className="flex items-center gap-3 text-sm">
                  <span className="font-bold">Show merchant grid</span>
                  <button
                    type="button"
                    className={`badge ${showMerchantGrid ? "ring-2 ring-[var(--primary)]" : ""}`}
                    onClick={() => setShowMerchantGrid((v) => !v)}
                    data-testid="hero-merchant-grid-toggle"
                  >
                    {showMerchantGrid ? "On" : "Off"}
                  </button>
                </label>
              </div>

              <div className="flex flex-wrap gap-3">
                <button type="button" className="btn-primary" disabled={busy} onClick={save} data-testid="hero-merchants-save">
                  Save homepage listings
                </button>
                <button type="button" className="btn-secondary flex items-center gap-2" disabled={busy} onClick={clearAllMerchants}>
                  <EyeOff size={16} /> Remove all from homepage
                </button>
                <button type="button" className="btn-secondary flex items-center gap-2" disabled={busy} onClick={restoreAllMerchants}>
                  <RotateCcw size={16} /> Restore all on homepage
                </button>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div>
                  <h3 className="font-bold mb-3 flex items-center gap-2"><Eye size={16} /> Visible on homepage ({visibleMerchants.length})</h3>
                  <div className="space-y-2 max-h-80 overflow-y-auto">
                    {visibleMerchants.map((r) => (
                      <div key={r.restaurant_id} className="flex items-center justify-between gap-3 p-3 rounded-xl border" style={{ borderColor: "var(--border)" }}>
                        <div className="min-w-0">
                          <div className="font-bold truncate">{r.name}</div>
                          <div className="text-xs truncate" style={{ color: "var(--muted)" }}>{r.cuisine || r.merchant_category_slug || "Merchant"}</div>
                        </div>
                        <button type="button" className="btn-secondary !py-1.5 text-xs shrink-0" disabled={busy} onClick={() => hideMerchant(r.restaurant_id)}>
                          Remove
                        </button>
                      </div>
                    ))}
                    {visibleMerchants.length === 0 && (
                      <p className="text-sm" style={{ color: "var(--muted)" }}>No stores are visible on the homepage.</p>
                    )}
                  </div>
                </div>

                <div>
                  <h3 className="font-bold mb-3 flex items-center gap-2"><EyeOff size={16} /> Hidden from homepage ({hiddenMerchants.length})</h3>
                  <div className="space-y-2 max-h-80 overflow-y-auto">
                    {hiddenMerchants.map((r) => (
                      <div key={r.restaurant_id} className="flex items-center justify-between gap-3 p-3 rounded-xl border" style={{ borderColor: "var(--border)" }}>
                        <div className="min-w-0">
                          <div className="font-bold truncate">{r.name}</div>
                          <div className="text-xs truncate" style={{ color: "var(--muted)" }}>{r.cuisine || r.merchant_category_slug || "Merchant"}</div>
                        </div>
                        <button type="button" className="btn-primary !py-1.5 text-xs shrink-0" disabled={busy} onClick={() => showMerchant(r.restaurant_id)}>
                          Restore
                        </button>
                      </div>
                    ))}
                    {hiddenMerchants.length === 0 && (
                      <p className="text-sm" style={{ color: "var(--muted)" }}>No hidden stores.</p>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {message && (
              <p className="text-sm text-green-400" data-testid="hero-status-message">{message}</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
