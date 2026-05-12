import { IntakeForm } from "./intake-form";

export default function NewProjectPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">New project</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Upload your script and pick the basics. We&apos;ll derive a brief, character list, and
          rough scene outline you can review before unlocking the workspace.
        </p>
      </div>
      <IntakeForm />
    </div>
  );
}
