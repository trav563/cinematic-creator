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
        .select(
          "scene_number, act, beat, camera, frame_role, pair_anchor, anchor_direction, description, reference_image_urls, referenced_asset_ids",
        )
        .eq("id", data.sceneId)
        .single();
      if (!scene) throw new Error("Scene not found");

      const { data: project } = await supabase
        .from("projects")
        .select("scope, style_preset, style_preset_options, aspect_ratio")
        .eq("id", data.projectId)
        .single();
      if (!project) throw new Error("Project not found");

      // Load ALL assets (with or without confirmed variations) so the matcher can
      // surface ones without a confirmed image — those fall back to the inline
      // base_description path in the prompt builder (Banjo CSV pattern).
      const { data: allAssets } = await supabase
        .from("assets")
        .select("id, name, kind, role, base_description, confirmed_variation_id")
        .eq("project_id", data.projectId);

      // Sign URLs for confirmed variations only
      const confirmedAssets = (allAssets ?? []).filter((a) => a.confirmed_variation_id);
      const variationPathById = new Map<string, string>();
      if (confirmedAssets.length) {
        const ids = confirmedAssets
          .map((a) => a.confirmed_variation_id)
          .filter(Boolean) as string[];
        const { data: variations } = await supabase
          .from("asset_variations")
          .select("id, image_url")
          .in("id", ids);
        for (const v of variations ?? []) variationPathById.set(v.id, v.image_url);
      }

      const allAssetsForMatching = (allAssets ?? []).map((a) => ({
        id: a.id,
        name: a.name,
        kind: (a.kind ?? null) as "character" | "location" | "object" | null,
        role: a.role,
        baseDescription: a.base_description,
        path: a.confirmed_variation_id
          ? variationPathById.get(a.confirmed_variation_id) ?? null
          : null,
      }));

      return { scene, project, allAssetsForMatching };
    });

    // Match assets against the scene description by full snake_case name.
    // Word-boundary regex with [^a-z0-9] so underscores separate (JS's \b counts _ as
    // a word char, which would miss inside "link_ordon").
    const desc = ctx.scene.description.toLowerCase();
    const explicitIds = new Set(((ctx.scene.referenced_asset_ids ?? []) as string[]));
    const matchedAssets = ctx.allAssetsForMatching.filter((a) => {
      // Explicit attachments always count, regardless of whether the name appears in
      // the description.
      if (explicitIds.has(a.id)) return true;
      const fullName = a.name.toLowerCase();
      return new RegExp(`(?:^|[^a-z0-9])${fullName}(?:[^a-z0-9]|$)`, "i").test(desc);
    });
    const matchedWithImage = matchedAssets.filter((a) => a.path);
    const matchedWithoutImage = matchedAssets.filter((a) => !a.path);

    const sceneRefPaths = (ctx.scene.reference_image_urls ?? []) as string[];

    const refImages = await step.run("load-refs", async () => {
      console.log(
        `[generate-keyframe] scene ${ctx.scene.scene_number}: ${matchedWithImage.length}/${ctx.allAssetsForMatching.length} asset refs with images matched (${matchedAssets.map((a) => a.name).join(", ") || "none"}). ${sceneRefPaths.length} scene-level ref(s). Description: "${ctx.scene.description}"`,
      );
      const loaded: { base64: string; mimeType: string }[] = [];
      // Scene-level refs go FIRST so the model anchors on them as the canonical
      // composition / lighting / environment reference for this exact shot.
      for (const path of sceneRefPaths) {
        try {
          loaded.push(await downloadAsServiceBase64(path));
        } catch (err) {
          console.warn(`Failed to load scene ref at ${path}:`, err);
        }
      }
      // Asset refs (character / location / object identity)
      for (const a of matchedWithImage) {
        try {
          loaded.push(await downloadAsServiceBase64(a.path!));
        } catch (err) {
          console.warn(`Failed to load asset ref for ${a.name} at ${a.path}:`, err);
        }
      }
      return loaded;
    });

    const apiKey = await step.run("fetch-key", () =>
      getProviderKey(data.userId, "google_ai_studio"),
    );

    const prompt = await step.run("build-prompt", () => {
      const presetOptions = (ctx.project.style_preset_options ?? {}) as { subMode?: string };
      return buildKeyframePrompt({
        scopeName: ctx.project.scope,
        sceneDescription: ctx.scene.description,
        camera: ctx.scene.camera,
        beat: ctx.scene.beat,
        act: ctx.scene.act,
        frameRole:
          ctx.scene.frame_role === "PAIR"
            ? ctx.scene.pair_anchor === "end"
              ? "PAIR-END"
              : "PAIR-START"
            : (ctx.scene.frame_role as "SINGLE" | "PAIR-START" | "PAIR-END"),
        anchorDirection: ctx.scene.anchor_direction,
        aspectRatio: (ctx.project.aspect_ratio ?? "16:9") as AspectRatio,
        stylePreset: (ctx.project.style_preset ?? "cinematic_blockbuster") as StylePreset,
        subMode: presetOptions.subMode ?? null,
        referencedAssets: [
          ...matchedWithImage.map((a) => ({
            name: a.name,
            role: a.role,
            kind: a.kind,
            baseDescription: a.baseDescription,
            hasReferenceImage: true,
          })),
          ...matchedWithoutImage.map((a) => ({
            name: a.name,
            role: a.role,
            kind: a.kind,
            baseDescription: a.baseDescription,
            hasReferenceImage: false,
          })),
        ],
        hasSceneReferences: sceneRefPaths.length > 0,
        editInstruction: data.editInstruction,
      });
    });

    const result = await step.run("generate", async () => {
      const img = await generateImage({ apiKey, prompt, referenceImages: refImages });
      const keyframeId = crypto.randomUUID();
      const path = `${data.userId}/${data.projectId}/scenes/${data.sceneId}/keyframes/${keyframeId}.png`;
      await uploadAsService(path, img.bytes, img.mimeType);
      return { keyframeId, path };
    });

    await step.run("persist", async () => {
      // Determine the role this keyframe plays based on the scene's frame_role.
      // - SINGLE → 'single' (current_keyframe_id)
      // - PAIR → role matches pair_anchor (start or end), goes into the matching
      //   current_(start|end)_keyframe_id slot. The other side is derived later
      //   via the derive-paired-frame worker.
      // - PAIR-START / PAIR-END (legacy from old projects) → maps to 'start' / 'end'
      let role: "single" | "start" | "end" = "single";
      if (ctx.scene.frame_role === "PAIR") {
        role = (ctx.scene.pair_anchor as "start" | "end" | null) ?? "start";
      } else if (ctx.scene.frame_role === "PAIR-START") {
        role = "start";
      } else if (ctx.scene.frame_role === "PAIR-END") {
        role = "end";
      }

      // Mark prior keyframes for the SAME role as not current (so multiple roles
      // can coexist on a PAIR scene without clobbering each other).
      await supabase
        .from("scene_keyframes")
        .update({ is_current: false })
        .eq("scene_id", data.sceneId)
        .eq("role", role);

      await supabase.from("scene_keyframes").insert({
        id: result.keyframeId,
        scene_id: data.sceneId,
        role,
        image_url: result.path,
        prompt_used: prompt,
        is_current: true,
      });

      const sceneUpdate: Record<string, unknown> = { status: "keyframed" };
      if (role === "single") {
        sceneUpdate.current_keyframe_id = result.keyframeId;
      } else if (role === "start") {
        sceneUpdate.current_start_keyframe_id = result.keyframeId;
        // Also set current_keyframe_id for backward-compat with code that reads it
        sceneUpdate.current_keyframe_id = result.keyframeId;
      } else {
        sceneUpdate.current_end_keyframe_id = result.keyframeId;
        sceneUpdate.current_keyframe_id = result.keyframeId;
      }
      await supabase.from("scenes").update(sceneUpdate).eq("id", data.sceneId);

      await supabase
        .from("jobs")
        .update({ status: "succeeded", result: { keyframe_path: result.path, role } })
        .eq("id", data.jobId);
    });

    return { ok: true, keyframeId: result.keyframeId };
  },
);
