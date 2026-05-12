"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { generateAllAssetVariations } from "./actions";
import { AddAssetForm } from "./add-asset-form";

interface Props {
  projectId: string;
  totalAssets: number;
  /** Assets that have a confirmed variation (ready for use in scene generation). */
  confirmedAssets: number;
  /** Assets that have at least one variation generated (regardless of confirmation). */
  generatedAssets: number;
  /** Assets eligible for "Generate all" — have refs but no variations yet. */
  eligibleForBulk: number;
}

export function AssetsHeader({
  projectId,
  totalAssets,
  confirmedAssets,
  generatedAssets,
  eligibleForBulk,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleGenerateAll() {
    startTransition(async () => {
      const result = await generateAllAssetVariations(projectId);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(
        `Queued ${result.data!.count} asset${result.data!.count === 1 ? "" : "s"}. Each takes ~30s.`,
      );
      router.refresh();
    });
  }

  return (
    <div className="space-y-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <h2 className="text-base font-medium">Assets</h2>
          <p className="text-xs text-[var(--muted)]">
            {totalAssets} total · {generatedAssets} generated · <span className="text-foreground">{confirmedAssets} confirmed</span>
            {eligibleForBulk > 0 && (
              <> · <span className="text-amber-400">{eligibleForBulk} ready to generate</span></>
            )}
          </p>
          <p className="text-xs text-[var(--muted)]">
            Reusable references for scene generation. Upload refs, generate variations, confirm one — any scene that names the asset (verbatim snake_case) will use it.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {eligibleForBulk > 0 && (
            <Button onClick={handleGenerateAll} disabled={isPending}>
              {isPending
                ? "Queueing…"
                : `Generate all (${eligibleForBulk})`}
            </Button>
          )}
          <AddAssetForm projectId={projectId} />
        </div>
      </div>
    </div>
  );
}
