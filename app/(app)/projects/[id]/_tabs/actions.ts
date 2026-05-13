"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { inngest } from "@/lib/inngest/client";
import { PROJECT_ASSETS_BUCKET, signedUrl } from "@/lib/storage";
import type { GenerateAssetVariationEventData } from "@/lib/inngest/functions/generate-asset-variation";
import type { BindAssetElementEventData } from "@/lib/inngest/functions/bind-asset-element";

type Result<T = void> = { ok: true; data?: T } | { ok: false; error: string };

export interface ImportableAsset {
  id: string;
  name: string;
  kind: "character" | "location" | "object";
  role: string | null;
  base_description: string | null;
  project_id: string;
  project_title: string;
  preview_url: string | null;
  variation_count: number;
  ref_count: number;
}

export async function uploadAssetReference(
  assetId: string,
  formData: FormData,
): Promise<Result<{ paths: string[] }>> {
  const supabase = await createSupabaseServerClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { ok: false, error: "Not signed in" };

  const { data: asset, error: assetErr } = await supabase
    .from("assets")
    .select("id, project_id, reference_image_urls")
    .eq("id", assetId)
    .single();
  if (assetErr || !asset) return { ok: false, error: "Asset not found" };

  const files = formData.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length === 0) return { ok: false, error: "No files provided" };

  const uploadedPaths: string[] = [];
  for (const file of files) {
    const ext = file.name.split(".").pop() ?? "png";
    const filename = `${crypto.randomUUID()}.${ext}`;
    const path = `${userData.user.id}/${asset.project_id}/refs/${assetId}/${filename}`;
    const { error: upErr } = await supabase.storage
      .from(PROJECT_ASSETS_BUCKET)
      .upload(path, file, { contentType: file.type, upsert: false });
    if (upErr) return { ok: false, error: upErr.message };
    uploadedPaths.push(path);
  }

  const newRefs = [...(asset.reference_image_urls ?? []), ...uploadedPaths];
  const { error: updateErr } = await supabase
    .from("assets")
    .update({ reference_image_urls: newRefs })
    .eq("id", assetId);
  if (updateErr) return { ok: false, error: updateErr.message };

  revalidatePath(`/projects/${asset.project_id}`);
  return { ok: true, data: { paths: uploadedPaths } };
}

export async function removeAssetReference(
  assetId: string,
  refPath: string,
): Promise<Result> {
  const supabase = await createSupabaseServerClient();
  const { data: asset, error: assetErr } = await supabase
    .from("assets")
    .select("id, project_id, reference_image_urls")
    .eq("id", assetId)
    .single();
  if (assetErr || !asset) return { ok: false, error: "Asset not found" };

  await supabase.storage.from(PROJECT_ASSETS_BUCKET).remove([refPath]);

  const remaining = (asset.reference_image_urls ?? []).filter((p: string) => p !== refPath);
  const { error: updateErr } = await supabase
    .from("assets")
    .update({ reference_image_urls: remaining })
    .eq("id", assetId);
  if (updateErr) return { ok: false, error: updateErr.message };

  revalidatePath(`/projects/${asset.project_id}`);
  return { ok: true };
}

export async function generateAssetVariations(
  assetId: string,
  editInstruction?: string,
): Promise<Result<{ jobId: string }>> {
  const supabase = await createSupabaseServerClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { ok: false, error: "Not signed in" };

  const { data: asset } = await supabase
    .from("assets")
    .select("id, project_id, reference_image_urls")
    .eq("id", assetId)
    .single();
  if (!asset) return { ok: false, error: "Asset not found" };

  if (!asset.reference_image_urls || asset.reference_image_urls.length === 0) {
    return { ok: false, error: "Upload at least one reference image first." };
  }

  const { data: keyRow } = await supabase
    .from("provider_credentials")
    .select("provider")
    .eq("provider", "google_ai_studio")
    .single();
  if (!keyRow) {
    return { ok: false, error: "Add a Google AI Studio API key at Settings → API Keys first." };
  }

  const { data: job, error: jobErr } = await supabase
    .from("jobs")
    .insert({
      project_id: asset.project_id,
      user_id: userData.user.id,
      type: "image_generate",
      status: "queued",
      provider: "google_ai_studio",
      request: { assetId, editInstruction },
    })
    .select("id")
    .single();
  if (jobErr || !job) return { ok: false, error: jobErr?.message ?? "Failed to enqueue job" };

  const eventData: GenerateAssetVariationEventData = {
    jobId: job.id,
    projectId: asset.project_id,
    assetId,
    userId: userData.user.id,
    editInstruction,
  };
  await inngest.send({ name: "asset/generate_variation", data: eventData });

  revalidatePath(`/projects/${asset.project_id}`);
  return { ok: true, data: { jobId: job.id } };
}

export async function confirmVariation(
  assetId: string,
  variationId: string,
): Promise<Result> {
  const supabase = await createSupabaseServerClient();
  const { data: asset } = await supabase
    .from("assets")
    .select("project_id")
    .eq("id", assetId)
    .single();

  const { error } = await supabase
    .from("assets")
    .update({ confirmed_variation_id: variationId })
    .eq("id", assetId);
  if (error) return { ok: false, error: error.message };

  if (asset) revalidatePath(`/projects/${asset.project_id}`);
  return { ok: true };
}

/**
 * Bulk-generate variations for every asset that has reference images but no variations
 * yet. Skips assets without refs (can't generate without input) and assets that
 * already have variations (avoid clobbering manual work). One Inngest event per
 * eligible asset; the worker concurrency limit handles throttling.
 */
export async function generateAllAssetVariations(
  projectId: string,
): Promise<Result<{ count: number; skipped: number }>> {
  const supabase = await createSupabaseServerClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { ok: false, error: "Not signed in" };

  const { data: keyRow } = await supabase
    .from("provider_credentials")
    .select("provider")
    .eq("provider", "google_ai_studio")
    .single();
  if (!keyRow) {
    return { ok: false, error: "Add a Google AI Studio API key at Settings → API Keys first." };
  }

  // Pull all assets + their existing variations to determine which need generation.
  const { data: assets } = await supabase
    .from("assets")
    .select(
      `
      id,
      name,
      reference_image_urls,
      asset_variations!asset_variations_asset_id_fkey(id)
    `,
    )
    .eq("project_id", projectId);

  type AssetRow = {
    id: string;
    name: string;
    reference_image_urls: string[] | null;
    asset_variations: { id: string }[] | null;
  };
  const eligible: AssetRow[] = ((assets ?? []) as AssetRow[]).filter((a) => {
    const refs = a.reference_image_urls ?? [];
    const variations = a.asset_variations ?? [];
    return refs.length > 0 && variations.length === 0;
  });
  const skipped = (assets?.length ?? 0) - eligible.length;

  if (eligible.length === 0) {
    return {
      ok: false,
      error:
        "Nothing to generate. Every asset either has no reference images uploaded yet, or already has variations.",
    };
  }

  const jobRows = eligible.map((a) => ({
    project_id: projectId,
    user_id: userData.user!.id,
    type: "image_generate",
    status: "queued",
    provider: "google_ai_studio",
    request: { assetId: a.id },
  }));
  const { data: insertedJobs, error: jobErr } = await supabase
    .from("jobs")
    .insert(jobRows)
    .select("id, request");
  if (jobErr || !insertedJobs) {
    return { ok: false, error: jobErr?.message ?? "Failed to enqueue jobs" };
  }

  const events = insertedJobs.map((j) => {
    const req = j.request as { assetId: string };
    return {
      name: "asset/generate_variation" as const,
      data: {
        jobId: j.id,
        projectId,
        assetId: req.assetId,
        userId: userData.user!.id,
      },
    };
  });
  await inngest.send(events);

  revalidatePath(`/projects/${projectId}`);
  return { ok: true, data: { count: eligible.length, skipped } };
}

/**
 * Manually add an asset to an existing project. Used when parse_script didn't extract
 * something (or when the project predates the assets feature). Once created, the asset
 * shows up on the Assets tab — upload refs and generate variations the same as any
 * Claude-extracted asset. The next propose_storyboard run reads the full assets table
 * fresh, so any added asset is automatically included in scene generation.
 */
export async function createAsset(
  projectId: string,
  input: {
    name: string;
    kind: "character" | "location" | "object";
    role?: string;
    base_description?: string;
  },
): Promise<Result<{ id: string }>> {
  const supabase = await createSupabaseServerClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { ok: false, error: "Not signed in" };

  // Sanitize the name into snake_case so the keyframe matcher can find it.
  const cleanName = input.name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  if (!cleanName) return { ok: false, error: "Name required (will be saved as snake_case)." };

  const { data: asset, error } = await supabase
    .from("assets")
    .insert({
      project_id: projectId,
      name: cleanName,
      kind: input.kind,
      role: input.role?.trim() || null,
      base_description: input.base_description?.trim() || null,
    })
    .select("id")
    .single();

  if (error || !asset) return { ok: false, error: error?.message ?? "Failed to create asset" };

  revalidatePath(`/projects/${projectId}`);
  return { ok: true, data: { id: asset.id } };
}

/**
 * Pre-register a confirmed asset (character / location / object) with Kling as a
 * Multi-Image Element so multi-shot videos can hold the asset's identity across cuts
 * via element_list. Async — the Inngest worker polls Kling for ~3 minutes until the
 * element_id is ready.
 */
export async function bindAssetToKlingElement(
  assetId: string,
): Promise<Result<{ jobId: string }>> {
  const supabase = await createSupabaseServerClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { ok: false, error: "Not signed in" };

  const { data: keyRow } = await supabase
    .from("provider_credentials")
    .select("provider")
    .eq("provider", "kling")
    .single();
  if (!keyRow) {
    return { ok: false, error: "Add a Kling API key at Settings → API Keys first." };
  }

  const { data: asset } = await supabase
    .from("assets")
    .select("id, project_id, confirmed_variation_id, kling_element_id")
    .eq("id", assetId)
    .single();
  if (!asset) return { ok: false, error: "Asset not found" };
  if (!asset.confirmed_variation_id) {
    return { ok: false, error: "Confirm an asset variation first." };
  }
  if (asset.kling_element_id) {
    return { ok: false, error: "Asset is already bound to a Kling element." };
  }

  const { data: job, error: jobErr } = await supabase
    .from("jobs")
    .insert({
      project_id: asset.project_id,
      user_id: userData.user.id,
      type: "kling_bind_element",
      status: "queued",
      provider: "kling",
      request: { assetId },
    })
    .select("id")
    .single();
  if (jobErr || !job) return { ok: false, error: jobErr?.message ?? "Failed to enqueue job" };

  const eventData: BindAssetElementEventData = {
    jobId: job.id,
    projectId: asset.project_id,
    assetId,
    userId: userData.user.id,
  };
  await inngest.send({ name: "asset/bind_kling_element", data: eventData });

  revalidatePath(`/projects/${asset.project_id}`);
  return { ok: true, data: { jobId: job.id } };
}

/**
 * Lazy-loaded library: confirmed assets from the user's OTHER projects, available for
 * cloning into the current project. Only invoked when the "Use existing" tab opens —
 * never on the page render path, so the Assets tab load time stays unchanged.
 *
 * Caps at 200 most recent to keep the modal snappy. Each row carries one signed
 * preview URL (the confirmed variation); we sign in parallel.
 */
export async function listImportableAssets(
  currentProjectId: string,
): Promise<Result<{ assets: ImportableAsset[] }>> {
  const supabase = await createSupabaseServerClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { ok: false, error: "Not signed in" };

  // RLS already restricts to assets the user owns. We additionally exclude the current
  // project (you don't import from yourself) and require a confirmed variation
  // (importing an unfinished asset isn't useful).
  const { data, error } = await supabase
    .from("assets")
    .select(
      `
      id, name, kind, role, base_description, project_id, confirmed_variation_id, reference_image_urls,
      projects!inner(title),
      asset_variations!asset_variations_asset_id_fkey(id, image_url)
    `,
    )
    .neq("project_id", currentProjectId)
    .not("confirmed_variation_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) return { ok: false, error: error.message };

  // Supabase typegen models PostgREST joins as arrays even when we know the FK is a
  // single relation. Normalize here.
  type Row = {
    id: string;
    name: string;
    kind: "character" | "location" | "object" | null;
    role: string | null;
    base_description: string | null;
    project_id: string;
    confirmed_variation_id: string | null;
    reference_image_urls: string[] | null;
    projects: { title: string } | { title: string }[] | null;
    asset_variations: { id: string; image_url: string }[] | null;
  };
  const rows = (data ?? []) as unknown as Row[];

  function projectTitle(p: Row["projects"]): string {
    if (!p) return "(untitled)";
    if (Array.isArray(p)) return p[0]?.title ?? "(untitled)";
    return p.title;
  }

  // Sign confirmed-variation previews in parallel.
  const previewPaths = rows.map((r) => {
    const v = (r.asset_variations ?? []).find((v) => v.id === r.confirmed_variation_id);
    return v?.image_url ?? null;
  });
  const signed = await Promise.all(
    previewPaths.map((p) => (p ? signedUrl(p) : Promise.resolve(null))),
  );

  const assets: ImportableAsset[] = rows.map((r, i) => ({
    id: r.id,
    name: r.name,
    kind: (r.kind ?? "character") as "character" | "location" | "object",
    role: r.role,
    base_description: r.base_description,
    project_id: r.project_id,
    project_title: projectTitle(r.projects),
    preview_url: signed[i],
    variation_count: (r.asset_variations ?? []).length,
    ref_count: (r.reference_image_urls ?? []).length,
  }));

  return { ok: true, data: { assets } };
}

/**
 * Clone a confirmed asset from one project into the current project. Duplicates the
 * asset row, all variations, and copies storage objects under the new project's path so
 * the source can be deleted independently. Mapping confirmed_variation_id is the key
 * detail — it must point at the NEW variation row, not the source's.
 */
export async function cloneAssetIntoProject(
  sourceAssetId: string,
  targetProjectId: string,
): Promise<Result<{ id: string }>> {
  const supabase = await createSupabaseServerClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { ok: false, error: "Not signed in" };
  const userId = userData.user.id;

  // Verify ownership of target project.
  const { data: targetProject } = await supabase
    .from("projects")
    .select("id, user_id")
    .eq("id", targetProjectId)
    .single();
  if (!targetProject) return { ok: false, error: "Target project not found" };
  if (targetProject.user_id !== userId) return { ok: false, error: "Not your project" };

  // Load source asset (RLS enforces ownership).
  const { data: source } = await supabase
    .from("assets")
    .select(
      "id, project_id, name, kind, role, base_description, reference_image_urls, confirmed_variation_id",
    )
    .eq("id", sourceAssetId)
    .single();
  if (!source) return { ok: false, error: "Source asset not found or not yours" };

  // Don't allow same-project clones — that's a duplicate, not an import.
  if (source.project_id === targetProjectId) {
    return { ok: false, error: "That asset is already in this project." };
  }

  // Reject collision on snake_case name within the target project — would break the
  // keyframe matcher (two assets with the same name).
  const { data: collision } = await supabase
    .from("assets")
    .select("id")
    .eq("project_id", targetProjectId)
    .eq("name", source.name)
    .maybeSingle();
  if (collision) {
    return {
      ok: false,
      error: `An asset named "${source.name}" already exists in this project. Rename it first or pick a different one.`,
    };
  }

  const { data: variations } = await supabase
    .from("asset_variations")
    .select("id, image_url, prompt_used")
    .eq("asset_id", sourceAssetId);

  // 1. Create the new asset row first (without confirmed_variation_id — set later)
  //    so we have a stable id to use in storage paths.
  const { data: newAsset, error: insertErr } = await supabase
    .from("assets")
    .insert({
      project_id: targetProjectId,
      name: source.name,
      kind: source.kind ?? "character",
      role: source.role,
      base_description: source.base_description,
    })
    .select("id")
    .single();
  if (insertErr || !newAsset) {
    return { ok: false, error: insertErr?.message ?? "Failed to create asset row" };
  }
  const newAssetId = newAsset.id;

  // 2. Copy reference images. Path layout matches uploadAssetReference.
  const newRefPaths: string[] = [];
  for (const refPath of (source.reference_image_urls ?? []) as string[]) {
    const ext = refPath.split(".").pop() ?? "png";
    const newPath = `${userId}/${targetProjectId}/refs/${newAssetId}/${crypto.randomUUID()}.${ext}`;
    const { error: copyErr } = await supabase.storage
      .from(PROJECT_ASSETS_BUCKET)
      .copy(refPath, newPath);
    if (copyErr) {
      // Roll back the asset row + anything we already copied so we don't leak storage.
      await supabase.from("assets").delete().eq("id", newAssetId);
      if (newRefPaths.length) {
        await supabase.storage.from(PROJECT_ASSETS_BUCKET).remove(newRefPaths);
      }
      return { ok: false, error: `Failed to copy reference: ${copyErr.message}` };
    }
    newRefPaths.push(newPath);
  }

  // 3. Copy variations (storage object + DB row). Track old→new id map so we can map
  //    the confirmed_variation_id below.
  const variationIdMap = new Map<string, string>();
  const newVariationStoragePaths: string[] = [];
  for (const v of variations ?? []) {
    const newVarId = crypto.randomUUID();
    const newPath = `${userId}/${targetProjectId}/assets/${newAssetId}/variations/${newVarId}.png`;
    const { error: copyErr } = await supabase.storage
      .from(PROJECT_ASSETS_BUCKET)
      .copy(v.image_url, newPath);
    if (copyErr) {
      // Roll back everything.
      await supabase.from("assets").delete().eq("id", newAssetId);
      const allPaths = [...newRefPaths, ...newVariationStoragePaths];
      if (allPaths.length) {
        await supabase.storage.from(PROJECT_ASSETS_BUCKET).remove(allPaths);
      }
      return { ok: false, error: `Failed to copy variation: ${copyErr.message}` };
    }
    newVariationStoragePaths.push(newPath);

    const { data: insertedVar, error: insErr } = await supabase
      .from("asset_variations")
      .insert({
        id: newVarId,
        asset_id: newAssetId,
        image_url: newPath,
        prompt_used: v.prompt_used,
      })
      .select("id")
      .single();
    if (insErr || !insertedVar) {
      await supabase.from("assets").delete().eq("id", newAssetId);
      const allPaths = [...newRefPaths, ...newVariationStoragePaths];
      if (allPaths.length) {
        await supabase.storage.from(PROJECT_ASSETS_BUCKET).remove(allPaths);
      }
      return { ok: false, error: `Failed to insert variation row: ${insErr?.message}` };
    }
    variationIdMap.set(v.id, insertedVar.id);
  }

  // 4. Update the asset row with reference paths + mapped confirmed_variation_id.
  const newConfirmedId = source.confirmed_variation_id
    ? variationIdMap.get(source.confirmed_variation_id) ?? null
    : null;
  const { error: updateErr } = await supabase
    .from("assets")
    .update({
      reference_image_urls: newRefPaths,
      confirmed_variation_id: newConfirmedId,
    })
    .eq("id", newAssetId);
  if (updateErr) {
    await supabase.from("assets").delete().eq("id", newAssetId);
    const allPaths = [...newRefPaths, ...newVariationStoragePaths];
    if (allPaths.length) {
      await supabase.storage.from(PROJECT_ASSETS_BUCKET).remove(allPaths);
    }
    return { ok: false, error: updateErr.message };
  }

  revalidatePath(`/projects/${targetProjectId}`);
  return { ok: true, data: { id: newAssetId } };
}
