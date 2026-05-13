"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { inngest } from "@/lib/inngest/client";
import { PROJECT_ASSETS_BUCKET } from "@/lib/storage";
import type { ProposeStoryboardEventData } from "@/lib/inngest/functions/propose-storyboard";
import type { GenerateKeyframeEventData } from "@/lib/inngest/functions/generate-keyframe";
import type { DerivePairedFrameEventData } from "@/lib/inngest/functions/derive-paired-frame";

type Result<T = void> = { ok: true; data?: T } | { ok: false; error: string };

export async function uploadSceneReference(
  sceneId: string,
  formData: FormData,
): Promise<Result<{ paths: string[] }>> {
  const supabase = await createSupabaseServerClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { ok: false, error: "Not signed in" };

  const { data: scene, error: sceneErr } = await supabase
    .from("scenes")
    .select("id, project_id, reference_image_urls")
    .eq("id", sceneId)
    .single();
  if (sceneErr || !scene) return { ok: false, error: "Scene not found" };

  const files = formData.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length === 0) return { ok: false, error: "No files provided" };

  const uploadedPaths: string[] = [];
  for (const file of files) {
    const ext = file.name.split(".").pop() ?? "png";
    const filename = `${crypto.randomUUID()}.${ext}`;
    const path = `${userData.user.id}/${scene.project_id}/scenes/${sceneId}/refs/${filename}`;
    const { error: upErr } = await supabase.storage
      .from(PROJECT_ASSETS_BUCKET)
      .upload(path, file, { contentType: file.type, upsert: false });
    if (upErr) return { ok: false, error: upErr.message };
    uploadedPaths.push(path);
  }

  const newRefs = [...(scene.reference_image_urls ?? []), ...uploadedPaths];
  const { error: updateErr } = await supabase
    .from("scenes")
    .update({ reference_image_urls: newRefs })
    .eq("id", sceneId);
  if (updateErr) return { ok: false, error: updateErr.message };

  revalidatePath(`/projects/${scene.project_id}`);
  return { ok: true, data: { paths: uploadedPaths } };
}

export async function removeSceneReference(
  sceneId: string,
  refPath: string,
): Promise<Result> {
  const supabase = await createSupabaseServerClient();
  const { data: scene, error: sceneErr } = await supabase
    .from("scenes")
    .select("id, project_id, reference_image_urls")
    .eq("id", sceneId)
    .single();
  if (sceneErr || !scene) return { ok: false, error: "Scene not found" };

  await supabase.storage.from(PROJECT_ASSETS_BUCKET).remove([refPath]);

  const remaining = (scene.reference_image_urls ?? []).filter((p: string) => p !== refPath);
  const { error: updateErr } = await supabase
    .from("scenes")
    .update({ reference_image_urls: remaining })
    .eq("id", sceneId);
  if (updateErr) return { ok: false, error: updateErr.message };

  revalidatePath(`/projects/${scene.project_id}`);
  return { ok: true };
}

async function requireUserAndAnthropic() {
  const supabase = await createSupabaseServerClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { ok: false as const, error: "Not signed in" };
  const { data: keyRow } = await supabase
    .from("provider_credentials")
    .select("provider")
    .eq("provider", "anthropic")
    .single();
  if (!keyRow) return { ok: false as const, error: "Add an Anthropic API key at Settings → API Keys first." };
  return { ok: true as const, supabase, userId: userData.user.id };
}

async function requireUserAndGoogle() {
  const supabase = await createSupabaseServerClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { ok: false as const, error: "Not signed in" };
  const { data: keyRow } = await supabase
    .from("provider_credentials")
    .select("provider")
    .eq("provider", "google_ai_studio")
    .single();
  if (!keyRow) return { ok: false as const, error: "Add a Google AI Studio API key at Settings → API Keys first." };
  return { ok: true as const, supabase, userId: userData.user.id };
}

export async function generateStoryboard(projectId: string): Promise<Result<{ jobId: string }>> {
  const auth = await requireUserAndAnthropic();
  if (!auth.ok) return auth;

  const { data: job, error: jobErr } = await auth.supabase
    .from("jobs")
    .insert({
      project_id: projectId,
      user_id: auth.userId,
      type: "propose_storyboard",
      status: "queued",
      provider: "anthropic",
    })
    .select("id")
    .single();
  if (jobErr || !job) return { ok: false, error: jobErr?.message ?? "Failed to enqueue job" };

  const eventData: ProposeStoryboardEventData = {
    jobId: job.id,
    projectId,
    userId: auth.userId,
  };
  await inngest.send({ name: "project/propose_storyboard", data: eventData });

  revalidatePath(`/projects/${projectId}`);
  return { ok: true, data: { jobId: job.id } };
}

export async function generateKeyframe(
  sceneId: string,
  editInstruction?: string,
): Promise<Result<{ jobId: string }>> {
  const auth = await requireUserAndGoogle();
  if (!auth.ok) return auth;

  const { data: scene } = await auth.supabase
    .from("scenes")
    .select("project_id")
    .eq("id", sceneId)
    .single();
  if (!scene) return { ok: false, error: "Scene not found" };

  const { data: job, error: jobErr } = await auth.supabase
    .from("jobs")
    .insert({
      project_id: scene.project_id,
      user_id: auth.userId,
      type: "image_generate",
      status: "queued",
      provider: "google_ai_studio",
      request: { sceneId, editInstruction },
    })
    .select("id")
    .single();
  if (jobErr || !job) return { ok: false, error: jobErr?.message ?? "Failed to enqueue job" };

  const eventData: GenerateKeyframeEventData = {
    jobId: job.id,
    projectId: scene.project_id,
    sceneId,
    userId: auth.userId,
    editInstruction,
  };
  await inngest.send({ name: "scene/generate_keyframe", data: eventData });

  revalidatePath(`/projects/${scene.project_id}`);
  return { ok: true, data: { jobId: job.id } };
}

export async function generateAllKeyframes(projectId: string): Promise<Result<{ count: number }>> {
  const auth = await requireUserAndGoogle();
  if (!auth.ok) return auth;

  const { data: scenes } = await auth.supabase
    .from("scenes")
    .select("id, current_keyframe_id")
    .eq("project_id", projectId)
    .is("current_keyframe_id", null);

  if (!scenes || scenes.length === 0) {
    return { ok: false, error: "All scenes already have a keyframe. Use Regenerate on individual scenes." };
  }

  // Insert jobs + send events in batch. The Inngest function has concurrency: 5 so
  // we won't hammer the API.
  const jobRows = scenes.map((s) => ({
    project_id: projectId,
    user_id: auth.userId,
    type: "image_generate",
    status: "queued",
    provider: "google_ai_studio",
    request: { sceneId: s.id },
  }));
  const { data: insertedJobs, error: jobErr } = await auth.supabase
    .from("jobs")
    .insert(jobRows)
    .select("id, request");
  if (jobErr || !insertedJobs) return { ok: false, error: jobErr?.message ?? "Failed to enqueue jobs" };

  const events = insertedJobs.map((j) => {
    const sceneId = (j.request as { sceneId: string }).sceneId;
    return {
      name: "scene/generate_keyframe" as const,
      data: {
        jobId: j.id,
        projectId,
        sceneId,
        userId: auth.userId,
      } as GenerateKeyframeEventData,
    };
  });
  await inngest.send(events);

  revalidatePath(`/projects/${projectId}`);
  return { ok: true, data: { count: scenes.length } };
}

/**
 * Revert / pin a specific keyframe from history as the current one for its scene.
 */
/**
 * For PAIR scenes: derive the paired frame from the existing anchor. The Inngest
 * worker calls Claude to compose a Gemini edit instruction, then runs the edit.
 */
export async function derivePairedFrame(sceneId: string): Promise<Result<{ jobId: string }>> {
  const auth = await requireUserAndGoogle();
  if (!auth.ok) return auth;

  const { data: scene } = await auth.supabase
    .from("scenes")
    .select(
      "project_id, frame_role, pair_anchor, current_start_keyframe_id, current_end_keyframe_id",
    )
    .eq("id", sceneId)
    .single();
  if (!scene) return { ok: false, error: "Scene not found" };
  if (scene.frame_role !== "PAIR") {
    return { ok: false, error: "Only PAIR scenes have paired frames to derive." };
  }
  if (!scene.pair_anchor) {
    return { ok: false, error: "Scene is missing pair_anchor — regenerate the storyboard." };
  }
  const anchorKfId =
    scene.pair_anchor === "start"
      ? scene.current_start_keyframe_id
      : scene.current_end_keyframe_id;
  if (!anchorKfId) {
    return {
      ok: false,
      error: `Generate the anchor (${scene.pair_anchor}) frame first before deriving the paired frame.`,
    };
  }

  const { data: job, error: jobErr } = await auth.supabase
    .from("jobs")
    .insert({
      project_id: scene.project_id,
      user_id: auth.userId,
      type: "derive_paired_frame",
      status: "queued",
      provider: "google_ai_studio",
      request: { sceneId },
    })
    .select("id")
    .single();
  if (jobErr || !job) return { ok: false, error: jobErr?.message ?? "Failed to enqueue job" };

  const eventData: DerivePairedFrameEventData = {
    jobId: job.id,
    projectId: scene.project_id,
    sceneId,
    userId: auth.userId,
  };
  await inngest.send({ name: "scene/derive_paired_frame", data: eventData });

  revalidatePath(`/projects/${scene.project_id}`);
  return { ok: true, data: { jobId: job.id } };
}

export async function confirmKeyframeVariation(keyframeId: string): Promise<Result> {
  const supabase = await createSupabaseServerClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { ok: false, error: "Not signed in" };

  const { data: kf } = await supabase
    .from("scene_keyframes")
    .select("scene_id")
    .eq("id", keyframeId)
    .single();
  if (!kf) return { ok: false, error: "Keyframe not found" };

  await supabase
    .from("scene_keyframes")
    .update({ is_current: false })
    .eq("scene_id", kf.scene_id);
  await supabase
    .from("scene_keyframes")
    .update({ is_current: true })
    .eq("id", keyframeId);
  const { data: scene } = await supabase
    .from("scenes")
    .update({ current_keyframe_id: keyframeId, status: "edited" })
    .eq("id", kf.scene_id)
    .select("project_id")
    .single();

  if (scene) {
    revalidatePath(`/projects/${scene.project_id}`);
    revalidatePath(`/projects/${scene.project_id}/scenes/${kf.scene_id}`);
  }
  return { ok: true };
}
