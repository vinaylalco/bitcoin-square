const IMGBB_CDN_BASE = "https://i.ibb.co";
const SITE_IMAGE_PROXY_BASE = "/api/img";

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const IMGBB_CDN_PATTERN = new RegExp(escapeRegex(IMGBB_CDN_BASE), "g");

const resolveSiteOrigin = (): string | null => {
  if (typeof window !== "undefined" && typeof window.location?.origin === "string") {
    return window.location.origin;
  }

  const env = (() => {
    if (typeof process !== "undefined" && typeof process.env === "object") {
      return process.env as Record<string, string | undefined>;
    }
    if (typeof import.meta !== "undefined" && typeof (import.meta as any)?.env === "object") {
      return (import.meta as any).env as Record<string, string | undefined>;
    }
    return {} as Record<string, string | undefined>;
  })();

  const candidates = [
    env.VITE_SITE_URL,
    env.NEXT_PUBLIC_SITE_URL,
    env.FRONTEND_URL,
    env.VITE_FRONTEND_URL,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim().length > 0) {
      const trimmed = candidate.trim();
      return trimmed.endsWith("/") ? trimmed.slice(0, -1) : trimmed;
    }
  }

  return null;
};

const buildProxyBase = (absolute: boolean): string => {
  if (!absolute) {
    return SITE_IMAGE_PROXY_BASE;
  }

  const origin = resolveSiteOrigin();
  return origin ? `${origin}${SITE_IMAGE_PROXY_BASE}` : SITE_IMAGE_PROXY_BASE;
};

export const rewriteImgBbUrlToProxy = (
  url: string,
  options: { absolute?: boolean } = {},
): string => {
  if (typeof url !== "string" || url.trim().length === 0) {
    return url;
  }

  const { absolute = false } = options;
  const proxyBase = buildProxyBase(absolute);

  if (url.startsWith(IMGBB_CDN_BASE)) {
    return proxyBase + url.slice(IMGBB_CDN_BASE.length);
  }

  if (absolute && url.startsWith(SITE_IMAGE_PROXY_BASE)) {
    return proxyBase + url.slice(SITE_IMAGE_PROXY_BASE.length);
  }

  return url;
};

export const rewriteImgBbUrlsInText = (
  text: string,
  options: { absolute?: boolean } = {},
): string => {
  if (typeof text !== "string" || text.trim().length === 0) {
    return text;
  }

  const { absolute = false } = options;
  const proxyBase = buildProxyBase(absolute);

  let next = text.replace(IMGBB_CDN_PATTERN, proxyBase);

  if (absolute && proxyBase.startsWith("http")) {
    const relativePattern = new RegExp(`(^|[\\s(\"'])${escapeRegex(SITE_IMAGE_PROXY_BASE)}\/`, "g");
    next = next.replace(relativePattern, (match, prefix: string) => {
      const safePrefix = typeof prefix === "string" ? prefix : "";
      return `${safePrefix}${proxyBase}/`;
    });
  }

  return next;
};
