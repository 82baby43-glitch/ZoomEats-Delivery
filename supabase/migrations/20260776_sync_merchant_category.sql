-- Ensure unapproved merchants are not stuck on licensed_dispensary category.

update public.restaurants
set merchant_category_slug = coalesce(
      (select merchant_category_slug from public.restaurant_onboarding o where o.user_id = restaurants.owner_id),
      'restaurants'
    ),
    business_category = case
      when coalesce(
        (select merchant_category_slug from public.restaurant_onboarding o where o.user_id = restaurants.owner_id),
        'restaurants'
      ) = 'liquor_stores' then 'liquor_store'
      when coalesce(
        (select merchant_category_slug from public.restaurant_onboarding o where o.user_id = restaurants.owner_id),
        'restaurants'
      ) = 'convenience_stores' then 'convenience_store'
      when coalesce(
        (select merchant_category_slug from public.restaurant_onboarding o where o.user_id = restaurants.owner_id),
        'restaurants'
      ) = 'local_retail' then 'retail'
      else 'restaurant'
    end,
    updated_at = now()
where merchant_category_slug = 'licensed_dispensary'
  and coalesce(approved, false) = false;
