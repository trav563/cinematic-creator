import { createSupabaseServerClient } from "@/lib/supabase/server";
import { signedUrl } from "@/lib/storage";
import { AssetCard } from "./asset-card";
import { AddAssetForm } from "./add-asset-form";
import { AssetsHeader } from "./assets-header";

const KIND_LABELS: Record<string, string> = {
  character: "Characters",
  location: "Locations",
  object: "Objects & props",
};

const KIND_ORDER = ["character", "location", "object"];

export async function AssetsTab({ projectId }: { projectId: string }) {
  const supabase = await createSupabaseServerClient();

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
        <div className="rounded-lg border border-dashed border-[var(--border)] p-12 text-center">
          <p className="text-sm text-[var(--muted)]">
            No assets yet. Characters, locations, and objects are extracted from your script during intake — or add them manually below.
          </p>
        </div>
        <AddAssetForm projectId={projectId} />
      </div>
    );
  }

  // For each asset, fetch all variations + the latest pending/running jobs
  const enriched = await Promise.all(
    assets.map(async (a) => {
      const [{ data: variations }, { data: latestJob }, { data: latestBindJob }] = await Promise.all([
        supabase
          .from("asset_variations")
          .select("id, image_url, prompt_used, created_at")
          .eq("asset_id", a.id)
          .order("created_at", { ascending: false }),
        supabase
          .from("jobs")
          .select("id, status, error, request")
          .eq("type", "image_generate")
          .eq("project_id", projectId)
          .contains("request", { assetId: a.id })
          .in("status", ["queued", "running", "failed"])
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from("jobs")
          .select("id, status, error")
          .eq("type", "kling_bind_element")
          .eq("project_id", projectId)
          .contains("request", { assetId: a.id })
          .in("status", ["queued", "running", "failed"])
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);

      const refUrls = await Promise.all(
        (a.reference_image_urls ?? []).map(async (path: string) => ({
          path,
          url: await signedUrl(path),
        })),
      );
      const variationUrls = await Promise.all(
        (variations ?? []).map(async (v) => ({
          ...v,
          signed_url: await signedUrl(v.image_url),
        })),
      );

      return {
        ...a,
        kind: (a.kind ?? "character") as "character" | "location" | "object",
        refs: refUrls,
        variations: variationUrls,
        activeJob: latestJob ?? null,
        activeBindJob: latestBindJob ?? null,
      };
    }),
  );

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
  const eligibleForBulk = enriched.filter(
    (a) => a.refs.length > 0 && a.variations.length === 0,
  ).length;

  return (
    <div className="space-y-8">
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
