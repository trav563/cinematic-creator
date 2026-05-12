-- Enable Supabase Realtime on tables the UI subscribes to.
-- Without this, postgres_changes subscriptions silently never fire.

alter publication supabase_realtime add table public.jobs;
alter publication supabase_realtime add table public.character_variations;
alter publication supabase_realtime add table public.scene_keyframes;
alter publication supabase_realtime add table public.scene_videos;
