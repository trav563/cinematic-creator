-- Per-scene reference images. In addition to asset-level refs (which provide
-- character/location/object identity), users can attach scene-specific refs
-- (e.g. an actual screenshot of the location they want to evoke) directly to
-- a scene. The keyframe worker prepends these to the Gemini input so the
-- model anchors on them as the canonical composition / lighting reference
-- for this exact shot.
alter table public.scenes
  add column if not exists reference_image_urls text[] not null default '{}';
