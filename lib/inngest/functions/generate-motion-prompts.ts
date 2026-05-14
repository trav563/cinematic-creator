import { inngest } from "../client";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { getProviderKey } from "@/lib/providers/keys";
import { generateMotionPrompts } from "@/lib/providers/claude";
import { downloadAsServiceBase64 } from "@/lib/storage";
import type { StylePreset } from "@/lib/prompts/loader";

export interface GenerateMotionPromptsEventData {
  jobId: string;
  projectId: string;
  userId: string;
}

export const generateMotionPromptsFunction = inngest.createFunction(
  {
    id: "generate-motion-prompts",
    name: "Generate Kling motion prompts for all scenes",
    triggers: [{ event: "project/generate_motion_prompts" }],
    retries: 1,
    onFailure: async ({ event, error }) => {
      const original = (event.data as { event: { data: GenerateMotionPromptsEventData } }).event;
      const supabase = createSupabaseServiceClient();
      await supabase
        .from("jobs")
        .update({ status: "failed", error: error.message ?? "unknown error" })
        .eq("id", original.data.jobId);
    },
  },
  async ({ event, step }) => {
    const data = event.data as GenerateMotionPromptsEventData;
    const supabase = createSupabaseServiceClient();

    await step.run("mark-running", async () => {
      await supabase.from("jobs").update({ status: "running" }).eq("id", data.jobId);
    });

    const ctx = await step.run("load-context", async () => {
      const { data: project } = await supabase
        .from("projects")
        .select("scope, genre, emotional_arc, style_preset, style_preset_options, brief_yaml")
        .eq("id", data.projectId)
        .single();
      if (!project) throw new Error("Project not found");

      const { data: scenes } = await supabase
        .from("scenes")
        .select(
          "id, scene_number, act, beat, camera, frame_role, pair_anchor, anchor_direction, description, keyframe_prompt_override, current_keyframe_id, current_start_keyframe_id, current_end_keyframe_id",
        )
        .eq("project_id", data.projectId)
        .order("scene_number");
      if (!scenes || scenes.length === 0) throw new Error("No scenes to write prompts for");

      const { data: characters } = await supabase
        .from("assets")
        .select("name, role, base_description")
        .eq("project_id", data.projectId)
        .order("created_at");

      return { project, scenes, characters: characters ?? [] };
    });

    // Load the anchor keyframe per scene as base64 so Claude sees the actual visual.
    // For PAIR scenes the anchor is whichever side pair_anchor names; for SINGLE it's
    // current_keyframe_id. Scenes without a keyframe yet are skipped — Claude falls
    // back to the textual description for those.
    const keyframeImages = await step.run("load-keyframes", async () => {
      const map = new Map<number, { base64: string; mimeType: string }>();
      const idsBySceneNumber = new Map<number, string>();
      for (const s of ctx.scenes) {
        const id =
          s.frame_role === "PAIR" && s.pair_anchor === "end"
            ? s.current_end_keyframe_id
            : s.current_start_keyframe_id ?? s.current_keyframe_id;
        if (id) idsBySceneNumber.set(s.scene_number, id);
      }
      const ids = Array.from(idsBySceneNumber.values());
      if (ids.length === 0) return Array.from(map.entries());

      const { data: kfs } = await supabase
        .from("scene_keyframes")
        .select("id, image_url")
        .in("id", ids);
      const pathById = new Map((kfs ?? []).map((k) => [k.id, k.image_url]));

      // Download in parallel; tolerate per-scene failures.
      const entries = await Promise.all(
        Array.from(idsBySceneNumber.entries()).map(async ([sceneNumber, kfId]) => {
          const path = pathById.get(kfId);
          if (!path) return null;
          try {
            const img = await downloadAsServiceBase64(path);
            return [sceneNumber, img] as const;
          } catch (err) {
            console.warn(
              `[generate-motion-prompts] skipped keyframe for scene ${sceneNumber}:`,
              err,
            );
            return null;
          }
        }),
      );
      // Return as array of tuples — Inngest serializes step output as JSON, and Map
      // objects don't survive that round-trip. We rebuild the Map after the step.
      return entries.filter((e): e is readonly [number, { base64: string; mimeType: string }] => e !== null);
    });

    const keyframeImageMap = new Map<number, { base64: string; mimeType: string }>(
      keyframeImages,
    );

    const apiKey = await step.run("fetch-key", () =>
      getProviderKey(data.userId, "anthropic"),
    );

    const prompts = await step.run("call-claude", () => {
      const presetOptions = (ctx.project.style_preset_options ?? {}) as { subMode?: string };
      return generateMotionPrompts({
        apiKey,
        stylePreset: (ctx.project.style_preset ?? "cinematic_blockbuster") as StylePreset,
        subMode: presetOptions.subMode ?? null,
        scopeName: ctx.project.scope,
        genre: ctx.project.genre,
        emotionalArc: ctx.project.emotional_arc,
        briefYaml: ctx.project.brief_yaml,
        characters: ctx.characters,
        scenes: ctx.scenes.map((s) => ({
          scene_number: s.scene_number,
          act: s.act,
          beat: s.beat,
          camera: s.camera,
          frame_role: s.frame_role,
          anchor_direction: s.anchor_direction,
          description: s.description,
          keyframe_prompt_override: s.keyframe_prompt_override,
        })),
        keyframeImages: keyframeImageMap,
      });
    });

    await step.run("persist", async () => {
      const byNumber = new Map(prompts.prompts.map((p) => [p.scene_number, p.motion_prompt]));
      // Update each scene that has a generated prompt. Use one update per scene rather
      // than a bulk upsert to avoid races with other in-flight scene edits.
      for (const scene of ctx.scenes) {
        const motionPrompt = byNumber.get(scene.scene_number);
        if (motionPrompt) {
          await supabase
            .from("scenes")
            .update({ motion_prompt: motionPrompt })
            .eq("id", scene.id);
        }
      }

      await supabase
        .from("jobs")
        .update({
          status: "succeeded",
          result: { prompts_written: byNumber.size },
        })
        .eq("id", data.jobId);
    });

    return { ok: true, count: prompts.prompts.length };
  },
);
