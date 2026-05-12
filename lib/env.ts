function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

export const env = {
  get supabaseUrl() {
    return required("NEXT_PUBLIC_SUPABASE_URL");
  },
  get supabaseAnonKey() {
    return required("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  },
  get supabaseServiceRoleKey() {
    return required("SUPABASE_SERVICE_ROLE_KEY");
  },
  get credentialsEncryptionKey() {
    const hex = required("CREDENTIALS_ENCRYPTION_KEY");
    if (hex.length !== 64) {
      throw new Error("CREDENTIALS_ENCRYPTION_KEY must be 32 bytes hex (64 chars)");
    }
    return Buffer.from(hex, "hex");
  },
  get siteUrl() {
    return process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  },
  get inngestEventKey() {
    return process.env.INNGEST_EVENT_KEY;
  },
  get inngestSigningKey() {
    return process.env.INNGEST_SIGNING_KEY;
  },
};
