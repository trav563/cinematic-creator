-- Storage policies for the project-assets bucket.
-- Path layout: {user_id}/{project_id}/refs/{...}, {user_id}/{project_id}/characters/{...}, etc.
-- A user can read/write only paths whose first segment is their own auth.uid().

create policy "users can read own project assets"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'project-assets'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "users can insert own project assets"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'project-assets'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "users can update own project assets"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'project-assets'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "users can delete own project assets"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'project-assets'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- The service-role client (used by Inngest workers) bypasses RLS automatically,
-- so worker-side uploads/reads do not need explicit policies.
