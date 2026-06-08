import type { RawStrategySource, OsintSourceClient } from "./types.js";
import { defaultCryptoSearchTerms, splitCsv } from "./trustedSources.js";

interface YouTubeSearchResponse {
  items?: readonly { id?: { videoId?: string }; snippet?: { title?: string; channelTitle?: string; channelId?: string; publishedAt?: string; description?: string } }[];
}

interface YouTubeCaptionsResponse {
  items?: readonly { id?: string; snippet?: { language?: string; name?: string; trackKind?: string } }[];
}

export class YouTubeSearchClient implements OsintSourceClient {
  public readonly name = "YouTube Data API with captions";

  public constructor(
    private readonly apiKey?: string,
    private readonly oauthAccessToken?: string,
    private readonly configuredChannelIds?: string
  ) {}

  public async fetchFreshIdeas(): Promise<RawStrategySource[]> {
    if (!this.apiKey) {
      return [];
    }
    const channelIds = splitCsv(this.configuredChannelIds);
    const results: RawStrategySource[] = [];
    if (channelIds.length > 0) {
      for (const channelId of channelIds.slice(0, 20)) {
        results.push(...await this.searchVideos({ channelId }));
      }
    } else {
      for (const query of defaultCryptoSearchTerms.slice(0, 4)) {
        results.push(...await this.searchVideos({ query }));
      }
    }
    return results.slice(0, 40);
  }

  private async searchVideos(input: { channelId?: string; query?: string }): Promise<RawStrategySource[]> {
    const url = new URL("https://www.googleapis.com/youtube/v3/search");
    url.searchParams.set("part", "snippet");
    url.searchParams.set("type", "video");
    url.searchParams.set("maxResults", "8");
    url.searchParams.set("order", "date");
    if (input.channelId) {
      url.searchParams.set("channelId", input.channelId);
    }
    if (input.query) {
      url.searchParams.set("q", input.query);
    }
    url.searchParams.set("key", this.apiKey ?? "");
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`YouTube search failed with status ${response.status}`);
    }
    const body = await response.json() as YouTubeSearchResponse;
    const output: RawStrategySource[] = [];
    for (const item of body.items ?? []) {
      const videoId = item.id?.videoId;
      const snippet = item.snippet;
      if (!videoId || !snippet?.title) {
        continue;
      }
      const transcript = await this.fetchTranscriptIfAuthorized(videoId).catch(() => null);
      const description = snippet.description ?? "";
      const text = transcript && transcript.length > 80
        ? transcript
        : `${snippet.title}. ${description}. Source channel: ${snippet.channelTitle ?? "unknown"}. Captions were unavailable to the configured OAuth principal, so this entry is treated as a low-evidence headline signal.`;
      const source: RawStrategySource = {
        sourceType: "YOUTUBE",
        sourceId: videoId,
        sourceUrl: `https://www.youtube.com/watch?v=${videoId}`,
        sourceTitle: snippet.title,
        text,
        sourceTrustScore: transcript ? 0.74 : 0.48
      };
      if (snippet.channelTitle) {
        source.authorHandle = snippet.channelTitle;
      }
      if (snippet.publishedAt) {
        source.publishedAt = snippet.publishedAt;
      }
      output.push(source);
    }
    return output;
  }

  private async fetchTranscriptIfAuthorized(videoId: string): Promise<string | null> {
    if (!this.oauthAccessToken) {
      return null;
    }
    const listUrl = new URL("https://www.googleapis.com/youtube/v3/captions");
    listUrl.searchParams.set("part", "snippet");
    listUrl.searchParams.set("videoId", videoId);
    const listResponse = await fetch(listUrl, { headers: { authorization: `Bearer ${this.oauthAccessToken}` } });
    if (!listResponse.ok) {
      return null;
    }
    const listBody = await listResponse.json() as YouTubeCaptionsResponse;
    const track = (listBody.items ?? []).find((item) => item.id && (item.snippet?.language === "en" || item.snippet?.language === "ru")) ?? listBody.items?.find((item) => item.id);
    if (!track?.id) {
      return null;
    }
    const downloadUrl = new URL(`https://www.googleapis.com/youtube/v3/captions/${track.id}`);
    downloadUrl.searchParams.set("tfmt", "srt");
    const downloadResponse = await fetch(downloadUrl, { headers: { authorization: `Bearer ${this.oauthAccessToken}` } });
    if (!downloadResponse.ok) {
      return null;
    }
    const raw = await downloadResponse.text();
    return this.cleanCaptionText(raw);
  }

  private cleanCaptionText(raw: string): string {
    return raw
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .filter((line) => !/^\d+$/u.test(line))
      .filter((line) => !/-->/.test(line))
      .join(" ")
      .replace(/<[^>]+>/gu, " ")
      .replace(/\s+/gu, " ")
      .trim()
      .slice(0, 12_000);
  }
}
