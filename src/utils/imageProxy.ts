const IMGBB_CDN_BASE = "https://i.ibb.co";
const SITE_IMAGE_PROXY_BASE = "/api/img";

export const rewriteImgBbUrlToProxy = (url: string): string => {
  if (typeof url !== "string" || url.trim().length === 0) {
    return url;
  }

  if (url.startsWith(IMGBB_CDN_BASE)) {
    return url.replace(IMGBB_CDN_BASE, SITE_IMAGE_PROXY_BASE);
  }

  return url;
};
