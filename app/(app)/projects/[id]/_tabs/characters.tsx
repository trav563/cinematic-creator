import { createSupabaseServerClient } from "@/lib/supabase/server";
import { signedUrl } from "@/lib/storage";
import { CharacterCard } from "./character-card";

export async function CharactersTab({ projectId }: { projectId: string }) {
  const supabase = await createSupabaseServerClient();

  const { data: characters } = await supabase
    .from("characters")
    .select(
      "id, name, role, base_description, reference_image_urls, confirmed_variation_id, kling_element_id, kling_element_status",
    )
    .eq("project_id", projectId)
    .order("created_at");

  if (!characters || characters.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-[var(--border)] p-12 text-center">
        <p className="text-sm text-[var(--muted)]">
          No characters yet. They&apos;re extracted from your script during intake.
        </p>
      </div>
    );
  }

  // For each character, fetch all variations + the latest pending/running job
  const enriched = await Promise.all(
    characters.map(async (c) => {
      const [{ data: variations }, { data: latestJob }, { data: latestBindJob }] = await Promise.all([
        supabase
          .from("character_variations")
          .select("id, image_url, prompt_used, created_at")
          .eq("character_id", c.id)
          .order("created_at", { ascending: false }),
        supabase
          .from("jobs")
          .select("id, status, error, request")
          .eq("type", "image_generate")
          .eq("project_id", projectId)
          .contains("request", { characterId: c.id })
          .in("status", ["queued", "running", "failed"])
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from("jobs")
          .select("id, status, error")
          .eq("type", "kling_bind_element")
          .eq("project_id", projectId)
          .contains("request", { characterId: c.id })
          .in("status", ["queued", "running", "failed"])
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);

      // Sign URLs for refs and variations
      const refUrls = await Promise.all(
        (c.reference_image_urls ?? []).map(async (path: string) => ({
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
        ...c,
        refs: refUrls,
        variations: variationUrls,
        activeJob: latestJob ?? null,
        activeBindJob: latestBindJob ?? null,
      };
    }),
  );

  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
      {enriched.map((c) => (
        <CharacterCard key={c.id} character={c} projectId={projectId} />
      ))}
    </div>
  );
}
