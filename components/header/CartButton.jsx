"use client";

import { useRouter } from "next/navigation";
import { ShoppingBag } from "lucide-react";
import { useCart } from "@/lib/cart";

export default function CartButton() {
  const { cart } = useCart();
  const router = useRouter();
  const itemCount = cart.items.reduce((s, x) => s + x.quantity, 0);

  return (
    <button
      className="btn-ghost relative flex items-center gap-2"
      onClick={() => router.push("/cart")}
      data-testid="cart-button"
    >
      <ShoppingBag size={20} />
      {itemCount > 0 && (
        <span
          className="absolute -top-1 -right-1 text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center"
          style={{ background: "var(--primary)", color: "#0A0A0A" }}
          data-testid="cart-count"
        >
          {itemCount}
        </span>
      )}
    </button>
  );
}
