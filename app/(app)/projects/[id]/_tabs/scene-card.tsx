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
import { generateKeyframe, derivePairedFrame } from "./storyboard-actions";

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
  pair_anchor: string | null;
  anchor_direction: string | null;
  description: string;
  status: string;
  current_keyframe_id: string | null;
  startKeyframeUrl: string | null;
  endKeyframeUrl: string | null;
  /** Back-compat alias for SINGLE-only consumers */
  keyframeUrl: string | null;
  activeJob: ActiveJob | null;
}

const FRAME_ROLE_COLORS: Record<string, string> = {
  SINGLE: "bg-blue-500/15 text-blue-300",
  PAIR: "bg-violet-500/15 text-violet-300",
  "PAIR-START": "bg-amber-500/15 text-amber-300",
  "PAIR-END": "bg-pink-500/15 text-pink-300",
};

export function SceneCard({ scene, projectId }: { scene: Scene; projectId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [editInstruction, setEditInstruction] = useState("");
  const [showEdit, setShowEdit] = useState(false);
  const [lightboxFrame, setLightboxFrame] = useState<"start" | "end" | null>(null);
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

  const isGenerating = activeJob?.status === "queued" || activeJob?.status === "running";
  const isPair = scene.frame_role === "PAIR";
  const anchorSide = (scene.pair_anchor ?? "start") as "start" | "end";
  const derivedSide: "start" | "end" = anchorSide === "start" ? "end" : "start";
  const hasAnchor = isPair
    ? (anchorSide === "start" ? scene.startKeyframeUrl : scene.endKeyframeUrl)
    : scene.keyframeUrl;
  const hasDerived = isPair
    ? (derivedSide === "start" ? scene.startKeyframeUrl : scene.endKeyframeUrl)
    : null;

  function handleGenerateAnchor() {
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

  function handleDerivePaired() {
    startTransition(async () => {
      const result = await derivePairedFrame(scene.id);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setActiveJob({ id: result.data!.jobId, status: "queued", error: null });
      toast.success("Deriving paired frame — Claude composes the edit, Gemini renders it.");
    });
  }

  const lightboxUrl =
    lightboxFrame === "start"
      ? scene.startKeyframeUrl
      : lightboxFrame === "end"
        ? scene.endKeyframeUrl
        : null;

  return (
    <div className="flex flex-col rounded-lg border border-[var(--border)] bg-[var(--surface)] overflow-hidden">
      {/* Image area: PAIR scenes show start + end side-by-side; SINGLE shows one */}
      {isPair ? (
        <div className="relative grid grid-cols-2 gap-px bg-[var(--border)]">
          <FrameSlot
            label={anchorSide === "start" ? "Start (anchor)" : "Start (derived)"}
            url={scene.startKeyframeUrl}
            sceneNumber={scene.scene_number}
            isAnchor={anchorSide === "start"}
            onClick={() => scene.startKeyframeUrl && setLightboxFrame("start")}
            isGenerating={isGenerating}
            jobStatus={activeJob?.status ?? null}
            corner="left"
          />
          <FrameSlot
            label={anchorSide === "end" ? "End (anchor)" : "End (derived)"}
            url={scene.endKeyframeUrl}
            sceneNumber={scene.scene_number}
            isAnchor={anchorSide === "end"}
            onClick={() => scene.endKeyframeUrl && setLightboxFrame("end")}
            isGenerating={isGenerating}
            jobStatus={activeJob?.status ?? null}
            corner="right"
          />
          <span
            className={`pointer-events-none absolute right-2 top-2 z-10 rounded px-1.5 py-0.5 text-xs font-medium ${FRAME_ROLE_COLORS[scene.frame_role] ?? "bg-zinc-500/15 text-zinc-300"}`}
          >
            {scene.frame_role}
          </span>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => scene.keyframeUrl && setLightboxFrame("start")}
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
      )}

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
            {showEdit
              ? "Cancel"
              : hasAnchor
                ? isPair
                  ? `Regenerate ${anchorSide} (anchor)`
                  : "Regenerate"
                : isPair
                  ? `Generate ${anchorSide} (anchor)`
                  : "Generate keyframe"}
          </Button>
          {isPair && hasAnchor && (
            <Button
              onClick={handleDerivePaired}
              disabled={isPending || isGenerating}
              className="text-xs"
            >
              {hasDerived
                ? `Re-derive ${derivedSide}`
                : `Derive ${derivedSide} from anchor`}
            </Button>
          )}
          {hasAnchor && (
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
            <Button onClick={handleGenerateAnchor} disabled={isPending}>
              {isPending ? "Queueing…" : "Generate"}
            </Button>
          </div>
        )}
      </div>

      <Lightbox
        open={lightboxFrame !== null}
        onClose={() => setLightboxFrame(null)}
        src={lightboxUrl}
        alt={`Scene ${scene.scene_number} ${lightboxFrame ?? ""} keyframe`}
        caption={
          <span>
            Scene {scene.scene_number} · {scene.camera} · {scene.frame_role}
            {isPair && lightboxFrame ? ` · ${lightboxFrame} frame` : ""}
          </span>
        }
      />
    </div>
  );
}

interface FrameSlotProps {
  label: string;
  url: string | null;
  sceneNumber: number;
  isAnchor: boolean;
  onClick: () => void;
  isGenerating: boolean;
  jobStatus: string | null;
  corner: "left" | "right";
}

function FrameSlot({
  label,
  url,
  sceneNumber,
  isAnchor,
  onClick,
  isGenerating,
  jobStatus,
  corner,
}: FrameSlotProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!url}
      className="relative aspect-video w-full bg-[var(--surface-2)]"
    >
      {url ? (
        <Image
          src={url}
          alt={`Scene ${sceneNumber} ${label}`}
          fill
          sizes="200px"
          className="object-cover"
          unoptimized
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center px-2 text-center text-[10px] text-[var(--muted)]">
          {isGenerating ? `${jobStatus === "running" ? "Generating" : "Queued"}…` : `No ${label.toLowerCase()} yet`}
        </div>
      )}
      {isGenerating && url && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-amber-400" />
        </div>
      )}
      {corner === "left" && (
        <span className="absolute left-1.5 top-1.5 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-medium text-white">
          #{sceneNumber}
        </span>
      )}
      <span
        className={`absolute bottom-1.5 ${corner === "left" ? "left-1.5" : "right-1.5"} rounded bg-black/70 px-1.5 py-0.5 text-[10px] text-white`}
      >
        {isAnchor ? "★ " : ""}
        {label}
      </span>
    </button>
  );
}
