import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { api } from "@/lib/api";
import { useCart } from "@/lib/cart";
import { useAuth } from "@/lib/auth";
import Header from "@/components/Header";
import Chatbot from "@/components/Chatbot";
import { Star, Clock, Plus, ArrowLeft } from "lucide-react";

export default function RestaurantDetail() {
  const { rid } = useParams();
  const [data, setData] = useState(null);
  const { addItem } = useCart();
  const { user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    (async () => {
      const res = await api.get(`/restaurants/${rid}`);
      setData(res.data);
    })();
  }, [rid]);

  if (!data) return <div><Header /><div className="p-12 text-center">Loading…</div></div>;
  const { restaurant: r, menu } = data;

  const categories = [...new Set(menu.map((m) => m.category))];

  return (
    <div>
      <Header />
      <div className="max-w-7xl mx-auto px-6 md:px-12 py-8">
        <button onClick={() => navigate(-1)} className="btn-ghost mb-4 flex items-center gap-2" data-testid="back-button">
          <ArrowLeft size={16} /> Back
        </button>
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="rounded-3xl overflow-hidden mb-8"
        >
          <img src={r.cover_url} alt={r.name} className="w-full h-72 object-cover" />
        </motion.div>
        <div className="flex flex-wrap items-end justify-between gap-4 mb-10">
          <div>
            <div className="label-eyebrow">{r.cuisine}</div>
            <h1 className="font-display text-4xl md:text-5xl font-black tracking-tighter mt-1">{r.name}</h1>
            <p className="mt-2 max-w-2xl" style={{ color: "var(--muted)" }}>{r.description}</p>
          </div>
          <div className="flex gap-3">
            <span className="badge"><Star size={14} /> {r.rating}</span>
            <span className="badge"><Clock size={14} /> {r.delivery_time_min} min</span>
          </div>
        </div>

        {categories.map((cat) => (
          <div key={cat} className="mb-12">
            <h2 className="font-display text-2xl font-bold mb-5">{cat}</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {menu.filter((m) => m.category === cat).map((m) => (
                <div
                  key={m.item_id}
                  className="card flex flex-col"
                  data-testid={`menu-item-${m.item_id}`}
                >
                  <div className="aspect-video overflow-hidden">
                    <img src={m.image_url} alt={m.name} className="w-full h-full object-cover" />
                  </div>
                  <div className="p-5 flex-1 flex flex-col">
                    <h3 className="font-display text-lg font-bold">{m.name}</h3>
                    <p className="text-sm mt-1 flex-1" style={{ color: "var(--muted)" }}>{m.description}</p>
                    <div className="mt-4 flex items-center justify-between">
                      <div className="font-display text-xl font-bold">${m.price.toFixed(2)}</div>
                      <button
                        className="btn-primary !py-2 !px-4"
                        onClick={() => addItem(r, m)}
                        data-testid={`add-item-${m.item_id}`}
                      >
                        <Plus size={16} /> Add
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      {user && <Chatbot />}
    </div>
  );
}
