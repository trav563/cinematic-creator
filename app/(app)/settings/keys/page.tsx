import { createSupabaseServerClient } from "@/lib/supabase/server";
import { previewApiKey } from "@/lib/crypto/keys";
import { ProviderKeyForm } from "./provider-key-form";

const PROVIDERS = [
  {
    id: "anthropic" as const,
    name: "Anthropic",
    description: "Claude Opus 4.7 / Sonnet 4.6 for script parsing and prompt authoring.",
    placeholder: "sk-ant-…",
    helpUrl: "https://console.anthropic.com/settings/keys",
  },
  {
    id: "google_ai_studio" as const,
    name: "Google AI Studio",
    description:
      "Gemini 3 Pro Image (Nano Banana Pro) for character model sheets and keyframes. Pinned to gemini-3-pro-image — never the Nano Banana 2 / Thinking / Fast variants.",
    placeholder: "AIza…",
    helpUrl: "https://aistudio.google.com/apikey",
  },
  {
    id: "kling" as const,
    name: "Kling",
    description: "Kling 2.6 + 3.0 multi-shot for per-scene video generation.",
    placeholder: "Access key + secret",
    helpUrl: "https://app.klingai.com",
  },
];

export default async function KeysPage() {
  const supabase = await createSupabaseServerClient();
  const { data: rows } = await supabase
    .from("provider_credentials")
    .select("provider, encrypted_key");

  const byProvider = new Map((rows ?? []).map((r) => [r.provider, r.encrypted_key]));

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">API Keys</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Bring your own keys. They&apos;re encrypted with AES-256-GCM at rest and never sent to the
          browser after saving.
        </p>
      </div>

      <div className="space-y-4">
        {PROVIDERS.map((p) => {
          const stored = byProvider.get(p.id);
          return (
            <div
              key={p.id}
              className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-5"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-base font-medium">{p.name}</h2>
                    {stored ? (
                      <span className="rounded bg-emerald-500/10 px-1.5 py-0.5 text-xs text-emerald-400">
                        Connected · {previewApiKey(stored)}
                      </span>
                    ) : (
                      <span className="rounded bg-amber-500/10 px-1.5 py-0.5 text-xs text-amber-400">
                        Not connected
                      </span>
                    )}
                  </div>
                  <p className="mt-1 max-w-2xl text-sm text-[var(--muted)]">{p.description}</p>
                  <a
                    href={p.helpUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-1 inline-block text-xs text-[var(--muted)] underline hover:text-foreground"
                  >
                    Get a key →
                  </a>
                </div>
              </div>
              <div className="mt-4">
                <ProviderKeyForm provider={p.id} placeholder={p.placeholder} hasKey={Boolean(stored)} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
