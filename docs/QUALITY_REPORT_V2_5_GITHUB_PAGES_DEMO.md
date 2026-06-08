# Quality Report v2.5 — GitHub Pages Demo Link Pass

## Objective

Create a GitHub-only shareable demo deployment path for the institutional console without Docker, Vercel, PostgreSQL, Redis, backend API or exchange credentials.

## Implemented

- Added static GitHub Pages deployment workflow: `.github/workflows/github-pages.yml`.
- Added GitHub Pages aware `next.config.ts` with `output: "export"`, `basePath`, `assetPrefix`, `trailingSlash` and unoptimized images.
- Added frontend demo runtime detection through `NEXT_PUBLIC_DEPLOY_TARGET=github-pages` and `NEXT_PUBLIC_DEMO_MODE=true`.
- Added browser-safe mock API layer in `apps/web/lib/demoApi.ts`.
- Patched `apps/web/lib/api.ts` so production static demo does not require `NEXT_PUBLIC_API_URL`.
- Patched live event hook so static demo does not attempt to open a real SSE connection.
- Added a visible `GitHub Pages Demo` environment badge in the operator console.
- Removed `force-dynamic` page declarations so the Next.js App Router pages can be statically exported.
- Added root and web `build:github-pages` scripts.
- Updated README with exact GitHub Pages instructions.

## Commands added

```bash
pnpm build:github-pages
pnpm verify:github-pages
```

## GitHub Pages workflow

The workflow installs pnpm, installs dependencies, runs static audits, builds the shared package, builds the web app in GitHub Pages demo mode and deploys `apps/web/out` with `.nojekyll`.

## Known boundary

This mode is intentionally static. It is not a backend deployment. Redis, PostgreSQL, Fastify API, exchange private streams and real order execution require the full infrastructure stack.

## Verification in this sandbox

The modified source tree was statically audited with local scripts. Full Next.js build was not run here because dependency installation and browser/runtime verification require stable package registry access and the user's target GitHub Actions environment.
