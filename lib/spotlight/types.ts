export type SpotlightStatus = "draft" | "pending_review" | "published" | "archived";

export type SpotlightTag =
  | "local_favorites"
  | "new_partners"
  | "family_owned"
  | "late_night"
  | "student_favorites";

export type SpotlightAnalyticsEvent =
  | "spotlight_view"
  | "restaurant_page_click"
  | "menu_click"
  | "order_generated"
  | "promotion_redemption"
  | "share_click";

export type FeaturedMenuItem = {
  item_id?: string;
  name: string;
  description?: string;
  price?: number;
  image_url?: string;
};

export type SpotlightMedia = {
  id: string;
  media_type: "image" | "video";
  media_url: string;
  caption?: string | null;
  sort_order?: number;
};

export type SpotlightRecord = {
  id: string;
  restaurant_id: string;
  title?: string | null;
  story?: string | null;
  owner_message?: string | null;
  cover_image_url?: string | null;
  logo_url?: string | null;
  video_url?: string | null;
  featured_menu_items?: FeaturedMenuItem[];
  promotion_text?: string | null;
  spotlight_tags?: string[];
  slug?: string | null;
  homepage_featured?: boolean;
  status: SpotlightStatus;
  featured_start_date?: string | null;
  featured_end_date?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type SpotlightView = SpotlightRecord & {
  restaurant?: Record<string, unknown> | null;
  media?: SpotlightMedia[];
};

export const SPOTLIGHT_FILTER_LABELS: Record<SpotlightTag, string> = {
  local_favorites: "Local Favorites",
  new_partners: "New Partners",
  family_owned: "Family Owned",
  late_night: "Late Night",
  student_favorites: "Student Favorites",
};
