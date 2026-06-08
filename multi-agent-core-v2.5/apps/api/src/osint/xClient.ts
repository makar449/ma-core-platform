import type { RawStrategySource, OsintSourceClient } from "./types.js";
import { splitCsv } from "./trustedSources.js";

interface XSearchResponse {
  data?: readonly { id: string; text: string; author_id?: string; created_at?: string }[];
}

export class XRecentSearchClient implements OsintSourceClient {
  public readonly name = "X API v2 Recent Search";

  public constructor(private readonly bearerToken?: string, private readonly authorIdsCsv?: string) {}

  public async fetchFreshIdeas(): Promise<RawStrategySource[]> {
    if (!this.bearerToken) {
      return [];
    }
    const authorIds = splitCsv(this.authorIdsCsv).slice(0, 20);
    const authorClause = authorIds.length > 0 ? `(${authorIds.map((id) => `from:${id}`).join(" OR ")}) ` : "";
    const query = encodeURIComponent(`${authorClause}(BTC OR ETH OR SOL OR crypto) (long OR short OR leverage OR setup OR EMA200 OR RSI OR funding OR open interest) lang:en -is:retweet`);
    const url = new URL(`/2/tweets/search/recent?query=${query}&max_results=50&tweet.fields=created_at,author_id`, "https://api.x.com");
    const response = await fetch(url, { headers: { authorization: `Bearer ${this.bearerToken}` } });
    if (!response.ok) {
      throw new Error(`X recent search failed with status ${response.status}`);
    }
    const body = await response.json() as XSearchResponse;
    return (body.data ?? []).map((post) => {
      const source: RawStrategySource = {
        sourceType: "X",
        sourceId: post.id,
        sourceUrl: `https://x.com/i/web/status/${post.id}`,
        sourceTitle: `X trading post ${post.id}`,
        text: post.text,
        sourceTrustScore: authorIds.length > 0 && post.author_id && authorIds.includes(post.author_id) ? 0.7 : 0.5
      };
      if (post.author_id) {
        source.authorHandle = post.author_id;
      }
      if (post.created_at) {
        source.publishedAt = post.created_at;
      }
      return source;
    });
  }
}
