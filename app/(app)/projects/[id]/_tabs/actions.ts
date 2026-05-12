"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { inngest } from "@/lib/inngest/client";
import { PROJECT_ASSETS_BUCKET } from "@/lib/storage";
import type { GenerateCharacterVariationEventData } from "@/lib/inngest/functions/generate-character-variation";
import type { BindCharacterElementEventData } from "@/lib/inngest/functions/bind-character-element";

type Result<T = void> = { ok: true; data?: T } | { ok: false; error: string };

export async function uploadCharacterReference(
  characterId: string,
  formData: FormData,
): Promise<Result<{ paths: string[] }>> {
  const supabase = await createSupabaseServerClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { ok: false, error: "Not signed in" };

  const { data: character, error: charErr } = await supabase
    .from("characters")
    .select("id, project_id, reference_image_urls")
    .eq("id", characterId)
    .single();
  if (charErr || !character) return { ok: false, error: "Character not found" };

  const files = formData.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length === 0) return { ok: false, error: "No files provided" };

  const uploadedPaths: string[] = [];
  for (const file of files) {
    const ext = file.name.split(".").pop() ?? "png";
    const filename = `${crypto.randomUUID()}.${ext}`;
    const path = `${userData.user.id}/${character.project_id}/refs/${characterId}/${filename}`;
    const { error: upErr } = await supabase.storage
      .from(PROJECT_ASSETS_BUCKET)
      .upload(path, file, { contentType: file.type, upsert: false });
    if (upErr) return { ok: false, error: upErr.message };
    uploadedPaths.push(path);
  }

  const newRefs = [...(character.reference_image_urls ?? []), ...uploadedPaths];
  const { error: updateErr } = await supabase
    .from("characters")
    .update({ reference_image_urls: newRefs })
    .eq("id", characterId);
  if (updateErr) return { ok: false, error: updateErr.message };

  revalidatePath(`/projects/${character.project_id}`);
  return { ok: true, data: { paths: uploadedPaths } };
}

export async function removeCharacterReference(
  characterId: string,
  refPath: string,
): Promise<Result> {
  const supabase = await createSupabaseServerClient();
  const { data: character, error: charErr } = await supabase
    .from("characters")
    .select("id, project_id, reference_image_urls")
    .eq("id", characterId)
    .single();
  if (charErr || !character) return { ok: false, error: "Character not found" };

  await supabase.storage.from(PROJECT_ASSETS_BUCKET).remove([refPath]);

  const remaining = (character.reference_image_urls ?? []).filter((p: string) => p !== refPath);
  const { error: updateErr } = await supabase
    .from("characters")
    .update({ reference_image_urls: remaining })
    .eq("id", characterId);
  if (updateErr) return { ok: false, error: updateErr.message };

  revalidatePath(`/projects/${character.project_id}`);
  return { ok: true };
}

export async function generateCharacterVariations(
  characterId: string,
  editInstruction?: string,
): Promise<Result<{ jobId: string }>> {
  const supabase = await createSupabaseServerClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { ok: false, error: "Not signed in" };

  const { data: character } = await supabase
    .from("characters")
    .select("id, project_id, reference_image_urls")
    .eq("id", characterId)
    .single();
  if (!character) return { ok: false, error: "Character not found" };

  if (!character.reference_image_urls || character.reference_image_urls.length === 0) {
    return { ok: false, error: "Upload at least one reference image first." };
  }

  // Verify Google AI Studio key exists
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
      project_id: character.project_id,
      user_id: userData.user.id,
      type: "image_generate",
      status: "queued",
      provider: "google_ai_studio",
      request: { characterId, editInstruction },
    })
    .select("id")
    .single();
  if (jobErr || !job) return { ok: false, error: jobErr?.message ?? "Failed to enqueue job" };

  const eventData: GenerateCharacterVariationEventData = {
    jobId: job.id,
    projectId: character.project_id,
    characterId,
    userId: userData.user.id,
    editInstruction,
  };
  await inngest.send({ name: "character/generate_variation", data: eventData });

  revalidatePath(`/projects/${character.project_id}`);
  return { ok: true, data: { jobId: job.id } };
}

export async function confirmVariation(
  characterId: string,
  variationId: string,
): Promise<Result> {
  const supabase = await createSupabaseServerClient();
  const { data: character } = await supabase
    .from("characters")
    .select("project_id")
    .eq("id", characterId)
    .single();

  const { error } = await supabase
    .from("characters")
    .update({ confirmed_variation_id: variationId })
    .eq("id", characterId);
  if (error) return { ok: false, error: error.message };

  if (character) revalidatePath(`/projects/${character.project_id}`);
  return { ok: true };
}

/**
 * Pre-register a confirmed character with Kling as a Multi-Image Element so multi-shot
 * videos can hold the character's identity across cuts via element_list. Async — the
 * Inngest worker polls Kling for ~3 minutes until the element_id is ready.
 */
export async function bindCharacterToKlingElement(
  characterId: string,
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

  const { data: character } = await supabase
    .from("characters")
    .select("id, project_id, confirmed_variation_id, kling_element_id")
    .eq("id", characterId)
    .single();
  if (!character) return { ok: false, error: "Character not found" };
  if (!character.confirmed_variation_id) {
    return { ok: false, error: "Confirm a character variation first." };
  }
  if (character.kling_element_id) {
    return { ok: false, error: "Character is already bound to a Kling element." };
  }

  const { data: job, error: jobErr } = await supabase
    .from("jobs")
    .insert({
      project_id: character.project_id,
      user_id: userData.user.id,
      type: "kling_bind_element",
      status: "queued",
      provider: "kling",
      request: { characterId },
    })
    .select("id")
    .single();
  if (jobErr || !job) return { ok: false, error: jobErr?.message ?? "Failed to enqueue job" };

  const eventData: BindCharacterElementEventData = {
    jobId: job.id,
    projectId: character.project_id,
    characterId,
    userId: userData.user.id,
  };
  await inngest.send({ name: "character/bind_kling_element", data: eventData });

  revalidatePath(`/projects/${character.project_id}`);
  return { ok: true, data: { jobId: job.id } };
}
