"use client";

import { useState } from "react";
import { Copy, Edit2, Plus, Trash2 } from "lucide-react";
import MenuImageEnhancer from "@/components/vendor/MenuImageEnhancer";
import { formatMoney } from "@/lib/safeData";

const FOOD_IMG = "https://images.pexels.com/photos/32594346/pexels-photo-32594346.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940";
const CATEGORIES = ["Starters", "Mains", "Sides", "Desserts", "Drinks"];

const EMPTY_ITEM = { name: "", description: "", price: "", image_url: "", category: "Mains", available: true, sold_out: false };

export default function RestaurantMenuManager({ menu, onAdd, onUpdate, onDelete, onDuplicate }) {
  const [item, setItem] = useState(EMPTY_ITEM);
  const [editing, setEditing] = useState(null);
  const [busy, setBusy] = useState(null);

  const saveNew = async () => {
    if (!item.name || !item.price) return;
    setBusy("add");
    try {
      await onAdd({ ...item, price: parseFloat(item.price), image_url: item.image_url || FOOD_IMG });
      setItem(EMPTY_ITEM);
    } finally {
      setBusy(null);
    }
  };

  const saveEdit = async () => {
    if (!editing?.name) return;
    setBusy(editing.item_id);
    try {
      await onUpdate(editing.item_id, {
        ...editing,
        price: parseFloat(editing.price),
      });
      setEditing(null);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="grid lg:grid-cols-3 gap-6">
      <div className="card p-5 h-fit space-y-3">
        <h3 className="font-display text-lg font-bold flex items-center gap-2">
          <Plus size={18} /> Add menu item
        </h3>
        <input className="input-field" placeholder="Name" value={item.name} onChange={(e) => setItem({ ...item, name: e.target.value })} />
        <textarea className="input-field" rows={2} placeholder="Description" value={item.description} onChange={(e) => setItem({ ...item, description: e.target.value })} />
        <input className="input-field" type="number" step="0.01" placeholder="Price" value={item.price} onChange={(e) => setItem({ ...item, price: e.target.value })} />
        <MenuImageEnhancer imageUrl={item.image_url} onImageUrl={(url) => setItem((p) => ({ ...p, image_url: url }))} />
        <select className="input-field" value={item.category} onChange={(e) => setItem({ ...item, category: e.target.value })}>
          {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
        </select>
        <button type="button" className="btn-primary w-full" disabled={busy === "add"} onClick={saveNew}>Add item</button>
      </div>

      <div className="lg:col-span-2 space-y-3">
        {menu.map((m) => (
          <div key={m.item_id} className="card p-4">
            {editing?.item_id === m.item_id ? (
              <div className="space-y-3">
                <input className="input-field" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
                <input className="input-field" type="number" step="0.01" value={editing.price} onChange={(e) => setEditing({ ...editing, price: e.target.value })} />
                <textarea className="input-field" rows={2} value={editing.description || ""} onChange={(e) => setEditing({ ...editing, description: e.target.value })} />
                <select className="input-field" value={editing.category || "Mains"} onChange={(e) => setEditing({ ...editing, category: e.target.value })}>
                  {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
                </select>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={editing.sold_out} onChange={(e) => setEditing({ ...editing, sold_out: e.target.checked, available: !e.target.checked })} />
                  Sold out
                </label>
                <div className="flex gap-2">
                  <button type="button" className="btn-primary" onClick={saveEdit}>Save</button>
                  <button type="button" className="btn-ghost" onClick={() => setEditing(null)}>Cancel</button>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-4">
                <img src={m.image_url || FOOD_IMG} alt="" className="w-16 h-16 rounded-xl object-cover" />
                <div className="flex-1 min-w-0">
                  <div className="font-bold flex items-center gap-2">
                    {m.name}
                    {m.sold_out && <span className="badge text-[10px]">Sold out</span>}
                  </div>
                  <div className="text-sm" style={{ color: "var(--muted)" }}>
                    {m.category || "—"} · ${formatMoney(m.price)}
                  </div>
                </div>
                <div className="flex gap-1">
                  <button type="button" className="btn-ghost !p-2" onClick={() => setEditing({ ...m })} title="Edit"><Edit2 size={16} /></button>
                  <button type="button" className="btn-ghost !p-2" onClick={() => onDuplicate(m.item_id)} title="Duplicate"><Copy size={16} /></button>
                  <button type="button" className="btn-ghost !p-2" onClick={() => onDelete(m.item_id)} title="Delete"><Trash2 size={16} /></button>
                </div>
              </div>
            )}
          </div>
        ))}
        {!menu.length && (
          <div className="card p-8 text-center" style={{ color: "var(--muted)" }}>No menu items yet.</div>
        )}
      </div>
    </div>
  );
}
