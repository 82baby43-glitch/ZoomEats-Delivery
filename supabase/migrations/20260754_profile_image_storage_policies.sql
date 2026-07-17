-- Storage policies for profile and vehicle image uploads

drop policy if exists "profile_images_public_read" on storage.objects;
create policy "profile_images_public_read"
  on storage.objects for select
  using (bucket_id = 'profile-images');

drop policy if exists "profile_images_auth_insert" on storage.objects;
create policy "profile_images_auth_insert"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'profile-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "profile_images_auth_update" on storage.objects;
create policy "profile_images_auth_update"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'profile-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "profile_images_auth_delete" on storage.objects;
create policy "profile_images_auth_delete"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'profile-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "vehicle_images_public_read" on storage.objects;
create policy "vehicle_images_public_read"
  on storage.objects for select
  using (bucket_id = 'vehicle-images');

drop policy if exists "vehicle_images_auth_insert" on storage.objects;
create policy "vehicle_images_auth_insert"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'vehicle-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "vehicle_images_auth_update" on storage.objects;
create policy "vehicle_images_auth_update"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'vehicle-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "vehicle_images_auth_delete" on storage.objects;
create policy "vehicle_images_auth_delete"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'vehicle-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
