export const COMMUNITY_PATH = "/community";
export const COMMUNITY_MESSAGES_VIEW_PARAM = "view";
export const COMMUNITY_MESSAGES_VIEW_VALUE = "messages";
export const COMMUNITY_MESSAGES_PATH = `${COMMUNITY_PATH}?${COMMUNITY_MESSAGES_VIEW_PARAM}=${COMMUNITY_MESSAGES_VIEW_VALUE}`;

export const isCommunityMessagesLocation = (
  pathname: string,
  search: string,
): boolean => {
  if (!pathname.startsWith(COMMUNITY_PATH)) {
    return false;
  }

  try {
    const params = new URLSearchParams(search);
    return params.get(COMMUNITY_MESSAGES_VIEW_PARAM) === COMMUNITY_MESSAGES_VIEW_VALUE;
  } catch {
    return search.includes(`${COMMUNITY_MESSAGES_VIEW_PARAM}=${COMMUNITY_MESSAGES_VIEW_VALUE}`);
  }
};
