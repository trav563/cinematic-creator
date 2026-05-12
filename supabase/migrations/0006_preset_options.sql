-- Per-project style-preset options. Currently holds:
--   { "subMode": "first_person" | "third_person" | "isometric" | "over_shoulder_combat" }
-- for videogame_gameplay, or
--   { "subMode": "pixar" | "anime" | "spider_verse" | "arcane" }
-- for animated_film. Other presets leave this empty.
--
-- jsonb so we can extend with future per-preset options (e.g. gameplay HUD style,
-- animated frame-rate target) without needing a new migration each time.

alter table projects add column style_preset_options jsonb not null default '{}'::jsonb;
