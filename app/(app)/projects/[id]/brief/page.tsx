import { notFound, redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { BriefReview } from "./brief-review";
import { JobWaiting } from "./job-waiting";

export default async function BriefPage({ params }: PageProps<"/projects/[id]/brief">) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();

  const { data: project } = await supabase
    .from("projects")
    .select("*")
    .eq("id", id)
    .single();

  if (!project) notFound();

  // Already locked → straight to workspace
  if (project.status === "active") {
    redirect(`/projects/${project.id}`);
  }

  // Find the most recent parse_script job
  const { data: job } = await supabase
    .from("jobs")
    .select("id, status, error, result")
    .eq("project_id", id)
    .eq("type", "parse_script")
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (!job) {
    return (
      <div className="text-sm text-[var(--muted)]">
        No parse_script job found for this project. Re-create the project from{" "}
        <a href="/projects/new" className="underline">/projects/new</a>.
      </div>
    );
  }

  if (job.status !== "succeeded") {
    return <JobWaiting projectId={id} jobId={job.id} initialStatus={job.status} initialError={job.error} />;
  }

  const { data: assets } = await supabase
    .from("assets")
    .select("id, name, role, base_description")
    .eq("project_id", id)
    .order("created_at");

  const { data: scenes } = await supabase
    .from("scenes")
    .select("scene_number, act, description")
    .eq("project_id", id)
    .order("scene_number");

  return (
    <BriefReview
      project={project}
      assets={assets ?? []}
      scenes={scenes ?? []}
    />
  );
}
