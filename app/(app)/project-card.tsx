"use client";

import Link from "next/link";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { deleteProject } from "./actions";

interface Project {
  id: string;
  title: string;
  status: string;
}

export function ProjectCard({ project }: { project: Project }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleDelete(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const ok = window.confirm(
      `Delete "${project.title}"? This permanently removes the project, all characters, scenes, keyframes, and videos. Cannot be undone.`,
    );
    if (!ok) return;
    startTransition(async () => {
      const result = await deleteProject(project.id);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(`Deleted "${project.title}"`);
      router.refresh();
    });
  }

  return (
    <div className="group relative rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4 transition-colors hover:bg-[var(--surface-2)]">
      <Link href={`/projects/${project.id}`} className="block">
        <div className="aspect-video w-full overflow-hidden rounded bg-[var(--surface-2)]" />
        <div className="mt-3 flex items-center justify-between">
          <h3 className="text-sm font-medium">{project.title}</h3>
          <span className="text-xs text-[var(--muted)]">{project.status}</span>
        </div>
      </Link>
      <button
        type="button"
        onClick={handleDelete}
        disabled={isPending}
        className="absolute right-2 top-2 rounded bg-black/60 px-2 py-1 text-xs text-white opacity-0 transition-opacity hover:bg-red-500/80 group-hover:opacity-100 disabled:opacity-50"
        aria-label={`Delete ${project.title}`}
        title="Delete project"
      >
        {isPending ? "Deleting…" : "✕ Delete"}
      </button>
    </div>
  );
}
