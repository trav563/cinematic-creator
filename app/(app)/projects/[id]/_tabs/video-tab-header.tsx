"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { generateMotionPromptsForProject, fetchKlingBalance } from "./video-actions";
import { unitsToUsd, type KlingBalanceSummary } from "@/lib/providers/kling";

interface ActiveJob {
  id: string;
  status: string;
  error: string | null;
}

interface Props {
  projectId: string;
  totalScenes: number;
  keyframedScenes: number;
  videoedScenes: number;
  promptedScenes: number;
  activePromptJob: ActiveJob | null;
}

export function VideoTabHeader({
  projectId,
  totalScenes,
  keyframedScenes,
  videoedScenes,
  promptedScenes,
  activePromptJob: initial,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [activeJob, setActiveJob] = useState<ActiveJob | null>(initial);
  const [balance, setBalance] = useState<KlingBalanceSummary | null>(null);
  const [balanceError, setBalanceError] = useState<string | null>(null);
  const [refreshingBalance, setRefreshingBalance] = useState(false);

  useEffect(() => {
    setActiveJob(initial);
  }, [initial]);

  // Fetch Kling balance on mount, and again whenever a video job completes (so the
  // user sees the unit deduction reflected — though Kling docs say there's a ~12h
  // delay on the remaining_quantity stat).
  useEffect(() => {
    let cancelled = false;
    setRefreshingBalance(true);
    fetchKlingBalance()
      .then((res) => {
        if (cancelled) return;
        if (res.ok) {
          setBalance(res.data!);
          setBalanceError(null);
        } else {
          setBalanceError(res.error);
        }
      })
      .finally(() => {
        if (!cancelled) setRefreshingBalance(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function handleRefreshBalance() {
    setRefreshingBalance(true);
    fetchKlingBalance()
      .then((res) => {
        if (res.ok) {
          setBalance(res.data!);
          setBalanceError(null);
          toast.success("Balance refreshed");
        } else {
          setBalanceError(res.error);
          toast.error(res.error);
        }
      })
      .finally(() => setRefreshingBalance(false));
  }

  const activeJobId = activeJob?.id ?? null;
  useEffect(() => {
    if (!activeJobId) return;
    const supabase = createSupabaseBrowserClient();
    const channel = supabase
      .channel(`prompt-job-${activeJobId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "jobs", filter: `id=eq.${activeJobId}` },
        (payload) => {
          const next = payload.new as { status: string; error: string | null };
          setActiveJob({ id: activeJobId, status: next.status, error: next.error });
          if (next.status === "succeeded" || next.status === "failed") {
            router.refresh();
          }
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [activeJobId, router]);

  const isRunning = activeJob?.status === "queued" || activeJob?.status === "running";

  function handleGenerate() {
    startTransition(async () => {
      const result = await generateMotionPromptsForProject(projectId);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setActiveJob({ id: result.data!.jobId, status: "queued", error: null });
      toast.success(`Generating motion prompts for ${totalScenes} scenes — Opus 4.7 takes ~30-60s.`);
    });
  }

  const hasAnyPrompts = promptedScenes > 0;

  return (
    <div className="space-y-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <h2 className="text-base font-medium">Video</h2>
          <p className="text-xs text-[var(--muted)]">
            {totalScenes} scenes · {keyframedScenes} keyframed · {promptedScenes} have motion prompts · {videoedScenes} have video.
          </p>
          <p className="text-xs text-[var(--muted)]">
            Claude can write Kling-optimized motion prompts for every scene at once. You can edit any prompt before generating its video.
          </p>
          {activeJob?.status === "failed" && (
            <p className="text-xs text-red-400">Failed: {activeJob.error ?? "unknown error"}</p>
          )}
        </div>
        <Button
          onClick={handleGenerate}
          disabled={isPending || isRunning}
          variant={hasAnyPrompts ? "secondary" : "primary"}
        >
          {isRunning
            ? `${activeJob?.status === "running" ? "Writing prompts" : "Queued"}…`
            : hasAnyPrompts
              ? "Regenerate motion prompts"
              : "Auto-generate motion prompts"}
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-3 border-t border-[var(--border)] pt-3 text-xs">
        <span className="text-[var(--muted)]">Kling balance:</span>
        {balance ? (
          <span>
            <span className="font-medium text-foreground">
              {balance.remainingActive.toFixed(1)} units
            </span>
            <span className="text-[var(--muted)]"> (~${unitsToUsd(balance.remainingActive).toFixed(2)})</span>
            {balance.packs.filter((p) => p.status === "online").length > 1 && (
              <span className="text-[var(--muted)]"> · {balance.packs.filter((p) => p.status === "online").length} active packs</span>
            )}
          </span>
        ) : balanceError ? (
          <span className="text-red-400">{balanceError}</span>
        ) : (
          <span className="text-[var(--muted)]">{refreshingBalance ? "fetching…" : "—"}</span>
        )}
        <button
          type="button"
          onClick={handleRefreshBalance}
          disabled={refreshingBalance}
          className="text-[var(--muted)] hover:text-foreground disabled:opacity-50"
        >
          {refreshingBalance ? "↻" : "Refresh"}
        </button>
        <span className="text-[10px] text-[var(--muted)]" title="Kling API has a ~12h delay on remaining-quantity stats.">
          ⓘ ~12h delay
        </span>
      </div>
    </div>
  );
}
