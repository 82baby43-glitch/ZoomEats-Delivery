/**
 * Re-export supabase gateway as the recommended import for future modules.
 * Existing `@/lib/supabase` imports continue to work unchanged.
 */
export { supabase, isSupabaseConfigured } from "./supabaseClient";
export {
  getSession,
  clearSessionCache,
  subscribeToRow,
  cleanupAllSubscriptions,
  getCachedProfile,
  setCachedProfile,
  invalidateProfileCache,
} from "./supabaseGateway";
