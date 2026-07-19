"use client";

import { createContext, useContext, useEffect, useMemo, useState, useCallback } from "react";

const CartContext = createContext(null);
const STORAGE_KEY = "zoomeats_cart_v1";

export function CartProvider({ children }) {
  const [cart, setCart] = useState({ restaurant: null, items: [] });

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) setCart(JSON.parse(saved));
    } catch (e) {
      console.warn("[cart] failed to load saved cart:", e);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cart));
  }, [cart]);

  const addItem = (restaurant, item) => {
    const nextPrice = Number(item.price);
    setCart((c) => {
      let items = c.items;
      let r = c.restaurant;
      if (!r || r.restaurant_id !== restaurant.restaurant_id) {
        r = { restaurant_id: restaurant.restaurant_id, name: restaurant.name };
        items = [];
      }
      const idx = items.findIndex((x) => x.item_id === item.item_id);
      if (idx >= 0) {
        items = items.map((x, i) =>
          i === idx
            ? {
                ...x,
                quantity: x.quantity + 1,
                name: x.name || item.name,
                price: Number(x.price) > 0 ? x.price : Number.isFinite(nextPrice) ? nextPrice : x.price,
                image_url: x.image_url || item.image_url,
              }
            : x
        );
      } else {
        items = [
          ...items,
          {
            item_id: item.item_id,
            name: item.name,
            price: Number.isFinite(nextPrice) ? nextPrice : 0,
            quantity: 1,
            image_url: item.image_url,
          },
        ];
      }
      return { restaurant: r, items };
    });
  };

  const updateQty = (item_id, qty) => {
    setCart((c) => ({
      ...c,
      items: c.items
        .map((x) => (x.item_id === item_id ? { ...x, quantity: qty } : x))
        .filter((x) => x.quantity > 0),
    }));
  };

  const clear = () => setCart({ restaurant: null, items: [] });

  const syncItemPrices = useCallback((repricedItems) => {
    if (!Array.isArray(repricedItems) || repricedItems.length === 0) return;
    const round2 = (n) => Math.round(Number(n) * 100) / 100;
    setCart((c) => {
      let changed = false;
      const items = c.items.map((x) => {
        const match = repricedItems.find((row) => row.item_id === x.item_id);
        if (!match) return x;
        const nextPrice = round2(Number.isFinite(Number(match.price)) && Number(match.price) > 0 ? match.price : x.price);
        const nextName = match.name || x.name;
        if (round2(x.price) === nextPrice && x.name === nextName) return x;
        changed = true;
        return {
          ...x,
          name: nextName,
          price: nextPrice,
        };
      });
      if (!changed) return c;
      return { ...c, items };
    });
  }, []);

  const subtotal = cart.items.reduce(
    (s, x) => s + Number(x.price || 0) * Number(x.quantity || 1),
    0
  );

  const value = useMemo(
    () => ({ cart, addItem, updateQty, clear, syncItemPrices, subtotal }),
    [cart, subtotal, syncItemPrices]
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export const useCart = () => useContext(CartContext);
