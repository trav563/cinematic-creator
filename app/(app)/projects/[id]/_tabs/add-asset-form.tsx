"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { createAsset } from "./actions";

type Kind = "character" | "location" | "object";

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
  const [kind, setKind] = useState<Kind>("character");
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [description, setDescription] = useState("");

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

  if (!open) {
    return (
      <Button variant="secondary" onClick={() => setOpen(true)} className="text-xs">
        + Add asset
      </Button>
    );
  }

  const placeholder = KIND_OPTIONS.find((k) => k.value === kind)?.placeholder ?? "";

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-3 rounded-lg border border-amber-500/30 bg-amber-500/5 p-4"
    >
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
          After adding, upload reference images and generate a variation. Regenerate the storyboard so this asset is woven into scene descriptions.
        </p>
        <Button type="submit" disabled={isPending} className="text-xs">
          {isPending ? "Adding…" : "Add"}
        </Button>
      </div>
    </form>
  );
}
