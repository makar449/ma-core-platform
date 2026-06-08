import type { StrategyRule } from "@ma-core/shared";

export interface RawStrategySource {
  sourceType: StrategyRule["sourceType"];
  sourceId: string;
  sourceUrl?: string;
  sourceTitle: string;
  text: string;
  authorHandle?: string;
  publishedAt?: string;
  sourceTrustScore?: number;
}

export interface OsintSourceClient {
  readonly name: string;
  fetchFreshIdeas(): Promise<RawStrategySource[]>;
}
