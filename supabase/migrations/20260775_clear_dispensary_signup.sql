-- Clear licensed dispensary from incomplete public merchant onboarding records.

update public.restaurant_onboarding
set merchant_category_slug = 'restaurants',
    updated_at = now()
where merchant_category_slug = 'licensed_dispensary'
  and coalesce(status, 'incomplete') <> 'submitted'
  and coalesce(verification_status, 'pending') in ('pending', 'info_requested');

update public.restaurants
set merchant_category_slug = 'restaurants',
    business_category = 'restaurant',
    updated_at = now()
where merchant_category_slug = 'licensed_dispensary'
  and coalesce(approved, false) = false
  and coalesce(active, false) = false;
