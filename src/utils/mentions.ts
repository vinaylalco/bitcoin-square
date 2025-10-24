export interface MentionCandidate {
  pubkey: string;
  displayName: string;
  screenName: string;
  avatarUrl: string;
  shortPubkey: string;
}

export interface MentionMatch {
  start: number;
  end: number;
  query: string;
}

const MENTION_ALLOWED_CHAR_REGEX = /[A-Za-z0-9._-]/;
const MENTION_QUERY_REGEX = /^[A-Za-z0-9._-]*$/;
const MENTION_CAPTURE_REGEX = /(^|[\s([\{>])@([A-Za-z0-9._-]+)/g;

const normalizeHandle = (value: string) => value.trim().toLowerCase();

export const extractMentionHandles = (text: string) => {
  const handles = new Set<string>();
  let match: RegExpExecArray | null;
  while ((match = MENTION_CAPTURE_REGEX.exec(text)) !== null) {
    const handle = match[2];
    if (handle) {
      handles.add(normalizeHandle(handle));
    }
  }
  return handles;
};

const candidateHandles = (candidate: MentionCandidate) => {
  const handles = new Set<string>();
  if (candidate.screenName.trim()) {
    handles.add(normalizeHandle(candidate.screenName));
  }
  return handles;
};

const isValidMentionBoundary = (char?: string) => {
  if (!char) return true;
  return /\s|[(\[\{>]/.test(char);
};

export const findActiveMention = (text: string, caret: number): MentionMatch | null => {
  if (!Number.isFinite(caret)) return null;
  if (caret < 0 || caret > text.length) return null;
  const uptoCaret = text.slice(0, caret);
  const atIndex = uptoCaret.lastIndexOf("@");
  if (atIndex === -1) return null;
  const prefixChar = text[atIndex - 1];
  if (!isValidMentionBoundary(prefixChar)) return null;

  for (let index = atIndex + 1; index < caret; index += 1) {
    const char = text[index];
    if (!char) break;
    if (!MENTION_ALLOWED_CHAR_REGEX.test(char)) {
      return null;
    }
  }

  let end = caret;
  while (end < text.length && MENTION_ALLOWED_CHAR_REGEX.test(text[end]!)) {
    end += 1;
  }

  const query = text.slice(atIndex + 1, caret);
  if (!MENTION_QUERY_REGEX.test(query)) {
    return null;
  }

  const nextChar = text[caret];
  if (nextChar && MENTION_ALLOWED_CHAR_REGEX.test(nextChar)) {
    return null;
  }

  return { start: atIndex, end, query };
};

export const resolveMentionTargets = async (
  text: string,
  fetchCandidates: (handles: string[]) => Promise<MentionCandidate[]>,
): Promise<MentionCandidate[]> => {
  const handles = Array.from(extractMentionHandles(text));
  if (handles.length === 0) {
    return [];
  }

  const candidates = await fetchCandidates(handles);
  if (!Array.isArray(candidates) || candidates.length === 0) {
    return [];
  }

  const candidatesByHandle = new Map<string, MentionCandidate>();
  candidates.forEach((candidate) => {
    const normalized = normalizeHandle(candidate.screenName);
    if (!normalized || candidatesByHandle.has(normalized)) {
      return;
    }
    candidatesByHandle.set(normalized, candidate);
  });

  const seenPubkeys = new Set<string>();
  const results: MentionCandidate[] = [];
  handles.forEach((handle) => {
    const candidate = candidatesByHandle.get(handle);
    if (!candidate) {
      return;
    }
    if (seenPubkeys.has(candidate.pubkey)) {
      return;
    }
    seenPubkeys.add(candidate.pubkey);
    results.push(candidate);
  });

  return results;
};

const sortByScreenName = (a: MentionCandidate, b: MentionCandidate) => {
  const aKey = a.screenName.trim().toLowerCase();
  const bKey = b.screenName.trim().toLowerCase();
  return aKey.localeCompare(bKey);
};

export const searchMentionCandidatesByScreenName = (
  candidates: MentionCandidate[],
  query: string,
  limit = 5,
): MentionCandidate[] => {
  if (limit <= 0) {
    return [];
  }

  const normalizedQuery = query.trim().toLowerCase();

  const withScreenName = candidates
    .filter((candidate) => candidate.screenName.trim().length > 0)
    .sort(sortByScreenName);

  if (normalizedQuery.length === 0) {
    return withScreenName.slice(0, limit);
  }

  return withScreenName
    .filter((candidate) => candidate.screenName.toLowerCase().includes(normalizedQuery))
    .slice(0, limit);
};
