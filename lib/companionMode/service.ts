import type { SupabaseClient } from "@supabase/supabase-js";
import type { AudioPreferences, CompanionRole, CompanionSettings, MusicProvider } from "./types";
import { DEFAULT_AUDIO_PREFERENCES } from "./types";

function uid(prefix: string) {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
}

function normalizePreferences(raw: unknown): AudioPreferences {
  const p = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return {
    musicVolume: Math.min(100, Math.max(0, Number(p.musicVolume ?? DEFAULT_AUDIO_PREFERENCES.musicVolume))),
    duckingEnabled: p.duckingEnabled !== false,
    safetyMode: !!p.safetyMode,
    duckVolume: Math.min(100, Math.max(0, Number(p.duckVolume ?? DEFAULT_AUDIO_PREFERENCES.duckVolume ?? 20))),
  };
}

export async function getCompanionSettings(
  db: SupabaseClient,
  userId: string
): Promise<CompanionSettings | null> {
  const { data } = await db.from("companion_settings").select("*").eq("user_id", userId).maybeSingle();
  if (!data) return null;
  return {
    ...data,
    audio_preferences: normalizePreferences(data.audio_preferences),
  } as CompanionSettings;
}

export async function ensureCompanionSettings(
  db: SupabaseClient,
  userId: string,
  role: CompanionRole
): Promise<CompanionSettings> {
  const existing = await getCompanionSettings(db, userId);
  if (existing) return existing;

  const row = {
    id: uid("cmp"),
    user_id: userId,
    role,
    music_provider: null,
    music_connected: false,
    audio_preferences: DEFAULT_AUDIO_PREFERENCES,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await db.from("companion_settings").insert(row).select("*").single();
  if (error) throw new Error(error.message);
  return { ...data, audio_preferences: normalizePreferences(data.audio_preferences) } as CompanionSettings;
}

export async function connectMusicProvider(
  db: SupabaseClient,
  userId: string,
  role: CompanionRole,
  provider: MusicProvider
): Promise<CompanionSettings> {
  await ensureCompanionSettings(db, userId, role);
  const { data, error } = await db
    .from("companion_settings")
    .update({
      music_provider: provider,
      music_connected: true,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId)
    .select("*")
    .single();

  if (error) throw new Error(error.message);
  return { ...data, audio_preferences: normalizePreferences(data.audio_preferences) } as CompanionSettings;
}

export async function disconnectMusicProvider(
  db: SupabaseClient,
  userId: string
): Promise<CompanionSettings> {
  const { data, error } = await db
    .from("companion_settings")
    .update({
      music_connected: false,
      music_provider: null,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId)
    .select("*")
    .single();

  if (error) throw new Error(error.message);
  return { ...data, audio_preferences: normalizePreferences(data.audio_preferences) } as CompanionSettings;
}

export async function updateAudioSettings(
  db: SupabaseClient,
  userId: string,
  role: CompanionRole,
  patch: Partial<AudioPreferences>
): Promise<CompanionSettings> {
  const current = await ensureCompanionSettings(db, userId, role);
  const merged = normalizePreferences({ ...current.audio_preferences, ...patch });

  const { data, error } = await db
    .from("companion_settings")
    .update({
      audio_preferences: merged,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId)
    .select("*")
    .single();

  if (error) throw new Error(error.message);
  return { ...data, audio_preferences: merged } as CompanionSettings;
}

/** Server-side ducking signal metadata (client performs actual volume change). */
export function buildDuckingPayload(
  eventType: string,
  message: string,
  orderId?: string
) {
  return {
    event_type: eventType,
    message,
    order_id: orderId || null,
    duck_volume: 20,
    restore_after_ms: 5000,
    triggered_at: new Date().toISOString(),
  };
}

export function restoreAudioVolume(preferences: AudioPreferences) {
  return {
    volume: preferences.musicVolume,
    restored_at: new Date().toISOString(),
  };
}
