"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { inngest } from "@/lib/inngest/client";
import { PROJECT_ASSETS_BUCKET } from "@/lib/storage";
import type { GenerateAssetVariationEventData } from "@/lib/inngest/functions/generate-asset-variation";
import type { BindAssetElementEventData } from "@/lib/inngest/functions/bind-asset-element";

type Result<T = void> = { ok: true; data?: T } | { ok: false; error: string };

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
