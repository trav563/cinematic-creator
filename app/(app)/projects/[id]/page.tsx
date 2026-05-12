import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { AssetsTab } from "./_tabs/assets";
import { StoryboardTab } from "./_tabs/storyboard";
import { VideoTab } from "./_tabs/video";

const TABS = ["assets", "storyboard", "video", "history"] as const;
type Tab = (typeof TABS)[number];

export default async function ProjectWorkspacePage({
  params,
  searchParams,
}: PageProps<"/projects/[id]">) {
  const { id } = await params;
  const search = await searchParams;
  const tabParam = typeof search.tab === "string" ? search.tab : "assets";
  // Backward compat: old URLs with ?tab=characters redirect to ?tab=assets
  const normalized = tabParam === "characters" ? "assets" : tabParam;
  const activeTab = (TABS as readonly string[]).includes(normalized) ? (normalized as Tab) : "assets";

  const supabase = await createSupabaseServerClient();
  const { data: project } = await supabase.from("projects").select("*").eq("id", id).single();
  if (!project) notFound();

  // If brief isn't locked yet, send the user there
  if (project.status !== "active" && project.status !== "archived") {
    redirect(`/projects/${id}/brief`);
  }

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <Link href="/" className="text-xs text-[var(--muted)] hover:text-foreground">
          ← Projects
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">{project.title}</h1>
        <p className="text-xs text-[var(--muted)]">
          {project.aspect_ratio} · {project.style_preset} · {project.scope}
        </p>
      </header>

      <nav className="border-b border-[var(--border)]">
        <ul className="flex gap-1">
          {TABS.map((tab) => (
            <li key={tab}>
              <Link
                href={`/projects/${id}?tab=${tab}`}
                className={`inline-block border-b-2 px-4 py-2 text-sm capitalize transition-colors ${
                  activeTab === tab
                    ? "border-foreground text-foreground"
                    : "border-transparent text-[var(--muted)] hover:text-foreground"
                }`}
              >
                {tab}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {activeTab === "assets" ? (
        <AssetsTab projectId={id} />
      ) : activeTab === "storyboard" ? (
        <StoryboardTab projectId={id} />
      ) : activeTab === "video" ? (
        <VideoTab projectId={id} />
      ) : (
        <div className="rounded-lg border border-dashed border-[var(--border)] p-12 text-center">
          <p className="text-sm text-[var(--muted)]">
            The <span className="capitalize text-foreground">{activeTab}</span> tab is built in a
            later phase.
          </p>
        </div>
      )}
    </div>
  );
}
