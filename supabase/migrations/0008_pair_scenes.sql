-- PAIR scenes own start AND end keyframes. Previously a "pair" was modeled as two
-- separate scenes (PAIR-START and PAIR-END rows). New model: one scene per clip with
-- frame_role = 'PAIR' and pair_anchor indicating which side is the anchor frame
-- (the other side is editorially derived from the anchor via Gemini's edit endpoint).

-- 1. Drop the old check constraint on frame_role and add the new one
alter table public.scenes drop constraint if exists scenes_frame_role_check;
alter table public.scenes
  add constraint scenes_frame_role_check
  check (frame_role in ('SINGLE', 'PAIR', 'PAIR-START', 'PAIR-END'));
-- Note: keeping PAIR-START / PAIR-END in the enum for backward compatibility with
-- any in-flight projects. New propose_storyboard generations only emit SINGLE | PAIR.

-- 2. Add pair_anchor — which side of the pair is the anchor frame
alter table public.scenes add column pair_anchor text
  check (pair_anchor is null or pair_anchor in ('start', 'end'));

-- 3. Add separate current_start_keyframe_id + current_end_keyframe_id for PAIR scenes.
-- Keep current_keyframe_id around for SINGLE scenes (and for backward compat reads).
alter table public.scenes add column current_start_keyframe_id uuid;
alter table public.scenes add column current_end_keyframe_id uuid;

alter table public.scenes
  add constraint scenes_current_start_keyframe_fk
  foreign key (current_start_keyframe_id)
  references public.scene_keyframes(id)
  on delete set null;

alter table public.scenes
  add constraint scenes_current_end_keyframe_fk
  foreign key (current_end_keyframe_id)
  references public.scene_keyframes(id)
  on delete set null;
