import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

const root = process.cwd();
const forbidden = [
  /TODO/i,
  /FIXME/i,
  /demo_user/,
  /AUTH_BOOTSTRAP/,
  /localStorage/,
  /token=/,
  /schema_version:\s*["\']1\.0\.0["\']/,
  /Vault_Service/,
  /:\s*any\b/,
  /as\s+any\b/,
  /Array<\s*any\s*>/,
  /\bPromise<\s*any\s*>/,
  /\.\.\.\s*$/m,
  /остальной код/i,
  /реализуйте самостоятельно/i
];
const extensions = new Set([".ts", ".tsx", ".js", ".mjs", ".sql", ".md", ".yml", ".yaml", ".json"]);
const ignoredDirs = new Set(["node_modules", ".next", "dist", ".git", "playwright-report", "test-results", "coverage"]);
const ignoredFiles = new Set(["scripts/static-audit.mjs", "pnpm-lock.yaml"]);

const failures = [];
await walk(root);
if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log("Static audit passed");

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!ignoredDirs.has(entry.name)) await walk(path);
      continue;
    }
    const relativePath = path.replace(root + "/", "");
    if (ignoredFiles.has(relativePath)) continue;
    if (!extensions.has(path.slice(path.lastIndexOf(".")))) continue;
    const content = await readFile(path, "utf8");
    for (const pattern of forbidden) {
      if (pattern.test(content)) failures.push(`Forbidden pattern ${pattern} in ${relativePath}`);
    }
  }
}
