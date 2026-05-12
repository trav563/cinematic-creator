"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { saveProviderKey, deleteProviderKey } from "./actions";

type Provider = "anthropic" | "google_ai_studio" | "kling";

export function ProviderKeyForm({
  provider,
  placeholder,
  hasKey,
}: {
  provider: Provider;
  placeholder: string;
  hasKey: boolean;
}) {
  const [value, setValue] = useState("");
  const [isPending, startTransition] = useTransition();

  function handleSave() {
    if (!value) return;
    startTransition(async () => {
      const result = await saveProviderKey(provider, value);
      if (result.ok) {
        setValue("");
        toast.success(`${provider} key saved.`);
      } else {
        toast.error(result.error ?? "Failed to save key.");
      }
    });
  }

  function handleDelete() {
    startTransition(async () => {
      const result = await deleteProviderKey(provider);
      if (result.ok) toast.success("Key removed.");
      else toast.error(result.error ?? "Failed to remove key.");
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Input
        type="password"
        placeholder={placeholder}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        autoComplete="off"
        className="max-w-md flex-1"
      />
      <Button onClick={handleSave} disabled={isPending || !value}>
        {hasKey ? "Replace" : "Save"}
      </Button>
      {hasKey ? (
        <Button variant="secondary" onClick={handleDelete} disabled={isPending}>
          Remove
        </Button>
      ) : null}
    </div>
  );
}
