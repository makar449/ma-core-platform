import path from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const deployTarget = process.env.NEXT_PUBLIC_DEPLOY_TARGET ?? "self-hosted";
const repositoryName = process.env.NEXT_PUBLIC_GITHUB_PAGES_REPO ?? "";
const githubPagesMode = deployTarget === "github-pages";
const githubPagesBasePath = githubPagesMode && repositoryName.length > 0 ? `/${repositoryName}` : undefined;

const nextConfig: NextConfig = {
  reactStrictMode: true,
  output: githubPagesMode ? "export" : undefined,
  trailingSlash: githubPagesMode,
  basePath: githubPagesBasePath,
  assetPrefix: githubPagesBasePath,
  images: { unoptimized: true },
  outputFileTracingRoot: currentDirectory,
  experimental: {
    optimizePackageImports: ["lucide-react", "framer-motion"]
  }
};

export default nextConfig;
