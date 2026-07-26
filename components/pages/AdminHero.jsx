"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import Header from "@/components/Header";
import { LoadingSkeleton, ErrorState } from "@/components/ui/PageStates";
import { ImageIcon, Trash2, Upload, Store } from "lucide-react";

const DEFAULT_HERO_IMG = "/images/hero-zoomeats.webp";

export default function AdminHero() {
  const [hero, setHero] = useState(null);
  const [restaurants, setRestaurants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [restaurantId, setRestaurantId] = useState("");
  const [useRestaurantImage, setUseRestaurantImage] = useState(true);
  const [customImageUrl, setCustomImageUrl] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [heroRes, restRes] = await Promise.all([
        api.get("/admin/hero"),
        api.get("/admin/restaurants"),
      ]);
      const data = heroRes?.data ?? heroRes;
      setHero(data);
      setEnabled(Boolean(data?.enabled));
      setRestaurantId(data?.restaurant_id || "");
      setUseRestaurantImage(data?.use_restaurant_image !== false);
      setCustomImageUrl(data?.custom_image_url || "");
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

  const selectedRestaurant = useMemo(
    () => restaurants.find((r) => r.restaurant_id === restaurantId) || hero?.restaurant || null,
    [restaurants, restaurantId, hero]
  );

  const previewImage = useMemo(() => {
    if (!enabled || !restaurantId) return DEFAULT_HERO_IMG;
    if (!useRestaurantImage && customImageUrl) return customImageUrl;
    return selectedRestaurant?.image_url || selectedRestaurant?.cover_url || customImageUrl || DEFAULT_HERO_IMG;
  }, [enabled, restaurantId, useRestaurantImage, customImageUrl, selectedRestaurant]);

  const save = async () => {
    if (enabled && !restaurantId) {
      alert("Choose a restaurant/store to feature on the hero, or turn the hero feature off.");
      return;
    }
    setBusy(true);
    try {
      await api.put("/admin/hero", {
        enabled,
        restaurant_id: restaurantId || null,
        use_restaurant_image: useRestaurantImage,
        image_url: customImageUrl || null,
      });
      await load();
    } catch (e) {
      alert(e?.message || "Could not save hero settings");
    } finally {
      setBusy(false);
    }
  };

  const removeFromHero = async () => {
    if (!confirm("Remove the featured store from the homepage hero?")) return;
    setBusy(true);
    try {
      await api.post("/admin/hero/clear", {});
      setEnabled(false);
      setRestaurantId("");
      setCustomImageUrl("");
      setUseRestaurantImage(true);
      await load();
    } catch (e) {
      alert(e?.message || "Could not clear hero");
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
            <p className="mt-2 max-w-2xl" style={{ color: "var(--muted)" }}>
              Choose which store appears on the landing page hero, upload a custom hero image, or remove it to show the default ZoomEats image.
            </p>
          </div>
          <Link href="/admin" className="btn-secondary text-sm">Back to admin</Link>
        </div>

        {loading && <div className="mt-6"><LoadingSkeleton label="Loading hero settings…" rows={4} /></div>}
        {error && <div className="mt-6"><ErrorState title="Could not load hero settings" onRetry={load} /></div>}

        {!loading && !error && (
          <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="card p-6 space-y-5" data-testid="admin-hero-controls">
              <label className="flex items-center justify-between gap-4">
                <div>
                  <div className="font-bold">Show featured store on hero</div>
                  <div className="text-sm" style={{ color: "var(--muted)" }}>Turn on to replace the default hero image with your selected store.</div>
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
                  onChange={(e) => setRestaurantId(e.target.value)}
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
                  <input
                    type="radio"
                    checked={useRestaurantImage}
                    onChange={() => setUseRestaurantImage(true)}
                  />
                  Use store photo from listing
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    checked={!useRestaurantImage}
                    onChange={() => setUseRestaurantImage(false)}
                  />
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
                {customImageUrl && (
                  <div className="text-xs break-all" style={{ color: "var(--muted)" }}>
                    Custom image ready
                  </div>
                )}
              </div>

              <div className="flex flex-wrap gap-3 pt-2">
                <button type="button" className="btn-primary" disabled={busy} onClick={save} data-testid="hero-save">
                  Save hero
                </button>
                <button
                  type="button"
                  className="btn-secondary flex items-center gap-2"
                  disabled={busy}
                  onClick={removeFromHero}
                  data-testid="hero-remove"
                >
                  <Trash2 size={16} /> Remove from hero
                </button>
              </div>
            </div>

            <div className="card p-6" data-testid="admin-hero-preview">
              <div className="font-bold mb-4">Preview</div>
              <div className="rounded-3xl overflow-hidden border relative" style={{ borderColor: "var(--border)" }}>
                <img src={previewImage} alt="Hero preview" className="w-full h-[360px] object-cover" />
                {enabled && selectedRestaurant && (
                  <div className="absolute inset-x-0 bottom-0 p-5 bg-gradient-to-t from-black/80 to-transparent">
                    <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-white/80">
                      <Store size={14} /> Featured on hero
                    </div>
                    <div className="font-display text-2xl font-black text-white mt-1">{selectedRestaurant.name}</div>
                    <div className="text-sm text-white/80 mt-1 line-clamp-2">
                      {selectedRestaurant.description || selectedRestaurant.cuisine || "Local merchant"}
                    </div>
                  </div>
                )}
              </div>
              <p className="text-sm mt-4" style={{ color: "var(--muted)" }}>
                {enabled && restaurantId
                  ? "This store will appear on the homepage hero after you save."
                  : "The default ZoomEats hero image is shown when no store is featured."}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
