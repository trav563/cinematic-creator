"use client";

import { useState, useTransition, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Lightbox } from "@/components/ui/lightbox";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  uploadAssetReference,
  removeAssetReference,
  generateAssetVariations,
  confirmVariation,
  bindAssetToKlingElement,
} from "./actions";

interface Variation {
  id: string;
  image_url: string;
  signed_url: string | null;
  created_at: string;
}

interface RefImage {
  path: string;
  url: string | null;
}

interface ActiveJob {
  id: string;
  status: string;
  error: string | null;
}

interface Asset {
  id: string;
  name: string;
  role: string | null;
  base_description: string | null;
  confirmed_variation_id: string | null;
  kling_element_id: string | null;
  kling_element_status: string | null;
  refs: RefImage[];
  variations: Variation[];
  activeJob: ActiveJob | null;
  activeBindJob: ActiveJob | null;
}

export function AssetCard({ asset, projectId: _projectId }: { asset: Asset; projectId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [editInstruction, setEditInstruction] = useState("");
  const [activeJob, setActiveJob] = useState<ActiveJob | null>(asset.activeJob);
  const [activeBindJob, setActiveBindJob] = useState<ActiveJob | null>(asset.activeBindJob);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [lightboxRef, setLightboxRef] = useState<RefImage | null>(null);
  const lightboxVariation =
    lightboxIndex !== null ? asset.variations[lightboxIndex] ?? null : null;

  // Watch for job completion. Two strategies in parallel for resilience:
  //   (a) Supabase Realtime postgres_changes — instant, but requires the table to be in
  //       the supabase_realtime publication (migration 0003) and replication can be flaky.
  //   (b) Polling every 3s on router.refresh() — guaranteed to converge.
  // The polling stops as soon as the activeJob clears (which happens after refresh because
  // the server-side query only includes queued/running/failed jobs).
  const activeJobId = activeJob?.id ?? null;
  useEffect(() => {
    if (!activeJobId) return;
    const supabase = createSupabaseBrowserClient();
    const channel = supabase
      .channel(`char-job-${activeJobId}`)
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

  // When the server says the active job is gone (succeeded/cleared), drop our local
  // optimistic state so the UI reflects the truth.
  useEffect(() => {
    setActiveJob(asset.activeJob);
  }, [asset.activeJob]);

  useEffect(() => {
    setActiveBindJob(asset.activeBindJob);
  }, [asset.activeBindJob]);

  // Watch the Kling-bind job in realtime as well.
  const activeBindJobId = activeBindJob?.id ?? null;
  useEffect(() => {
    if (!activeBindJobId) return;
    const supabase = createSupabaseBrowserClient();
    const channel = supabase
      .channel(`bind-job-${activeBindJobId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "jobs", filter: `id=eq.${activeBindJobId}` },
        (payload) => {
          const next = payload.new as { status: string; error: string | null };
          setActiveBindJob({ id: activeBindJobId, status: next.status, error: next.error });
          if (next.status === "succeeded" || next.status === "failed") {
            router.refresh();
          }
        },
      )
      .subscribe();
    const interval = setInterval(() => router.refresh(), 5000);
    return () => {
      supabase.removeChannel(channel);
      clearInterval(interval);
    };
  }, [activeBindJobId, router]);

  function handleBindKlingElement() {
    startTransition(async () => {
      const result = await bindAssetToKlingElement(asset.id);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setActiveBindJob({ id: result.data!.jobId, status: "queued", error: null });
      toast.success("Binding to Kling — takes ~1-3 minutes.");
    });
  }

  function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const formData = new FormData();
    for (const f of Array.from(files)) formData.append("files", f);
    startTransition(async () => {
      const result = await uploadAssetReference(asset.id, formData);
      if (!result.ok) toast.error(result.error);
      else toast.success(`Uploaded ${result.data?.paths.length ?? 0} reference${result.data?.paths.length === 1 ? "" : "s"}`);
      if (fileInputRef.current) fileInputRef.current.value = "";
    });
  }

  function handleRemoveRef(path: string) {
    startTransition(async () => {
      const result = await removeAssetReference(asset.id, path);
      if (!result.ok) toast.error(result.error);
    });
  }

  function handleGenerate() {
    startTransition(async () => {
      const result = await generateAssetVariations(asset.id, editInstruction || undefined);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setActiveJob({ id: result.data!.jobId, status: "queued", error: null });
      setEditInstruction("");
    });
  }

  function handleConfirm(variationId: string) {
    startTransition(async () => {
      const result = await confirmVariation(asset.id, variationId);
      if (!result.ok) toast.error(result.error);
      else {
        toast.success(`${asset.name} locked`);
        setLightboxIndex(null);
      }
    });
  }

  const isGenerating = activeJob?.status === "queued" || activeJob?.status === "running";
  const isBinding = activeBindJob?.status === "queued" || activeBindJob?.status === "running";
  const isBound = !!asset.kling_element_id;

  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-5 space-y-4">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-medium">{asset.name}</h3>
          {asset.role && (
            <p className="text-xs text-[var(--muted)]">{asset.role}</p>
          )}
        </div>
        <div className="flex flex-col items-end gap-1">
          {asset.confirmed_variation_id && (
            <span className="rounded bg-emerald-500/10 px-1.5 py-0.5 text-xs text-emerald-400">
              ✓ Confirmed
            </span>
          )}
          {isBound && (
            <span
              className="rounded bg-amber-500/10 px-1.5 py-0.5 text-xs text-amber-400"
              title={`Kling element ID: ${asset.kling_element_id}`}
            >
              ✓ Bound (Kling)
            </span>
          )}
        </div>
      </header>

      {asset.base_description && (
        <p className="text-xs text-[var(--muted)]">{asset.base_description}</p>
      )}

      <section className="space-y-2">
        <Label>Reference images</Label>
        <div className="flex flex-wrap gap-2">
          {asset.refs.map((ref) =>
            ref.url ? (
              <div key={ref.path} className="group relative h-20 w-20 overflow-hidden rounded border border-[var(--border)]">
                <button
                  type="button"
                  onClick={() => setLightboxRef(ref)}
                  className="block h-full w-full"
                  aria-label="Enlarge reference"
                >
                  <Image src={ref.url} alt="" fill sizes="80px" className="object-cover" unoptimized />
                </button>
                <button
                  type="button"
                  onClick={() => handleRemoveRef(ref.path)}
                  className="absolute right-0.5 top-0.5 rounded bg-black/60 px-1.5 text-xs text-white opacity-0 transition-opacity group-hover:opacity-100"
                  disabled={isPending}
                >
                  ✕
                </button>
              </div>
            ) : null,
          )}
          <label className="flex h-20 w-20 cursor-pointer items-center justify-center rounded border border-dashed border-[var(--border)] text-2xl text-[var(--muted)] hover:bg-[var(--surface-2)]">
            +
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              onChange={handleUpload}
              className="hidden"
            />
          </label>
        </div>
      </section>

      <section className="space-y-2">
        <Label>Generate model sheet variations</Label>
        <Input
          value={editInstruction}
          onChange={(e) => setEditInstruction(e.target.value)}
          placeholder="Optional edit instruction (e.g. 'add yellow stripe across her shirt')"
          disabled={isGenerating}
        />
        <Button onClick={handleGenerate} disabled={isPending || isGenerating || asset.refs.length === 0}>
          {isGenerating
            ? `${activeJob?.status === "running" ? "Generating" : "Queued"}…`
            : asset.variations.length === 0
              ? "Generate 3 variations"
              : "Regenerate"}
        </Button>
        {activeJob?.status === "failed" && (
          <p className="text-xs text-red-400">Failed: {activeJob.error ?? "unknown error"}</p>
        )}
      </section>

      {asset.confirmed_variation_id && !isBound && (
        <section className="space-y-2 rounded border border-amber-500/30 bg-amber-500/5 p-3">
          <Label className="text-xs">Video consistency</Label>
          <p className="text-xs text-[var(--muted)]">
            Pre-register {asset.name} with Kling so multi-shot videos preserve identity across cuts. Takes ~1-3 minutes; only needed once per asset.
          </p>
          <Button
            onClick={handleBindKlingElement}
            disabled={isPending || isBinding}
            className="text-xs"
          >
            {isBinding
              ? `${activeBindJob?.status === "running" ? "Binding" : "Queued"}…`
              : "Bind for video consistency"}
          </Button>
          {activeBindJob?.status === "failed" && (
            <p className="text-xs text-red-400">
              Bind failed: {activeBindJob.error ?? "unknown error"}
            </p>
          )}
        </section>
      )}

      {asset.variations.length > 0 && (
        <section className="space-y-2">
          <Label>Variations ({asset.variations.length})</Label>
          <div className="grid grid-cols-3 gap-2">
            {asset.variations.map((v, idx) =>
              v.signed_url ? (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => setLightboxIndex(idx)}
                  className={`group relative aspect-video overflow-hidden rounded border-2 transition-colors ${
                    asset.confirmed_variation_id === v.id
                      ? "border-emerald-400"
                      : "border-[var(--border)] hover:border-white/40"
                  }`}
                >
                  <Image src={v.signed_url} alt="" fill sizes="200px" className="object-cover" unoptimized />
                  {asset.confirmed_variation_id === v.id && (
                    <span className="absolute bottom-1 right-1 rounded bg-emerald-500/80 px-1.5 py-0.5 text-xs text-white">
                      ✓
                    </span>
                  )}
                </button>
              ) : null,
            )}
          </div>
          <p className="text-xs text-[var(--muted)]">Click a variation to inspect it full-size, then confirm to lock as this asset&apos;s model sheet.</p>
        </section>
      )}

      <Lightbox
        open={lightboxIndex !== null}
        onClose={() => setLightboxIndex(null)}
        src={lightboxVariation?.signed_url ?? null}
        alt={`${asset.name} variation`}
        indexLabel={
          lightboxIndex !== null
            ? `${lightboxIndex + 1} of ${asset.variations.length}`
            : undefined
        }
        caption={
          asset.confirmed_variation_id === lightboxVariation?.id
            ? "✓ Currently confirmed"
            : "Use ← → to flip between variations. Confirm to lock as the canonical model sheet."
        }
        onPrev={
          lightboxIndex !== null && lightboxIndex > 0
            ? () => setLightboxIndex(lightboxIndex - 1)
            : undefined
        }
        onNext={
          lightboxIndex !== null && lightboxIndex < asset.variations.length - 1
            ? () => setLightboxIndex(lightboxIndex + 1)
            : undefined
        }
        footer={
          lightboxVariation && asset.confirmed_variation_id !== lightboxVariation.id ? (
            <Button onClick={() => handleConfirm(lightboxVariation.id)} disabled={isPending}>
              {isPending ? "Confirming…" : "Confirm this variation"}
            </Button>
          ) : null
        }
      />

      <Lightbox
        open={!!lightboxRef}
        onClose={() => setLightboxRef(null)}
        src={lightboxRef?.url ?? null}
        alt={`${asset.name} reference`}
      />
    </div>
  );
}
