import { createSupabaseServerClient, createSupabaseServiceClient } from "@/lib/supabase/server";

export const PROJECT_ASSETS_BUCKET = "project-assets";

/**
 * Sign a private storage URL for display in the browser. Default expiry: 1 hour.
 * Call from server components / server actions only — uses the user's session.
 */
export async function signedUrl(path: string, expiresInSeconds = 60 * 60): Promise<string | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.storage
    .from(PROJECT_ASSETS_BUCKET)
    .createSignedUrl(path, expiresInSeconds);
  if (error || !data) return null;
  return data.signedUrl;
}

/**
 * Service-role version for Inngest workers. Bypasses RLS.
 */
export async function signedUrlAsService(path: string, expiresInSeconds = 60 * 60): Promise<string | null> {
  const supabase = createSupabaseServiceClient();
  const { data, error } = await supabase.storage
    .from(PROJECT_ASSETS_BUCKET)
    .createSignedUrl(path, expiresInSeconds);
  if (error || !data) return null;
  return data.signedUrl;
}

/**
 * Upload bytes from a worker. Returns the storage path, not a signed URL.
 */
export async function uploadAsService(path: string, bytes: Buffer, contentType: string): Promise<void> {
  const supabase = createSupabaseServiceClient();
  const { error } = await supabase.storage
    .from(PROJECT_ASSETS_BUCKET)
    .upload(path, bytes, { contentType, upsert: true });
  if (error) throw new Error(`Storage upload failed at ${path}: ${error.message}`);
}

/**
 * Download an object's bytes via service-role client. Returns base64-encoded content.
 */
export async function downloadAsServiceBase64(path: string): Promise<{ base64: string; mimeType: string }> {
  const supabase = createSupabaseServiceClient();
  const { data, error } = await supabase.storage.from(PROJECT_ASSETS_BUCKET).download(path);
  if (error || !data) throw new Error(`Storage download failed at ${path}: ${error?.message}`);
  const buf = Buffer.from(await data.arrayBuffer());
  return { base64: buf.toString("base64"), mimeType: data.type || "image/png" };
}
