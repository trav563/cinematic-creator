import { inngest } from "../client";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { getProviderKey } from "@/lib/providers/keys";
import { generateImage } from "@/lib/providers/gemini";
import { downloadAsServiceBase64, uploadAsService } from "@/lib/storage";
import { buildKeyframePrompt } from "@/lib/prompts/storyboard-prompts";
import type { StylePreset } from "@/lib/prompts/loader";
import type { AspectRatio } from "@/lib/providers/claude";

export interface GenerateKeyframeEventData {
  jobId: string;
  projectId: string;
  sceneId: string;
  userId: string;
  editInstruction?: string;
}

export const generateKeyframeFunction = inngest.createFunction(
  {
    id: "generate-keyframe",
    name: "Generate scene keyframe",
    triggers: [{ event: "scene/generate_keyframe" }],
    retries: 1,
    concurrency: { limit: 5 }, // throttle bulk runs to avoid rate-limit thunder
    onFailure: async ({ event, error }) => {
      const original = (event.data as { event: { data: GenerateKeyframeEventData } }).event;
      const supabase = createSupabaseServiceClient();
      await supabase
        .from("jobs")
        .update({ status: "failed", error: error.message ?? "unknown error" })
        .eq("id", original.data.jobId);
    },
  },
  async ({ event, step }) => {
    const data = event.data as GenerateKeyframeEventData;
    const supabase = createSupabaseServiceClient();

    await step.run("mark-running", async () => {
      await supabase.from("jobs").update({ status: "running" }).eq("id", data.jobId);
    });

    const ctx = await step.run("load-context", async () => {
      const { data: scene } = await supabase
        .from("scenes")
        .select("scene_number, act, beat, camera, frame_role, anchor_direction, description")
        .eq("id", data.sceneId)
        .single();
      if (!scene) throw new Error("Scene not found");

      const { data: project } = await supabase
        .from("projects")
        .select("scope, style_preset, aspect_ratio")
        .eq("id", data.projectId)
        .single();
      if (!project) throw new Error("Project not found");

      // Load all characters in the project that have a confirmed model sheet — we'll
      // match these by name against the scene description to figure out which references
      // to attach.
      const { data: characters } = await supabase
        .from("characters")
        .select("id, name, role, confirmed_variation_id")
        .eq("project_id", data.projectId)
        .not("confirmed_variation_id", "is", null);

      // Get the image_url path for each confirmed variation
      const refImagePaths: Array<{ name: string; role: string | null; path: string }> = [];
      if (characters && characters.length) {
        const ids = characters.map((c) => c.confirmed_variation_id).filter(Boolean) as string[];
        const { data: variations } = await supabase
          .from("character_variations")
          .select("id, image_url")
          .in("id", ids);
        const byId = new Map((variations ?? []).map((v) => [v.id, v.image_url]));
        for (const c of characters) {
          if (!c.confirmed_variation_id) continue;
          const path = byId.get(c.confirmed_variation_id);
          if (path) refImagePaths.push({ name: c.name, role: c.role, path });
        }
      }

      return { scene, project, refImagePaths };
    });

    // Match reference assets against the scene description by full snake_case name.
    // propose_storyboard is instructed to embed asset names verbatim (e.g.
    // "link_ordon's eye opens"), so we require an exact full-name match. This
    // avoids overmatching: single-word matching on "link" would attach link_ordon,
    // link_hero, AND wolf_link to any scene mentioning Link, confusing Gemini.
    // Underscores are treated as separators in the boundary regex (JS's \b
    // considers `_` a word char, which would let \blink\b miss inside "link_ordon").
    const desc = ctx.scene.description.toLowerCase();
    const referencedAssets = ctx.refImagePaths.filter((a) => {
      const fullName = a.name.toLowerCase();
      return new RegExp(`(?:^|[^a-z0-9])${fullName}(?:[^a-z0-9]|$)`, "i").test(desc);
    });

    const refImages = await step.run("load-refs", async () => {
      console.log(
        `[generate-keyframe] scene ${ctx.scene.scene_number}: ${referencedAssets.length}/${ctx.refImagePaths.length} refs matched (${referencedAssets.map((a) => a.name).join(", ") || "none"}). Description: "${ctx.scene.description}"`,
      );
      const loaded = [];
      for (const a of referencedAssets) {
        try {
          const ref = await downloadAsServiceBase64(a.path);
          loaded.push(ref);
        } catch (err) {
          console.warn(`Failed to load ref for ${a.name} at ${a.path}:`, err);
        }
      }
      return loaded;
    });

    const apiKey = await step.run("fetch-key", () =>
      getProviderKey(data.userId, "google_ai_studio"),
    );

    const prompt = await step.run("build-prompt", () =>
      buildKeyframePrompt({
        scopeName: ctx.project.scope,
        sceneDescription: ctx.scene.description,
        camera: ctx.scene.camera,
        beat: ctx.scene.beat,
        act: ctx.scene.act,
        frameRole: ctx.scene.frame_role as "SINGLE" | "PAIR-START" | "PAIR-END",
        anchorDirection: ctx.scene.anchor_direction,
        aspectRatio: (ctx.project.aspect_ratio ?? "16:9") as AspectRatio,
        stylePreset: (ctx.project.style_preset ?? "cinematic_blockbuster") as StylePreset,
        referencedAssets: referencedAssets.map((a) => ({ name: a.name, role: a.role })),
        editInstruction: data.editInstruction,
      }),
    );

    const result = await step.run("generate", async () => {
      const img = await generateImage({ apiKey, prompt, referenceImages: refImages });
      const keyframeId = crypto.randomUUID();
      const path = `${data.userId}/${data.projectId}/scenes/${data.sceneId}/keyframes/${keyframeId}.png`;
      await uploadAsService(path, img.bytes, img.mimeType);
      return { keyframeId, path };
    });

    await step.run("persist", async () => {
      // Mark prior keyframes as not current
      await supabase
        .from("scene_keyframes")
        .update({ is_current: false })
        .eq("scene_id", data.sceneId);

      await supabase.from("scene_keyframes").insert({
        id: result.keyframeId,
        scene_id: data.sceneId,
        role: ctx.scene.frame_role === "PAIR-END" ? "end" : ctx.scene.frame_role === "PAIR-START" ? "start" : "single",
        image_url: result.path,
        prompt_used: prompt,
        is_current: true,
      });

      await supabase
        .from("scenes")
        .update({
          current_keyframe_id: result.keyframeId,
          status: "keyframed",
        })
        .eq("id", data.sceneId);

      await supabase
        .from("jobs")
        .update({ status: "succeeded", result: { keyframe_path: result.path } })
        .eq("id", data.jobId);
    });

    return { ok: true, keyframeId: result.keyframeId };
  },
);
