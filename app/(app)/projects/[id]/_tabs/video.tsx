import { createSupabaseServerClient } from "@/lib/supabase/server";
import { signedUrl } from "@/lib/storage";
import { VideoSceneCard } from "./video-scene-card";
import { VideoTabHeader } from "./video-tab-header";
import { RealtimeJobsRefresher } from "./realtime-jobs-refresher";

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
  const sceneIds = scenesArr.map((s) => s.id);
  const keyframeIds = scenesArr
    .map((s) => s.current_keyframe_id)
    .filter(Boolean) as string[];

  // BATCHED: collapse N+1 queries into a constant number per page.
  const [
    { data: keyframes },
    { data: videos },
    { data: activeVideoJobs },
    { data: latestPromptJob },
  ] = await Promise.all([
    keyframeIds.length > 0
      ? supabase
          .from("scene_keyframes")
          .select("id, image_url")
          .in("id", keyframeIds)
      : Promise.resolve({ data: [] as { id: string; image_url: string }[] }),
    sceneIds.length > 0
      ? supabase
          .from("scene_videos")
          .select("id, scene_id, video_url, duration_s, prompt_used, provider, created_at")
          .in("scene_id", sceneIds)
          .eq("is_current", true)
      : Promise.resolve({
          data: [] as {
            id: string;
            scene_id: string;
            video_url: string;
            duration_s: number | null;
            prompt_used: string | null;
            provider: string | null;
            created_at: string;
          }[],
        }),
    supabase
      .from("jobs")
      .select("id, status, error, request, created_at")
      .eq("type", "video_generate")
      .eq("project_id", projectId)
      .in("status", ["queued", "running", "failed"])
      .order("created_at", { ascending: false }),
    supabase
      .from("jobs")
      .select("id, status, error")
      .eq("type", "generate_motion_prompts")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const keyframePathById = new Map<string, string>();
  for (const kf of keyframes ?? []) keyframePathById.set(kf.id, kf.image_url);

  type VideoRow = {
    id: string;
    scene_id: string;
    video_url: string;
    duration_s: number | null;
    prompt_used: string | null;
    provider: string | null;
    created_at: string;
  };
  const videoBySceneId = new Map<string, VideoRow>();
  for (const v of (videos ?? []) as VideoRow[]) videoBySceneId.set(v.scene_id, v);

  const jobBySceneId = new Map<string, { id: string; status: string; error: string | null }>();
  for (const j of activeVideoJobs ?? []) {
    const req = j.request as { sceneId?: string } | null;
    const sid = req?.sceneId;
    if (!sid) continue;
    if (!jobBySceneId.has(sid)) jobBySceneId.set(sid, { id: j.id, status: j.status, error: j.error });
  }

  // Sign every URL we need in one parallel batch
  const allPaths = new Set<string>();
  for (const path of keyframePathById.values()) allPaths.add(path);
  for (const v of videos ?? []) allPaths.add(v.video_url);
  const pathsArr = Array.from(allPaths);
  const signedUrls = await Promise.all(pathsArr.map((p) => signedUrl(p)));
  const urlByPath = new Map<string, string | null>();
  pathsArr.forEach((p, i) => urlByPath.set(p, signedUrls[i]));

  const enrichedScenes = scenesArr.map((s) => {
    const kfPath = s.current_keyframe_id ? keyframePathById.get(s.current_keyframe_id) ?? null : null;
    const video = videoBySceneId.get(s.id) ?? null;
    return {
      ...s,
      keyframeUrl: kfPath ? urlByPath.get(kfPath) ?? null : null,
      videoUrl: video ? urlByPath.get(video.video_url) ?? null : null,
      videoMeta: video,
      activeJob: jobBySceneId.get(s.id) ?? null,
    };
  });

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
      <RealtimeJobsRefresher projectId={projectId} />
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
