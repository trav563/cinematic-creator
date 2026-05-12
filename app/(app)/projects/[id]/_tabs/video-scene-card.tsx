"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  generateVideo,
  saveSceneMotionPrompt,
  regenerateSceneMotionPrompt,
} from "./video-actions";
import {
  estimateUnits,
  unitsToUsd,
  type KlingModel,
  type KlingMode,
  type KlingDuration,
  type MultiPromptShot,
} from "@/lib/providers/kling";

interface ActiveJob {
  id: string;
  status: string;
  error: string | null;
}

interface VideoMeta {
  duration_s: number | null;
  prompt_used: string | null;
  provider: string | null;
}

interface Scene {
  id: string;
  scene_number: number;
  description: string;
  camera: string | null;
  frame_role: string;
  motion_prompt: string | null;
  keyframeUrl: string | null;
  videoUrl: string | null;
  videoMeta: VideoMeta | null;
  activeJob: ActiveJob | null;
}

const MODEL_OPTIONS: { value: KlingModel; label: string }[] = [
  { value: "kling-v2-6", label: "Kling 2.6" },
  { value: "kling-v3", label: "Kling 3.0" },
];

// Allowed durations per model. Kling 2.6 only does 5/10; Kling 3.0 does 3-15.
const KLING_V3_DURATIONS: KlingDuration[] = ["3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14", "15"];
const KLING_V2_DURATIONS: KlingDuration[] = ["5", "10"];

export function VideoSceneCard({ scene, projectId: _projectId }: { scene: Scene; projectId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [model, setModel] = useState<KlingModel>("kling-v2-6");
  const [mode, setMode] = useState<KlingMode>("pro");
  const [duration, setDuration] = useState<KlingDuration>("5");
  const [prompt, setPrompt] = useState(scene.motion_prompt ?? "");
  const [savedPrompt, setSavedPrompt] = useState(scene.motion_prompt ?? "");
  const [sound, setSound] = useState<"on" | "off">("off");
  const [multiShot, setMultiShot] = useState(false);
  const [storyboards, setStoryboards] = useState<MultiPromptShot[]>([
    { index: 1, prompt: "", duration: "5" },
  ]);
  const [activeJob, setActiveJob] = useState<ActiveJob | null>(scene.activeJob);

  useEffect(() => {
    setActiveJob(scene.activeJob);
  }, [scene.activeJob]);

  // Sync local prompt state when the server pushes a fresh motion_prompt (e.g. after
  // the bulk auto-generate job finishes and the page revalidates). Don't clobber
  // unsaved local edits — only adopt the server value if local and saved are in sync.
  useEffect(() => {
    if (prompt === savedPrompt) {
      const next = scene.motion_prompt ?? "";
      setPrompt(next);
      setSavedPrompt(next);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene.motion_prompt]);

  function handlePromptBlur() {
    if (prompt === savedPrompt) return;
    const next = prompt;
    setSavedPrompt(next);
    // Fire-and-forget save; toast on failure only.
    saveSceneMotionPrompt(scene.id, next).then((res) => {
      if (!res.ok) toast.error(`Couldn't save prompt: ${res.error}`);
    });
  }

  const [isRegenerating, setIsRegenerating] = useState(false);
  function handleRegeneratePrompt() {
    setIsRegenerating(true);
    regenerateSceneMotionPrompt(scene.id)
      .then((res) => {
        if (!res.ok) {
          toast.error(res.error);
          return;
        }
        const next = res.data!.motionPrompt;
        setPrompt(next);
        setSavedPrompt(next);
        toast.success("Prompt re-rolled");
      })
      .finally(() => setIsRegenerating(false));
  }

  // Switching to Kling 2.6 forces multi-shot off and clamps duration/mode.
  useEffect(() => {
    if (model === "kling-v2-6") {
      if (multiShot) setMultiShot(false);
      if (mode === "4k") setMode("pro");
      if (duration !== "5" && duration !== "10") setDuration("5");
      // Std + audio on Kling 2.6 is invalid — flip audio off if user lands here.
      if (mode === "std" && sound === "on") setSound("off");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model, mode]);

  // Per-card Realtime keeps the local activeJob state fresh; the page-level
  // RealtimeJobsRefresher (mounted in video.tsx) handles router.refresh() centrally.
  const activeJobId = activeJob?.id ?? null;
  useEffect(() => {
    if (!activeJobId) return;
    const supabase = createSupabaseBrowserClient();
    const channel = supabase
      .channel(`video-job-${activeJobId}`)
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
  const { units } = estimateUnits({
    model,
    mode,
    durationSeconds: parseInt(duration, 10),
    sound,
  });
  const costUsd = unitsToUsd(units);

  const audioDisabledReason =
    model === "kling-v2-6" && mode === "std"
      ? "Kling 2.6 Standard is no-audio only. Switch to Pro (1080p) to enable audio."
      : null;
  const fourKDisabled = model === "kling-v2-6";
  const multiShotDisabled = model !== "kling-v3";

  // Storyboard duration validation for multi-shot.
  const storyboardSum = useMemo(
    () => storyboards.reduce((acc, s) => acc + (parseInt(s.duration, 10) || 0), 0),
    [storyboards],
  );
  const storyboardValid = !multiShot || storyboardSum === parseInt(duration, 10);

  function updateStoryboard(idx: number, patch: Partial<MultiPromptShot>) {
    setStoryboards((prev) => prev.map((s, i) => (i === idx ? { ...s, ...patch } : s)));
  }

  function addStoryboard() {
    if (storyboards.length >= 6) return;
    setStoryboards((prev) => [
      ...prev,
      { index: prev.length + 1, prompt: "", duration: "1" },
    ]);
  }

  function removeStoryboard(idx: number) {
    setStoryboards((prev) =>
      prev.filter((_, i) => i !== idx).map((s, i) => ({ ...s, index: i + 1 })),
    );
  }

  function handleGenerate() {
    if (multiShot) {
      if (storyboards.some((s) => !s.prompt.trim())) {
        toast.error("Every storyboard needs a prompt.");
        return;
      }
      if (!storyboardValid) {
        toast.error(
          `Storyboard durations must sum to ${duration}s (currently ${storyboardSum}s).`,
        );
        return;
      }
    } else if (!prompt.trim()) {
      toast.error("Describe the motion you want.");
      return;
    }

    startTransition(async () => {
      const result = await generateVideo(scene.id, {
        model,
        mode,
        duration,
        prompt,
        sound,
        multiShot: multiShot || undefined,
        multiPrompt: multiShot ? storyboards : undefined,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setActiveJob({ id: result.data!.jobId, status: "queued", error: null });
      toast.success(`Queued. Kling takes ~3-8 min for ${duration}s clips.`);
    });
  }

  const allowedDurations = model === "kling-v3" ? KLING_V3_DURATIONS : KLING_V2_DURATIONS;

  return (
    <div className="flex flex-col rounded-lg border border-[var(--border)] bg-[var(--surface)] overflow-hidden">
      <div className="relative aspect-video w-full bg-[var(--surface-2)]">
        {scene.videoUrl ? (
          <video
            src={scene.videoUrl}
            controls
            className="h-full w-full object-cover"
            poster={scene.keyframeUrl ?? undefined}
          />
        ) : scene.keyframeUrl ? (
          <Image
            src={scene.keyframeUrl}
            alt={`Scene ${scene.scene_number}`}
            fill
            sizes="500px"
            className="object-cover"
            unoptimized
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-xs text-[var(--muted)]">
            No keyframe
          </div>
        )}
        <span className="absolute left-2 top-2 rounded bg-black/70 px-1.5 py-0.5 text-xs font-medium text-white">
          #{scene.scene_number}
        </span>
        {isGenerating && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className="flex items-center gap-2 rounded-full bg-black/80 px-3 py-1.5 text-xs font-medium text-white">
              <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-amber-400" />
              {activeJob?.status === "running" ? "Generating video…" : "Queued…"}
            </div>
          </div>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-3 p-3">
        <p className="text-sm text-foreground">{scene.description}</p>
        {scene.camera && (
          <p className="text-xs text-[var(--muted)]">Camera: {scene.camera}</p>
        )}

        {scene.videoUrl && scene.videoMeta && (
          <div className="rounded border border-[var(--border)] p-2 text-xs text-[var(--muted)]">
            <p>
              {scene.videoMeta.provider} · {scene.videoMeta.duration_s}s
            </p>
            {scene.videoMeta.prompt_used && (
              <p className="mt-1 italic">&ldquo;{scene.videoMeta.prompt_used}&rdquo;</p>
            )}
            <a
              href={scene.videoUrl}
              download={`scene-${scene.scene_number}.mp4`}
              className="mt-2 inline-block text-amber-400 hover:underline"
            >
              Download MP4
            </a>
          </div>
        )}

        {activeJob?.status === "failed" && (
          <p className="text-xs text-red-400">Failed: {activeJob.error ?? "unknown error"}</p>
        )}

        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-2">
            <div>
              <Label htmlFor={`model-${scene.id}`} className="text-xs">Model</Label>
              <select
                id={`model-${scene.id}`}
                value={model}
                onChange={(e) => setModel(e.target.value as KlingModel)}
                disabled={isGenerating}
                className="w-full rounded border border-[var(--border)] bg-[var(--surface-2)] p-1.5 text-xs"
              >
                {MODEL_OPTIONS.map((m) => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor={`mode-${scene.id}`} className="text-xs">Resolution</Label>
              <select
                id={`mode-${scene.id}`}
                value={mode}
                onChange={(e) => setMode(e.target.value as KlingMode)}
                disabled={isGenerating}
                className="w-full rounded border border-[var(--border)] bg-[var(--surface-2)] p-1.5 text-xs"
              >
                <option value="std">720p (Std)</option>
                <option value="pro">1080p (Pro)</option>
                <option value="4k" disabled={fourKDisabled}>4K{fourKDisabled ? " (3.0 only)" : ""}</option>
              </select>
            </div>
            <div>
              <Label htmlFor={`duration-${scene.id}`} className="text-xs">Duration</Label>
              <select
                id={`duration-${scene.id}`}
                value={duration}
                onChange={(e) => setDuration(e.target.value as KlingDuration)}
                disabled={isGenerating}
                className="w-full rounded border border-[var(--border)] bg-[var(--surface-2)] p-1.5 text-xs"
              >
                {allowedDurations.map((d) => (
                  <option key={d} value={d}>{d}s</option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 text-xs">
            <label className="flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={sound === "on"}
                onChange={(e) => setSound(e.target.checked ? "on" : "off")}
                disabled={isGenerating || !!audioDisabledReason}
              />
              <span className={audioDisabledReason ? "text-[var(--muted)]" : ""}>
                Native audio
              </span>
            </label>
            {audioDisabledReason && (
              <span className="text-[10px] text-[var(--muted)]" title={audioDisabledReason}>
                ⓘ {audioDisabledReason.split(".")[0]}
              </span>
            )}

            <label className="flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={multiShot}
                onChange={(e) => setMultiShot(e.target.checked)}
                disabled={isGenerating || multiShotDisabled}
              />
              <span className={multiShotDisabled ? "text-[var(--muted)]" : ""}>
                Multi-shot
              </span>
            </label>
            {multiShotDisabled && (
              <span className="text-[10px] text-[var(--muted)]">(Kling 3.0 only)</span>
            )}
          </div>

          {!multiShot && (
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <Label htmlFor={`prompt-${scene.id}`}>Motion prompt</Label>
                <div className="flex items-center gap-2">
                  {prompt !== savedPrompt && (
                    <span className="text-[10px] text-amber-400">Unsaved</span>
                  )}
                  <button
                    type="button"
                    onClick={handleRegeneratePrompt}
                    disabled={isRegenerating || isGenerating}
                    className="text-[10px] text-[var(--muted)] hover:text-foreground disabled:opacity-50"
                    title="Re-roll this prompt with Claude (uses full story context)"
                  >
                    {isRegenerating ? "Re-rolling…" : "↻ Re-roll"}
                  </button>
                </div>
              </div>
              <Input
                id={`prompt-${scene.id}`}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onBlur={handlePromptBlur}
                placeholder="Auto-generate from the header, or write one: 'slow push-in, sword catches sunlight, cape ripples in wind'"
                disabled={isGenerating || !scene.keyframeUrl}
              />
            </div>
          )}

          {multiShot && (
            <div className="space-y-2 rounded border border-[var(--border)] p-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs">Storyboards (1–6 shots)</Label>
                <span
                  className={`text-[10px] ${storyboardValid ? "text-[var(--muted)]" : "text-red-400"}`}
                >
                  Sum: {storyboardSum}s / {duration}s
                </span>
              </div>
              {storyboards.map((s, i) => (
                <div key={i} className="flex gap-2">
                  <span className="w-5 pt-1 text-xs text-[var(--muted)]">{s.index}.</span>
                  <Input
                    value={s.prompt}
                    onChange={(e) => updateStoryboard(i, { prompt: e.target.value })}
                    placeholder="Shot prompt…"
                    disabled={isGenerating}
                    className="flex-1 text-xs"
                  />
                  <input
                    type="number"
                    min={1}
                    max={parseInt(duration, 10)}
                    value={s.duration}
                    onChange={(e) => updateStoryboard(i, { duration: e.target.value })}
                    disabled={isGenerating}
                    className="w-14 rounded border border-[var(--border)] bg-[var(--surface-2)] p-1 text-xs"
                  />
                  <button
                    type="button"
                    onClick={() => removeStoryboard(i)}
                    disabled={isGenerating || storyboards.length === 1}
                    className="text-xs text-[var(--muted)] hover:text-red-400 disabled:opacity-30"
                  >
                    ✕
                  </button>
                </div>
              ))}
              <Button
                variant="secondary"
                onClick={addStoryboard}
                disabled={isGenerating || storyboards.length >= 6}
                className="text-xs"
              >
                + Add shot
              </Button>
            </div>
          )}

          <div className="flex items-center justify-between gap-2 pt-1">
            <p className="text-xs text-[var(--muted)]">
              Cost: <span className="text-foreground">{units} units</span>
              <span className="text-[var(--muted)]"> (~${costUsd.toFixed(2)})</span>
            </p>
            <Button
              onClick={handleGenerate}
              disabled={isPending || isGenerating || !scene.keyframeUrl}
              className="text-xs"
            >
              {isGenerating ? "Generating…" : scene.videoUrl ? "Regenerate" : "Generate video"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
