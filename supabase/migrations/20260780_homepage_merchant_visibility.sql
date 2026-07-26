-- Homepage merchant listing visibility controls

alter table public.homepage_hero
  add column if not exists show_merchant_grid boolean not null default true,
  add column if not exists hidden_restaurant_ids text[] not null default '{}';

comment on column public.homepage_hero.show_merchant_grid is 'When false, the landing page merchant grid is hidden.';
comment on column public.homepage_hero.hidden_restaurant_ids is 'Restaurant IDs hidden from the landing page merchant grid.';
