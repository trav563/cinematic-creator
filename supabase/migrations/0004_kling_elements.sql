-- Kling element binding for character consistency across multi-shot videos.
-- Kling lets us pre-register a character as a "Multi-Image Element" via
-- POST /v1/general/advanced-custom-elements, then attach element_list: [{element_id}]
-- on image2video calls so the model holds the character's identity across shots.

alter table characters
  add column kling_element_id text,
  add column kling_element_status text not null default 'unbound';

-- Element IDs come back from Kling as numbers (long), but we store as text to avoid
-- bigint serialization edge cases when round-tripping through JSON.

-- kling_element_status values: 'unbound' | 'binding' | 'bound' | 'failed'
-- This is faster for the UI to read than joining to the jobs table on every render.
