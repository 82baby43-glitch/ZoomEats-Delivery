import { useEffect, useState } from "react";

/**
 * Debounce a value — useful for search inputs in future modules.
 * Existing Landing page benefits from transparent gateway debouncing;
 * this hook is available for explicit component-level control.
 */
export function useDebouncedValue(value, delayMs = 300) {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}

export default useDebouncedValue;
