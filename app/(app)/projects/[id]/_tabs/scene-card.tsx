"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Lightbox } from "@/components/ui/lightbox";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  generateKeyframe,
  derivePairedFrame,
  uploadSceneReference,
  removeSceneReference,
  attachAssetToScene,
  detachAssetFromScene,
} from "./storyboard-actions";

interface ActiveJob {
  id: string;
  status: string;
  error: string | null;
}

interface SceneRef {
  path: string;
  url: string | null;
}

interface ProjectAsset {
  id: string;
  name: string;
  kind: string | null;
  role: string | null;
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
  refs: SceneRef[];
  attachedAssetIds: string[];
  startPrompt: string | null;
  endPrompt: string | null;
  activeJob: ActiveJob | null;
}

const FRAME_ROLE_COLORS: Record<string, string> = {
  SINGLE: "bg-blue-500/15 text-blue-300",
  PAIR: "bg-violet-500/15 text-violet-300",
  "PAIR-START": "bg-amber-500/15 text-amber-300",
  "PAIR-END": "bg-pink-500/15 text-pink-300",
};

export function SceneCard({
  scene,
  projectId,
  projectAssets,
}: {
  scene: Scene;
  projectId: string;
  projectAssets: ProjectAsset[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [editInstruction, setEditInstruction] = useState("");
  const [showEdit, setShowEdit] = useState(false);
  const [showRefs, setShowRefs] = useState(false);
  const [showAssets, setShowAssets] = useState(false);
  const [showPrompt, setShowPrompt] = useState<"start" | "end" | null>(null);
  const [assetPickerValue, setAssetPickerValue] = useState("");
  const [lightboxFrame, setLightboxFrame] = useState<"start" | "end" | null>(null);
  const [lightboxRef, setLightboxRef] = useState<SceneRef | null>(null);
  const [activeJob, setActiveJob] = useState<ActiveJob | null>(scene.activeJob);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Auto-detect which asset names appear in the description (matches the worker's regex).
  const matchedAssetIds = new Set<string>();
  const desc = scene.description.toLowerCase();
  for (const a of projectAssets) {
    const re = new RegExp(`(?:^|[^a-z0-9])${a.name.toLowerCase()}(?:[^a-z0-9]|$)`, "i");
    if (re.test(desc)) matchedAssetIds.add(a.id);
  }
  const explicitlyAttached = projectAssets.filter((a) =>
    scene.attachedAssetIds.includes(a.id),
  );
  const autoMatched = projectAssets.filter(
    (a) => matchedAssetIds.has(a.id) && !scene.attachedAssetIds.includes(a.id),
  );
  const availableToAttach = projectAssets.filter(
    (a) => !scene.attachedAssetIds.includes(a.id) && !matchedAssetIds.has(a.id),
  );

  useEffect(() => {
    setActiveJob(scene.activeJob);
  }, [scene.activeJob]);

  // Per-card Realtime keeps the local activeJob fresh; the page-level
  // RealtimeJobsRefresher handles router.refresh() for the whole tab.
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
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
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

  function handleUploadRef(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const formData = new FormData();
    for (const f of Array.from(files)) formData.append("files", f);
    startTransition(async () => {
      const result = await uploadSceneReference(scene.id, formData);
      if (!result.ok) toast.error(result.error);
      else
        toast.success(
          `Uploaded ${result.data?.paths.length ?? 0} scene reference${result.data?.paths.length === 1 ? "" : "s"}`,
        );
      if (fileInputRef.current) fileInputRef.current.value = "";
    });
  }

  function handleRemoveRef(path: string) {
    startTransition(async () => {
      const result = await removeSceneReference(scene.id, path);
      if (!result.ok) toast.error(result.error);
    });
  }

  function handleAttachAsset(assetId: string) {
    if (!assetId) return;
    startTransition(async () => {
      const result = await attachAssetToScene(scene.id, assetId);
      if (!result.ok) toast.error(result.error);
      setAssetPickerValue("");
    });
  }

  function handleDetachAsset(assetId: string) {
    startTransition(async () => {
      const result = await detachAssetFromScene(scene.id, assetId);
      if (!result.ok) toast.error(result.error);
    });
  }

  async function copyPrompt(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Prompt copied to clipboard");
    } catch {
      toast.error("Couldn't copy — select the text manually");
    }
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

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-1">
          <button
            type="button"
            onClick={() => setShowRefs((v) => !v)}
            className="text-xs text-[var(--muted)] underline-offset-2 hover:text-foreground hover:underline"
          >
            {scene.refs.length > 0
              ? `Scene refs (${scene.refs.length})${showRefs ? " ▴" : " ▾"}`
              : showRefs
                ? "+ Add scene reference ▴"
                : "+ Add scene reference"}
          </button>
          <button
            type="button"
            onClick={() => setShowAssets((v) => !v)}
            className="text-xs text-[var(--muted)] underline-offset-2 hover:text-foreground hover:underline"
          >
            Assets ({explicitlyAttached.length + autoMatched.length})
            {showAssets ? " ▴" : " ▾"}
          </button>
          {(scene.startPrompt || scene.endPrompt) && (
            <button
              type="button"
              onClick={() =>
                setShowPrompt((cur) =>
                  cur ? null : scene.endPrompt && !scene.startPrompt ? "end" : "start",
                )
              }
              className="text-xs text-[var(--muted)] underline-offset-2 hover:text-foreground hover:underline"
            >
              {showPrompt ? "Hide prompt ▴" : "View prompt ▾"}
            </button>
          )}
        </div>

        {showRefs && (
          <div className="space-y-2 rounded border border-dashed border-[var(--border)] p-2">
            <p className="text-[11px] text-[var(--muted)]">
              Scene-specific reference images (e.g. an actual screenshot of the location). The
              keyframe worker prepends these to the model input as the canonical composition /
              lighting reference for THIS shot.
            </p>
            <div className="flex flex-wrap gap-2">
              {scene.refs.map((ref) =>
                ref.url ? (
                  <div
                    key={ref.path}
                    className="group relative h-16 w-16 overflow-hidden rounded border border-[var(--border)]"
                  >
                    <button
                      type="button"
                      onClick={() => setLightboxRef(ref)}
                      className="block h-full w-full"
                      aria-label="Enlarge scene reference"
                    >
                      <Image
                        src={ref.url}
                        alt=""
                        fill
                        sizes="64px"
                        className="object-cover"
                        unoptimized
                      />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRemoveRef(ref.path)}
                      className="absolute right-0.5 top-0.5 rounded bg-black/60 px-1.5 text-[10px] text-white opacity-0 transition-opacity group-hover:opacity-100"
                      disabled={isPending}
                    >
                      ✕
                    </button>
                  </div>
                ) : null,
              )}
              <label className="flex h-16 w-16 cursor-pointer items-center justify-center rounded border border-dashed border-[var(--border)] text-xl text-[var(--muted)] hover:bg-[var(--surface-2)]">
                +
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handleUploadRef}
                  className="hidden"
                />
              </label>
            </div>
          </div>
        )}

        {showAssets && (
          <div className="space-y-2 rounded border border-dashed border-[var(--border)] p-2">
            <p className="text-[11px] text-[var(--muted)]">
              Assets attached to this scene. Auto-matched ones come from snake_case names in the
              description; explicitly-added ones get included even if they aren't named.
            </p>
            <div className="flex flex-wrap gap-1.5">
              {autoMatched.map((a) => (
                <span
                  key={a.id}
                  className="rounded bg-[var(--surface-2)] px-2 py-0.5 text-[11px] text-[var(--muted)]"
                  title="Auto-matched from the scene description"
                >
                  {a.name} <span className="opacity-60">· auto</span>
                </span>
              ))}
              {explicitlyAttached.map((a) => (
                <span
                  key={a.id}
                  className="group inline-flex items-center gap-1 rounded bg-amber-500/10 px-2 py-0.5 text-[11px] text-amber-300"
                >
                  {a.name}
                  <button
                    type="button"
                    onClick={() => handleDetachAsset(a.id)}
                    disabled={isPending}
                    className="text-amber-400 opacity-0 transition-opacity hover:text-white group-hover:opacity-100"
                    aria-label={`Detach ${a.name}`}
                  >
                    ✕
                  </button>
                </span>
              ))}
              {autoMatched.length + explicitlyAttached.length === 0 && (
                <span className="text-[11px] text-[var(--muted)]">No assets attached.</span>
              )}
            </div>
            {availableToAttach.length > 0 && (
              <div className="flex items-center gap-2 pt-1">
                <select
                  value={assetPickerValue}
                  onChange={(e) => {
                    const v = e.target.value;
                    setAssetPickerValue(v);
                    if (v) handleAttachAsset(v);
                  }}
                  disabled={isPending}
                  className="flex-1 rounded border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-xs"
                >
                  <option value="">+ Attach asset…</option>
                  {availableToAttach.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                      {a.kind ? ` (${a.kind})` : ""}
                      {a.role ? ` — ${a.role}` : ""}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {projectAssets.length === 0 && (
              <p className="text-[11px] text-[var(--muted)]">
                No assets in this project yet — add some from the Assets tab.
              </p>
            )}
          </div>
        )}

        {showPrompt && (
          <div className="space-y-2 rounded border border-dashed border-[var(--border)] p-2">
            {isPair && scene.startPrompt && scene.endPrompt && (
              <div className="flex gap-1 rounded border border-[var(--border)] p-0.5 text-[11px]">
                <button
                  type="button"
                  onClick={() => setShowPrompt("start")}
                  className={`flex-1 rounded px-2 py-1 ${
                    showPrompt === "start"
                      ? "bg-[var(--surface-2)] text-foreground"
                      : "text-[var(--muted)] hover:text-foreground"
                  }`}
                >
                  Start frame
                </button>
                <button
                  type="button"
                  onClick={() => setShowPrompt("end")}
                  className={`flex-1 rounded px-2 py-1 ${
                    showPrompt === "end"
                      ? "bg-[var(--surface-2)] text-foreground"
                      : "text-[var(--muted)] hover:text-foreground"
                  }`}
                >
                  End frame
                </button>
              </div>
            )}
            <p className="text-[11px] text-[var(--muted)]">
              Read-only — to change the prompt, edit the scene description / attached assets / refs
              and regenerate.
            </p>
            <textarea
              readOnly
              value={
                (showPrompt === "end" ? scene.endPrompt : scene.startPrompt) ??
                "(no prompt recorded)"
              }
              rows={10}
              className="w-full resize-y rounded border border-[var(--border)] bg-[var(--surface-2)] p-2 font-mono text-[11px] leading-relaxed text-foreground"
              onClick={(e) => (e.target as HTMLTextAreaElement).select()}
            />
            <Button
              variant="secondary"
              onClick={() =>
                copyPrompt(
                  (showPrompt === "end" ? scene.endPrompt : scene.startPrompt) ?? "",
                )
              }
              className="text-xs"
              disabled={!(showPrompt === "end" ? scene.endPrompt : scene.startPrompt)}
            >
              Copy prompt
            </Button>
          </div>
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

      <Lightbox
        open={!!lightboxRef}
        onClose={() => setLightboxRef(null)}
        src={lightboxRef?.url ?? null}
        alt={`Scene ${scene.scene_number} reference`}
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
