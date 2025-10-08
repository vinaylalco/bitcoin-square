const ADJECTIVES = [
  "Sunny",
  "Golden",
  "Radiant",
  "Sparkling",
  "Lively",
  "Warm",
  "Cheerful",
  "Vibrant",
  "Playful",
  "Brilliant",
  "Glowing",
  "Friendly",
  "Joyful",
  "Magnetic",
  "Soaring",
  "Spirited",
  "Shimmering",
  "Peachy",
  "Amber",
  "Crimson",
];

const NOUNS = [
  "Flare",
  "Horizon",
  "Comet",
  "Ember",
  "Aurora",
  "Mirage",
  "Pulse",
  "Beacon",
  "Cascade",
  "Orbit",
  "Spark",
  "Echo",
  "Blossom",
  "Drift",
  "Glow",
  "Jubilee",
  "Nebula",
  "Serenade",
  "Sunrise",
  "Whisper",
];

const hashSeed = (seed: string): number => {
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) | 0;
  }
  return Math.abs(hash);
};

const pickFromList = <T,>(list: readonly T[], seed: string, salt: number) => {
  if (list.length === 0) return undefined;
  const hash = hashSeed(`${seed}:${salt}`);
  return list[hash % list.length];
};

export const generateScreenName = (seed: string): string => {
  const normalized = seed && seed.trim().length > 0 ? seed.trim() : `guest-${Math.random().toString(36).slice(2)}`;
  const adjective = pickFromList(ADJECTIVES, normalized, 1) ?? "Sunny";
  const noun = pickFromList(NOUNS, normalized, 2) ?? "Spark";
  const numeric = (hashSeed(`${normalized}:id`) % 900) + 100;
  return `${adjective}${noun}${numeric}`;
};

export const generateWarmAvatar = (seed: string, size = 256): string => {
  const normalized = seed && seed.trim().length > 0 ? seed.trim() : Math.random().toString(36).slice(2);
  const encodedSeed = encodeURIComponent(normalized);
  return `https://source.boringavatars.com/beam/${size}/${encodedSeed}?colors=F97316,F59E0B,FB923C,FBBF24,FB7185`;
};

export const normalizeScreenName = (value: unknown, fallbackSeed: string): string => {
  if (typeof value === "string" && value.trim().length > 0) {
    return value.trim();
  }
  return generateScreenName(fallbackSeed);
};

export const normalizeAvatarUrl = (value: unknown, fallbackSeed: string): string => {
  if (typeof value === "string" && value.trim().length > 0) {
    return value.trim();
  }
  return generateWarmAvatar(fallbackSeed);
};

