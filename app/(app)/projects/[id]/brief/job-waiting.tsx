"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export function JobWaiting({
  projectId,
  jobId,
  initialStatus,
  initialError,
}: {
  projectId: string;
  jobId: string;
  initialStatus: string;
  initialError: string | null;
}) {
  const router = useRouter();
  const [status, setStatus] = useState(initialStatus);
  const [error, setError] = useState(initialError);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    const channel = supabase
      .channel(`job-${jobId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "jobs", filter: `id=eq.${jobId}` },
        (payload) => {
          const next = payload.new as { status: string; error: string | null };
          setStatus(next.status);
          setError(next.error);
          if (next.status === "succeeded") {
            // Refresh the server component to show the brief
            router.refresh();
          }
        },
      )
      .subscribe();

    // Polling fallback in case realtime drops
    const interval = setInterval(() => {
      router.refresh();
    }, 5000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(interval);
    };
  }, [jobId, router]);

  if (status === "failed") {
    return (
      <div className="space-y-3 rounded-lg border border-red-500/30 bg-red-500/5 p-6">
        <h2 className="text-base font-semibold text-red-300">parse_script failed</h2>
        <p className="text-sm text-red-200/80">
          {error ?? "Unknown error. Check the Inngest dev UI for details."}
        </p>
        <p className="text-xs text-[var(--muted)]">
          Project ID: <code>{projectId}</code> · Job ID: <code>{jobId}</code>
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-6">
      <div className="flex items-center gap-3">
        <div className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
        <h2 className="text-base font-medium">
          {status === "queued" ? "Queued…" : "Parsing your script…"}
        </h2>
      </div>
      <p className="text-sm text-[var(--muted)]">
        Opus 4.7 is extracting the brief, character list, and scene outline. Usually 30–90 seconds. You
        can close the tab — we&apos;ll save your progress and you can return here later.
      </p>
    </div>
  );
}
