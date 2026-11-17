import path from "node:path";
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
  // Always treat this folder as the project root, even if another lockfile sits
  // in a parent folder (e.g. a stray package-lock.json in the home folder).
  turbopack: { root: path.resolve(__dirname) },
  outputFileTracingRoot: path.resolve(__dirname),
  // The embedded Postgres (PGlite) ships WebAssembly and the pg driver uses
  // native modules: load both from node_modules instead of bundling them.
  serverExternalPackages: ["@electric-sql/pglite", "pg"],
  // Email attachments and transcript files go through server actions (1 MB by
  // default). On Vercel, which caps requests at 4.5 MB, files are staged in R2 first.
  experimental: { serverActions: { bodySizeLimit: "20mb" } },
  async headers() {
    return [
      { source: "/portal", headers: portalHeaders },
      { source: "/portal/:path*", headers: portalHeaders },
    ];
  },
};

export default nextConfig;
