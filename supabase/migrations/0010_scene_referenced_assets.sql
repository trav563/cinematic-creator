-- Per-scene explicit asset attachments. The keyframe worker already auto-matches
-- assets by snake_case name in the scene description; this column lets the user
-- ALSO attach assets that aren't named in the description (or weren't picked up).
-- The worker unions matched + attached.
alter table public.scenes
  add column if not exists referenced_asset_ids uuid[] not null default '{}';
