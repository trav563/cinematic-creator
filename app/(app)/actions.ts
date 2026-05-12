"use server";

import { revalidatePath } from "next/cache";
import {
  createSupabaseServerClient,
  createSupabaseServiceClient,
} from "@/lib/supabase/server";
import { PROJECT_ASSETS_BUCKET } from "@/lib/storage";

type Result = { ok: true } | { ok: false; error: string };

/**
 * Delete a project and all its associated data.
 *
 * DB cleanup is automatic via ON DELETE CASCADE (projects → characters, scenes, jobs;
 * those then cascade to character_variations, scene_keyframes, scene_videos).
 *
 * Storage objects do NOT cascade — we recursively list and delete every file under
 * `{userId}/{projectId}/` in the project-assets bucket so we don't leak storage.
 */
export async function deleteProject(projectId: string): Promise<Result> {
  const supabase = await createSupabaseServerClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { ok: false, error: "Not signed in" };

  // Verify ownership before any destructive work.
  const { data: project } = await supabase
    .from("projects")
    .select("id, user_id")
    .eq("id", projectId)
    .single();
  if (!project) return { ok: false, error: "Project not found" };
  if (project.user_id !== userData.user.id) {
    return { ok: false, error: "Not authorized to delete this project" };
  }

  // Storage cleanup uses service role since the user-scoped client respects RLS path
  // prefixes but the recursive listing API benefits from broader access.
  const service = createSupabaseServiceClient();
  const projectPrefix = `${userData.user.id}/${projectId}`;

  const allPaths = await listAllStorageObjects(service, projectPrefix);
  if (allPaths.length > 0) {
    // Storage delete accepts up to 1000 paths per call. Chunk for safety.
    for (let i = 0; i < allPaths.length; i += 500) {
      const batch = allPaths.slice(i, i + 500);
      const { error: rmErr } = await service.storage
        .from(PROJECT_ASSETS_BUCKET)
        .remove(batch);
      if (rmErr) {
        // Log but don't block DB delete — orphaned files are acceptable; orphaned DB
        // rows are not, since they'd keep showing up in the dashboard.
        console.warn(`Storage cleanup partial failure for ${projectId}: ${rmErr.message}`);
      }
    }
  }

  // DB delete (cascades clean up all child rows automatically).
  const { error: delErr } = await supabase.from("projects").delete().eq("id", projectId);
  if (delErr) return { ok: false, error: delErr.message };

  revalidatePath("/");
  return { ok: true };
}

/**
 * Recursively walk the storage bucket under `prefix` and return every file path.
 * Supabase Storage's list() returns files in the immediate "directory" (and folders
 * as separate entries) — we recurse into folders to flatten everything.
 */
async function listAllStorageObjects(
  supabase: ReturnType<typeof createSupabaseServiceClient>,
  prefix: string,
): Promise<string[]> {
  const collected: string[] = [];

  async function walk(dir: string) {
    const { data, error } = await supabase.storage
      .from(PROJECT_ASSETS_BUCKET)
      .list(dir, { limit: 1000 });
    if (error || !data) return;
    for (const entry of data) {
      // Folder entries have id == null; files have an id.
      const fullPath = dir ? `${dir}/${entry.name}` : entry.name;
      if (entry.id === null) {
        await walk(fullPath);
      } else {
        collected.push(fullPath);
      }
    }
  }

  await walk(prefix);
  return collected;
}
