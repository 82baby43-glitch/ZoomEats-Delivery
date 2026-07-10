export const MENU_ENHANCE_FREE_LIMIT = 5;

export const MENU_ENHANCE_PRESET = "clean_bright" as const;

export type MenuEnhancePreset = typeof MENU_ENHANCE_PRESET;

export function getPhotoroomApiKey(): string {
  return process.env.PHOTOROOM_API_KEY || process.env.Photoroom_Api_Key || "";
}

export function publicMenuImageUrl(supabaseUrl: string, storagePath: string): string {
  const base = supabaseUrl.replace(/\/$/, "");
  return `${base}/storage/v1/object/public/menu-images/${storagePath}`;
}
