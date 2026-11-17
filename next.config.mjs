/** @type {import('next').NextConfig} */
const androidExport = process.env.BUILD_ANDROID === "1";
// Keep the long-running dev server isolated from production/export builds.
const devDistDir = process.env.NODE_ENV === "development" ? ".next-dev" : undefined;
const nextConfig = {
  reactStrictMode: true,
  // Optional separate build folder, so a second dev server (e.g. for tests) cannot clobber the main one.
  ...((process.env.NEXT_DIST_DIR || devDistDir) ? { distDir: process.env.NEXT_DIST_DIR || devDistDir } : {}),
  ...(androidExport ? {
    output: "export",
    experimental: { cpus: 1, workerThreads: true, webpackBuildWorker: false },
  } : {
    async headers() {
      return [
        // The Quran data and font never change between deploys of the same version: cache them hard.
        { source: "/data/:path*", headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }] },
        { source: "/fonts/:path*", headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }] },
        { source: "/sw.js", headers: [{ key: "Cache-Control", value: "no-cache" }] },
      ];
    },
  }),
};
export default nextConfig;
