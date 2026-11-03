import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@napi-rs/canvas", "ag-psd"],
  cacheComponents: true,
  partialPrefetching: true,
};

export default nextConfig;
