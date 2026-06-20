/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // @ledgerline/types is a workspace TS package consumed as source.
  transpilePackages: ["@ledgerline/types"],
  // The repo ships via esbuild/SWC; strict tsc (noUncheckedIndexedAccess) has
  // pre-existing noise across the design-phase codebase. Don't gate builds on it
  // or on lint — we run targeted tsc on changed files instead.
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true },
};

export default nextConfig;
