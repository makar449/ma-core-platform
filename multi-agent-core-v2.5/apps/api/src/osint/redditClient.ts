import type { RawStrategySource, OsintSourceClient } from "./types.js";

interface RedditListing {
  data?: { children?: readonly { data?: { id?: string; title?: string; selftext?: string; permalink?: string; subreddit?: string; created_utc?: number; score?: number } }[] };
}

export class RedditPublicClient implements OsintSourceClient {
  public readonly name = "Reddit public JSON";

  public constructor(private readonly userAgent: string) {}

  public async fetchFreshIdeas(): Promise<RawStrategySource[]> {
    const url = new URL("https://www.reddit.com/r/CryptoMarkets+CryptoCurrency/search.json?q=BTC%20RSI%20EMA%20funding%20setup&restrict_sr=1&sort=new&limit=25");
    const response = await fetch(url, { headers: { "user-agent": this.userAgent } });
    if (!response.ok) {
      throw new Error(`Reddit search failed with status ${response.status}`);
    }
    const body = await response.json() as RedditListing;
    return (body.data?.children ?? [])
      .map((child) => child.data)
      .filter((post): post is { id: string; title: string; selftext?: string; permalink?: string; subreddit?: string; created_utc?: number; score?: number } => Boolean(post?.id && post.title))
      .filter((post) => (post.score ?? 0) >= 0)
      .map((post) => {
        const source: RawStrategySource = {
          sourceType: "REDDIT",
          sourceId: post.id,
          sourceUrl: `https://www.reddit.com${post.permalink ?? ""}`,
          sourceTitle: `${post.subreddit ?? "Crypto"}: ${post.title}`,
          text: `${post.title}\n${post.selftext ?? ""}`.trim(),
          sourceTrustScore: Math.min(0.62, 0.4 + Math.max(0, post.score ?? 0) / 1000)
        };
        if (post.created_utc) {
          source.publishedAt = new Date(post.created_utc * 1000).toISOString();
        }
        return source;
      });
  }
}
