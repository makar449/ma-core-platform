import { readFile } from "node:fs/promises";
import { z } from "zod";
import type { AppConfig } from "../config.js";

const HttpKeyResponseSchema = z.object({
  keyBase64: z.string().min(44),
  keyVersion: z.string().min(1).optional()
});

export interface ResolvedVaultKey {
  readonly key: Buffer;
  readonly version: string;
  readonly provider: "env" | "file" | "http";
}

export async function resolveVaultMasterKey(config: AppConfig): Promise<ResolvedVaultKey> {
  if (config.VAULT_KEY_PROVIDER === "env") {
    return decodeVaultKey(config.VAULT_MASTER_KEY_BASE64 ?? "", config.VAULT_KEY_VERSION, "env");
  }
  if (config.VAULT_KEY_PROVIDER === "file") {
    const path = config.VAULT_KEY_FILE;
    if (!path) {
      throw new Error("VAULT_KEY_FILE is required when VAULT_KEY_PROVIDER=file");
    }
    const fileContent = (await readFile(path, "utf8")).trim();
    const parsed = parseFileKey(fileContent);
    return decodeVaultKey(parsed.keyBase64, parsed.keyVersion ?? config.VAULT_KEY_VERSION, "file");
  }
  const url = config.VAULT_KEY_PROVIDER_URL;
  if (!url) {
    throw new Error("VAULT_KEY_PROVIDER_URL is required when VAULT_KEY_PROVIDER=http");
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.VAULT_KEY_PROVIDER_TIMEOUT_MS);
  try {
    const headers: Record<string, string> = { accept: "application/json" };
    if (config.VAULT_KEY_PROVIDER_BEARER_TOKEN) {
      headers.authorization = `Bearer ${config.VAULT_KEY_PROVIDER_BEARER_TOKEN}`;
    }
    const response = await fetch(url, { method: "GET", headers, signal: controller.signal });
    if (!response.ok) {
      throw new Error(`Vault key provider returned HTTP ${response.status}`);
    }
    const raw = await response.json();
    const parsed = HttpKeyResponseSchema.parse(raw);
    return decodeVaultKey(parsed.keyBase64, parsed.keyVersion ?? config.VAULT_KEY_VERSION, "http");
  } finally {
    clearTimeout(timeout);
  }
}

function parseFileKey(content: string): { readonly keyBase64: string; readonly keyVersion?: string } {
  if (content.startsWith("{")) {
    const parsed = HttpKeyResponseSchema.parse(JSON.parse(content));
    if (parsed.keyVersion) {
      return { keyBase64: parsed.keyBase64, keyVersion: parsed.keyVersion };
    }
    return { keyBase64: parsed.keyBase64 };
  }
  return { keyBase64: content };
}

function decodeVaultKey(keyBase64: string, version: string, provider: ResolvedVaultKey["provider"]): ResolvedVaultKey {
  const key = Buffer.from(keyBase64, "base64");
  if (key.length !== 32) {
    throw new Error(`Vault master key from ${provider} must decode to exactly 32 bytes for AES-256-GCM`);
  }
  return { key, version, provider };
}
