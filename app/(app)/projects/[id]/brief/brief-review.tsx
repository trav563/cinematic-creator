"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { updateBrief, updateAsset, deleteAsset, lockBrief } from "./actions";

interface Project {
  id: string;
  title: string;
  scope: string | null;
  genre: string | null;
  emotional_arc: string | null;
  must_include: string[] | null;
  must_not_include: string[] | null;
  aspect_ratio: string;
  style_preset: string | null;
  style_preset_options: { subMode?: string } | null;
  brief_yaml: string | null;
}

interface Asset {
  id: string;
  name: string;
  role: string | null;
  base_description: string | null;
}

interface Scene {
  scene_number: number;
  act: string | null;
  description: string;
}

export function BriefReview({
  project,
  assets,
  scenes,
}: {
  project: Project;
  assets: Asset[];
  scenes: Scene[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [scope, setScope] = useState(project.scope ?? "");
  const [genre, setGenre] = useState(project.genre ?? "");
  const [arc, setArc] = useState(project.emotional_arc ?? "");
  const [mustInclude, setMustInclude] = useState((project.must_include ?? []).join(", "));
  const [mustNot, setMustNot] = useState((project.must_not_include ?? []).join(", "));

  function handleSaveAndLock() {
    startTransition(async () => {
      const briefResult = await updateBrief(project.id, {
        scope,
        genre,
        emotional_arc: arc,
        must_include: parseList(mustInclude),
        must_not_include: parseList(mustNot),
      });
      if (!briefResult.ok) {
        toast.error(briefResult.error);
        return;
      }
      const lockResult = await lockBrief(project.id);
      if (!lockResult.ok) {
        toast.error(lockResult.error);
        return;
      }
      router.push(`/projects/${project.id}`);
    });
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{project.title}</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Review the derived brief and asset list. Edit anything that&apos;s wrong, then lock it
          to open the workspace.
        </p>
      </div>

      <section className="space-y-4 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-6">
        <h2 className="text-base font-medium">Brief</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="scope">Scope / setting</Label>
            <Input id="scope" value={scope} onChange={(e) => setScope(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="genre">Genre</Label>
            <Input id="genre" value={genre} onChange={(e) => setGenre(e.target.value)} />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="arc">Emotional arc</Label>
          <Input
            id="arc"
            value={arc}
            onChange={(e) => setArc(e.target.value)}
            placeholder="e.g. wonder → mystery → horror → escape"
          />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="must">Must include</Label>
            <Textarea id="must" rows={2} value={mustInclude} onChange={(e) => setMustInclude(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="mustNot">Must NOT include</Label>
            <Textarea id="mustNot" rows={2} value={mustNot} onChange={(e) => setMustNot(e.target.value)} />
          </div>
        </div>
        <p className="text-xs text-[var(--muted)]">
          Aspect ratio: <span className="text-foreground">{project.aspect_ratio}</span> · Style preset:{" "}
          <span className="text-foreground">{project.style_preset}</span>
          {project.style_preset_options?.subMode && (
            <>
              {" "}·{" "}
              <span className="rounded bg-amber-500/10 px-1.5 py-0.5 text-[11px] text-amber-400">
                Sub-mode: {project.style_preset_options.subMode.replace(/_/g, " ")}
              </span>
            </>
          )}
        </p>
      </section>

      <section className="space-y-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-medium">Assets ({assets.length})</h2>
        </div>
        <div className="space-y-3">
          {assets.map((c) => (
            <AssetRow key={c.id} asset={c} />
          ))}
          {assets.length === 0 && (
            <p className="text-sm text-[var(--muted)]">
              No assets extracted. You can add them after locking the brief.
            </p>
          )}
        </div>
      </section>

      <section className="space-y-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-6">
        <h2 className="text-base font-medium">Scene outline ({scenes.length})</h2>
        <p className="text-xs text-[var(--muted)]">
          A rough outline. The Storyboard tab will expand this into a full table with frame roles, cameras,
          and beats once you lock the brief.
        </p>
        <ol className="space-y-1 text-sm">
          {scenes.map((s) => (
            <li key={s.scene_number} className="flex gap-3">
              <span className="w-8 shrink-0 text-right text-[var(--muted)]">{s.scene_number}.</span>
              <span className="w-20 shrink-0 text-[var(--muted)]">{s.act}</span>
              <span>{s.description}</span>
            </li>
          ))}
        </ol>
      </section>

      <div className="flex justify-end gap-3 pt-2">
        <Button variant="secondary" onClick={() => router.push("/")}>
          Back to projects
        </Button>
        <Button onClick={handleSaveAndLock} disabled={isPending}>
          {isPending ? "Locking…" : "Lock brief & open workspace"}
        </Button>
      </div>
    </div>
  );
}

function AssetRow({ asset }: { asset: Asset }) {
  const [name, setName] = useState(asset.name);
  const [role, setRole] = useState(asset.role ?? "");
  const [desc, setDesc] = useState(asset.base_description ?? "");
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleSave() {
    startTransition(async () => {
      const result = await updateAsset(asset.id, { name, role, base_description: desc });
      if (!result.ok) toast.error(result.error);
      else toast.success("Saved");
    });
  }

  function handleDelete() {
    startTransition(async () => {
      const result = await deleteAsset(asset.id);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="grid grid-cols-1 gap-2 rounded border border-[var(--border)] p-3 sm:grid-cols-[180px_140px_1fr_auto]">
      <Input value={name} onChange={(e) => setName(e.target.value)} />
      <Input value={role} onChange={(e) => setRole(e.target.value)} placeholder="role" />
      <Input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="base description" />
      <div className="flex gap-2">
        <Button variant="secondary" onClick={handleSave} disabled={isPending}>
          Save
        </Button>
        <Button variant="ghost" onClick={handleDelete} disabled={isPending}>
          ✕
        </Button>
      </div>
    </div>
  );
}

function parseList(s: string): string[] {
  return s
    .split(/[\n,]/)
    .map((x) => x.trim())
    .filter(Boolean);
}
