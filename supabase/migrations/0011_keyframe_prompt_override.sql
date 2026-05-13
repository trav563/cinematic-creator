-- Per-scene keyframe prompt override. When set, generate-keyframe uses this string
-- verbatim instead of running buildKeyframePrompt(). Lets the user prompt-engineer
-- a scene without changing the description / asset library / preset wiring.
-- Motion-prompt generation also reads this so Kling prompts reflect what the
-- keyframe will actually look like.
alter table public.scenes
  add column if not exists keyframe_prompt_override text;
