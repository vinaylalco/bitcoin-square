import { describe, expect, it } from "vitest";

import { deriveProfileReputation } from "../src/utils/reputation";

describe("deriveProfileReputation", () => {
  it("computes weighted reputation score and rank", () => {
    const payload = {
      metrics: {
        repliesLast30Days: 40,
        reactionsLast30Days: 80,
        zapsLast30Days: 10,
        postsLast30Days: 10,
        percentiles: {
          engagement30d: { p5: 0.2, p95: 8 },
          trust: { p5: 0.1, p95: 0.9 },
          contribution: { p5: 0, p95: 20 },
          reputation: { p5: 20, p95: 90 },
        },
      },
      followersCount: 200,
      followingCount: 50,
      blocksReceived: 2,
      reportsResolved: 5,
      postsWithMedia: 6,
      longFormThreads: 2,
      helpfulReportsResolved: 3,
      joined: new Date(Date.now() - 200 * 24 * 60 * 60 * 1000).toISOString(),
    };

    const result = deriveProfileReputation(payload);

    expect(result.score).not.toBeNull();
    expect(result.score).toBeCloseTo(81.6, 1);
    expect(result.rankLabel).toBe("Top 12%");
    expect(result.components).not.toBeNull();
    expect(result.components?.trust).toBeGreaterThan(0.8);
  });

  it("applies trust penalty when blocks exceed resolved reports", () => {
    const basePayload = {
      metrics: {
        repliesLast30Days: 18,
        reactionsLast30Days: 22,
        zapsLast30Days: 4,
        postsLast30Days: 12,
        percentiles: {
          engagement30d: { p5: 0, p95: 4 },
          trust: { p5: 0, p95: 1 },
          contribution: { p5: 0, p95: 8 },
          reputation: { p5: 15, p95: 85 },
        },
      },
      followers: 120,
      following: 40,
      blocksReceived: 1,
      reportsResolved: 5,
      postsWithMedia: 1,
      longFormThreads: 1,
      helpfulReportsResolved: 1,
      joined: new Date(Date.now() - 320 * 24 * 60 * 60 * 1000).toISOString(),
    };

    const penalizedPayload = {
      ...basePayload,
      blocksReceived: 12,
      reportsResolved: 2,
    };

    const baseline = deriveProfileReputation(basePayload);
    const penalized = deriveProfileReputation(penalizedPayload);

    expect(baseline.score).not.toBeNull();
    expect(penalized.score).not.toBeNull();
    expect(penalized.score ?? 0).toBeLessThan(baseline.score ?? 0);

    const topPercent = (label: string | null) => {
      if (!label) return Number.POSITIVE_INFINITY;
      const match = label.match(/Top\s+(\d+)%/i);
      return match ? Number(match[1]) : Number.POSITIVE_INFINITY;
    };

    expect(topPercent(penalized.rankLabel)).toBeGreaterThan(topPercent(baseline.rankLabel));
  });
});
