import { createSupabaseServerClient } from "@/lib/supabase/server";
import { signedUrl } from "@/lib/storage";
import { StoryboardHeader } from "./storyboard-header";
import { SceneCard } from "./scene-card";
import { RealtimeJobsRefresher } from "./realtime-jobs-refresher";

export async function StoryboardTab({ projectId }: { projectId: string }) {
  const supabase = await createSupabaseServerClient();

  const { data: scenes } = await supabase
    .from("scenes")
    .select(
      "id, scene_number, act, beat, camera, frame_role, pair_anchor, anchor_direction, description, status, current_keyframe_id, current_start_keyframe_id, current_end_keyframe_id",
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

  // For scenes with keyframes, fetch + sign the URLs. PAIR scenes have separate
  // start/end frames; SINGLE scenes use current_keyframe_id (which we mirror onto
  // start/end for backward compat).
  const enrichedScenes = await Promise.all(
    scenesArr.map(async (s) => {
      const ids = [
        s.current_start_keyframe_id ?? s.current_keyframe_id,
        s.current_end_keyframe_id,
      ].filter(Boolean) as string[];
      const byId = new Map<string, string>();
      if (ids.length) {
        const { data: kfs } = await supabase
          .from("scene_keyframes")
          .select("id, image_url")
          .in("id", ids);
        for (const kf of kfs ?? []) byId.set(kf.id, kf.image_url);
      }

      const startKfId = s.current_start_keyframe_id ?? s.current_keyframe_id ?? null;
      const startKfPath = startKfId ? byId.get(startKfId) ?? null : null;
      const startKfUrl = startKfPath ? await signedUrl(startKfPath) : null;

      const endKfPath = s.current_end_keyframe_id
        ? byId.get(s.current_end_keyframe_id) ?? null
        : null;
      const endKfUrl = endKfPath ? await signedUrl(endKfPath) : null;

      // Surface jobs for either anchor generation or paired-frame derivation.
      const { data: latestJob } = await supabase
        .from("jobs")
        .select("id, status, error, type")
        .in("type", ["image_generate", "derive_paired_frame"])
        .eq("project_id", projectId)
        .contains("request", { sceneId: s.id })
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      const activeJob = latestJob && latestJob.status !== "succeeded" ? latestJob : null;

      return {
        ...s,
        startKeyframeUrl: startKfUrl,
        endKeyframeUrl: endKfUrl,
        keyframeUrl: startKfUrl, // back-compat alias for SINGLE-only consumers
        activeJob,
      };
    }),
  );

  return (
    <div className="space-y-6">
      <RealtimeJobsRefresher projectId={projectId} />
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
