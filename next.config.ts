import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  serverExternalPackages: ["postgres", "@react-pdf/renderer", "exceljs", "bcryptjs"],
  experimental: { serverActions: { bodySizeLimit: "12mb" } },
  outputFileTracingIncludes: { "/api/settlements/[id]/pdf": ["./src/assets/fonts/**"] },
  async headers() {
    return [{
      source: "/(.*)",
      headers: [
        { key: "X-Frame-Options", value: "DENY" },
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=()" },
      ],
    }];
  },
};
export default nextConfig;
