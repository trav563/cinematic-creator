"use client";

import { useState, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import {
  createAsset,
  cloneAssetIntoProject,
  listImportableAssets,
  type ImportableAsset,
} from "./actions";

type Kind = "character" | "location" | "object";
type Mode = "create" | "import";

const KIND_OPTIONS: { value: Kind; label: string; placeholder: string }[] = [
  {
    value: "character",
    label: "Character",
    placeholder: "young_link / princess_zelda / ganondorf",
  },
  {
    value: "location",
    label: "Location",
    placeholder: "kokiri_village / hyrule_castle_courtyard / temple_of_time",
  },
  {
    value: "object",
    label: "Object / prop",
    placeholder: "master_sword / hover_boots / ocarina_of_time",
  },
];

export function AddAssetForm({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>("create");

  // Create-new state
  const [kind, setKind] = useState<Kind>("character");
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [description, setDescription] = useState("");

  // Import state — lazy-loaded the first time the import tab is opened.
  const [importLoaded, setImportLoaded] = useState(false);
  const [importLoading, setImportLoading] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [available, setAvailable] = useState<ImportableAsset[]>([]);
  const [search, setSearch] = useState("");
  const [importingId, setImportingId] = useState<string | null>(null);

  useEffect(() => {
    if (mode !== "import" || importLoaded || importLoading) return;
    setImportLoading(true);
    listImportableAssets(projectId)
      .then((res) => {
        if (res.ok) {
          setAvailable(res.data?.assets ?? []);
          setImportError(null);
        } else {
          setImportError(res.error);
        }
        setImportLoaded(true);
      })
      .finally(() => setImportLoading(false));
  }, [mode, importLoaded, importLoading, projectId]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const result = await createAsset(projectId, {
        name,
        kind,
        role: role || undefined,
        base_description: description || undefined,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(`Added ${kind}`);
      setName("");
      setRole("");
      setDescription("");
      setOpen(false);
      router.refresh();
    });
  }

  function handleImport(asset: ImportableAsset) {
    setImportingId(asset.id);
    startTransition(async () => {
      const result = await cloneAssetIntoProject(asset.id, projectId);
      setImportingId(null);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(`Imported ${asset.name} from ${asset.project_title}`);
      setOpen(false);
      router.refresh();
    });
  }

  if (!open) {
    return (
      <Button variant="secondary" onClick={() => setOpen(true)} className="text-xs">
        + Add asset
      </Button>
    );
  }

  const placeholder = KIND_OPTIONS.find((k) => k.value === kind)?.placeholder ?? "";

  const filtered = search.trim()
    ? available.filter((a) =>
        `${a.name} ${a.project_title} ${a.role ?? ""}`
          .toLowerCase()
          .includes(search.trim().toLowerCase()),
      )
    : available;

  return (
    <div className="space-y-3 rounded-lg border border-amber-500/30 bg-amber-500/5 p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">Add asset</h3>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-xs text-[var(--muted)] hover:text-foreground"
        >
          Cancel
        </button>
      </div>

      <div className="flex gap-1 rounded-md border border-[var(--border)] p-0.5 text-xs">
        <button
          type="button"
          onClick={() => setMode("create")}
          className={`flex-1 rounded px-2 py-1.5 transition-colors ${
            mode === "create"
              ? "bg-[var(--surface-2)] text-foreground"
              : "text-[var(--muted)] hover:text-foreground"
          }`}
        >
          Create new
        </button>
        <button
          type="button"
          onClick={() => setMode("import")}
          className={`flex-1 rounded px-2 py-1.5 transition-colors ${
            mode === "import"
              ? "bg-[var(--surface-2)] text-foreground"
              : "text-[var(--muted)] hover:text-foreground"
          }`}
        >
          Use existing
        </button>
      </div>

      {mode === "create" ? (
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="add-asset-kind">Kind</Label>
              <Select
                id="add-asset-kind"
                value={kind}
                onChange={(e) => setKind(e.target.value as Kind)}
              >
                {KIND_OPTIONS.map((k) => (
                  <option key={k.value} value={k.value}>
                    {k.label}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="add-asset-name">Name (snake_case)</Label>
              <Input
                id="add-asset-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={placeholder}
                required
              />
            </div>
          </div>

          <div className="space-y-1">
            <Label htmlFor="add-asset-role">Role (optional)</Label>
            <Input
              id="add-asset-role"
              value={role}
              onChange={(e) => setRole(e.target.value)}
              placeholder={
                kind === "character"
                  ? "protagonist / antagonist / mentor"
                  : kind === "location"
                    ? "hub world / dungeon / climactic battleground"
                    : "key item / weapon / artifact"
              }
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="add-asset-desc">Base description (optional)</Label>
            <Input
              id="add-asset-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Identity-focused note. Don't describe appearance — references will carry that."
            />
          </div>

          <div className="flex items-center justify-between gap-2 pt-1">
            <p className="text-[10px] text-[var(--muted)]">
              After adding, upload reference images and generate a variation. Regenerate the
              storyboard so this asset is woven into scene descriptions.
            </p>
            <Button type="submit" disabled={isPending} className="text-xs">
              {isPending ? "Adding…" : "Add"}
            </Button>
          </div>
        </form>
      ) : (
        <div className="space-y-3">
          <p className="text-[11px] text-[var(--muted)]">
            Confirmed assets from your other projects. Importing copies the references and
            variations into this project — the source stays intact.
          </p>

          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter by name, role, or source project…"
            disabled={importLoading || !importLoaded}
          />

          {importLoading && (
            <p className="text-xs text-[var(--muted)]">Loading library…</p>
          )}
          {importError && <p className="text-xs text-red-400">{importError}</p>}
          {importLoaded && !importLoading && filtered.length === 0 && (
            <p className="rounded border border-dashed border-[var(--border)] p-4 text-center text-xs text-[var(--muted)]">
              {available.length === 0
                ? "No confirmed assets in your other projects yet. Confirm a variation in another project to make it importable here."
                : "No matches for that search."}
            </p>
          )}

          {filtered.length > 0 && (
            <ul className="max-h-96 space-y-2 overflow-y-auto">
              {filtered.map((asset) => (
                <li
                  key={asset.id}
                  className="flex items-center gap-3 rounded border border-[var(--border)] bg-[var(--surface)] p-2"
                >
                  <div className="relative h-14 w-14 flex-shrink-0 overflow-hidden rounded bg-[var(--surface-2)]">
                    {asset.preview_url ? (
                      <Image
                        src={asset.preview_url}
                        alt=""
                        fill
                        sizes="56px"
                        className="object-cover"
                        unoptimized
                      />
                    ) : (
                      <span className="flex h-full w-full items-center justify-center text-[10px] text-[var(--muted)]">
                        no preview
                      </span>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{asset.name}</p>
                    <p className="truncate text-[11px] text-[var(--muted)]">
                      {asset.kind}
                      {asset.role ? ` · ${asset.role}` : ""}
                      {" · from "}
                      <span className="text-foreground/70">{asset.project_title}</span>
                    </p>
                    <p className="truncate text-[10px] text-[var(--muted)]">
                      {asset.variation_count} variation{asset.variation_count === 1 ? "" : "s"} ·{" "}
                      {asset.ref_count} ref{asset.ref_count === 1 ? "" : "s"}
                    </p>
                  </div>
                  <Button
                    onClick={() => handleImport(asset)}
                    disabled={isPending || importingId !== null}
                    className="flex-shrink-0 text-xs"
                  >
                    {importingId === asset.id ? "Importing…" : "Import"}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
