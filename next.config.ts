import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Per-package tree-shaking for libraries that bundle everything as
  // independent module entries. Without this, importing a single lucide
  // icon pulls the whole icon set into the client chunk; same story for
  // dnd-kit and recharts. Next rewrites `import { X } from 'lucide-react'`
  // into a sub-path import at build time, so unused exports are dropped.
  experimental: {
    optimizePackageImports: [
      "lucide-react",
      "@dnd-kit/core",
      "@dnd-kit/sortable",
      "@dnd-kit/modifiers",
      "@dnd-kit/utilities",
      "recharts",
    ],
  },
};

export default nextConfig;
