export const deployTarget = process.env.NEXT_PUBLIC_DEPLOY_TARGET ?? "self-hosted";
export const githubPagesRepository = process.env.NEXT_PUBLIC_GITHUB_PAGES_REPO ?? "";
export const demoModeEnabled = process.env.NEXT_PUBLIC_DEMO_MODE === "true" || deployTarget === "github-pages";
export const demoEnvironmentLabel = deployTarget === "github-pages" ? "GitHub Pages Demo" : demoModeEnabled ? "Demo Mode" : "Live Backend";
