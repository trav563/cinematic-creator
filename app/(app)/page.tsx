import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";

export default async function ProjectsPage() {
  const supabase = await createSupabaseServerClient();
  const { data: projects } = await supabase
    .from("projects")
    .select("id, title, status, thumbnail_url, updated_at")
    .order("updated_at", { ascending: false });

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Your Projects</h1>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Upload a script, generate characters and storyboards, then turn keyframes into video.
          </p>
        </div>
        <Link href="/projects/new">
          <Button>+ New project</Button>
        </Link>
      </div>

      {!projects || projects.length === 0 ? (
        <div className="rounded-lg border border-dashed border-[var(--border)] p-12 text-center">
          <p className="text-sm text-[var(--muted)]">
            No projects yet. Create one to get started.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((p) => (
            <Link
              key={p.id}
              href={`/projects/${p.id}`}
              className="group rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4 transition-colors hover:bg-[var(--surface-2)]"
            >
              <div className="aspect-video w-full overflow-hidden rounded bg-[var(--surface-2)]" />
              <div className="mt-3 flex items-center justify-between">
                <h3 className="text-sm font-medium">{p.title}</h3>
                <span className="text-xs text-[var(--muted)]">{p.status}</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
