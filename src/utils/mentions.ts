const MENTION_REGEX = /@([0-9a-f]{64})\b/gi;

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

export default extractMentionedPubkeys;
