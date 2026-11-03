import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@napi-rs/canvas", "ag-psd"],
  // When a Blob token exists at build time, the browser uploads straight to Blob.
  env: { NEXT_PUBLIC_DIRECT_UPLOAD: process.env.BLOB_READ_WRITE_TOKEN ? "1" : "" },
  cacheComponents: true,
  partialPrefetching: true,
};

export default nextConfig;
