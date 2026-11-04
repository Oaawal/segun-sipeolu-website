import type { NextConfig } from "next";

// Staff portal (/portal) pages must never be cached, framed or indexed.
const portalHeaders = [
  { key: "Cache-Control", value: "no-store" },
  { key: "X-Robots-Tag", value: "noindex, nofollow" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "same-origin" },
  { key: "Permissions-Policy", value: "camera=(), geolocation=(), microphone=(self)" },
];

const nextConfig: NextConfig = {
  // The embedded Postgres (PGlite) ships WebAssembly and the pg driver uses
  // native modules: load both from node_modules instead of bundling them.
  serverExternalPackages: ["@electric-sql/pglite", "pg"],
  async headers() {
    return [
      { source: "/portal", headers: portalHeaders },
      { source: "/portal/:path*", headers: portalHeaders },
    ];
  },
};

export default nextConfig;
