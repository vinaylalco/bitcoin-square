const HEX_PUBKEY_PATTERN = /^[0-9a-f]{64}$/i;
const MENTION_REGEX = /@([0-9a-f]{64})\b/gi;

const BOUNDARY_MENTION_REGEX = /(^|[\s.,!?;:()[\]{}<>"'])@([0-9a-zA-Z_]{1,64})/g;

export const extractMentionedPubkeys = (text: string): string[] => {
  if (typeof text !== "string" || text.length === 0) {
    return [];
  }
  const normalized = text.toLowerCase();
  const result = new Set<string>();
  let match: RegExpExecArray | null = null;
  // eslint-disable-next-line no-cond-assign
  while ((match = MENTION_REGEX.exec(normalized)) !== null) {
    if (match[1]) {
      result.add(match[1]);
    }
  }
  return Array.from(result);
};

export const includesMentionOfPubkey = (text: string | null | undefined, pubkey: string): boolean => {
  if (!text || !pubkey) return false;
  const normalizedPubkey = pubkey.toLowerCase();
  const regex = new RegExp(`@${normalizedPubkey}`, "i");
  return regex.test(text);
};

export type MentionTarget = {
  pubkey: string;
  screenName: string;
  displayName: string;
  avatarUrl: string;
};

export type MentionSelection = Pick<MentionTarget, "pubkey" | "screenName">;

export const normalizeMentionLabel = (value: string): string => value.replace(/^@/, "").trim().toLowerCase();

const escapeRegex = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export const textIncludesMentionLabel = (text: string, label: string): boolean => {
  if (typeof text !== "string" || typeof label !== "string") {
    return false;
  }
  const normalizedLabel = normalizeMentionLabel(label);
  if (!normalizedLabel) {
    return false;
  }
  const pattern = new RegExp(`(^|[\\s.,!?;:()[\\]{}<>\"'])@${escapeRegex(normalizedLabel)}(?=$|[\\s.,!?;:()[\\]{}<>\"'])`, "i");
  return pattern.test(text);
};

export const collectMentionSelections = (
  text: string,
  candidates: Iterable<MentionTarget>,
): MentionSelection[] => {
  if (typeof text !== "string" || text.trim().length === 0) {
    return [];
  }
  const normalizedText = text.toLowerCase();
  const matches = new Map<string, MentionSelection>();
  for (const candidate of candidates) {
    const label = normalizeMentionLabel(candidate.screenName || candidate.displayName || "");
    if (!label) {
      continue;
    }
    if (textIncludesMentionLabel(normalizedText, label)) {
      matches.set(label, { pubkey: candidate.pubkey.toLowerCase(), screenName: candidate.screenName });
      continue;
    }
    if (HEX_PUBKEY_PATTERN.test(candidate.pubkey) && textIncludesMentionLabel(normalizedText, candidate.pubkey)) {
      matches.set(candidate.pubkey.toLowerCase(), { pubkey: candidate.pubkey.toLowerCase(), screenName: candidate.screenName });
    }
  }
  return Array.from(matches.values());
};

export const seedMentionSelectionsFromText = (
  text: string,
  lookup: Map<string, MentionTarget>,
): Map<string, MentionTarget> => {
  const result = new Map<string, MentionTarget>();
  if (typeof text !== "string" || text.trim().length === 0) {
    return result;
  }
  const normalizedText = text.toLowerCase();
  let match: RegExpExecArray | null = null;
  const matcher = new RegExp(BOUNDARY_MENTION_REGEX.source, "gi");
  // eslint-disable-next-line no-cond-assign
  while ((match = matcher.exec(normalizedText)) !== null) {
    const label = match[2];
    if (!label) continue;
    const normalizedLabel = label.toLowerCase();
    const target = lookup.get(normalizedLabel);
    if (target) {
      result.set(normalizedLabel, target);
      continue;
    }
    if (HEX_PUBKEY_PATTERN.test(normalizedLabel)) {
      const hexTarget = lookup.get(normalizedLabel);
      if (hexTarget) {
        result.set(normalizedLabel, hexTarget);
      }
    }
  }
  return result;
};

export const extractMentionPubkeysFromTags = (
  tags?: string[][] | null,
  options?: { includeReplies?: boolean },
): string[] => {
  if (!Array.isArray(tags) || tags.length === 0) {
    return [];
  }
  const includeReplies = options?.includeReplies ?? false;
  const results = new Set<string>();
  tags.forEach((tag) => {
    if (!Array.isArray(tag) || tag.length < 2) {
      return;
    }
    if (tag[0] !== "p") {
      return;
    }
    const value = typeof tag[1] === "string" ? tag[1].trim().toLowerCase() : "";
    if (value.length !== 64) {
      return;
    }
    const marker = typeof tag[3] === "string" ? tag[3].trim().toLowerCase() : "";
    if (!includeReplies && marker === "reply") {
      return;
    }
    results.add(value);
  });
  return Array.from(results);
};

export default extractMentionedPubkeys;
