"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

/**
 * Single page-level realtime listener for all job updates on a project. Triggers a
 * debounced router.refresh() so the page re-fetches RSC data when workers complete.
 *
 * Why not per-card polling: with N active jobs and per-card setInterval(refresh, 3s),
 * you get N full RSC re-fetches every 3 seconds — easy to overwhelm the server with
 * 10+ concurrent jobs. This component centralizes that to ONE refresh per debounce
 * window (1.5s) regardless of how many job rows update.
 *
 * Why include polling fallback: Supabase Realtime requires the table to be in the
 * supabase_realtime publication AND can drop the subscription silently. The 8-second
 * fallback ensures eventual consistency even if Realtime is misbehaving.
 */
export function RealtimeJobsRefresher({ projectId }: { projectId: string }) {
  const router = useRouter();
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    function scheduleRefresh() {
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      refreshTimer.current = setTimeout(() => {
        router.refresh();
      }, 1500);
    }

    const supabase = createSupabaseBrowserClient();
    const channel = supabase
      .channel(`project-jobs-${projectId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "jobs",
          filter: `project_id=eq.${projectId}`,
        },
        () => scheduleRefresh(),
      )
      .subscribe();

    // Slow polling fallback. Only fires every 8s so the cost is bounded even if
    // Realtime works fine alongside it (worst case: 1 refresh per 8s instead of 0).
    const fallback = setInterval(() => scheduleRefresh(), 8000);

    return () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      clearInterval(fallback);
      supabase.removeChannel(channel);
    };
  }, [projectId, router]);

  return null;
}
