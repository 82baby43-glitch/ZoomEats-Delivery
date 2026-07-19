-- Fix calculate_restaurant_payout overload ambiguity (drop 5-arg version, keep 6-arg with default)

drop function if exists public.calculate_restaurant_payout(numeric, numeric, numeric, numeric, boolean);

revoke all on function public.calculate_restaurant_payout(numeric, numeric, numeric, numeric, boolean, numeric) from public;
grant execute on function public.calculate_restaurant_payout(numeric, numeric, numeric, numeric, boolean, numeric) to service_role;
