export type MusicProvider = "spotify" | "apple_music" | "youtube_music";
export type CompanionRole = "driver" | "restaurant";

export interface AudioPreferences {
  musicVolume: number;
  duckingEnabled: boolean;
  safetyMode: boolean;
  duckVolume?: number;
}

export interface CompanionSettings {
  id: string;
  user_id: string;
  role: CompanionRole;
  music_provider: MusicProvider | null;
  music_connected: boolean;
  audio_preferences: AudioPreferences;
  created_at: string;
  updated_at: string;
}

export type DuckingPriority = "high" | "medium" | "low";

export type CompanionEventType =
  | "delivery_created"
  | "delivery_assigned"
  | "restaurant_message"
  | "customer_message"
  | "navigation_event"
  | "safety_alert";

export interface DuckingEvent {
  type: CompanionEventType;
  priority: DuckingPriority;
  message?: string;
  order_id?: string;
}

export const DEFAULT_AUDIO_PREFERENCES: AudioPreferences = {
  musicVolume: 70,
  duckingEnabled: true,
  safetyMode: false,
  duckVolume: 20,
};
