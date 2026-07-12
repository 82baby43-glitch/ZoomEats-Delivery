import Link from "next/link";

export default function OfflinePage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 text-center">
      <div className="w-20 h-20 rounded-2xl flex items-center justify-center text-4xl font-black mb-6" style={{ background: "var(--primary)", color: "#0A0A0A" }}>Z</div>
      <h1 className="font-display text-2xl font-bold">You are offline</h1>
      <p className="mt-3 max-w-md" style={{ color: "var(--muted)" }}>
        Some features will return when your connection is restored. Cached restaurants and menus may still be available.
      </p>
      <Link href="/" className="btn-primary mt-8">Try again</Link>
    </div>
  );
}
