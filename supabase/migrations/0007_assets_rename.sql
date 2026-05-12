-- Rename `characters` → `assets` and `character_variations` → `asset_variations`,
-- add `kind` column so locations and objects can use the same upload-refs / generate-
-- variations / confirm-canonical / bind workflow as characters.
--
-- After this, the parse_script step extracts not just people but also recurring
-- locations (kokiri_village, hyrule_castle) and key objects (master_sword, hover_boots)
-- as assets. The existing keyframe matcher (full snake_case name match against scene
-- description) automatically pulls them in for scene generation.

-- 1. Rename tables
alter table public.characters rename to assets;
alter table public.character_variations rename to asset_variations;

-- 2. Rename FK column on the variations table
alter table public.asset_variations rename column character_id to asset_id;

-- 3. Add kind column (default 'character' so existing rows stay valid)
alter table public.assets
  add column kind text not null default 'character'
  check (kind in ('character', 'location', 'object'));

-- 4. Rename indexes for clarity
alter index public.characters_project_id_idx rename to assets_project_id_idx;
alter index public.character_variations_character_id_idx rename to asset_variations_asset_id_idx;

-- 5. Rename FK constraints
alter table public.assets rename constraint characters_confirmed_variation_fk
  to assets_confirmed_variation_fk;

-- 6. Rename RLS policies (drop + recreate; rename isn't supported for policies)
drop policy if exists "own_characters" on public.assets;
drop policy if exists "own_character_variations" on public.asset_variations;

create policy "own_assets" on public.assets
  for all using (project_id in (select id from public.projects where user_id = auth.uid()))
  with check    (project_id in (select id from public.projects where user_id = auth.uid()));

create policy "own_asset_variations" on public.asset_variations
  for all using (asset_id in (
    select a.id from public.assets a
    join public.projects p on p.id = a.project_id
    where p.user_id = auth.uid()
  ))
  with check (asset_id in (
    select a.id from public.assets a
    join public.projects p on p.id = a.project_id
    where p.user_id = auth.uid()
  ));

-- 7. Make sure the realtime publication membership follows the rename. If your project's
-- supabase_realtime publication previously included `character_variations`, drop and re-add
-- under the new name so the asset_variations table still streams updates.
do $$
begin
  begin
    alter publication supabase_realtime drop table public.character_variations;
  exception when undefined_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.asset_variations;
  exception when duplicate_object then null;
  end;
end $$;
