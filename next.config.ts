import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdfkit reads its font data files (AFM) via fs at runtime using
  // __dirname-relative paths, which break when bundled by Turbopack.
  // sharp is a native (libvips) addon. Both must be loaded via native
  // require, so we opt them out of the Server Components bundler.
  serverExternalPackages: ["pdfkit", "sharp"],
  // Next.js 16 blocks cross-origin requests to dev-only resources
  // (/_next/static chunks, /_next/hmr) by default. Allow local hosts so
  // the client bundle hydrates when accessed via 127.0.0.1 / LAN IP /
  // tunnel proxies. Dev-only; has no effect in production.
  allowedDevOrigins: ["127.0.0.1", "localhost", "0.0.0.0", "192.168.80.115"],
};

export default nextConfig;
