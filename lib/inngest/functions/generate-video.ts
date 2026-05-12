import { inngest } from "../client";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { getProviderKey } from "@/lib/providers/keys";
import {
  submitImageToVideo,
  pollTask,
  downloadVideoBytes,
  type KlingModel,
  type KlingMode,
  type KlingDuration,
  type MultiPromptShot,
} from "@/lib/providers/kling";
import { downloadAsServiceBase64, uploadAsService } from "@/lib/storage";

export interface GenerateVideoEventData {
  jobId: string;
  projectId: string;
  sceneId: string;
  userId: string;
  model: KlingModel;
  mode: KlingMode;
  duration: KlingDuration;
  prompt: string;
  negativePrompt?: string;
  sound: "on" | "off";
  multiShot?: boolean;
  multiPrompt?: MultiPromptShot[];
}

const POLL_INTERVAL_SECONDS = 15;
// Kling clips routinely take 2-8 minutes. 8 minutes / 15s = 32 polls.
// Cap at 40 to allow some headroom for queueing.
const MAX_POLLS = 40;

export const generateVideoFunction = inngest.createFunction(
  {
    id: "generate-video",
    name: "Generate Kling video for scene",
    triggers: [{ event: "scene/generate_video" }],
    retries: 1,
    // Kling itself rate-limits; keep our concurrency conservative to avoid 429s.
    concurrency: { limit: 3 },
    onFailure: async ({ event, error }) => {
      const original = (event.data as { event: { data: GenerateVideoEventData } }).event;
      const supabase = createSupabaseServiceClient();
      await supabase
        .from("jobs")
        .update({ status: "failed", error: error.message ?? "unknown error" })
        .eq("id", original.data.jobId);
    },
  },
  async ({ event, step }) => {
    const data = event.data as GenerateVideoEventData;
    const supabase = createSupabaseServiceClient();

    await step.run("mark-running", async () => {
      await supabase.from("jobs").update({ status: "running" }).eq("id", data.jobId);
    });

    const ctx = await step.run("load-context", async () => {
      const { data: scene } = await supabase
        .from("scenes")
        .select("scene_number, current_keyframe_id, project_id, description")
        .eq("id", data.sceneId)
        .single();
      if (!scene) throw new Error("Scene not found");
      if (!scene.current_keyframe_id) throw new Error("Scene has no current keyframe");

      const { data: kf } = await supabase
        .from("scene_keyframes")
        .select("image_url")
        .eq("id", scene.current_keyframe_id)
        .single();
      if (!kf) throw new Error("Keyframe not found in storage");

      const { data: project } = await supabase
        .from("projects")
        .select("aspect_ratio")
        .eq("id", data.projectId)
        .single();
      if (!project) throw new Error("Project not found");

      // Load any characters in this project that have a Kling element bound, so we can
      // attach element_list for those mentioned in the scene description.
      const { data: boundCharacters } = await supabase
        .from("characters")
        .select("name, kling_element_id")
        .eq("project_id", data.projectId)
        .not("kling_element_id", "is", null);

      return {
        sceneNumber: scene.scene_number,
        sceneDescription: scene.description,
        keyframePath: kf.image_url,
        aspectRatio: project.aspect_ratio,
        boundCharacters: boundCharacters ?? [],
      };
    });

    // Match bound characters against the scene description by full snake_case name.
    // Same matcher as generate-keyframe — underscores treated as separators.
    const desc = ctx.sceneDescription.toLowerCase();
    const matchedElementIds: string[] = [];
    for (const c of ctx.boundCharacters) {
      if (!c.kling_element_id) continue;
      const fullName = c.name.toLowerCase();
      const re = new RegExp(`(?:^|[^a-z0-9])${fullName}(?:[^a-z0-9]|$)`, "i");
      if (re.test(desc)) {
        matchedElementIds.push(c.kling_element_id);
      }
      if (matchedElementIds.length >= 3) break; // Kling caps element_list at 3
    }
    if (matchedElementIds.length) {
      console.log(
        `[generate-video] scene ${ctx.sceneNumber}: attaching ${matchedElementIds.length} Kling element(s) (${matchedElementIds.join(", ")}) for character consistency.`,
      );
    }

    const credential = await step.run("fetch-key", () =>
      getProviderKey(data.userId, "kling"),
    );

    const imageBase64 = await step.run("load-keyframe", async () => {
      const { base64 } = await downloadAsServiceBase64(ctx.keyframePath);
      return base64;
    });

    const taskId = await step.run("submit-task", () =>
      submitImageToVideo({
        credential,
        model: data.model,
        mode: data.mode,
        duration: data.duration,
        imageBase64,
        prompt: data.prompt,
        negativePrompt: data.negativePrompt,
        sound: data.sound,
        multiShot: data.multiShot,
        multiPrompt: data.multiPrompt,
        elementIds: matchedElementIds.length ? matchedElementIds : undefined,
        aspectRatio: ctx.aspectRatio === "9:16" || ctx.aspectRatio === "1:1" ? ctx.aspectRatio : "16:9",
      }),
    );

    // Poll loop. Inngest's step.sleep is durable — the worker pauses cleanly without
    // holding a connection open, which lets a single function run for the full 8-minute
    // Kling generation window without blowing past serverless function timeouts.
    let videoUrl: string | null = null;
    for (let i = 0; i < MAX_POLLS; i++) {
      await step.sleep(`wait-${i}`, `${POLL_INTERVAL_SECONDS}s`);
      const status = await step.run(`poll-${i}`, () => pollTask(credential, taskId));
      if (status.status === "succeed" && status.videoUrl) {
        videoUrl = status.videoUrl;
        break;
      }
      if (status.status === "failed") {
        throw new Error(`Kling task failed: ${status.error ?? "unknown"}`);
      }
    }
    if (!videoUrl) {
      throw new Error(`Kling task did not complete within ${MAX_POLLS * POLL_INTERVAL_SECONDS}s.`);
    }

    const upload = await step.run("download-and-store", async () => {
      const { bytes, mimeType } = await downloadVideoBytes(videoUrl!);
      const videoId = crypto.randomUUID();
      const ext = mimeType.includes("mp4") ? "mp4" : "bin";
      const path = `${data.userId}/${data.projectId}/scenes/${data.sceneId}/videos/${videoId}.${ext}`;
      await uploadAsService(path, bytes, mimeType);
      return { videoId, path, mimeType };
    });

    await step.run("persist", async () => {
      // Mark prior videos for this scene as not current.
      await supabase
        .from("scene_videos")
        .update({ is_current: false })
        .eq("scene_id", data.sceneId);

      // For multi-shot, prompt_used is a serialized summary of the storyboards.
      const promptForRecord =
        data.multiShot && data.multiPrompt
          ? data.multiPrompt.map((s) => `[${s.duration}s] ${s.prompt}`).join(" | ")
          : data.prompt;

      await supabase.from("scene_videos").insert({
        id: upload.videoId,
        scene_id: data.sceneId,
        video_url: upload.path,
        duration_s: Number(data.duration),
        prompt_used: promptForRecord,
        provider: `${data.model} ${data.mode}${data.multiShot ? " multi-shot" : ""}`,
        is_current: true,
      });

      await supabase
        .from("scenes")
        .update({ status: "videoed" })
        .eq("id", data.sceneId);

      await supabase
        .from("jobs")
        .update({
          status: "succeeded",
          result: {
            video_path: upload.path,
            kling_task_id: taskId,
            element_ids_used: matchedElementIds,
          },
        })
        .eq("id", data.jobId);
    });

    return { ok: true, videoId: upload.videoId };
  },
);
