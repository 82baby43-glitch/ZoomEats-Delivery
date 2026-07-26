"use client";

import { createContext, useCallback, useContext, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Bell, X } from "lucide-react";

const NotificationContext = createContext({
  notify: () => {},
});

export function useRestaurantNotify() {
  return useContext(NotificationContext);
}

export function RestaurantNotificationProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const notify = useCallback((title, message, type = "info") => {
    const id = `${Date.now()}-${Math.random()}`;
    setToasts((t) => [...t, { id, title, message, type }]);
    setTimeout(() => {
      setToasts((t) => t.filter((x) => x.id !== id));
    }, 6000);
  }, []);

  const dismiss = (id) => setToasts((t) => t.filter((x) => x.id !== id));

  return (
    <NotificationContext.Provider value={{ notify }}>
      {children}
      <div className="fixed top-20 right-4 z-[100] flex flex-col gap-2 max-w-sm w-full pointer-events-none">
        <AnimatePresence>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              initial={{ opacity: 0, x: 40 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 40 }}
              className="card p-4 pointer-events-auto shadow-lg border"
              style={{ borderColor: "var(--primary)", background: "var(--surface)" }}
            >
              <div className="flex gap-3">
                <Bell size={18} style={{ color: "var(--primary)", flexShrink: 0 }} />
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-sm">{t.title}</div>
                  {t.message && (
                    <div className="text-xs mt-1" style={{ color: "var(--muted)" }}>{t.message}</div>
                  )}
                </div>
                <button type="button" className="btn-ghost !p-1" onClick={() => dismiss(t.id)}>
                  <X size={14} />
                </button>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </NotificationContext.Provider>
  );
}
