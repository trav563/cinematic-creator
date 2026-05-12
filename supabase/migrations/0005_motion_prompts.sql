-- Persist Claude-generated and user-edited Kling motion prompts per scene.
-- Pre-populated by the bulk "Auto-generate motion prompts" action and editable
-- in the Video tab card. The video-generation worker reads from the per-scene
-- card state at submit time, but we save edits back to this column on blur so
-- the user doesn't lose them when navigating away.

alter table scenes add column motion_prompt text;
