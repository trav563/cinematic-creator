import { createSupabaseServerClient } from "@/lib/supabase/server";
import { signedUrl } from "@/lib/storage";
import { StoryboardHeader } from "./storyboard-header";
import { SceneCard } from "./scene-card";

export async function StoryboardTab({ projectId }: { projectId: string }) {
  const supabase = await createSupabaseServerClient();

  const { data: scenes } = await supabase
    .from("scenes")
    .select(
      "id, scene_number, act, beat, camera, frame_role, anchor_direction, description, status, current_keyframe_id",
    )
    .eq("project_id", projectId)
    .order("scene_number");

  // Find the most recent propose_storyboard job; only surface it in the UI if it
  // didn't succeed (so an old failure stops being shown after a successful regen).
  const { data: latestStoryboardJob } = await supabase
    .from("jobs")
    .select("id, status, error")
    .eq("type", "propose_storyboard")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const storyboardJob =
    latestStoryboardJob && latestStoryboardJob.status !== "succeeded" ? latestStoryboardJob : null;

  const scenesArr = scenes ?? [];

  // The stored "scenes" from parse_script were a rough outline (frame_role defaulted to
  // "SINGLE", camera/beat empty). Detect whether propose_storyboard has been run.
  const hasRealStoryboard = scenesArr.some((s) => s.camera && s.beat);

  const totalScenes = scenesArr.length;
  const keyframedScenes = scenesArr.filter((s) => s.current_keyframe_id).length;
  const remainingScenes = totalScenes - keyframedScenes;

  // For scenes with keyframes, fetch + sign the URL
  const enrichedScenes = await Promise.all(
    scenesArr.map(async (s) => {
      let keyframeUrl: string | null = null;
      let keyframePath: string | null = null;
      if (s.current_keyframe_id) {
        const { data: kf } = await supabase
          .from("scene_keyframes")
          .select("image_url")
          .eq("id", s.current_keyframe_id)
          .single();
        if (kf) {
          keyframePath = kf.image_url;
          keyframeUrl = await signedUrl(kf.image_url);
        }
      }

      const { data: latestJob } = await supabase
        .from("jobs")
        .select("id, status, error")
        .eq("type", "image_generate")
        .eq("project_id", projectId)
        .contains("request", { sceneId: s.id })
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      const activeJob = latestJob && latestJob.status !== "succeeded" ? latestJob : null;

      return {
        ...s,
        keyframeUrl,
        keyframePath,
        activeJob,
      };
    }),
  );

  return (
    <div className="space-y-6">
      <StoryboardHeader
        projectId={projectId}
        hasRealStoryboard={hasRealStoryboard}
        totalScenes={totalScenes}
        keyframedScenes={keyframedScenes}
        remainingScenes={remainingScenes}
        storyboardJob={storyboardJob ?? null}
      />

      {!hasRealStoryboard ? (
        <div className="rounded-lg border border-dashed border-[var(--border)] p-12 text-center">
          <p className="text-sm text-[var(--muted)]">
            Generate the full storyboard to populate camera angles, beats, and frame roles for every scene.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {enrichedScenes.map((s) => (
            <SceneCard key={s.id} scene={s} projectId={projectId} />
          ))}
        </div>
      )}
    </div>
  );
}
