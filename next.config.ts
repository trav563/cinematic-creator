import type { NextConfig } from "next";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseHostname = supabaseUrl ? new URL(supabaseUrl).hostname : undefined;

const nextConfig: NextConfig = {
  images: {
    remotePatterns: supabaseHostname
      ? [
          {
            protocol: "https",
            hostname: supabaseHostname,
            pathname: "/storage/v1/object/sign/**",
          },
        ]
      : [],
  },
  experimental: {
    // Default is 1 MB. Character reference uploads (especially raw phone photos) and
    // any future direct-to-action image upload routinely exceed this. Bump to 25 MB —
    // matches Kling's per-image hard cap so we never over-promise to downstream APIs.
    serverActions: {
      bodySizeLimit: "25mb",
    },
  },
};

export default nextConfig;
