"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Lightbox } from "@/components/ui/lightbox";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { generateKeyframe } from "./storyboard-actions";

interface ActiveJob {
  id: string;
  status: string;
  error: string | null;
}

interface Scene {
  id: string;
  scene_number: number;
  act: string | null;
  beat: string | null;
  camera: string | null;
  frame_role: string;
  anchor_direction: string | null;
  description: string;
  status: string;
  current_keyframe_id: string | null;
  keyframeUrl: string | null;
  activeJob: ActiveJob | null;
}

const FRAME_ROLE_COLORS: Record<string, string> = {
  SINGLE: "bg-blue-500/15 text-blue-300",
  "PAIR-START": "bg-amber-500/15 text-amber-300",
  "PAIR-END": "bg-pink-500/15 text-pink-300",
};

export function SceneCard({ scene, projectId }: { scene: Scene; projectId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [editInstruction, setEditInstruction] = useState("");
  const [showEdit, setShowEdit] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [activeJob, setActiveJob] = useState<ActiveJob | null>(scene.activeJob);

  useEffect(() => {
    setActiveJob(scene.activeJob);
  }, [scene.activeJob]);

  const activeJobId = activeJob?.id ?? null;
  useEffect(() => {
    if (!activeJobId) return;
    const supabase = createSupabaseBrowserClient();
    const channel = supabase
      .channel(`scene-job-${activeJobId}`)
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
    const interval = setInterval(() => router.refresh(), 3000);
    return () => {
      supabase.removeChannel(channel);
      clearInterval(interval);
    };
  }, [activeJobId, router]);

  function handleGenerate() {
    startTransition(async () => {
      const result = await generateKeyframe(scene.id, editInstruction || undefined);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setActiveJob({ id: result.data!.jobId, status: "queued", error: null });
      setEditInstruction("");
      setShowEdit(false);
    });
  }

  const isGenerating = activeJob?.status === "queued" || activeJob?.status === "running";

  return (
    <div className="flex flex-col rounded-lg border border-[var(--border)] bg-[var(--surface)] overflow-hidden">
      <button
        type="button"
        onClick={() => scene.keyframeUrl && setLightboxOpen(true)}
        className="relative aspect-video w-full bg-[var(--surface-2)]"
        disabled={!scene.keyframeUrl}
      >
        {scene.keyframeUrl ? (
          <Image
            src={scene.keyframeUrl}
            alt={`Scene ${scene.scene_number}`}
            fill
            sizes="400px"
            className="object-cover"
            unoptimized
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-xs text-[var(--muted)]">
            {isGenerating
              ? `${activeJob?.status === "running" ? "Generating" : "Queued"}…`
              : "No keyframe yet"}
          </div>
        )}
        {isGenerating && scene.keyframeUrl && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className="flex items-center gap-2 rounded-full bg-black/80 px-3 py-1.5 text-xs font-medium text-white">
              <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-amber-400" />
              {activeJob?.status === "running" ? "Generating…" : "Queued…"}
            </div>
          </div>
        )}
        <span className="absolute left-2 top-2 rounded bg-black/70 px-1.5 py-0.5 text-xs font-medium text-white">
          #{scene.scene_number}
        </span>
        <span
          className={`absolute right-2 top-2 rounded px-1.5 py-0.5 text-xs font-medium ${FRAME_ROLE_COLORS[scene.frame_role] ?? "bg-zinc-500/15 text-zinc-300"}`}
        >
          {scene.frame_role}
        </span>
      </button>

      <div className="flex flex-1 flex-col gap-2 p-3">
        <div className="flex items-center gap-2 text-xs text-[var(--muted)]">
          {scene.act && <span>{scene.act}</span>}
          {scene.beat && (
            <>
              <span>·</span>
              <span>{scene.beat}</span>
            </>
          )}
          {scene.camera && (
            <>
              <span>·</span>
              <span className="truncate">{scene.camera}</span>
            </>
          )}
        </div>
        <p className="text-sm text-foreground">{scene.description}</p>
        {scene.anchor_direction && (
          <p className="text-xs italic text-[var(--muted)]">↳ {scene.anchor_direction}</p>
        )}

        {activeJob?.status === "failed" && (
          <p className="text-xs text-red-400">Failed: {activeJob.error ?? "unknown error"}</p>
        )}

        <div className="mt-auto flex flex-wrap items-center gap-2 pt-2">
          <Button
            variant="secondary"
            onClick={() => setShowEdit((v) => !v)}
            disabled={isGenerating}
            className="text-xs"
          >
            {showEdit ? "Cancel" : scene.keyframeUrl ? "Regenerate" : "Generate keyframe"}
          </Button>
          {scene.keyframeUrl && (
            <Link
              href={`/projects/${projectId}/scenes/${scene.id}`}
              className="rounded-md border border-[var(--border)] px-3 py-1.5 text-xs hover:bg-[var(--surface-2)]"
            >
              Open
            </Link>
          )}
        </div>

        {showEdit && (
          <div className="space-y-2 pt-1">
            <Label htmlFor={`edit-${scene.id}`}>Optional edit instruction</Label>
            <Input
              id={`edit-${scene.id}`}
              value={editInstruction}
              onChange={(e) => setEditInstruction(e.target.value)}
              placeholder="e.g. 'low angle, push him left of frame'"
            />
            <Button onClick={handleGenerate} disabled={isPending}>
              {isPending ? "Queueing…" : "Generate"}
            </Button>
          </div>
        )}
      </div>

      <Lightbox
        open={lightboxOpen}
        onClose={() => setLightboxOpen(false)}
        src={scene.keyframeUrl}
        alt={`Scene ${scene.scene_number} keyframe`}
        caption={
          <span>
            Scene {scene.scene_number} · {scene.camera} · {scene.frame_role}
          </span>
        }
      />
    </div>
  );
}
