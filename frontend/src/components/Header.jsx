import { Link } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import NavLinks from "@/components/header/NavLinks";
import CartButton from "@/components/header/CartButton";
import UserMenu from "@/components/header/UserMenu";

const LOGO_URL = "https://customer-assets.emergentagent.com/job_builder-hub-470/artifacts/ndtc6nc9_file_000000004a0471f792fc274e17837e5e.png";

export default function Header() {
  const { user, logout } = useAuth();

  return (
    <header
      className="sticky top-0 z-40 backdrop-blur-xl border-b"
      style={{ background: "rgba(10, 10, 10, 0.85)", borderColor: "var(--border)" }}
      data-testid="app-header"
    >
      <div className="max-w-7xl mx-auto px-6 md:px-12 lg:px-12 py-4 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2" data-testid="brand-logo">
          <img src={LOGO_URL} alt="ZoomEats" className="h-12 md:h-14 w-auto rounded-lg" />
        </Link>
        <NavLinks user={user} />
        <div className="flex items-center gap-3">
          <CartButton />
          <UserMenu user={user} logout={logout} />
        </div>
      </div>
    </header>
  );
}
