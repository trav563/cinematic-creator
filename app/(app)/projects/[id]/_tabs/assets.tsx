import { createSupabaseServerClient } from "@/lib/supabase/server";
import { signedUrl } from "@/lib/storage";
import { AssetCard } from "./asset-card";
import { AddAssetForm } from "./add-asset-form";
import { AssetsHeader } from "./assets-header";
import { RealtimeJobsRefresher } from "./realtime-jobs-refresher";

const KIND_LABELS: Record<string, string> = {
  character: "Characters",
  location: "Locations",
  object: "Objects & props",
};

const KIND_ORDER = ["character", "location", "object"];

export async function AssetsTab({ projectId }: { projectId: string }) {
  const supabase = await createSupabaseServerClient();

  // Single bulk query for assets
  const { data: assets } = await supabase
    .from("assets")
    .select(
      "id, name, kind, role, base_description, reference_image_urls, confirmed_variation_id, kling_element_id, kling_element_status",
    )
    .eq("project_id", projectId)
    .order("kind")
    .order("created_at");

  if (!assets || assets.length === 0) {
    return (
      <div className="space-y-4">
        <RealtimeJobsRefresher projectId={projectId} />
        <div className="rounded-lg border border-dashed border-[var(--border)] p-12 text-center">
          <p className="text-sm text-[var(--muted)]">
            No assets yet. Characters, locations, and objects are extracted from your script during intake — or add them manually below.
          </p>
        </div>
        <AddAssetForm projectId={projectId} />
      </div>
    );
  }

  // BATCHED queries — instead of N+1 (one per asset), do 3 total queries that pull
  // everything we need, then group in JS. This was the slow page load: 20 assets ×
  // 3 sequential queries = 60+ DB round-trips.
  const assetIds = assets.map((a) => a.id);
  const [
    { data: allVariations },
    { data: activeImageJobs },
    { data: activeBindJobs },
  ] = await Promise.all([
    // All variations for any asset in this project
    supabase
      .from("asset_variations")
      .select("id, asset_id, image_url, prompt_used, created_at")
      .in("asset_id", assetIds)
      .order("created_at", { ascending: false }),
    // All image-generate jobs for this project that are queued/running/failed.
    // We filter to assetId-bearing jobs in JS since contains() is per-row.
    supabase
      .from("jobs")
      .select("id, status, error, request, created_at")
      .eq("type", "image_generate")
      .eq("project_id", projectId)
      .in("status", ["queued", "running", "failed"])
      .order("created_at", { ascending: false }),
    // All Kling-bind jobs in queued/running/failed states
    supabase
      .from("jobs")
      .select("id, status, error, request, created_at")
      .eq("type", "kling_bind_element")
      .eq("project_id", projectId)
      .in("status", ["queued", "running", "failed"])
      .order("created_at", { ascending: false }),
  ]);

  // Group variations by asset_id
  const variationsByAsset = new Map<string, typeof allVariations>();
  for (const v of allVariations ?? []) {
    if (!variationsByAsset.has(v.asset_id)) variationsByAsset.set(v.asset_id, []);
    variationsByAsset.get(v.asset_id)!.push(v);
  }

  // Group jobs by assetId (extracted from request jsonb). Take the most recent per asset.
  function indexJobsByAsset(jobs: typeof activeImageJobs) {
    const map = new Map<string, { id: string; status: string; error: string | null }>();
    for (const j of jobs ?? []) {
      const req = j.request as { assetId?: string } | null;
      const aid = req?.assetId;
      if (!aid) continue;
      // jobs are pre-sorted desc by created_at, so first one wins
      if (!map.has(aid)) map.set(aid, { id: j.id, status: j.status, error: j.error });
    }
    return map;
  }
  const imageJobByAsset = indexJobsByAsset(activeImageJobs);
  const bindJobByAsset = indexJobsByAsset(activeBindJobs);

  // Sign URLs in parallel — collect every path we need first, then dedupe + batch.
  const allPaths = new Set<string>();
  for (const a of assets) {
    for (const p of (a.reference_image_urls ?? []) as string[]) allPaths.add(p);
  }
  for (const v of allVariations ?? []) allPaths.add(v.image_url);

  const pathsArr = Array.from(allPaths);
  const signedUrlPromises = pathsArr.map((p) => signedUrl(p));
  const signedUrls = await Promise.all(signedUrlPromises);
  const urlByPath = new Map<string, string | null>();
  pathsArr.forEach((p, i) => urlByPath.set(p, signedUrls[i]));

  // Stitch enriched rows together
  const enriched = assets.map((a) => {
    const refs = ((a.reference_image_urls ?? []) as string[]).map((path) => ({
      path,
      url: urlByPath.get(path) ?? null,
    }));
    const variations = (variationsByAsset.get(a.id) ?? []).map((v) => ({
      ...v,
      signed_url: urlByPath.get(v.image_url) ?? null,
    }));
    return {
      ...a,
      kind: (a.kind ?? "character") as "character" | "location" | "object",
      refs,
      variations,
      activeJob: imageJobByAsset.get(a.id) ?? null,
      activeBindJob: bindJobByAsset.get(a.id) ?? null,
    };
  });

  // Group by kind for display
  const grouped = new Map<string, typeof enriched>();
  for (const asset of enriched) {
    const key = asset.kind;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(asset);
  }

  // Counter math for the header
  const totalAssets = enriched.length;
  const confirmedAssets = enriched.filter((a) => a.confirmed_variation_id).length;
  const generatedAssets = enriched.filter((a) => a.variations.length > 0).length;
  // Matches the eligibility filter in generateAllAssetVariations: refs uploaded AND
  // not yet confirmed. Confirmed assets stay untouched on bulk runs.
  const eligibleForBulk = enriched.filter(
    (a) => a.refs.length > 0 && !a.confirmed_variation_id,
  ).length;

  return (
    <div className="space-y-8">
      <RealtimeJobsRefresher projectId={projectId} />
      <AssetsHeader
        projectId={projectId}
        totalAssets={totalAssets}
        confirmedAssets={confirmedAssets}
        generatedAssets={generatedAssets}
        eligibleForBulk={eligibleForBulk}
      />

      {KIND_ORDER.filter((k) => grouped.has(k)).map((kind) => (
        <section key={kind} className="space-y-3">
          <h2 className="text-base font-medium">
            {KIND_LABELS[kind] ?? kind}{" "}
            <span className="text-xs font-normal text-[var(--muted)]">
              ({grouped.get(kind)!.length})
            </span>
          </h2>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            {grouped.get(kind)!.map((a) => (
              <AssetCard key={a.id} asset={a} projectId={projectId} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
