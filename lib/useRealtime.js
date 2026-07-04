import { useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";

/**
 * Subscribe to Postgres CHANGES on a single table filtered by a column.
 * Returns nothing — runs side-effect (calls onChange) and cleans up.
 *
 * @param {string} table       - e.g. "orders"
 * @param {string} column      - filter column, e.g. "order_id"
 * @param {string} value       - filter value
 * @param {(payload) => void} onChange - called on every INSERT/UPDATE/DELETE
 */
export function useRealtimeRow(table, column, value, onChange) {
  useEffect(() => {
    if (!supabase || !value) return;
    const channel = supabase
      .channel(`row-${table}-${column}-${value}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table, filter: `${column}=eq.${value}` },
        onChange
      )
      .subscribe((status, err) => {
        // RLS denies anon access → channel goes CHANNEL_ERROR. Polling fallback
        // (already wired in callers) keeps the UI live. Don't spam the console.
        if (err && process.env.NODE_ENV !== "production") {
          console.debug(`[realtime] ${table}/${value} status=${status}`);
        }
      });
    return () => { supabase.removeChannel(channel); };
  }, [table, column, value, onChange]);
}
