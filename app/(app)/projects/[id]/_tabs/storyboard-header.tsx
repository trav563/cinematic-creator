"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { generateStoryboard, generateAllKeyframes } from "./storyboard-actions";

interface StoryboardJob {
  id: string;
  status: string;
  error: string | null;
}

export function StoryboardHeader({
  projectId,
  hasRealStoryboard,
  totalScenes,
  keyframedScenes,
  remainingScenes,
  storyboardJob,
}: {
  projectId: string;
  hasRealStoryboard: boolean;
  totalScenes: number;
  keyframedScenes: number;
  remainingScenes: number;
  storyboardJob: StoryboardJob | null;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [activeJob, setActiveJob] = useState<StoryboardJob | null>(storyboardJob);

  useEffect(() => {
    setActiveJob(storyboardJob);
  }, [storyboardJob]);

  // Realtime + polling for the storyboard generation job
  useEffect(() => {
    if (!activeJob) return;
    const supabase = createSupabaseBrowserClient();
    const channel = supabase
      .channel(`storyboard-job-${activeJob.id}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "jobs", filter: `id=eq.${activeJob.id}` },
        (payload) => {
          const next = payload.new as { status: string; error: string | null };
          setActiveJob({ id: activeJob.id, status: next.status, error: next.error });
          if (next.status === "succeeded" || next.status === "failed") {
            router.refresh();
          }
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [activeJob, router]);

  function handleGenerateStoryboard() {
    startTransition(async () => {
      const result = await generateStoryboard(projectId);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setActiveJob({ id: result.data!.jobId, status: "queued", error: null });
      toast.success("Storyboard generation queued — Opus 4.7 takes ~60–90s.");
    });
  }

  function handleGenerateAllKeyframes() {
    startTransition(async () => {
      const result = await generateAllKeyframes(projectId);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(`Queued ${result.data!.count} keyframe jobs. Throttled to 5 in parallel.`);
    });
  }

  const isStoryboardRunning = activeJob?.status === "queued" || activeJob?.status === "running";

  return (
    <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
      <div className="space-y-1">
        <h2 className="text-base font-medium">Storyboard</h2>
        {hasRealStoryboard ? (
          <p className="text-xs text-[var(--muted)]">
            {totalScenes} scenes · {keyframedScenes} keyframed · {remainingScenes} remaining
          </p>
        ) : (
          <p className="text-xs text-[var(--muted)]">
            Not generated yet. Run propose_storyboard to expand the rough outline into a full table with cameras, beats, and frame roles.
          </p>
        )}
        {activeJob?.status === "failed" && (
          <p className="text-xs text-red-400">Failed: {activeJob.error ?? "unknown error"}</p>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          onClick={handleGenerateStoryboard}
          disabled={isPending || isStoryboardRunning}
          variant={hasRealStoryboard ? "secondary" : "primary"}
        >
          {isStoryboardRunning
            ? `${activeJob?.status === "running" ? "Generating storyboard" : "Queued"}…`
            : hasRealStoryboard
              ? "Regenerate storyboard"
              : "Generate storyboard"}
        </Button>
        {hasRealStoryboard && remainingScenes > 0 && (
          <Button onClick={handleGenerateAllKeyframes} disabled={isPending}>
            Generate {remainingScenes} keyframe{remainingScenes === 1 ? "" : "s"}
          </Button>
        )}
      </div>
    </div>
  );
}
