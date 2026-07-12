-- PWA ecosystem: installation tracking + Web Push subscriptions

CREATE TABLE IF NOT EXISTS pwa_installations (
  installation_id text PRIMARY KEY,
  user_id text REFERENCES users(user_id) ON DELETE CASCADE,
  app_type text NOT NULL CHECK (app_type IN ('customer', 'driver', 'restaurant')),
  installation_status text NOT NULL DEFAULT 'installed' CHECK (installation_status IN ('prompted', 'installed', 'dismissed')),
  platform text,
  device_id text,
  user_agent text,
  installed_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, app_type, device_id)
);

CREATE INDEX IF NOT EXISTS idx_pwa_installations_user ON pwa_installations(user_id);
CREATE INDEX IF NOT EXISTS idx_pwa_installations_app_type ON pwa_installations(app_type);

CREATE TABLE IF NOT EXISTS push_subscriptions (
  subscription_id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  app_type text NOT NULL CHECK (app_type IN ('customer', 'driver', 'restaurant')),
  endpoint text NOT NULL UNIQUE,
  p256dh text NOT NULL,
  auth text NOT NULL,
  device_id text,
  user_agent text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user ON push_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_app_type ON push_subscriptions(app_type);

ALTER TABLE pwa_installations ENABLE ROW LEVEL SECURITY;
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY pwa_installations_own ON pwa_installations
  FOR ALL USING (auth.uid()::text = user_id OR user_id IS NULL)
  WITH CHECK (auth.uid()::text = user_id OR user_id IS NULL);

CREATE POLICY push_subscriptions_own ON push_subscriptions
  FOR ALL USING (auth.uid()::text = user_id)
  WITH CHECK (auth.uid()::text = user_id);
