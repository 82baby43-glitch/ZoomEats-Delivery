-- Deactivate incomplete walkthrough/test restaurants that lack addresses (launch readiness).

update public.restaurants
set
  approved = false,
  active = false,
  accepting_orders = false,
  updated_at = now()
where restaurant_id in ('rest_walk_1785056493698', 'rest_live_1785058306078')
  and (address is null or latitude is null or longitude is null);
