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
      "id, scene_number, act, beat, camera, frame_role, pair_anchor, anchor_direction, description, status, current_keyframe_id, current_start_keyframe_id, current_end_keyframe_id, reference_image_urls, referenced_asset_ids, keyframe_prompt_override",
    )
    .eq("project_id", projectId)
    .order("scene_number");

  const scenesArr = scenes ?? [];

  // BATCHED: collect every keyframe id we need, then fetch them in one IN-query.
  const keyframeIds = new Set<string>();
  for (const s of scenesArr) {
    const startId = s.current_start_keyframe_id ?? s.current_keyframe_id;
    if (startId) keyframeIds.add(startId);
    if (s.current_end_keyframe_id) keyframeIds.add(s.current_end_keyframe_id);
  }

  const [
    { data: latestStoryboardJob },
    { data: keyframes },
    { data: activeSceneJobs },
    { data: projectAssets },
  ] = await Promise.all([
    supabase
      .from("jobs")
      .select("id, status, error")
      .eq("type", "propose_storyboard")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    keyframeIds.size > 0
      ? supabase
          .from("scene_keyframes")
          .select("id, image_url, prompt_used")
          .in("id", Array.from(keyframeIds))
      : Promise.resolve({
          data: [] as { id: string; image_url: string; prompt_used: string | null }[],
        }),
    // All active scene-related jobs in one query
    supabase
      .from("jobs")
      .select("id, status, error, type, request, created_at")
      .in("type", ["image_generate", "derive_paired_frame"])
      .eq("project_id", projectId)
      .in("status", ["queued", "running", "failed"])
      .order("created_at", { ascending: false }),
    // Asset library for the per-scene attach picker
    supabase
      .from("assets")
      .select("id, name, kind, role")
      .eq("project_id", projectId)
      .order("kind")
      .order("name"),
  ]);

  const storyboardJob =
    latestStoryboardJob && latestStoryboardJob.status !== "succeeded" ? latestStoryboardJob : null;

  const pathById = new Map<string, string>();
  const promptByKeyframeId = new Map<string, string | null>();
  for (const kf of keyframes ?? []) {
    pathById.set(kf.id, kf.image_url);
    promptByKeyframeId.set(kf.id, kf.prompt_used);
  }

  const projectAssetList = (projectAssets ?? []) as {
    id: string;
    name: string;
    kind: string | null;
    role: string | null;
  }[];

  // Index latest active job per scene
  const jobBySceneId = new Map<string, { id: string; status: string; error: string | null; type: string }>();
  for (const j of activeSceneJobs ?? []) {
    const req = j.request as { sceneId?: string } | null;
    const sid = req?.sceneId;
    if (!sid) continue;
    if (!jobBySceneId.has(sid)) {
      jobBySceneId.set(sid, { id: j.id, status: j.status, error: j.error, type: j.type });
    }
  }

  // Sign all unique paths in parallel (keyframes + per-scene refs).
  const allPaths = new Set<string>();
  for (const path of pathById.values()) allPaths.add(path);
  for (const s of scenesArr) {
    for (const p of (s.reference_image_urls ?? []) as string[]) allPaths.add(p);
  }
  const pathsArr = Array.from(allPaths);
  const signedUrls = await Promise.all(pathsArr.map((p) => signedUrl(p)));
  const urlByPath = new Map<string, string | null>();
  pathsArr.forEach((p, i) => urlByPath.set(p, signedUrls[i]));

  const enrichedScenes = scenesArr.map((s) => {
    const startId = s.current_start_keyframe_id ?? s.current_keyframe_id;
    const startPath = startId ? pathById.get(startId) ?? null : null;
    const endPath = s.current_end_keyframe_id
      ? pathById.get(s.current_end_keyframe_id) ?? null
      : null;
    const refs = ((s.reference_image_urls ?? []) as string[]).map((path) => ({
      path,
      url: urlByPath.get(path) ?? null,
    }));
    const startPrompt = startId ? promptByKeyframeId.get(startId) ?? null : null;
    const endPrompt = s.current_end_keyframe_id
      ? promptByKeyframeId.get(s.current_end_keyframe_id) ?? null
      : null;
    return {
      ...s,
      startKeyframeUrl: startPath ? urlByPath.get(startPath) ?? null : null,
      endKeyframeUrl: endPath ? urlByPath.get(endPath) ?? null : null,
      keyframeUrl: startPath ? urlByPath.get(startPath) ?? null : null,
      refs,
      attachedAssetIds: (s.referenced_asset_ids ?? []) as string[],
      startPrompt,
      endPrompt,
      activeJob: jobBySceneId.get(s.id) ?? null,
    };
  });

  // Detect whether propose_storyboard has been run (rough outline = no camera/beat).
  const hasRealStoryboard = scenesArr.some((s) => s.camera && s.beat);
  const totalScenes = scenesArr.length;
  const keyframedScenes = scenesArr.filter((s) => s.current_keyframe_id).length;
  const remainingScenes = totalScenes - keyframedScenes;

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
            <SceneCard
              key={s.id}
              scene={s}
              projectId={projectId}
              projectAssets={projectAssetList}
            />
          ))}
        </div>
      )}
    </div>
  );
}
