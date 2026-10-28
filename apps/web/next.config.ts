import type { NextConfig } from "next";

export default {
  cacheComponents: true,
  // The build script type checks with Bun before Next builds.
  typescript: { ignoreBuildErrors: true },
  agentRules: false,
  allowedDevOrigins: ["**.ts.net"],
} satisfies NextConfig;
