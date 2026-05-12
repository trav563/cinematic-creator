"use client";

import Image from "next/image";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Lightbox } from "@/components/ui/lightbox";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  generateKeyframe,
  confirmKeyframeVariation,
} from "../../_tabs/storyboard-actions";

interface Keyframe {
  id: string;
  image_url: string;
  signedUrl: string | null;
  prompt_used: string | null;
  parent_keyframe_id: string | null;
  is_current: boolean;
  created_at: string;
}

interface ActiveJob {
  id: string;
  status: string;
  error: string | null;
}

interface Props {
  sceneId: string;
  projectId: string;
  currentKeyframe: Keyframe | null;
  history: Keyframe[];
  activeJob: ActiveJob | null;
}

export function SceneEditor({
  sceneId,
  projectId: _projectId,
  currentKeyframe,
  history,
  activeJob: initialJob,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [instruction, setInstruction] = useState("");
  const [activeJob, setActiveJob] = useState<ActiveJob | null>(initialJob);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  useEffect(() => {
    setActiveJob(initialJob);
  }, [initialJob]);

  const activeJobId = activeJob?.id ?? null;
  useEffect(() => {
    if (!activeJobId) return;
    const supabase = createSupabaseBrowserClient();
    const channel = supabase
      .channel(`scene-job-${activeJobId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "jobs",
          filter: `id=eq.${activeJobId}`,
        },
        (payload) => {
          const next = payload.new as { status: string; error: string | null };
          setActiveJob({ id: activeJobId, status: next.status, error: next.error });
          if (next.status === "succeeded" || next.status === "failed") {
            router.refresh();
          }
        },
      )
      .subscribe();
    const interval = setInterval(() => router.refresh(), 3000);
    return () => {
      supabase.removeChannel(channel);
      clearInterval(interval);
    };
  }, [activeJobId, router]);

  const isGenerating = activeJob?.status === "queued" || activeJob?.status === "running";

  function handleRegenerate() {
    startTransition(async () => {
      const result = await generateKeyframe(sceneId, instruction || undefined);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setActiveJob({ id: result.data!.jobId, status: "queued", error: null });
      setInstruction("");
      toast.success("Keyframe queued.");
    });
  }

  function handleSetCurrent(keyframeId: string) {
    startTransition(async () => {
      const result = await confirmKeyframeVariation(keyframeId);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Keyframe set as current.");
      router.refresh();
    });
  }

  if (!currentKeyframe || !currentKeyframe.signedUrl) {
    return (
      <div className="rounded-lg border border-dashed border-[var(--border)] p-12 text-center">
        <p className="text-sm text-[var(--muted)]">
          No keyframe yet. Generate one from the storyboard tab first.
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <div className="space-y-4">
        <div className="relative aspect-video overflow-hidden rounded-lg border border-[var(--border)] bg-black">
          <Image
            src={currentKeyframe.signedUrl}
            alt="Current keyframe"
            fill
            sizes="900px"
            className="object-contain"
            unoptimized
          />
          {isGenerating && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm">
              <div className="flex items-center gap-2 rounded-full bg-black/80 px-3 py-1.5 text-xs font-medium text-white">
                <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-amber-400" />
                {activeJob?.status === "running" ? "Generating…" : "Queued…"}
              </div>
            </div>
          )}
        </div>

        <section className="space-y-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
          <Label htmlFor="instruction">Edit instruction (optional)</Label>
          <Input
            id="instruction"
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            placeholder="e.g. 'low angle, push him left of frame', 'add lens flare from sun', 'tighter on his face'"
            disabled={isGenerating}
          />
          <div className="flex items-center gap-2 pt-1">
            <Button onClick={handleRegenerate} disabled={isPending || isGenerating}>
              {isGenerating ? "Generating…" : "Regenerate"}
            </Button>
            <p className="text-xs text-[var(--muted)]">
              Each regeneration creates a new keyframe in history. Revert from the right panel.
            </p>
          </div>
          {activeJob?.status === "failed" && (
            <p className="text-xs text-red-400">Failed: {activeJob.error ?? "unknown error"}</p>
          )}
        </section>
      </div>

      <aside className="space-y-3">
        <h2 className="text-sm font-medium">History</h2>
        <p className="text-xs text-[var(--muted)]">
          {history.length} keyframe{history.length === 1 ? "" : "s"} · click any to view full size, or set as current.
        </p>
        <ul className="space-y-2">
          {history.map((kf) => (
            <li
              key={kf.id}
              className={`flex gap-2 rounded border p-2 text-xs ${kf.is_current ? "border-amber-500/50 bg-amber-500/5" : "border-[var(--border)]"}`}
            >
              {kf.signedUrl && (
                <button
                  type="button"
                  onClick={() => setLightboxUrl(kf.signedUrl)}
                  className="relative block h-12 w-20 shrink-0 overflow-hidden rounded bg-black"
                >
                  <Image
                    src={kf.signedUrl}
                    alt=""
                    fill
                    sizes="80px"
                    className="object-cover"
                    unoptimized
                  />
                </button>
              )}
              <div className="flex-1 space-y-0.5">
                <p className="font-medium">{kf.is_current ? "Current" : "Past version"}</p>
                <p className="text-[var(--muted)]">{new Date(kf.created_at).toLocaleString()}</p>
                {!kf.is_current && (
                  <button
                    type="button"
                    onClick={() => handleSetCurrent(kf.id)}
                    disabled={isPending}
                    className="text-amber-400 hover:underline"
                  >
                    Set as current
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      </aside>

      <Lightbox
        open={!!lightboxUrl}
        onClose={() => setLightboxUrl(null)}
        src={lightboxUrl}
        alt="Keyframe"
      />
    </div>
  );
}
