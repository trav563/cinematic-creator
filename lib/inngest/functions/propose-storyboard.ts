import { inngest } from "../client";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { getProviderKey } from "@/lib/providers/keys";
import { proposeStoryboard, type AspectRatio } from "@/lib/providers/claude";
import type { StylePreset } from "@/lib/prompts/loader";

export interface ProposeStoryboardEventData {
  jobId: string;
  projectId: string;
  userId: string;
}

export const proposeStoryboardFunction = inngest.createFunction(
  {
    id: "propose-storyboard",
    name: "Generate full storyboard from brief",
    triggers: [{ event: "project/propose_storyboard" }],
    retries: 1,
    onFailure: async ({ event, error }) => {
      const original = (event.data as { event: { data: ProposeStoryboardEventData } }).event;
      const supabase = createSupabaseServiceClient();
      await supabase
        .from("jobs")
        .update({ status: "failed", error: error.message ?? "unknown error" })
        .eq("id", original.data.jobId);
    },
  },
  async ({ event, step }) => {
    const data = event.data as ProposeStoryboardEventData;
    const supabase = createSupabaseServiceClient();

    await step.run("mark-running", async () => {
      await supabase.from("jobs").update({ status: "running" }).eq("id", data.jobId);
    });

    const ctx = await step.run("load-context", async () => {
      const { data: project } = await supabase
        .from("projects")
        .select(
          "brief_yaml, scope, genre, emotional_arc, aspect_ratio, style_preset, style_preset_options, must_include, must_not_include",
        )
        .eq("id", data.projectId)
        .single();
      if (!project) throw new Error("Project not found");

      const { data: assets } = await supabase
        .from("assets")
        .select("name, kind, role, base_description")
        .eq("project_id", data.projectId)
        .order("created_at");

      const { data: scenes } = await supabase
        .from("scenes")
        .select("scene_number, act, description")
        .eq("project_id", data.projectId)
        .order("scene_number");

      return { project, assets: assets ?? [], scenes: scenes ?? [] };
    });

    const apiKey = await step.run("fetch-key", () =>
      getProviderKey(data.userId, "anthropic"),
    );

    const storyboard = await step.run("call-claude", async () => {
      const presetOptions = (ctx.project.style_preset_options ?? {}) as { subMode?: string };
      return proposeStoryboard({
        apiKey,
        briefYaml: ctx.project.brief_yaml,
        scope: ctx.project.scope,
        genre: ctx.project.genre,
        emotionalArc: ctx.project.emotional_arc,
        aspectRatio: ctx.project.aspect_ratio as AspectRatio,
        stylePreset: (ctx.project.style_preset ?? "cinematic_blockbuster") as StylePreset,
        subMode: presetOptions.subMode ?? null,
        mustInclude: (ctx.project.must_include ?? []) as string[],
        mustNotInclude: (ctx.project.must_not_include ?? []) as string[],
        assets: ctx.assets.map((a) => ({
          name: a.name,
          kind: (a.kind ?? "character") as "character" | "location" | "object",
          role: a.role,
          base_description: a.base_description,
        })),
        existingScenes: ctx.scenes,
      });
    });

    await step.run("persist", async () => {
      // Replace existing scenes with the new storyboard. Cascade-deletes scene_keyframes.
      await supabase.from("scenes").delete().eq("project_id", data.projectId);
      await supabase.from("scenes").insert(
        storyboard.scenes.map((s) => ({
          project_id: data.projectId,
          scene_number: s.scene_number,
          act: s.act,
          beat: s.beat,
          camera: s.camera,
          frame_role: s.frame_role,
          pair_anchor: s.pair_anchor,
          anchor_direction: s.anchor_direction,
          description: s.description,
          status: "planned",
        })),
      );

      await supabase
        .from("jobs")
        .update({ status: "succeeded", result: { scene_count: storyboard.scenes.length } })
        .eq("id", data.jobId);
    });

    return { ok: true, sceneCount: storyboard.scenes.length };
  },
);
