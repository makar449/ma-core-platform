import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const requiredFiles = [
  ".github/workflows/github-pages.yml",
  "apps/web/lib/demoApi.ts",
  "apps/web/lib/deployMode.ts",
  "apps/web/next.config.ts",
  "apps/web/public/.nojekyll",
  "docs/GITHUB_PAGES_DEMO_DEPLOY.md"
];

const failures = [];
for (const file of requiredFiles) {
  if (!existsSync(join(root, file))) failures.push(`Missing required GitHub Pages demo file: ${file}`);
}

const nextConfig = readFileSync(join(root, "apps/web/next.config.ts"), "utf8");
for (const marker of ["output: githubPagesMode ? \"export\"", "basePath", "assetPrefix", "trailingSlash", "images: { unoptimized: true }"]) {
  if (!nextConfig.includes(marker)) failures.push(`next.config.ts is missing marker: ${marker}`);
}

const workflow = readFileSync(join(root, ".github/workflows/github-pages.yml"), "utf8");
for (const marker of ["deploy-pages", "upload-pages-artifact", "NEXT_PUBLIC_DEPLOY_TARGET: github-pages", "NEXT_PUBLIC_DEMO_MODE: \"true\""]) {
  if (!workflow.includes(marker)) failures.push(`github-pages.yml is missing marker: ${marker}`);
}

const api = readFileSync(join(root, "apps/web/lib/api.ts"), "utf8");
for (const marker of ["demoRequestJson", "demoModeEnabled", "NEXT_PUBLIC_API_URL is required"]) {
  if (!api.includes(marker)) failures.push(`api.ts is missing demo marker: ${marker}`);
}

const live = readFileSync(join(root, "apps/web/hooks/useLiveEvents.ts"), "utf8");
for (const marker of ["isDemoApiMode", "demoLiveEnvelope", "window.setInterval"]) {
  if (!live.includes(marker)) failures.push(`useLiveEvents.ts is missing demo live-event marker: ${marker}`);
}

const dynamicScanFiles = [
  "apps/web/app/page.tsx",
  "apps/web/app/terminal/page.tsx",
  "apps/web/app/positions/page.tsx",
  "apps/web/app/incidents/page.tsx",
  "apps/web/app/readiness/page.tsx"
];
for (const file of dynamicScanFiles) {
  const text = readFileSync(join(root, file), "utf8");
  if (text.includes("force-dynamic") || text.includes("revalidate = 0")) failures.push(`${file} still contains dynamic-only export markers`);
}

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log("GitHub Pages demo audit passed");
