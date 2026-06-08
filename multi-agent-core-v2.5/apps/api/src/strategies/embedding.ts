import { createHash } from "node:crypto";
import type { AppConfig } from "../config.js";

export interface EmbeddingResult {
  values: number[];
  model: string;
  dimensions: number;
}

interface EmbeddingResponse {
  data?: readonly { embedding?: readonly number[] }[];
}

export function deterministicEmbedding(text: string, dimensions = 64): number[] {
  const vector = Array.from({ length: dimensions }, (_, index) => {
    const hash = createHash("sha256").update(`${index}:${text.toLowerCase()}`).digest();
    const raw = hash.readUInt32BE(0) / 0xffffffff;
    return Number((raw * 2 - 1).toFixed(6));
  });
  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0)) || 1;
  return vector.map((value) => Number((value / norm).toFixed(6)));
}

export async function buildEmbedding(text: string, config: AppConfig): Promise<EmbeddingResult> {
  if (config.EMBEDDING_PROVIDER !== "openai-compatible" || !config.EMBEDDING_API_KEY) {
    return { values: deterministicEmbedding(text, config.EMBEDDING_DIMENSIONS), model: "deterministic-local-v1", dimensions: config.EMBEDDING_DIMENSIONS };
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.LLM_TIMEOUT_MS);
  try {
    const response = await fetch(new URL("/embeddings", config.EMBEDDING_BASE_URL), {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${config.EMBEDDING_API_KEY}` },
      body: JSON.stringify({ model: config.EMBEDDING_MODEL, input: text, dimensions: config.EMBEDDING_DIMENSIONS }),
      signal: controller.signal
    });
    if (!response.ok) {
      throw new Error(`Embedding provider failed with ${response.status}`);
    }
    const body = await response.json() as EmbeddingResponse;
    const embedding = body.data?.[0]?.embedding;
    if (!embedding || embedding.length === 0) {
      throw new Error("Embedding provider returned an empty vector");
    }
    return { values: [...embedding].slice(0, config.EMBEDDING_DIMENSIONS), model: config.EMBEDDING_MODEL, dimensions: Math.min(embedding.length, config.EMBEDDING_DIMENSIONS) };
  } catch {
    return { values: deterministicEmbedding(text, config.EMBEDDING_DIMENSIONS), model: "deterministic-local-v1", dimensions: config.EMBEDDING_DIMENSIONS };
  } finally {
    clearTimeout(timeout);
  }
}

export function cosineSimilarity(left: readonly number[], right: readonly number[]): number {
  const length = Math.min(left.length, right.length);
  if (length === 0) return 0;
  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;
  for (let index = 0; index < length; index += 1) {
    const l = left[index] ?? 0;
    const r = right[index] ?? 0;
    dot += l * r;
    leftNorm += l * l;
    rightNorm += r * r;
  }
  const denominator = Math.sqrt(leftNorm) * Math.sqrt(rightNorm);
  return denominator === 0 ? 0 : dot / denominator;
}
