import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { User as UserIcon, LogOut, Repeat } from "lucide-react";
import { startLogin } from "@/lib/supabaseAuth";

export default function UserMenu({ user, logout }) {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  if (!user) {
    return (
      <button className="btn-primary" onClick={startLogin} data-testid="login-button">
        Sign in
      </button>
    );
  }

  return (
    <div className="relative">
      <button
        className="flex items-center gap-2 btn-ghost"
        onClick={() => setOpen((v) => !v)}
        data-testid="user-menu-button"
      >
        {user.picture ? (
          <img src={user.picture} alt="" className="w-8 h-8 rounded-full object-cover" />
        ) : (
          <UserIcon size={20} />
        )}
        <span className="hidden md:block font-bold">{user.name?.split(" ")[0]}</span>
      </button>
      {open && (
        <div
          className="absolute right-0 mt-2 w-56 border rounded-xl shadow-lg overflow-hidden"
          style={{ background: "var(--surface)", borderColor: "var(--border)" }}
          data-testid="user-menu"
        >
          <div className="px-4 py-3 border-b" style={{ borderColor: "var(--border)" }}>
            <div className="text-sm font-bold">{user.name}</div>
            <div className="text-xs" style={{ color: "var(--muted)" }}>{user.email}</div>
            <div className="text-xs mt-1 label-eyebrow">Role: {user.role}</div>
          </div>
          <button
            className="w-full text-left px-4 py-3 flex items-center gap-2 text-sm hover:bg-black/40"
            onClick={() => { setOpen(false); navigate("/onboarding"); }}
            data-testid="switch-mode-button"
          >
            <Repeat size={16} /> Switch mode
          </button>
          <button
            className="w-full text-left px-4 py-3 flex items-center gap-2 text-sm hover:bg-black/40"
            onClick={logout}
            data-testid="logout-button"
          >
            <LogOut size={16} /> Sign out
          </button>
        </div>
      )}
    </div>
  );
}
