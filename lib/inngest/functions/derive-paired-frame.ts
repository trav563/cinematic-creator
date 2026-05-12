import { inngest } from "../client";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { getProviderKey } from "@/lib/providers/keys";
import { generateImage } from "@/lib/providers/gemini";
import { composePairedFrameEditInstruction } from "@/lib/providers/claude";
import { downloadAsServiceBase64, uploadAsService } from "@/lib/storage";

export interface DerivePairedFrameEventData {
  jobId: string;
  projectId: string;
  sceneId: string;
  userId: string;
}

/**
 * For PAIR scenes: take the anchor keyframe (whichever side was generated first) and
 * derive the paired counterpart by:
 *   1. Asking Claude Opus 4.7 to compose a surgical Gemini edit instruction
 *      ("add explosion + smoke; preserve character pose and camera").
 *   2. Calling Gemini 3 Pro Image with the anchor frame as a reference + the edit
 *      instruction as the prompt → produces the derived paired frame.
 *   3. Storing the result as a scene_keyframes row with the OPPOSITE role of the
 *      anchor and pointing scenes.current_(start|end)_keyframe_id at it.
 */
export const derivePairedFrameFunction = inngest.createFunction(
  {
    id: "derive-paired-frame",
    name: "Derive paired frame from anchor (PAIR scenes)",
    triggers: [{ event: "scene/derive_paired_frame" }],
    retries: 1,
    concurrency: { limit: 5 },
    onFailure: async ({ event, error }) => {
      const original = (event.data as { event: { data: DerivePairedFrameEventData } }).event;
      const supabase = createSupabaseServiceClient();
      await supabase
        .from("jobs")
        .update({ status: "failed", error: error.message ?? "unknown error" })
        .eq("id", original.data.jobId);
    },
  },
  async ({ event, step }) => {
    const data = event.data as DerivePairedFrameEventData;
    const supabase = createSupabaseServiceClient();

    await step.run("mark-running", async () => {
      await supabase.from("jobs").update({ status: "running" }).eq("id", data.jobId);
    });

    const ctx = await step.run("load-context", async () => {
      const { data: scene } = await supabase
        .from("scenes")
        .select(
          "scene_number, act, beat, camera, frame_role, pair_anchor, anchor_direction, description, current_start_keyframe_id, current_end_keyframe_id",
        )
        .eq("id", data.sceneId)
        .single();
      if (!scene) throw new Error("Scene not found");
      if (scene.frame_role !== "PAIR") {
        throw new Error("derive-paired-frame only runs on PAIR scenes");
      }
      if (!scene.pair_anchor) {
        throw new Error("PAIR scene is missing pair_anchor — can't determine which side is anchor");
      }

      // The anchor keyframe is whichever side matches pair_anchor. The derived frame
      // will be stored as the opposite role.
      const anchorRole = scene.pair_anchor as "start" | "end";
      const derivedRole = anchorRole === "start" ? "end" : "start";
      const anchorKeyframeId =
        anchorRole === "start"
          ? scene.current_start_keyframe_id
          : scene.current_end_keyframe_id;
      if (!anchorKeyframeId) {
        throw new Error(
          `Anchor frame (${anchorRole}) doesn't exist yet. Generate it first before deriving the paired frame.`,
        );
      }

      const { data: anchorKf } = await supabase
        .from("scene_keyframes")
        .select("image_url")
        .eq("id", anchorKeyframeId)
        .single();
      if (!anchorKf) throw new Error("Anchor keyframe not found in storage");

      // Asset name list for the edit-instruction composer (so it can name them).
      const { data: assets } = await supabase
        .from("assets")
        .select("name")
        .eq("project_id", data.projectId);
      const allAssetNames = (assets ?? []).map((a) => a.name);
      const desc = scene.description.toLowerCase();
      const referencedNames = allAssetNames.filter((name) => {
        const re = new RegExp(`(?:^|[^a-z0-9])${name.toLowerCase()}(?:[^a-z0-9]|$)`, "i");
        return re.test(desc);
      });

      return {
        scene,
        anchorRole,
        derivedRole,
        anchorKeyframeId,
        anchorImagePath: anchorKf.image_url,
        referencedNames,
      };
    });

    const apiKeys = await step.run("fetch-keys", async () => {
      const [anthropic, google] = await Promise.all([
        getProviderKey(data.userId, "anthropic"),
        getProviderKey(data.userId, "google_ai_studio"),
      ]);
      return { anthropic, google };
    });

    const editInstruction = await step.run("compose-edit-instruction", () =>
      composePairedFrameEditInstruction({
        apiKey: apiKeys.anthropic,
        sceneDescription: ctx.scene.description,
        pairAnchor: ctx.anchorRole,
        anchorDirection: ctx.scene.anchor_direction,
        camera: ctx.scene.camera,
        beat: ctx.scene.beat,
        act: ctx.scene.act,
        referencedAssetNames: ctx.referencedNames,
      }),
    );

    const anchorImage = await step.run("load-anchor-image", async () => {
      return downloadAsServiceBase64(ctx.anchorImagePath);
    });

    const result = await step.run("generate-paired-image", async () => {
      const img = await generateImage({
        apiKey: apiKeys.google,
        prompt: editInstruction,
        referenceImages: [anchorImage],
      });
      const keyframeId = crypto.randomUUID();
      const path = `${data.userId}/${data.projectId}/scenes/${data.sceneId}/keyframes/${keyframeId}.png`;
      await uploadAsService(path, img.bytes, img.mimeType);
      return { keyframeId, path };
    });

    await step.run("persist", async () => {
      // Mark prior keyframes for this scene+role as not current.
      await supabase
        .from("scene_keyframes")
        .update({ is_current: false })
        .eq("scene_id", data.sceneId)
        .eq("role", ctx.derivedRole);

      await supabase.from("scene_keyframes").insert({
        id: result.keyframeId,
        scene_id: data.sceneId,
        role: ctx.derivedRole,
        image_url: result.path,
        prompt_used: editInstruction,
        parent_keyframe_id: ctx.anchorKeyframeId,
        is_current: true,
      });

      const sceneUpdate: Record<string, unknown> = { status: "keyframed" };
      if (ctx.derivedRole === "start") {
        sceneUpdate.current_start_keyframe_id = result.keyframeId;
      } else {
        sceneUpdate.current_end_keyframe_id = result.keyframeId;
      }
      await supabase.from("scenes").update(sceneUpdate).eq("id", data.sceneId);

      await supabase
        .from("jobs")
        .update({
          status: "succeeded",
          result: {
            keyframe_path: result.path,
            derived_role: ctx.derivedRole,
            edit_instruction: editInstruction,
          },
        })
        .eq("id", data.jobId);
    });

    return { ok: true, keyframeId: result.keyframeId, derivedRole: ctx.derivedRole };
  },
);
