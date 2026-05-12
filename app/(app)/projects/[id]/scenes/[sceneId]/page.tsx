import Link from "next/link";
import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { signedUrl } from "@/lib/storage";
import { SceneEditor } from "./scene-editor";

export default async function SceneEditorPage({
  params,
}: {
  params: Promise<{ id: string; sceneId: string }>;
}) {
  const { id: projectId, sceneId } = await params;
  const supabase = await createSupabaseServerClient();

  const { data: scene } = await supabase
    .from("scenes")
    .select(
      "id, scene_number, act, beat, camera, frame_role, anchor_direction, description, current_keyframe_id, project_id",
    )
    .eq("id", sceneId)
    .single();
  if (!scene || scene.project_id !== projectId) notFound();

  const { data: keyframes } = await supabase
    .from("scene_keyframes")
    .select("id, image_url, prompt_used, parent_keyframe_id, is_current, created_at")
    .eq("scene_id", sceneId)
    .order("created_at", { ascending: false });

  const enrichedKeyframes = await Promise.all(
    (keyframes ?? []).map(async (kf) => ({
      ...kf,
      signedUrl: await signedUrl(kf.image_url),
    })),
  );

  const currentKeyframe = enrichedKeyframes.find((kf) => kf.is_current) ?? null;

  // Latest image_generate job for this scene, only surfaced if not succeeded.
  const { data: latestJob } = await supabase
    .from("jobs")
    .select("id, status, error, created_at")
    .eq("type", "image_generate")
    .eq("project_id", projectId)
    .contains("request", { sceneId })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const activeJob = latestJob && latestJob.status !== "succeeded" ? latestJob : null;

  return (
    <div className="space-y-4">
      <Link
        href={`/projects/${projectId}?tab=storyboard`}
        className="text-xs text-[var(--muted)] hover:text-foreground"
      >
        ← Storyboard
      </Link>
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">Scene {scene.scene_number}</h1>
        <p className="text-xs text-[var(--muted)]">
          {scene.act && <>{scene.act} · </>}
          {scene.beat && <>{scene.beat} · </>}
          {scene.camera}
        </p>
        <p className="text-sm">{scene.description}</p>
      </header>

      <SceneEditor
        sceneId={sceneId}
        projectId={projectId}
        currentKeyframe={currentKeyframe}
        history={enrichedKeyframes}
        activeJob={activeJob}
      />
    </div>
  );
}
