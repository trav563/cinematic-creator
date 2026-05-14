"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { inngest } from "@/lib/inngest/client";
import type { GenerateVideoEventData } from "@/lib/inngest/functions/generate-video";
import type { GenerateMotionPromptsEventData } from "@/lib/inngest/functions/generate-motion-prompts";
import {
  validateOptions,
  fetchAccountBalance,
  type KlingModel,
  type KlingMode,
  type KlingDuration,
  type MultiPromptShot,
  type KlingBalanceSummary,
} from "@/lib/providers/kling";
import { getProviderKey } from "@/lib/providers/keys";

type Result<T = void> = { ok: true; data?: T } | { ok: false; error: string };

async function requireUserAndKling() {
  const supabase = await createSupabaseServerClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { ok: false as const, error: "Not signed in" };
  const { data: keyRow } = await supabase
    .from("provider_credentials")
    .select("provider")
    .eq("provider", "kling")
    .single();
  if (!keyRow) return { ok: false as const, error: "Add a Kling API key at Settings → API Keys first." };
  return { ok: true as const, supabase, userId: userData.user.id };
}

export interface VideoOptions {
  model: KlingModel;
  mode: KlingMode;
  duration: KlingDuration;
  prompt: string;
  negativePrompt?: string;
  sound: "on" | "off";
  multiShot?: boolean;
  multiPrompt?: MultiPromptShot[];
}

export async function generateVideo(
  sceneId: string,
  opts: VideoOptions,
): Promise<Result<{ jobId: string }>> {
  const auth = await requireUserAndKling();
  if (!auth.ok) return auth;

  // For multi-shot the per-shot prompts are required; the top-level prompt isn't.
  if (!opts.multiShot && !opts.prompt.trim()) {
    return { ok: false, error: "Motion prompt is required." };
  }

  // Validate against Kling's capability matrix before paying for an API call.
  try {
    validateOptions({
      model: opts.model,
      mode: opts.mode,
      duration: opts.duration,
      sound: opts.sound,
      multiShot: opts.multiShot,
      multiPrompt: opts.multiPrompt,
    });
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Invalid options" };
  }

  const { data: scene } = await auth.supabase
    .from("scenes")
    .select("project_id, current_keyframe_id")
    .eq("id", sceneId)
    .single();
  if (!scene) return { ok: false, error: "Scene not found" };
  if (!scene.current_keyframe_id) {
    return { ok: false, error: "Generate a keyframe for this scene first." };
  }

  const { data: job, error: jobErr } = await auth.supabase
    .from("jobs")
    .insert({
      project_id: scene.project_id,
      user_id: auth.userId,
      type: "video_generate",
      status: "queued",
      provider: opts.model,
      request: { sceneId, ...opts },
    })
    .select("id")
    .single();
  if (jobErr || !job) return { ok: false, error: jobErr?.message ?? "Failed to enqueue job" };

  const eventData: GenerateVideoEventData = {
    jobId: job.id,
    projectId: scene.project_id,
    sceneId,
    userId: auth.userId,
    model: opts.model,
    mode: opts.mode,
    duration: opts.duration,
    prompt: opts.prompt,
    negativePrompt: opts.negativePrompt,
    sound: opts.sound,
    multiShot: opts.multiShot,
    multiPrompt: opts.multiPrompt,
  };
  await inngest.send({ name: "scene/generate_video", data: eventData });

  revalidatePath(`/projects/${scene.project_id}`);
  return { ok: true, data: { jobId: job.id } };
}

/**
 * Generate Kling-optimized motion prompts for every scene in the project via a single
 * Claude Opus 4.7 call. Persists motion_prompt onto each scene row. The user can edit
 * any prompt afterward — saveSceneMotionPrompt persists per-scene edits.
 */
export async function generateMotionPromptsForProject(
  projectId: string,
): Promise<Result<{ jobId: string }>> {
  const supabase = await createSupabaseServerClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { ok: false, error: "Not signed in" };

  const { data: keyRow } = await supabase
    .from("provider_credentials")
    .select("provider")
    .eq("provider", "anthropic")
    .single();
  if (!keyRow) {
    return { ok: false, error: "Add an Anthropic API key at Settings → API Keys first." };
  }

  const { data: job, error: jobErr } = await supabase
    .from("jobs")
    .insert({
      project_id: projectId,
      user_id: userData.user.id,
      type: "generate_motion_prompts",
      status: "queued",
      provider: "anthropic",
    })
    .select("id")
    .single();
  if (jobErr || !job) return { ok: false, error: jobErr?.message ?? "Failed to enqueue job" };

  const eventData: GenerateMotionPromptsEventData = {
    jobId: job.id,
    projectId,
    userId: userData.user.id,
  };
  await inngest.send({ name: "project/generate_motion_prompts", data: eventData });

  revalidatePath(`/projects/${projectId}`);
  return { ok: true, data: { jobId: job.id } };
}

/**
 * Fetch the user's current Kling resource-pack balance via the official /account/costs
 * endpoint. Note: per Kling docs, remaining_quantity has a ~12h delay, so this is a
 * "what we know as of last sync" reading, not real-time.
 */
export async function fetchKlingBalance(): Promise<Result<KlingBalanceSummary>> {
  const supabase = await createSupabaseServerClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { ok: false, error: "Not signed in" };

  try {
    const credential = await getProviderKey(userData.user.id, "kling");
    const summary = await fetchAccountBalance(credential);
    return { ok: true, data: summary };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Failed to fetch balance" };
  }
}

/**
 * Regenerate the motion prompt for a single scene. Same Claude call as the bulk
 * action, but only one scene's worth of context — so the user can quickly re-roll
 * a weak prompt without rewriting all of them. Returns the new text inline so the
 * card can update without a page refresh.
 */
export async function regenerateSceneMotionPrompt(
  sceneId: string,
): Promise<Result<{ motionPrompt: string }>> {
  const supabase = await createSupabaseServerClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { ok: false, error: "Not signed in" };

  const { data: keyRow } = await supabase
    .from("provider_credentials")
    .select("provider")
    .eq("provider", "anthropic")
    .single();
  if (!keyRow) {
    return { ok: false, error: "Add an Anthropic API key at Settings → API Keys first." };
  }

  const { data: scene } = await supabase
    .from("scenes")
    .select(
      "id, scene_number, act, beat, camera, frame_role, pair_anchor, anchor_direction, description, project_id, current_keyframe_id, current_start_keyframe_id, current_end_keyframe_id",
    )
    .eq("id", sceneId)
    .single();
  if (!scene) return { ok: false, error: "Scene not found" };

  const { data: project } = await supabase
    .from("projects")
    .select("scope, genre, emotional_arc, style_preset, style_preset_options, brief_yaml")
    .eq("id", scene.project_id)
    .single();
  if (!project) return { ok: false, error: "Project not found" };

  const { data: characters } = await supabase
    .from("assets")
    .select("name, role, base_description")
    .eq("project_id", scene.project_id)
    .order("created_at");

  // Provide full project context so the regenerated prompt is consistent with the
  // rest of the trailer's arc — even though we only need one prompt back.
  const { data: allScenes } = await supabase
    .from("scenes")
    .select("scene_number, act, beat, camera, frame_role, anchor_direction, description")
    .eq("project_id", scene.project_id)
    .order("scene_number");

  try {
    const apiKey = await getProviderKey(userData.user.id, "anthropic");
    const { generateMotionPrompts } = await import("@/lib/providers/claude");
    const { downloadAsServiceBase64 } = await import("@/lib/storage");
    const presetOptions = (project.style_preset_options ?? {}) as { subMode?: string };

    // Load just the target scene's keyframe for image-grounded re-roll. We could
    // load all scenes' keyframes for richer context but that's expensive on every
    // re-roll. Single image is enough — the textual context for the others still
    // gives Claude the trailer arc.
    const targetKfId =
      scene.frame_role === "PAIR" && scene.pair_anchor === "end"
        ? scene.current_end_keyframe_id
        : scene.current_start_keyframe_id ?? scene.current_keyframe_id;
    let keyframeImages: Map<number, { base64: string; mimeType: string }> | undefined;
    if (targetKfId) {
      const { data: kf } = await supabase
        .from("scene_keyframes")
        .select("image_url")
        .eq("id", targetKfId)
        .single();
      if (kf) {
        try {
          const img = await downloadAsServiceBase64(kf.image_url);
          keyframeImages = new Map([[scene.scene_number, img]]);
        } catch (err) {
          console.warn("[regenerateSceneMotionPrompt] failed to load keyframe:", err);
        }
      }
    }

    const result = await generateMotionPrompts({
      apiKey,
      stylePreset: (project.style_preset ?? "cinematic_blockbuster") as
        | "cinematic_blockbuster"
        | "animated_film"
        | "videogame_gameplay"
        | "prerendered_cutscene",
      subMode: presetOptions.subMode ?? null,
      scopeName: project.scope,
      genre: project.genre,
      emotionalArc: project.emotional_arc,
      briefYaml: project.brief_yaml,
      characters: characters ?? [],
      scenes: (allScenes ?? []).map((s) => ({
        scene_number: s.scene_number,
        act: s.act,
        beat: s.beat,
        camera: s.camera,
        frame_role: s.frame_role,
        anchor_direction: s.anchor_direction,
        description: s.description,
      })),
      keyframeImages,
    });
    const match = result.prompts.find((p) => p.scene_number === scene.scene_number);
    if (!match) return { ok: false, error: "Claude didn't return a prompt for this scene" };

    await supabase
      .from("scenes")
      .update({ motion_prompt: match.motion_prompt })
      .eq("id", sceneId);

    return { ok: true, data: { motionPrompt: match.motion_prompt } };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Regeneration failed" };
  }
}

/**
 * Persist a user-edited motion prompt for one scene. Called from the scene card on
 * input blur so user edits survive navigation away from the Video tab.
 */
export async function saveSceneMotionPrompt(
  sceneId: string,
  motionPrompt: string,
): Promise<Result> {
  const supabase = await createSupabaseServerClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { ok: false, error: "Not signed in" };

  const { data: scene } = await supabase
    .from("scenes")
    .select("project_id")
    .eq("id", sceneId)
    .single();
  if (!scene) return { ok: false, error: "Scene not found" };

  const { error } = await supabase
    .from("scenes")
    .update({ motion_prompt: motionPrompt })
    .eq("id", sceneId);
  if (error) return { ok: false, error: error.message };

  // Don't revalidate here — saving on blur shouldn't trigger a page refresh.
  return { ok: true };
}
