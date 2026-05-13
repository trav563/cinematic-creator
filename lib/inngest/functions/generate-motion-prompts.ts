import { inngest } from "../client";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { getProviderKey } from "@/lib/providers/keys";
import { generateMotionPrompts } from "@/lib/providers/claude";
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
          "id, scene_number, act, beat, camera, frame_role, anchor_direction, description, keyframe_prompt_override",
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
