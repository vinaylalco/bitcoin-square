const clamp01 = (value: number) => {
  if (!Number.isFinite(value)) {
    return 0;
  }
  if (value <= 0) return 0;
  if (value >= 1) return 1;
  return value;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const toNumber = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (Array.isArray(value)) {
    return value.length;
  }
  if (isRecord(value)) {
    return (
      toNumber(value.value) ??
      toNumber(value.count) ??
      toNumber(value.total) ??
      toNumber(value.amount) ??
      null
    );
  }
  return null;
};

const toStringValue = (value: unknown): string | null => {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (Array.isArray(value) && value.length > 0) {
    const first = value[0];
    if (typeof first === "string") {
      const trimmed = first.trim();
      return trimmed.length > 0 ? trimmed : null;
    }
  }
  return null;
};

const collectRecords = (value: unknown, depth = 0, visited = new Set<unknown>()): Record<string, unknown>[] => {
  if (!isRecord(value)) return [];
  if (visited.has(value)) return [];
  visited.add(value);
  const record = value as Record<string, unknown>;
  if (depth > 4) {
    return [record];
  }
  const nested: Record<string, unknown>[] = [record];
  for (const entry of Object.values(record)) {
    if (isRecord(entry)) {
      nested.push(...collectRecords(entry, depth + 1, visited));
    }
  }
  return nested;
};

const KEY_VARIANTS: Record<string, string[]> = {
  replies30d: [
    "repliesLast30Days",
    "replies_last_30_days",
    "replies_30d",
    "replies30d",
    "replyCount30d",
    "reply_count_30d",
    "replies",
  ],
  reactions30d: [
    "reactionsLast30Days",
    "reactions_last_30_days",
    "reactions30d",
    "reactions_30d",
    "reactionCount30d",
    "reaction_count_30d",
    "reactions",
    "likes30d",
    "likes_last_30_days",
  ],
  zaps30d: [
    "zapsLast30Days",
    "zaps_last_30_days",
    "zaps30d",
    "zaps_30d",
    "zapCount30d",
    "zap_count_30d",
    "zaps",
  ],
  posts30d: [
    "postsLast30Days",
    "posts_last_30_days",
    "posts30d",
    "posts_30d",
    "postCount30d",
    "post_count_30d",
    "posts",
  ],
  followers: [
    "followers",
    "followersCount",
    "followers_count",
    "followers_total",
    "totalFollowers",
  ],
  following: [
    "following",
    "followingCount",
    "following_count",
    "following_total",
    "totalFollowing",
  ],
  blocks: [
    "blocksReceived",
    "blocks_received",
    "blocks",
    "blocksReceived30d",
    "blocks_received_30d",
  ],
  reportsResolved: [
    "reportsResolved",
    "reports_resolved",
    "resolvedReports",
    "reportsResolvedHelpful",
  ],
  postsWithMedia: [
    "postsWithMedia",
    "mediaPosts",
    "media_posts",
    "mediaPostCount",
  ],
  longFormThreads: [
    "longFormThreads",
    "long_form_threads",
    "longPosts",
    "threadCountLongForm",
  ],
  helpfulReports: [
    "helpfulReportsResolved",
    "helpful_reports_resolved",
    "helpfulReports",
    "reportsResolvedHelpful",
  ],
  accountAgeDays: [
    "accountAgeDays",
    "account_age_days",
    "ageInDays",
  ],
  reputationPercentile: [
    "reputationPercentile",
    "reputation_percentile",
    "percentileRank",
    "percentile_rank",
    "reputationPercentileRank",
  ],
};

const pickNumber = (records: Record<string, unknown>[], keys: string[]): number | null => {
  for (const record of records) {
    for (const key of keys) {
      if (key in record) {
        const candidate = toNumber(record[key]);
        if (candidate != null) {
          return candidate;
        }
      }
    }
  }
  return null;
};

const pickString = (records: Record<string, unknown>[], keys: string[]): string | null => {
  for (const record of records) {
    for (const key of keys) {
      if (key in record) {
        const candidate = toStringValue(record[key]);
        if (candidate) {
          return candidate;
        }
      }
    }
  }
  return null;
};

interface PercentileWindow {
  p5?: number | null;
  p50?: number | null;
  p95?: number | null;
}

const parsePercentileCandidate = (value: unknown): PercentileWindow | null => {
  if (!isRecord(value)) return null;
  const p5 = toNumber(value.p5 ?? value.p05 ?? value.low ?? value.lo ?? value.min ?? value.q05);
  const p50 = toNumber(value.p50 ?? value.median ?? value.q50 ?? value.percentile50 ?? value.mid ?? value.average);
  const p95 = toNumber(value.p95 ?? value.high ?? value.hi ?? value.max ?? value.q95);
  if (p5 == null && p50 == null && p95 == null) {
    return null;
  }
  return { p5: p5 ?? null, p50: p50 ?? null, p95: p95 ?? null };
};

const pickPercentiles = (records: Record<string, unknown>[], baseKeys: string[]): PercentileWindow | null => {
  for (const record of records) {
    for (const base of baseKeys) {
      const candidates: unknown[] = [];
      if (base in record) {
        candidates.push(record[base]);
      }
      const suffixes = [
        `${base}Percentiles`,
        `${base}_percentiles`,
        `${base}Distribution`,
        `${base}_distribution`,
        `${base}Stats`,
        `${base}_stats`,
      ];
      for (const suffix of suffixes) {
        if (suffix in record) {
          candidates.push(record[suffix]);
        }
      }
      if ("percentiles" in record && isRecord(record.percentiles)) {
        const nested = (record.percentiles as Record<string, unknown>)[base];
        if (nested) candidates.push(nested);
      }
      for (const candidate of candidates) {
        const parsed = parsePercentileCandidate(candidate);
        if (parsed) {
          return parsed;
        }
      }
    }
  }
  return null;
};

const normalizeWithPercentiles = (
  value: number,
  percentiles: PercentileWindow | null,
  fallbackMin: number,
  fallbackMax: number,
) => {
  if (!Number.isFinite(value)) {
    return 0;
  }
  const min = percentiles?.p5 ?? percentiles?.p50 ?? fallbackMin;
  const fallbackSpan = Math.max(Math.abs(fallbackMax - fallbackMin), 1);
  const maxCandidate = percentiles?.p95 ?? (percentiles?.p50 != null ? percentiles.p50 + fallbackSpan : null);
  let max = maxCandidate ?? fallbackMax;
  if (!Number.isFinite(min)) {
    max = Number.isFinite(max) ? max : fallbackMax;
  }
  if (!Number.isFinite(max)) {
    max = fallbackMax;
  }
  let low = Number.isFinite(min) ? (min as number) : fallbackMin;
  if (!Number.isFinite(low)) {
    low = fallbackMin;
  }
  let high = max;
  if (high <= low) {
    high = low + fallbackSpan;
  }
  const normalized = (value - low) / (high - low);
  return clamp01(normalized);
};

const MS_PER_DAY = 1000 * 60 * 60 * 24;

const resolveAccountAgeDays = (records: Record<string, unknown>[]): number => {
  const explicit = pickNumber(records, KEY_VARIANTS.accountAgeDays);
  if (explicit != null) {
    return Math.max(0, explicit);
  }
  const joinString = pickString(records, ["joined", "createdAt", "created_at", "created", "memberSince", "member_since"]);
  if (!joinString) {
    return 0;
  }
  const parsed = new Date(joinString);
  if (Number.isNaN(parsed.getTime())) {
    return 0;
  }
  const delta = Date.now() - parsed.getTime();
  if (!Number.isFinite(delta)) {
    return 0;
  }
  return Math.max(0, Math.floor(delta / MS_PER_DAY));
};

const resolvePercentileValue = (raw: number | null): number | null => {
  if (raw == null) return null;
  if (!Number.isFinite(raw)) return null;
  if (raw > 1) {
    return clamp01(raw / 100);
  }
  if (raw < 0) {
    return 0;
  }
  return clamp01(raw);
};

export interface ProfileReputationResult {
  score: number | null;
  normalizedScore: number | null;
  percentile: number | null;
  rankLabel: string | null;
  components: {
    engagement: number;
    trust: number;
    longevity: number;
    contribution: number;
  } | null;
}

export const deriveProfileReputation = (payload: Record<string, unknown>): ProfileReputationResult => {
  const records = collectRecords(payload);
  const replies = pickNumber(records, KEY_VARIANTS.replies30d) ?? 0;
  const reactions = pickNumber(records, KEY_VARIANTS.reactions30d) ?? 0;
  const zaps = pickNumber(records, KEY_VARIANTS.zaps30d) ?? 0;
  const posts = pickNumber(records, KEY_VARIANTS.posts30d) ?? 0;

  const followers =
    pickNumber(records, KEY_VARIANTS.followers) ??
    (Array.isArray(payload.followers) ? payload.followers.length : 0);
  const following =
    pickNumber(records, KEY_VARIANTS.following) ??
    (Array.isArray(payload.following) ? payload.following.length : 0);
  const blocks = pickNumber(records, KEY_VARIANTS.blocks) ?? 0;
  const reportsResolved = pickNumber(records, KEY_VARIANTS.reportsResolved) ?? 0;

  const mediaPosts = pickNumber(records, KEY_VARIANTS.postsWithMedia) ?? 0;
  const longThreads = pickNumber(records, KEY_VARIANTS.longFormThreads) ?? 0;
  const helpfulReports = pickNumber(records, KEY_VARIANTS.helpfulReports) ?? 0;

  const engagementPercentiles = pickPercentiles(records, ["engagement30d", "engagement"]);
  const trustPercentiles = pickPercentiles(records, ["trust", "trustScore"]);
  const contributionPercentiles = pickPercentiles(records, ["contribution", "contributions"]);
  const reputationPercentiles = pickPercentiles(records, ["reputation", "reputationScore"]);

  const accountAgeDays = resolveAccountAgeDays(records);

  const fallbackPercentile = resolvePercentileValue(
    pickNumber(records, KEY_VARIANTS.reputationPercentile),
  );
  const fallbackRankLabel = pickString(records, ["rank", "communityRank", "reputationRank"]);

  const interactions = replies + reactions + zaps;
  const engagementPerPost = posts > 0 ? interactions / posts : interactions;
  const engagementScore = normalizeWithPercentiles(
    engagementPerPost,
    engagementPercentiles,
    0,
    Math.max(engagementPerPost || 0, 1),
  );

  const denominator = followers + following + blocks * 5;
  const rawTrust = denominator > 0 ? followers / denominator : 0;
  const penalizedTrust = blocks > reportsResolved ? rawTrust * 0.9 : rawTrust;
  const trustScore = normalizeWithPercentiles(penalizedTrust, trustPercentiles, 0, 1);

  const longevityScore = clamp01(accountAgeDays / 365);

  const contributionTotal = mediaPosts + longThreads + helpfulReports;
  const contributionScore = normalizeWithPercentiles(
    contributionTotal,
    contributionPercentiles,
    0,
    Math.max(contributionTotal || 0, 1),
  );

  const weighted =
    0.4 * engagementScore +
    0.3 * trustScore +
    0.2 * longevityScore +
    0.1 * contributionScore;
  const normalizedScore = clamp01(weighted);
  const score = Math.round(normalizedScore * 1000) / 10;

  const percentile = reputationPercentiles
    ? normalizeWithPercentiles(score, reputationPercentiles, 0, 100)
    : fallbackPercentile;

  const rankLabel = percentile != null
    ? `Top ${Math.max(1, Math.round((1 - percentile) * 100))}%`
    : fallbackRankLabel ?? null;

  return {
    score,
    normalizedScore,
    percentile,
    rankLabel,
    components: {
      engagement: engagementScore,
      trust: trustScore,
      longevity: longevityScore,
      contribution: contributionScore,
    },
  };
};
