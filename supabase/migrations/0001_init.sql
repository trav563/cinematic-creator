-- Cinematic Creator Tool — initial schema
-- Run this against a fresh Supabase project. Auth is provided by supabase auth.users.

create extension if not exists "pgcrypto";

-- Projects -------------------------------------------------------------------

create table public.projects (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  title           text not null,
  status          text not null default 'intake',          -- intake | brief_review | active | archived
  brief_yaml      text,
  style_preset    text,                                    -- cinematic_blockbuster | animated_film | videogame_gameplay | prerendered_cutscene
  aspect_ratio    text not null default '16:9',            -- 16:9 | 9:16 | 1:1 | 4:5
  scope           text,
  genre           text,
  emotional_arc   text,
  must_include    text[] default '{}',
  must_not_include text[] default '{}',
  thumbnail_url   text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index projects_user_id_idx on public.projects(user_id);

-- Characters ----------------------------------------------------------------

create table public.characters (
  id                       uuid primary key default gen_random_uuid(),
  project_id               uuid not null references public.projects(id) on delete cascade,
  name                     text not null,
  role                     text,
  base_description         text,
  reference_image_urls     text[] default '{}',
  confirmed_variation_id   uuid,                           -- FK added below
  created_at               timestamptz not null default now()
);

create index characters_project_id_idx on public.characters(project_id);

create table public.character_variations (
  id           uuid primary key default gen_random_uuid(),
  character_id uuid not null references public.characters(id) on delete cascade,
  image_url    text not null,
  prompt_used  text,
  created_at   timestamptz not null default now()
);

create index character_variations_character_id_idx on public.character_variations(character_id);

alter table public.characters
  add constraint characters_confirmed_variation_fk
  foreign key (confirmed_variation_id)
  references public.character_variations(id)
  on delete set null;

-- Scenes / storyboard --------------------------------------------------------

create table public.scenes (
  id                   uuid primary key default gen_random_uuid(),
  project_id           uuid not null references public.projects(id) on delete cascade,
  scene_number         int not null,
  act                  text,
  beat                 text,
  camera               text,
  frame_role           text not null check (frame_role in ('SINGLE', 'PAIR-START', 'PAIR-END')),
  anchor_direction     text,
  description          text not null,
  current_keyframe_id  uuid,                               -- FK added below
  status               text not null default 'planned',    -- planned | keyframed | edited | videoed
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique (project_id, scene_number)
);

create index scenes_project_id_idx on public.scenes(project_id);

create table public.scene_keyframes (
  id                  uuid primary key default gen_random_uuid(),
  scene_id            uuid not null references public.scenes(id) on delete cascade,
  role                text not null default 'single',      -- start | end | single
  image_url           text not null,
  prompt_used         text,
  parent_keyframe_id  uuid references public.scene_keyframes(id) on delete set null,
  is_current          boolean not null default false,
  created_at          timestamptz not null default now()
);

create index scene_keyframes_scene_id_idx on public.scene_keyframes(scene_id);

alter table public.scenes
  add constraint scenes_current_keyframe_fk
  foreign key (current_keyframe_id)
  references public.scene_keyframes(id)
  on delete set null;

create table public.scene_videos (
  id              uuid primary key default gen_random_uuid(),
  scene_id        uuid not null references public.scenes(id) on delete cascade,
  video_url       text not null,
  duration_s      numeric,
  prompt_used     text,
  provider        text not null,                           -- kling-2.6 | kling-3.0
  parent_video_id uuid references public.scene_videos(id) on delete set null,
  is_current      boolean not null default false,
  created_at      timestamptz not null default now()
);

create index scene_videos_scene_id_idx on public.scene_videos(scene_id);

-- Jobs (background work history) --------------------------------------------

create table public.jobs (
  id                  uuid primary key default gen_random_uuid(),
  project_id          uuid references public.projects(id) on delete cascade,
  user_id             uuid not null references auth.users(id) on delete cascade,
  type                text not null,                      -- parse_script | propose_storyboard | image_generate | image_edit | video_generate
  status              text not null default 'queued',     -- queued | running | succeeded | failed
  provider            text,
  cost_usd_estimate   numeric,
  request             jsonb,
  result              jsonb,
  error               text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index jobs_project_id_idx on public.jobs(project_id);
create index jobs_user_id_idx on public.jobs(user_id);

-- Encrypted provider credentials (BYO API keys) ------------------------------

create table public.provider_credentials (
  user_id        uuid not null references auth.users(id) on delete cascade,
  provider       text not null,                           -- anthropic | google_ai_studio | kling
  encrypted_key  text not null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  primary key (user_id, provider)
);

-- updated_at triggers --------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

create trigger projects_set_updated_at before update on public.projects
  for each row execute function public.set_updated_at();
create trigger scenes_set_updated_at before update on public.scenes
  for each row execute function public.set_updated_at();
create trigger jobs_set_updated_at before update on public.jobs
  for each row execute function public.set_updated_at();
create trigger provider_credentials_set_updated_at before update on public.provider_credentials
  for each row execute function public.set_updated_at();

-- Row-level security ---------------------------------------------------------

alter table public.projects enable row level security;
alter table public.characters enable row level security;
alter table public.character_variations enable row level security;
alter table public.scenes enable row level security;
alter table public.scene_keyframes enable row level security;
alter table public.scene_videos enable row level security;
alter table public.jobs enable row level security;
alter table public.provider_credentials enable row level security;

create policy "own_projects" on public.projects
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "own_characters" on public.characters
  for all using (project_id in (select id from public.projects where user_id = auth.uid()))
  with check    (project_id in (select id from public.projects where user_id = auth.uid()));

create policy "own_character_variations" on public.character_variations
  for all using (character_id in (
    select c.id from public.characters c
    join public.projects p on p.id = c.project_id
    where p.user_id = auth.uid()
  ))
  with check (character_id in (
    select c.id from public.characters c
    join public.projects p on p.id = c.project_id
    where p.user_id = auth.uid()
  ));

create policy "own_scenes" on public.scenes
  for all using (project_id in (select id from public.projects where user_id = auth.uid()))
  with check    (project_id in (select id from public.projects where user_id = auth.uid()));

create policy "own_scene_keyframes" on public.scene_keyframes
  for all using (scene_id in (
    select s.id from public.scenes s
    join public.projects p on p.id = s.project_id
    where p.user_id = auth.uid()
  ))
  with check (scene_id in (
    select s.id from public.scenes s
    join public.projects p on p.id = s.project_id
    where p.user_id = auth.uid()
  ));

create policy "own_scene_videos" on public.scene_videos
  for all using (scene_id in (
    select s.id from public.scenes s
    join public.projects p on p.id = s.project_id
    where p.user_id = auth.uid()
  ))
  with check (scene_id in (
    select s.id from public.scenes s
    join public.projects p on p.id = s.project_id
    where p.user_id = auth.uid()
  ));

create policy "own_jobs" on public.jobs
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "own_provider_credentials" on public.provider_credentials
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Storage buckets (run via Supabase Dashboard or CLI; documented here for reference)
-- Buckets needed: project-assets (private). Folder structure:
--   project-assets/{user_id}/{project_id}/refs/{character_name}/{file}
--   project-assets/{user_id}/{project_id}/characters/{character_id}/variations/{variation_id}.png
--   project-assets/{user_id}/{project_id}/scenes/{scene_id}/keyframes/{keyframe_id}.png
--   project-assets/{user_id}/{project_id}/scenes/{scene_id}/videos/{video_id}.mp4
