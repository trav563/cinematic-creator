"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { inngest } from "@/lib/inngest/client";
import type { ProposeStoryboardEventData } from "@/lib/inngest/functions/propose-storyboard";
import type { GenerateKeyframeEventData } from "@/lib/inngest/functions/generate-keyframe";

type Result<T = void> = { ok: true; data?: T } | { ok: false; error: string };

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
