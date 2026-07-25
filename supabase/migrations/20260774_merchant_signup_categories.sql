-- Merchant signup: prioritize restaurants + retail subcategories; hide dispensary from default signup.

update public.merchant_categories
set enabled = true, visible = true, sort_order = 10
where slug = 'restaurants';

update public.merchant_categories
set enabled = true, visible = true, sort_order = 20
where slug = 'convenience_stores';

update public.merchant_categories
set enabled = true, visible = true, sort_order = 30
where slug = 'local_retail';

update public.merchant_categories
set enabled = true, visible = true, sort_order = 40, delivery_enabled = true, pickup_enabled = true
where slug = 'liquor_stores';

-- Licensed dispensary remains available for admin enablement but is not shown in default merchant signup.
update public.merchant_categories
set enabled = true, visible = false, sort_order = 200
where slug = 'licensed_dispensary';

comment on column public.merchant_categories.visible is 'When false, category is hidden from merchant signup picker (admin can still enable for special programs).';
