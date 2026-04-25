import { createContext, useContext, useEffect, useState } from "react";

const CartContext = createContext(null);
const STORAGE_KEY = "zoomeats_cart_v1";

export function CartProvider({ children }) {
  const [cart, setCart] = useState({ restaurant: null, items: [] });

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) setCart(JSON.parse(saved));
    } catch {}
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cart));
  }, [cart]);

  const addItem = (restaurant, item) => {
    setCart((c) => {
      let items = c.items;
      let r = c.restaurant;
      if (!r || r.restaurant_id !== restaurant.restaurant_id) {
        r = { restaurant_id: restaurant.restaurant_id, name: restaurant.name };
        items = [];
      }
      const idx = items.findIndex((x) => x.item_id === item.item_id);
      if (idx >= 0) {
        items = items.map((x, i) => (i === idx ? { ...x, quantity: x.quantity + 1 } : x));
      } else {
        items = [
          ...items,
          {
            item_id: item.item_id,
            name: item.name,
            price: item.price,
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

  const subtotal = cart.items.reduce((s, x) => s + x.price * x.quantity, 0);

  return (
    <CartContext.Provider value={{ cart, addItem, updateQty, clear, subtotal }}>
      {children}
    </CartContext.Provider>
  );
}

export const useCart = () => useContext(CartContext);
