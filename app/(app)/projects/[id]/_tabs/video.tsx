import { createSupabaseServerClient } from "@/lib/supabase/server";
import { signedUrl } from "@/lib/storage";
import { VideoSceneCard } from "./video-scene-card";
import { VideoTabHeader } from "./video-tab-header";

export async function VideoTab({ projectId }: { projectId: string }) {
  const supabase = await createSupabaseServerClient();

  const { data: scenes } = await supabase
    .from("scenes")
    .select(
      "id, scene_number, act, beat, camera, frame_role, description, current_keyframe_id, motion_prompt",
    )
    .eq("project_id", projectId)
    .order("scene_number");

  const scenesArr = scenes ?? [];

  const enrichedScenes = await Promise.all(
    scenesArr.map(async (s) => {
      let keyframeUrl: string | null = null;
      if (s.current_keyframe_id) {
        const { data: kf } = await supabase
          .from("scene_keyframes")
          .select("image_url")
          .eq("id", s.current_keyframe_id)
          .single();
        if (kf) keyframeUrl = await signedUrl(kf.image_url);
      }

      const { data: video } = await supabase
        .from("scene_videos")
        .select("id, video_url, duration_s, prompt_used, provider, created_at")
        .eq("scene_id", s.id)
        .eq("is_current", true)
        .maybeSingle();

      let videoUrl: string | null = null;
      if (video) {
        videoUrl = await signedUrl(video.video_url);
      }

      const { data: latestJob } = await supabase
        .from("jobs")
        .select("id, status, error")
        .eq("type", "video_generate")
        .eq("project_id", projectId)
        .contains("request", { sceneId: s.id })
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      const activeJob = latestJob && latestJob.status !== "succeeded" ? latestJob : null;

      return {
        ...s,
        keyframeUrl,
        videoUrl,
        videoMeta: video,
        activeJob,
      };
    }),
  );

  // Latest motion-prompt-generation job for this project. Only surface if not succeeded.
  const { data: latestPromptJob } = await supabase
    .from("jobs")
    .select("id, status, error")
    .eq("type", "generate_motion_prompts")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const activePromptJob =
    latestPromptJob && latestPromptJob.status !== "succeeded" ? latestPromptJob : null;

  const totalScenes = scenesArr.length;
  const keyframedScenes = enrichedScenes.filter((s) => s.keyframeUrl).length;
  const videoedScenes = enrichedScenes.filter((s) => s.videoUrl).length;
  const promptedScenes = enrichedScenes.filter((s) => s.motion_prompt?.trim()).length;

  if (keyframedScenes === 0) {
    return (
      <div className="rounded-lg border border-dashed border-[var(--border)] p-12 text-center">
        <p className="text-sm text-[var(--muted)]">
          Generate keyframes in the Storyboard tab first — videos are derived from them.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <VideoTabHeader
        projectId={projectId}
        totalScenes={totalScenes}
        keyframedScenes={keyframedScenes}
        videoedScenes={videoedScenes}
        promptedScenes={promptedScenes}
        activePromptJob={activePromptJob}
      />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {enrichedScenes.map((s) => (
          <VideoSceneCard key={s.id} scene={s} projectId={projectId} />
        ))}
      </div>
    </div>
  );
}
