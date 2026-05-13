-- Per-scene override for the derived paired-frame prompt. When set, derive-paired-frame
-- uses this string verbatim as the prompt sent to Gemini (alongside the anchor image),
-- bypassing the Claude edit-instruction composer entirely. Lets the user dial in the
-- exact transformation when the auto-composed instruction is too vague or too aggressive.
alter table public.scenes
  add column if not exists derived_frame_prompt_override text;
