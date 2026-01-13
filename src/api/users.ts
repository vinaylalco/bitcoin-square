import { strapiFetch } from "./strapi-client";

export interface ScreenNameUser {
  id: number;
  screenName: string;
  avatarUrl: string | null;
  nostrPubkey: string | null;
}

export interface CreatorProfileUser {
  id: number;
  username: string;
  avatarUrl: string | null;
  contentCreatorProfileDescription: string | null;
  contentCreatorYoutubeIntroEmbed: string | null;
}

const normalizeMaybeString = (value: unknown): string | null => {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const normalizeUserEntry = (raw: unknown): ScreenNameUser | null => {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const withAttributes = (raw as { attributes?: unknown }).attributes;
  const source = withAttributes && typeof withAttributes === "object" ? withAttributes : raw;

  const idCandidate = (raw as { id?: unknown }).id;
  const altIdCandidate = (source as { id?: unknown }).id;
  const idValue = typeof idCandidate === "number" ? idCandidate : typeof altIdCandidate === "number" ? altIdCandidate : null;

  const screenName =
    normalizeMaybeString((source as { screen_name?: unknown }).screen_name) ||
    normalizeMaybeString((source as { screenName?: unknown }).screenName);

  if (!idValue || !screenName) {
    return null;
  }

  const avatarUrl =
    normalizeMaybeString((source as { avatar_url?: unknown }).avatar_url) ||
    normalizeMaybeString((source as { avatarUrl?: unknown }).avatarUrl);

  const nostrPubkey =
    normalizeMaybeString((source as { nostr_pubkey?: unknown }).nostr_pubkey) ||
    normalizeMaybeString((source as { nostrPubkey?: unknown }).nostrPubkey);

  return {
    id: idValue,
    screenName,
    avatarUrl,
    nostrPubkey,
  };
};

const normalizeCreatorProfileEntry = (raw: unknown): CreatorProfileUser | null => {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const withAttributes = (raw as { attributes?: unknown }).attributes;
  const source = withAttributes && typeof withAttributes === "object" ? withAttributes : raw;

  const idCandidate = (raw as { id?: unknown }).id;
  const altIdCandidate = (source as { id?: unknown }).id;
  const idValue = typeof idCandidate === "number" ? idCandidate : typeof altIdCandidate === "number" ? altIdCandidate : null;

  const username =
    normalizeMaybeString((source as { username?: unknown }).username) ||
    normalizeMaybeString((source as { screen_name?: unknown }).screen_name) ||
    normalizeMaybeString((source as { screenName?: unknown }).screenName);

  if (!idValue || !username) {
    return null;
  }

  const avatarUrl =
    normalizeMaybeString((source as { avatar_url?: unknown }).avatar_url) ||
    normalizeMaybeString((source as { avatarUrl?: unknown }).avatarUrl);

  const contentCreatorProfileDescription = normalizeMaybeString(
    (source as { contentCreatorProfileDescription?: unknown }).contentCreatorProfileDescription,
  );

  const contentCreatorYoutubeIntroEmbed = normalizeMaybeString(
    (source as { contentCreatorYoutubeIntroEmbed?: unknown }).contentCreatorYoutubeIntroEmbed,
  );

  return {
    id: idValue,
    username,
    avatarUrl,
    contentCreatorProfileDescription,
    contentCreatorYoutubeIntroEmbed,
  };
};

const extractUsers = (payload: unknown): ScreenNameUser[] => {
  const entries: unknown[] = Array.isArray(payload)
    ? payload
    : Array.isArray((payload as { data?: unknown })?.data)
      ? (((payload as { data?: unknown }).data as unknown[]) ?? [])
      : [];

  const mapped = entries
    .map((entry) => normalizeUserEntry(entry))
    .filter((entry): entry is ScreenNameUser => Boolean(entry?.screenName));

  return mapped;
};

const appendFieldParams = (params: URLSearchParams) => {
  params.append("fields[0]", "id");
  params.append("fields[1]", "screen_name");
  params.append("fields[2]", "screenName");
  params.append("fields[3]", "avatar_url");
  params.append("fields[4]", "avatarUrl");
  params.append("fields[5]", "nostr_pubkey");
  params.append("fields[6]", "nostrPubkey");
};

const appendSortParams = (params: URLSearchParams) => {
  params.append("sort[0]", "screen_name:asc");
  params.append("sort[1]", "screenName:asc");
};

const appendCreatorProfileFieldParams = (params: URLSearchParams) => {
  params.append("fields[0]", "id");
  params.append("fields[1]", "username");
  params.append("fields[2]", "screen_name");
  params.append("fields[3]", "screenName");
  params.append("fields[4]", "avatar_url");
  params.append("fields[5]", "avatarUrl");
  params.append("fields[6]", "contentCreatorProfileDescription");
  params.append("fields[7]", "contentCreatorYoutubeIntroEmbed");
};

export async function searchUsersByScreenName(
  query: string,
  limit = 5,
): Promise<ScreenNameUser[]> {
  const trimmedLimit = Number.isFinite(limit) ? Math.max(1, Math.min(Math.floor(limit), 25)) : 5;
  const normalizedQuery = query.trim();

  const params = new URLSearchParams();
  appendFieldParams(params);
  appendSortParams(params);
  params.append("pagination[pageSize]", String(trimmedLimit));

  if (normalizedQuery) {
    params.append("filters[$or][0][screen_name][$containsi]", normalizedQuery);
    params.append("filters[$or][1][screenName][$containsi]", normalizedQuery);
  }

  const payload = await strapiFetch<unknown>(`/api/users?${params.toString()}`);
  const users = extractUsers(payload);

  if (!normalizedQuery) {
    return users.slice(0, trimmedLimit);
  }

  const loweredQuery = normalizedQuery.toLowerCase();
  return users
    .filter((user) => user.screenName.toLowerCase().includes(loweredQuery))
    .slice(0, trimmedLimit);
}

export async function fetchUsersByScreenNames(
  screenNames: string[],
): Promise<ScreenNameUser[]> {
  const normalizedUnique = Array.from(
    new Set(
      screenNames
        .map((name) => name.trim().toLowerCase())
        .filter((name) => name.length > 0),
    ),
  );

  if (normalizedUnique.length === 0) {
    return [];
  }

  const params = new URLSearchParams();
  appendFieldParams(params);
  appendSortParams(params);
  params.append("pagination[pageSize]", String(Math.min(normalizedUnique.length * 2, 50)));

  normalizedUnique.forEach((handle, index) => {
    params.append(`filters[$or][${index}][screen_name][$eqi]`, handle);
    params.append(`filters[$or][${index + normalizedUnique.length}][screenName][$eqi]`, handle);
  });

  const payload = await strapiFetch<unknown>(`/api/users?${params.toString()}`);
  const users = extractUsers(payload);

  const allowed = new Set(normalizedUnique);
  return users.filter((user) => allowed.has(user.screenName.toLowerCase()));
}

export async function fetchCreatorProfileUserById(
  userId: number,
): Promise<CreatorProfileUser | null> {
  if (!Number.isFinite(userId)) {
    return null;
  }

  const params = new URLSearchParams();
  appendCreatorProfileFieldParams(params);

  const payload = await strapiFetch<unknown>(`/api/users/${userId}?${params.toString()}`);
  return normalizeCreatorProfileEntry(payload);
}
